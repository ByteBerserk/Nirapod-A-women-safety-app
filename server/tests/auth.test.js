import { app, request, createUser, auth, signIn } from './helpers.js';
import User from '../src/models/User.js';

describe('Authentication', () => {
  describe('POST /api/auth/register', () => {
    it('creates an account and returns an access token', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Ayesha Rahman',
        username: 'ayesha_r',
        email: 'ayesha@example.com',
        password: 'Password123',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.user.email).toBe('ayesha@example.com');
    });

    it('never returns the password hash', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Test',
        username: 'nopass',
        email: 'nopass@example.com',
        password: 'Password123',
      });

      expect(JSON.stringify(response.body)).not.toContain('$2a$');
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('sets an httpOnly refresh cookie rather than returning the token', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Cookie Test',
        username: 'cookietest',
        email: 'cookie@example.com',
        password: 'Password123',
      });

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const refresh = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refresh).toContain('HttpOnly');
      expect(response.body.data.refreshToken).toBeUndefined();
    });

    it('rejects a duplicate email with a field-level message', async () => {
      await createUser({ email: 'taken@example.com' });

      const response = await request(app).post('/api/auth/register').send({
        name: 'Second',
        username: 'seconduser',
        email: 'taken@example.com',
        password: 'Password123',
      });

      expect(response.status).toBe(422);
      expect(response.body.details.email).toBeDefined();
    });

    it('rejects a duplicate username case-insensitively', async () => {
      await createUser({ username: 'takenname' });

      const response = await request(app).post('/api/auth/register').send({
        name: 'Second',
        username: 'TAKENNAME',
        email: 'other@example.com',
        password: 'Password123',
      });

      expect(response.status).toBe(422);
      expect(response.body.details.username).toBeDefined();
    });

    it('rejects a password with no digit', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Weak',
        username: 'weakpass',
        email: 'weak@example.com',
        password: 'onlyletters',
      });

      expect(response.status).toBe(422);
      expect(response.body.details.password).toBeDefined();
    });

    it('rejects an invalid username character', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Bad',
        username: 'has spaces',
        email: 'bad@example.com',
        password: 'Password123',
      });

      expect(response.status).toBe(422);
      expect(response.body.details.username).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in with an email address', async () => {
      const { user, password } = await createUser();

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.email, password });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
    });

    it('signs in with a username', async () => {
      const { user, password } = await createUser();

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.username, password });

      expect(response.status).toBe(200);
    });

    it('gives the same message for a wrong password and an unknown account', async () => {
      const { user } = await createUser();

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.email, password: 'WrongPassword1' });

      const unknownUser = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'nobody@example.com', password: 'Password123' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      // Different messages here would let an attacker enumerate accounts.
      expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    });

    it('locks the account after repeated failures', async () => {
      const { user } = await createUser();

      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: user.email, password: 'WrongPassword1' });
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.email, password: 'Password123' });

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('refuses a suspended account', async () => {
      const { user, password } = await createUser();
      await User.updateOne(
        { _id: user.id },
        { $set: { accountStatus: 'suspended', 'suspension.reason': 'Testing' } }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.email, password });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('lifts a suspension whose end date has passed', async () => {
      const { user, password } = await createUser();
      await User.updateOne(
        { _id: user.id },
        {
          $set: {
            accountStatus: 'suspended',
            'suspension.until': new Date(Date.now() - 60000),
          },
        }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.email, password });

      expect(response.status).toBe(200);
    });
  });

  describe('Session lifecycle', () => {
    it('returns the profile from /api/auth/me', async () => {
      const { token, user } = await createUser();

      const response = await auth(token).get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(user.id);
    });

    it('rejects a request with no token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('NO_TOKEN');
    });

    it('rejects a malformed token', async () => {
      const response = await auth('not.a.real.token').get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('mints a new access token from the refresh cookie', async () => {
      const { cookie } = await createUser();

      const response = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
    });

    it('invalidates every existing token when the password changes', async () => {
      const { token, password } = await createUser();

      const changed = await auth(token).patch('/api/auth/change-password').send({
        currentPassword: password,
        newPassword: 'BrandNew456',
      });
      expect(changed.status).toBe(200);

      // The old token must be dead even though it has not expired.
      const withOldToken = await auth(token).get('/api/auth/me');
      expect(withOldToken.status).toBe(401);

      // The response handed back a working replacement.
      const withNewToken = await auth(changed.body.data.accessToken).get('/api/auth/me');
      expect(withNewToken.status).toBe(200);
    });

    it('rejects a password change with the wrong current password', async () => {
      const { token } = await createUser();

      const response = await auth(token).patch('/api/auth/change-password').send({
        currentPassword: 'NotMyPassword1',
        newPassword: 'BrandNew456',
      });

      expect(response.status).toBe(422);
      expect(response.body.details.currentPassword).toBeDefined();
    });

    it('ends every session on logout-all', async () => {
      const { token } = await createUser();

      await auth(token).post('/api/auth/logout-all');
      const response = await auth(token).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('Password reset', () => {
    it('answers identically whether or not the account exists', async () => {
      const { user } = await createUser();

      const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
      const unknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body.message).toBe(unknown.body.message);
    });

    it('stores only a hash of the reset token', async () => {
      const { user } = await createUser();
      await request(app).post('/api/auth/forgot-password').send({ email: user.email });

      const record = await User.findById(user.id).select('+passwordResetTokenHash');

      expect(record.passwordResetTokenHash).toEqual(expect.any(String));
      // A sha256 hex digest, not a raw base64url token.
      expect(record.passwordResetTokenHash).toHaveLength(64);
    });

    it('refuses an invalid reset token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'made-up-token', password: 'BrandNew456' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('RESET_TOKEN_INVALID');
    });
  });

  describe('Injection resistance', () => {
    it('does not accept an operator object as a login identifier', async () => {
      await createUser({ email: 'victim@example.com' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: { $gt: '' }, password: { $gt: '' } });

      // Sanitised into a harmless string, so it simply fails to match.
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });
  });
});
