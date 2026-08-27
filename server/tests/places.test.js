import { createUser, auth, DHAKA, offsetNorth, settle } from './helpers.js';
import SafePlace from '../src/models/SafePlace.js';
import MailJob from '../src/models/MailJob.js';
import User from '../src/models/User.js';

async function createPlace(token, overrides = {}) {
  const response = await auth(token)
    .post('/api/places/safe-places')
    .send({
      label: overrides.label || 'Home',
      type: overrides.type || 'home',
      radiusMeters: overrides.radiusMeters ?? 150,
      lat: overrides.lat ?? DHAKA.lat,
      lng: overrides.lng ?? DHAKA.lng,
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.data.place;
}

describe('Safe places and geofencing', () => {
  describe('Saving places (FR-19)', () => {
    it('saves a place', async () => {
      const { token } = await createUser();

      const place = await createPlace(token, { label: 'Home', type: 'home' });

      expect(place.label).toBe('Home');
      expect(place.radiusMeters).toBe(150);
      expect(place.isInside).toBe(false);
    });

    it('refuses two places with the same name for one user', async () => {
      const { token } = await createUser();
      await createPlace(token, { label: 'Home' });

      const response = await auth(token)
        .post('/api/places/safe-places')
        .send({ label: 'Home', lat: DHAKA.lat, lng: DHAKA.lng });

      expect(response.status).toBe(409);
    });

    it('lets two different users each have a place called Home', async () => {
      const first = await createUser();
      const second = await createUser();

      await createPlace(first.token, { label: 'Home' });
      const response = await auth(second.token)
        .post('/api/places/safe-places')
        .send({ label: 'Home', lat: DHAKA.lat, lng: DHAKA.lng });

      expect(response.status).toBe(201);
    });

    it('rejects a radius below the GPS noise floor', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/places/safe-places')
        .send({ label: 'Tiny', radiusMeters: 5, lat: DHAKA.lat, lng: DHAKA.lng });

      expect(response.status).toBe(422);
      expect(response.body.details.radiusMeters).toBeDefined();
    });

    it('rejects a place with no location', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/places/safe-places').send({ label: 'Nowhere' });

      expect(response.status).toBe(422);
    });

    it('does not let one user edit another user’s place', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const place = await createPlace(owner.token);

      const response = await auth(stranger.token)
        .patch(`/api/places/safe-places/${place.id}`)
        .send({ label: 'Hijacked' });

      expect(response.status).toBe(404);
    });
  });

  describe('Geofence transitions (FR-20)', () => {
    it('records an arrival when the user comes inside the radius', async () => {
      const { token } = await createUser();
      await createPlace(token, { label: 'Home', radiusMeters: 200 });

      const response = await auth(token).post('/api/places/safe-places/check').send(DHAKA);

      expect(response.status).toBe(200);
      expect(response.body.data.transitions).toHaveLength(1);
      expect(response.body.data.transitions[0].event).toBe('enter');
    });

    it('does not fire again while the user stays put', async () => {
      const { token } = await createUser();
      await createPlace(token, { radiusMeters: 200 });

      await auth(token).post('/api/places/safe-places/check').send(DHAKA);
      const second = await auth(token).post('/api/places/safe-places/check').send(DHAKA);

      expect(second.body.data.transitions).toHaveLength(0);
      expect(second.body.data.inside).toHaveLength(1);
    });

    it('records a departure when the user moves well away', async () => {
      const { token } = await createUser();
      await createPlace(token, { radiusMeters: 200 });

      await auth(token).post('/api/places/safe-places/check').send(DHAKA);
      const response = await auth(token)
        .post('/api/places/safe-places/check')
        .send(offsetNorth(DHAKA, 2000));

      expect(response.body.data.transitions).toHaveLength(1);
      expect(response.body.data.transitions[0].event).toBe('leave');
    });

    it('does not flap when the user sits just outside the radius', async () => {
      const { token } = await createUser();
      await createPlace(token, { radiusMeters: 200 });

      await auth(token).post('/api/places/safe-places/check').send(DHAKA);

      const response = await auth(token)
        .post('/api/places/safe-places/check')
        .send(offsetNorth(DHAKA, 220));

      expect(response.body.data.transitions).toHaveLength(0);
      expect(response.body.data.inside).toHaveLength(1);
    });

    it('does not notify when the place has notifications switched off', async () => {
      const { token } = await createUser();
      await createPlace(token, { radiusMeters: 200, notifyOnEnter: false });

      const response = await auth(token).post('/api/places/safe-places/check').send(DHAKA);

      expect(response.body.data.transitions).toHaveLength(0);

      expect(response.body.data.inside).toHaveLength(1);
    });

    it('emails contacts only when both switches are on', async () => {
      const { token, user } = await createUser();
      await auth(token)
        .post('/api/contacts')
        .send({ name: 'Mother', email: 'mother@example.com' });

      await createPlace(token, { radiusMeters: 200, notifyContacts: true });

      await auth(token).post('/api/places/safe-places/check').send(DHAKA);
      await settle();
      expect(await MailJob.countDocuments({ kind: 'safe-place' })).toBe(0);

      await User.updateOne(
        { _id: user.id },
        { $set: { 'privacyPrefs.notifyContactsOnSafePlace': true } }
      );
      await createPlace(token, {
        label: 'Office',
        radiusMeters: 200,
        notifyContacts: true,
        ...offsetNorth(DHAKA, 5000),
      });
      await auth(token)
        .post('/api/places/safe-places/check')
        .send(offsetNorth(DHAKA, 5000));
      await settle();

      expect(await MailJob.countDocuments({ kind: 'safe-place' })).toBeGreaterThan(0);
    });

    it('lists the transition history', async () => {
      const { token } = await createUser();
      await createPlace(token, { radiusMeters: 200 });

      await auth(token).post('/api/places/safe-places/check').send(DHAKA);
      await auth(token)
        .post('/api/places/safe-places/check')
        .send(offsetNorth(DHAKA, 2000));

      const response = await auth(token).get('/api/places/safe-places/events');

      expect(response.body.data.events).toHaveLength(2);
      expect(response.body.data.events[0].event).toBe('leave');
    });

    it('returns nothing when the user has saved no places', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/places/safe-places/check').send(DHAKA);

      expect(response.status).toBe(200);
      expect(response.body.data.transitions).toHaveLength(0);
    });

    it('rejects a check with no coordinates', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/places/safe-places/check').send({});

      expect(response.status).toBe(422);
    });
  });
});
