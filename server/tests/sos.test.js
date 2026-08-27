import { app, request, createUser, auth, DHAKA, offsetNorth, settle, addContact } from './helpers.js';
import MailJob from '../src/models/MailJob.js';
import SosEvent from '../src/models/SosEvent.js';
import { hashToken } from '../src/utils/tokens.js';

describe('Emergency SOS', () => {
  describe('Activation', () => {
    it('creates an alert and returns a tracking link', async () => {
      const { token } = await createUser();
      await addContact(token);

      const response = await auth(token).post('/api/sos').send({ ...DHAKA, message: 'Help' });

      expect(response.status).toBe(201);
      expect(response.body.data.sos.status).toBe('active');
      expect(response.body.data.trackingToken).toEqual(expect.any(String));
      expect(response.body.data.trackingUrl).toContain('/track/');
    });

    it('still raises the alert when there is no location', async () => {
      const { token } = await createUser();
      await addContact(token, { name: 'Mother', email: 'mother@example.com' });

      const response = await auth(token).post('/api/sos').send({ message: 'Help' });

      expect(response.status).toBe(201);
      expect(response.body.data.sos.startLocation).toBeNull();
      expect(response.body.data.trackingToken).toBeTruthy();
      expect(response.body.message).toMatch(/location could not be read/i);
    });

    it('accepts a location later for an alert that started without one', async () => {
      const { token } = await createUser();

      const started = await auth(token).post('/api/sos').send({ message: 'Help' });
      const sosId = started.body.data.sos.id;

      const response = await auth(token)
        .patch(`/api/sos/${sosId}/location`)
        .send({ lat: 23.79, lng: 90.41 });

      expect(response.status).toBe(200);

      const detail = await auth(token).get(`/api/sos/${sosId}`);
      expect(detail.body.data.sos.currentLocation).toMatchObject({ lat: 23.79, lng: 90.41 });
    });

    it('rejects coordinates outside the valid range', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/sos').send({ lat: 200, lng: 500 });

      expect(response.status).toBe(422);
      expect(response.body.details.location).toBeDefined();
    });

    it('queues one email per active contact', async () => {
      const { token } = await createUser();
      await addContact(token, { name: 'Mother', email: 'mother@example.com' });
      await addContact(token, { name: 'Sister', email: 'sister@example.com' });

      await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const jobs = await MailJob.find({ kind: 'sos-alert' }).lean();
      expect(jobs).toHaveLength(2);
      expect(jobs.map((job) => job.to).sort()).toEqual([
        'mother@example.com',
        'sister@example.com',
      ]);
    });

    it('gives SOS mail the highest queue priority', async () => {
      const { token } = await createUser();
      await addContact(token);

      await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const job = await MailJob.findOne({ kind: 'sos-alert' }).lean();
      expect(job.priority).toBe(1);
    });

    it('puts the name, blood group and medical notes in the email', async () => {
      const { token } = await createUser({
        name: 'Ayesha Rahman',
        bloodGroup: 'O+',
        medicalInfo: 'Severe peanut allergy',
      });
      await addContact(token);

      await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const job = await MailJob.findOne({ kind: 'sos-alert' }).lean();

      expect(job.html).toContain('Ayesha Rahman');
      expect(job.html).toContain('O+');
      expect(job.html).toContain('Severe peanut allergy');

      expect(job.text).toContain('Severe peanut allergy');
    });

    it('does not email a contact that has been switched off', async () => {
      const { token } = await createUser();
      const contact = await addContact(token, { email: 'inactive@example.com' });
      await auth(token).patch(`/api/contacts/${contact.id}`).send({ isActive: false });

      await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const jobs = await MailJob.find({ kind: 'sos-alert' }).lean();
      expect(jobs).toHaveLength(0);
    });

    it('still raises the alert when there are no contacts, and says so', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/sos').send(DHAKA);

      expect(response.status).toBe(201);
      expect(response.body.data.contactCount).toBe(0);
      expect(response.body.message).toMatch(/no emergency contacts/i);
    });

    it('updates the existing alert instead of starting a second one', async () => {
      const { token } = await createUser();
      await addContact(token);

      const first = await auth(token).post('/api/sos').send(DHAKA);
      const second = await auth(token).post('/api/sos').send(offsetNorth(DHAKA, 100));

      expect(second.status).toBe(200);
      expect(second.body.data.sos.id).toBe(first.body.data.sos.id);
      expect(await SosEvent.countDocuments({ status: 'active' })).toBe(1);
    });

    it('stores only the hash of the tracking token', async () => {
      const { token } = await createUser();
      const response = await auth(token).post('/api/sos').send(DHAKA);
      const plain = response.body.data.trackingToken;

      const record = await SosEvent.findById(response.body.data.sos.id).lean();

      expect(record.trackingTokenHash).not.toBe(plain);
      expect(record.trackingTokenHash).toBe(hashToken(plain));
    });
  });

  describe('Live tracking (FR-3)', () => {
    it('appends points to the trail', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);
      const sosId = created.body.data.sos.id;

      await auth(token)
        .patch(`/api/sos/${sosId}/location`)
        .send({ ...offsetNorth(DHAKA, 50), accuracy: 12 });

      const response = await auth(token)
        .patch(`/api/sos/${sosId}/location`)
        .send(offsetNorth(DHAKA, 100));

      expect(response.status).toBe(200);

      expect(response.body.data.trailPointCount).toBe(3);
    });

    it('refuses a location update on a closed alert', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);
      const sosId = created.body.data.sos.id;

      await auth(token).patch(`/api/sos/${sosId}/resolve`).send({});

      const response = await auth(token)
        .patch(`/api/sos/${sosId}/location`)
        .send(offsetNorth(DHAKA, 50));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SOS_NOT_ACTIVE');
    });

    it('does not let one user push locations onto another user’s alert', async () => {
      const owner = await createUser();
      const stranger = await createUser();

      const created = await auth(owner.token).post('/api/sos').send(DHAKA);
      const sosId = created.body.data.sos.id;

      const response = await auth(stranger.token)
        .patch(`/api/sos/${sosId}/location`)
        .send(offsetNorth(DHAKA, 50));

      expect(response.status).toBe(404);
    });
  });

  describe('Public tracking page (FR-2)', () => {
    it('serves the alert to anyone holding the token, with no sign-in', async () => {
      const { token } = await createUser({
        name: 'Ayesha Rahman',
        bloodGroup: 'B+',
        medicalInfo: 'Asthma',
      });
      const created = await auth(token).post('/api/sos').send(DHAKA);
      const trackingToken = created.body.data.trackingToken;

      const response = await request(app).get(`/api/sos/track/${trackingToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tracking.person.name).toBe('Ayesha Rahman');
      expect(response.body.data.tracking.person.bloodGroup).toBe('B+');
      expect(response.body.data.tracking.person.medicalInfo).toBe('Asthma');
    });

    it('exposes nothing beyond what a responder needs', async () => {
      const { token, user } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);

      const response = await request(app).get(
        `/api/sos/track/${created.body.data.trackingToken}`
      );

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(user.email);
      expect(response.body.data.tracking.person.email).toBeUndefined();
      expect(response.body.data.tracking.notifiedContacts).toBeUndefined();
    });

    it('rejects a made-up token', async () => {
      const response = await request(app).get('/api/sos/track/completely-made-up');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('TRACKING_EXPIRED');
    });

    it('stops working once the alert is resolved', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);
      const trackingToken = created.body.data.trackingToken;

      await auth(token).patch(`/api/sos/${created.body.data.sos.id}/resolve`).send({});

      const response = await request(app).get(`/api/sos/track/${trackingToken}`);
      expect(response.status).toBe(404);
    });

    it('stops working after the expiry time', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);
      const trackingToken = created.body.data.trackingToken;

      await SosEvent.updateOne(
        { _id: created.body.data.sos.id },
        { $set: { trackingExpiresAt: new Date(Date.now() - 1000) } }
      );

      const response = await request(app).get(`/api/sos/track/${trackingToken}`);
      expect(response.status).toBe(404);
    });
  });

  describe('Resolution (FR-10)', () => {
    it('records the duration and emails the all-clear', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'mother@example.com' });

      const created = await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const response = await auth(token)
        .patch(`/api/sos/${created.body.data.sos.id}/resolve`)
        .send({ note: 'Home safe' });

      expect(response.status).toBe(200);
      expect(response.body.data.sos.status).toBe('resolved');
      expect(response.body.data.sos.durationMs).toBeGreaterThanOrEqual(0);

      await settle();
      const allClear = await MailJob.findOne({ kind: 'sos-resolved' }).lean();
      expect(allClear).not.toBeNull();
      expect(allClear.to).toBe('mother@example.com');
    });

    it('cannot be resolved twice', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);

      await auth(token).patch(`/api/sos/${created.body.data.sos.id}/resolve`).send({});
      const second = await auth(token)
        .patch(`/api/sos/${created.body.data.sos.id}/resolve`)
        .send({});

      expect(second.status).toBe(400);
      expect(second.body.code).toBe('SOS_NOT_ACTIVE');
    });

    it('revokes the tracking link on resolution', async () => {
      const { token } = await createUser();
      const created = await auth(token).post('/api/sos').send(DHAKA);

      await auth(token).patch(`/api/sos/${created.body.data.sos.id}/resolve`).send({});

      const record = await SosEvent.findById(created.body.data.sos.id).lean();
      expect(record.trackingTokenHash).toBeNull();
    });
  });

  describe('History and delivery status', () => {
    it('lists past alerts, newest first', async () => {
      const { token } = await createUser();

      const first = await auth(token).post('/api/sos').send(DHAKA);
      await auth(token).patch(`/api/sos/${first.body.data.sos.id}/resolve`).send({});
      const second = await auth(token).post('/api/sos').send(offsetNorth(DHAKA, 500));
      await auth(token).patch(`/api/sos/${second.body.data.sos.id}/resolve`).send({});

      const response = await auth(token).get('/api/sos/history');

      expect(response.status).toBe(200);
      expect(response.body.data.events).toHaveLength(2);
      expect(response.body.data.events[0].id).toBe(second.body.data.sos.id);
    });

    it('does not show one user another user’s history', async () => {
      const owner = await createUser();
      const stranger = await createUser();

      await auth(owner.token).post('/api/sos').send(DHAKA);

      const response = await auth(stranger.token).get('/api/sos/history');
      expect(response.body.data.events).toHaveLength(0);
    });

    it('reports per-recipient delivery status', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'mother@example.com' });

      const created = await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const response = await auth(token).get(
        `/api/sos/${created.body.data.sos.id}/alert-status`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.summary.total).toBeGreaterThan(0);
      expect(response.body.data.recipients[0].email).toBe('mother@example.com');
    });

    it('records who was notified even when the trail is written during fan-out', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'mother@example.com' });
      await addContact(token, { email: 'sister@example.com' });

      const created = await auth(token).post('/api/sos').send(DHAKA);
      const sosId = created.body.data.sos.id;

      await Promise.all([
        auth(token).patch(`/api/sos/${sosId}/location`).send(offsetNorth(DHAKA, 30)),
        auth(token).patch(`/api/sos/${sosId}/location`).send(offsetNorth(DHAKA, 60)),
        auth(token).patch(`/api/sos/${sosId}/location`).send(offsetNorth(DHAKA, 90)),
      ]);
      await settle();

      const stored = await SosEvent.findById(sosId).lean();
      expect(stored.notifiedContacts).toHaveLength(2);
      expect(stored.trail.length).toBeGreaterThanOrEqual(4);
    });

    it('moves a recipient from queued to sent once the mail goes out', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'mother@example.com' });

      const created = await auth(token).post('/api/sos').send(DHAKA);
      await settle();

      const stored = await SosEvent.findById(created.body.data.sos.id).lean();
      expect(stored.notifiedContacts[0].status).toBe('sent');
      expect(stored.notifiedContacts[0].sentAt).toBeTruthy();

      const history = await auth(token).get('/api/sos/history');
      expect(history.body.data.events[0].contactsDelivered).toBe(1);
    });

    it('emails the all-clear to everyone who was alerted', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'mother@example.com' });

      const created = await auth(token).post('/api/sos').send(DHAKA);
      const sosId = created.body.data.sos.id;
      await auth(token).patch(`/api/sos/${sosId}/location`).send(offsetNorth(DHAKA, 40));
      await settle();

      await auth(token).patch(`/api/sos/${sosId}/resolve`).send({ note: 'Safe now.' });
      await settle();

      const allClear = await MailJob.find({ relatedSos: sosId, kind: 'sos-resolved' }).lean();
      expect(allClear).toHaveLength(1);
      expect(allClear[0].to).toBe('mother@example.com');
    });
  });

  describe('Emergency contacts (FR-5)', () => {
    it('refuses a contact with no email address', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/contacts').send({ name: 'No Email' });

      expect(response.status).toBe(422);
      expect(response.body.details.email).toBeDefined();
    });

    it('refuses the same address twice', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'dup@example.com' });

      const response = await auth(token)
        .post('/api/contacts')
        .send({ name: 'Again', email: 'dup@example.com' });

      expect(response.status).toBe(409);
    });

    it('refuses the account holder’s own address', async () => {
      const { token, user } = await createUser();

      const response = await auth(token)
        .post('/api/contacts')
        .send({ name: 'Me', email: user.email });

      expect(response.status).toBe(422);
      expect(response.body.details.email).toMatch(/your own address/i);
    });

    it('lets two different users add the same person', async () => {
      const first = await createUser();
      const second = await createUser();

      await addContact(first.token, { email: 'shared@example.com' });
      const response = await auth(second.token)
        .post('/api/contacts')
        .send({ name: 'Shared', email: 'shared@example.com' });

      expect(response.status).toBe(201);
    });

    it('does not let one user delete another user’s contact', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const contact = await addContact(owner.token);

      const response = await auth(stranger.token).delete(`/api/contacts/${contact.id}`);
      expect(response.status).toBe(404);
    });
  });
});
