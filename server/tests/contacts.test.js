import { createUser, auth } from './helpers.js';
import EmergencyContact from '../src/models/EmergencyContact.js';
import { LIMITS } from '../src/config/constants.js';
import { request as req, app } from './helpers.js';

/**
 * FR-5. The validation and cross-user isolation rules are covered alongside
 * the alert path in sos.test.js; this suite covers the rest of the lifecycle -
 * listing order, editing, deactivating and the cap.
 */

function contactPayload(overrides = {}) {
  return {
    name: 'Ammu',
    email: 'ammu@example.com',
    phone: '+8801711223344',
    relationship: 'Mother',
    priority: 1,
    ...overrides,
  };
}

async function addContact(token, overrides = {}) {
  const response = await auth(token).post('/api/contacts').send(contactPayload(overrides));
  expect(response.status).toBe(201);
  return response.body.data.contact;
}

describe('Emergency contacts', () => {
  describe('Adding', () => {
    it('stores the trusted person and reports them as active', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/contacts').send(contactPayload());

      expect(response.status).toBe(201);
      expect(response.body.data.contact.name).toBe('Ammu');
      expect(response.body.data.contact.email).toBe('ammu@example.com');
      expect(response.body.data.contact.isActive).toBe(true);
    });

    it('lower-cases and trims the address the alert will be sent to', async () => {
      const { token } = await createUser();

      const contact = await addContact(token, { email: '  Ammu@Example.COM  ' });

      expect(contact.email).toBe('ammu@example.com');
    });

    it('rejects an address that is not an address', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/contacts')
        .send(contactPayload({ email: 'not-an-email' }));

      expect(response.status).toBe(422);
      expect(response.body.details.email).toBeDefined();
    });

    it('rejects a name that is too short to identify anyone', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/contacts').send(contactPayload({ name: 'A' }));

      expect(response.status).toBe(422);
      expect(response.body.details.name).toBeDefined();
    });

    it('refuses to add more than the cap allows', async () => {
      const { token } = await createUser();

      for (let i = 0; i < LIMITS.MAX_EMERGENCY_CONTACTS; i += 1) {
        /* eslint-disable no-await-in-loop */
        await addContact(token, { email: `contact${i}@example.com`, name: `Contact ${i}` });
      }

      const response = await auth(token)
        .post('/api/contacts')
        .send(contactPayload({ email: 'one-too-many@example.com' }));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('CONTACT_LIMIT');
    });
  });

  describe('Listing', () => {
    it('orders by priority so the first person called is first', async () => {
      const { token } = await createUser();

      await addContact(token, { name: 'Neighbour', email: 'n@example.com', priority: 3 });
      await addContact(token, { name: 'Sister', email: 's@example.com', priority: 1 });
      await addContact(token, { name: 'Friend', email: 'f@example.com', priority: 2 });

      const response = await auth(token).get('/api/contacts');

      expect(response.status).toBe(200);
      expect(response.body.data.contacts.map((c) => c.name)).toEqual([
        'Sister',
        'Friend',
        'Neighbour',
      ]);
    });

    it('reports the active count and the cap so the dashboard can warn', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      await auth(token).patch(`/api/contacts/${contact.id}`).send({ isActive: false });
      const response = await auth(token).get('/api/contacts');

      expect(response.body.data.activeCount).toBe(0);
      expect(response.body.data.limit).toBe(LIMITS.MAX_EMERGENCY_CONTACTS);
    });

    it('shows nobody else’s contacts', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      await addContact(owner.token);

      const response = await auth(stranger.token).get('/api/contacts');

      expect(response.body.data.contacts).toHaveLength(0);
    });
  });

  describe('Editing', () => {
    it('updates the details', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      const response = await auth(token)
        .patch(`/api/contacts/${contact.id}`)
        .send({ name: 'Ammu (new number)', phone: '+8801999888777', priority: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data.contact.name).toBe('Ammu (new number)');
      expect(response.body.data.contact.priority).toBe(2);
    });

    it('switches a contact off without deleting them', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      const response = await auth(token)
        .patch(`/api/contacts/${contact.id}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.contact.isActive).toBe(false);
      expect(await EmergencyContact.countDocuments({})).toBe(1);
    });

    it('refuses to move a contact onto an address another contact already uses', async () => {
      const { token } = await createUser();
      await addContact(token, { email: 'first@example.com' });
      const second = await addContact(token, { email: 'second@example.com', name: 'Baba' });

      const response = await auth(token)
        .patch(`/api/contacts/${second.id}`)
        .send({ email: 'first@example.com' });

      expect(response.status).toBe(422);
      expect(response.body.details.email).toBeDefined();
    });

    it('refuses to point a contact at the account holder', async () => {
      const { token, user } = await createUser();
      const contact = await addContact(token);

      const response = await auth(token)
        .patch(`/api/contacts/${contact.id}`)
        .send({ email: user.email });

      expect(response.status).toBe(422);
      expect(response.body.details.email).toBeDefined();
    });

    it('accepts the contact’s own address unchanged', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      const response = await auth(token)
        .patch(`/api/contacts/${contact.id}`)
        .send({ email: 'ammu@example.com', name: 'Ammu' });

      expect(response.status).toBe(200);
    });

    it('does not let one user edit another user’s contact', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const contact = await addContact(owner.token);

      const response = await auth(stranger.token)
        .patch(`/api/contacts/${contact.id}`)
        .send({ name: 'Hijacked' });

      expect(response.status).toBe(404);
    });
  });

  describe('Removing', () => {
    it('deletes the contact', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      const response = await auth(token).delete(`/api/contacts/${contact.id}`);

      expect(response.status).toBe(204);
      expect(await EmergencyContact.countDocuments({})).toBe(0);
    });

    it('404s on a contact that is already gone', async () => {
      const { token } = await createUser();
      const contact = await addContact(token);

      await auth(token).delete(`/api/contacts/${contact.id}`);
      const response = await auth(token).delete(`/api/contacts/${contact.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Access', () => {
    it('requires a signed-in user', async () => {

      const response = await req(app).get('/api/contacts');

      expect(response.status).toBe(401);
    });
  });
});
