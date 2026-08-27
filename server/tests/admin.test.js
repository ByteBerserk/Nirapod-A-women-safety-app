import { createUser, createUserWithFreshToken, auth, DHAKA, offsetNorth } from './helpers.js';
import User from '../src/models/User.js';
import AuditLog from '../src/models/AuditLog.js';
import MailJob from '../src/models/MailJob.js';
import { ROLES, ACCOUNT_STATUS, MAIL_STATUS } from '../src/config/constants.js';
import { request as req, app } from './helpers.js';
import { signIn } from './helpers.js';

function incidentPayload(overrides = {}) {
  return {
    title: 'Snatching near the footbridge',
    description:
      'A phone was snatched from a woman walking under the footbridge just after dark.',
    category: 'theft',
    severity: 'high',
    lat: DHAKA.lat,
    lng: DHAKA.lng,
    area: 'Dhanmondi',
    city: 'Dhaka',
    ...overrides,
  };
}

async function createIncident(token, overrides = {}) {
  const response = await auth(token).post('/api/incidents').send(incidentPayload(overrides));
  expect(response.status).toBe(201);
  return response.body.data.incident;
}

describe('Administration', () => {
  describe('Access control', () => {
    it('keeps ordinary members out of the dashboard', async () => {
      const member = await createUser();

      const response = await auth(member.token).get('/api/admin/dashboard');

      expect(response.status).toBe(403);
    });

    it('keeps moderators out of the admin-only analytics', async () => {
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const response = await auth(moderator.token).get('/api/admin/dashboard');

      expect(response.status).toBe(403);
    });

    it('lets a moderator into the shared moderation area', async () => {
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const response = await auth(moderator.token).get('/api/admin/users');

      expect(response.status).toBe(200);
    });

    it('turns away an unauthenticated request', async () => {

      const response = await req(app).get('/api/admin/dashboard');

      expect(response.status).toBe(401);
    });
  });

  describe('Dashboard (FR-24)', () => {
    it('summarises users, incidents, SOS and moderation', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();
      await createIncident(member.token);
      await auth(member.token).post('/api/sos').send(DHAKA);

      const response = await auth(admin.token).get('/api/admin/dashboard');

      expect(response.status).toBe(200);
      const { users, incidents, sos, moderation } = response.body.data;
      expect(users.total).toBe(2);
      expect(users.active).toBe(2);
      expect(incidents.total).toBe(1);
      expect(incidents.pending).toBe(1);
      expect(sos.total).toBe(1);
      expect(sos.active).toBe(1);
      expect(moderation.openReports).toBe(0);
    });

    it('clamps a silly window rather than trusting the query string', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const response = await auth(admin.token).get('/api/admin/dashboard?days=99999');

      expect(response.status).toBe(200);
      expect(response.body.data.period.days).toBe(365);
    });
  });

  describe('Analytics (FR-24)', () => {
    it('breaks incidents down by category with percentages', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();
      await createIncident(member.token, { category: 'theft' });
      await createIncident(member.token, { category: 'theft' });
      await createIncident(member.token, { category: 'harassment' });

      const response = await auth(admin.token).get('/api/admin/analytics/categories');

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(3);

      const theft = response.body.data.categories.find((c) => c.category === 'theft');
      expect(theft.count).toBe(2);
      expect(theft.percentage).toBeCloseTo(66.7, 1);

      expect(response.body.data.categories[0].category).toBe('theft');
    });

    it('returns a trend series', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();
      await createIncident(member.token);

      const response = await auth(admin.token).get('/api/admin/analytics/trends?days=7');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.series)).toBe(true);
    });

    it('treats a repeatedly reported spot as a hotspot', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      await createIncident(member.token);
      await createIncident(member.token, offsetNorth(DHAKA, 20));
      await createIncident(member.token, offsetNorth(DHAKA, 40));

      const response = await auth(admin.token).get('/api/admin/analytics/hotspots');

      expect(response.status).toBe(200);
      expect(response.body.data.hotspots.length).toBeGreaterThan(0);
      expect(response.body.data.hotspots[0].count).toBeGreaterThanOrEqual(2);
    });

    it('does not call a single report a hotspot', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();
      await createIncident(member.token);

      const response = await auth(admin.token).get('/api/admin/analytics/hotspots');

      expect(response.body.data.hotspots).toHaveLength(0);
    });
  });

  describe('User management (FR-25)', () => {
    it('lists accounts', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      await createUser({ name: 'Rina' });

      const response = await auth(admin.token).get('/api/admin/users');

      expect(response.status).toBe(200);
      expect(response.body.data.users.length).toBeGreaterThanOrEqual(2);
    });

    it('promotes someone to moderator', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/role`)
        .send({ role: ROLES.MODERATOR });

      expect(response.status).toBe(200);
      const stored = await User.findById(member.user.id).lean();
      expect(stored.role).toBe(ROLES.MODERATOR);
    });

    it('invalidates the promoted user’s existing token', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/role`)
        .send({ role: ROLES.MODERATOR });

      const response = await auth(member.token).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it('refuses a role that does not exist', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/role`)
        .send({ role: 'superuser' });

      expect(response.status).toBe(422);
    });

    it('does not let an administrator change their own role', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${admin.user.id}/role`)
        .send({ role: ROLES.USER });

      expect(response.status).toBe(400);
    });

    it('demotes an administrator while another one is still active', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const other = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${other.user.id}/role`)
        .send({ role: ROLES.USER });

      expect(response.status).toBe(200);
      const stored = await User.findById(other.user.id).lean();
      expect(stored.role).toBe(ROLES.USER);
    });

    it('refuses to demote the last administrator who can still sign in', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const other = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const suspended = await auth(admin.token)
        .patch(`/api/admin/users/${other.user.id}/status`)
        .send({ status: ACCOUNT_STATUS.SUSPENDED, reason: 'Under review', days: 30 });
      expect(suspended.status).toBe(200);

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${other.user.id}/role`)
        .send({ role: ROLES.USER });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/only administrator/i);

      const stored = await User.findById(other.user.id).lean();
      expect(stored.role).toBe(ROLES.ADMIN);
    });

    it('suspends an account and stops its session', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/status`)
        .send({ status: ACCOUNT_STATUS.SUSPENDED, reason: 'Abusive comments', days: 7 });

      expect(response.status).toBe(200);
      const stored = await User.findById(member.user.id).lean();
      expect(stored.accountStatus).toBe(ACCOUNT_STATUS.SUSPENDED);

      const blocked = await auth(member.token).get('/api/auth/me');
      expect(blocked.status).toBe(401);
    });

    it('reinstates a suspended account', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/status`)
        .send({ status: ACCOUNT_STATUS.SUSPENDED, reason: 'Mistake', days: 7 });

      const response = await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/status`)
        .send({ status: ACCOUNT_STATUS.ACTIVE });

      expect(response.status).toBe(200);
      const stored = await User.findById(member.user.id).lean();
      expect(stored.accountStatus).toBe(ACCOUNT_STATUS.ACTIVE);

      const session = await signIn(member.user.email, member.password);
      expect(session.token).toEqual(expect.any(String));
    });

    it('shows one account in detail', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser({ name: 'Rina' });

      const response = await auth(admin.token).get(`/api/admin/users/${member.user.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user.name).toBe('Rina');
    });
  });

  describe('Audit log (NFR-15)', () => {
    it('records administrative actions', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });
      const member = await createUser();

      await auth(admin.token)
        .patch(`/api/admin/users/${member.user.id}/role`)
        .send({ role: ROLES.MODERATOR });

      await new Promise((resolve) => setTimeout(resolve, 250));

      const entry = await AuditLog.findOne({ action: 'admin.role_change' }).lean();
      expect(entry).not.toBeNull();
    });

    it('serves the log to an administrator', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const response = await auth(admin.token).get('/api/admin/audit-logs');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.logs)).toBe(true);
    });

    it('is closed to moderators', async () => {
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const response = await auth(moderator.token).get('/api/admin/audit-logs');

      expect(response.status).toBe(403);
    });
  });

  describe('Mail queue (NFR-12)', () => {
    it('reports the queue state', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });

      const response = await auth(admin.token).get('/api/admin/mail-queue');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('counts');
    });

    it('puts abandoned mail back on the queue', async () => {
      const admin = await createUserWithFreshToken({ role: ROLES.ADMIN });

      await MailJob.create({
        kind: 'sos-alert',
        to: 'unreachable@example.com',
        subject: 'Emergency alert',
        html: '<p>Help</p>',
        status: MAIL_STATUS.ABANDONED,
        attempts: 5,
      });

      const response = await auth(admin.token).post('/api/admin/mail-queue/retry');

      expect(response.status).toBe(200);
      const job = await MailJob.findOne({ to: 'unreachable@example.com' }).lean();
      expect(job.status).not.toBe(MAIL_STATUS.ABANDONED);
    });
  });
});
