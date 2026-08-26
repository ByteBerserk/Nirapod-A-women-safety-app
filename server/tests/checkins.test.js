import { createUser, auth, DHAKA, settle, addContact } from './helpers.js';
import SafetyCheckIn from '../src/models/SafetyCheckIn.js';
import SosEvent from '../src/models/SosEvent.js';
import MailJob from '../src/models/MailJob.js';
import Notification from '../src/models/Notification.js';
import * as checkInService from '../src/services/checkInService.js';
import { CHECKIN_STATUS } from '../src/config/constants.js';

/** FR-26: safety check-in. */


function startPayload(overrides = {}) {
  return {
    label: 'Walking home from campus',
    minutes: 30,
    graceMinutes: 5,
    ...DHAKA,
    ...overrides,
  };
}

/** Drags a check-in's deadlines into the past so the scheduler sees it as due. */
async function makeDue(id, { escalate = false } = {}) {
  const past = new Date(Date.now() - 60 * 1000);
  const update = { dueAt: past };
  if (escalate) update.escalateAt = past;
  await SafetyCheckIn.updateOne({ _id: id }, { $set: update });
}

describe('Safety check-in (FR-26)', () => {
  describe('Setting a timer', () => {
    it('starts a check-in and reports who would be alerted', async () => {
      const { token } = await createUser();
      await addContact(token);

      const response = await auth(token).post('/api/check-ins').send(startPayload());

      expect(response.status).toBe(201);
      expect(response.body.data.checkIn.status).toBe(CHECKIN_STATUS.ACTIVE);
      expect(response.body.data.checkIn.label).toBe('Walking home from campus');
      expect(response.body.data.contactCount).toBe(1);
      expect(response.body.message).toMatch(/1 contact will be alerted/i);
    });

    it('escalateAt is the deadline plus the grace period', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/check-ins')
        .send(startPayload({ minutes: 10, graceMinutes: 4 }));

      const { dueAt, escalateAt } = response.body.data.checkIn;
      const gapMinutes = (new Date(escalateAt) - new Date(dueAt)) / 60000;
      expect(Math.round(gapMinutes)).toBe(4);
    });

    /*
     * A timer whose escalation would email nobody does nothing at all, and the
     * moment to learn that is when it is set rather than when it expires.
     */
    it('says so plainly when there are no contacts to alert', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/check-ins').send(startPayload());

      expect(response.status).toBe(201);
      expect(response.body.data.contactCount).toBe(0);
      expect(response.body.message).toMatch(/no emergency contacts/i);
    });

    it('allows only one open check-in at a time', async () => {
      const { token } = await createUser();
      await auth(token).post('/api/check-ins').send(startPayload());

      const second = await auth(token).post('/api/check-ins').send(startPayload());

      expect(second.status).toBe(409);
      expect(second.body.code).toBe('CHECKIN_ALREADY_OPEN');
    });

    it('starts without a location, for a phone with no fix', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/check-ins')
        .send({ label: 'Late bus home', minutes: 20 });

      expect(response.status).toBe(201);
      expect(response.body.data.checkIn.startLocation).toBeNull();
    });

    it('rejects a duration outside the allowed range', async () => {
      const { token } = await createUser();

      const tooLong = await auth(token).post('/api/check-ins').send(startPayload({ minutes: 5000 }));
      expect(tooLong.status).toBe(422);

      const tooShort = await auth(token).post('/api/check-ins').send(startPayload({ minutes: 0 }));
      expect(tooShort.status).toBe(422);
    });

    it('requires a label', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/check-ins').send({ minutes: 15 });

      expect(response.status).toBe(422);
      expect(response.body.details.label).toBeDefined();
    });
  });

  describe('Answering', () => {
    it('marks safe and alerts nobody', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      const response = await auth(token)
        .patch(`/api/check-ins/${id}/safe`)
        .send({ note: 'Home now.' });

      expect(response.status).toBe(200);
      expect(response.body.data.checkIn.status).toBe(CHECKIN_STATUS.SAFE);
      expect(await SosEvent.countDocuments()).toBe(0);
      expect(await MailJob.countDocuments({ kind: 'sos-alert' })).toBe(0);
    });

    it('extends the timer and clears the prompt', async () => {
      const { token } = await createUser();
      const started = await auth(token).post('/api/check-ins').send(startPayload({ minutes: 5 }));
      const id = started.body.data.checkIn.id;

      await makeDue(id);
      await checkInService.promptDue();
      expect((await SafetyCheckIn.findById(id)).status).toBe(CHECKIN_STATUS.AWAITING);

      const response = await auth(token).patch(`/api/check-ins/${id}/extend`).send({ minutes: 20 });

      expect(response.status).toBe(200);

      const stored = await SafetyCheckIn.findById(id);
      expect(stored.status).toBe(CHECKIN_STATUS.ACTIVE);
      expect(stored.promptedAt).toBeNull();
      expect(stored.extensionCount).toBe(1);
      expect(new Date(stored.dueAt).getTime()).toBeGreaterThan(Date.now());
    });

    /*
     * The important half of extending: pushing the timer back must actually
     * call the escalation off, not merely delay the question.
     */
    it('an extended check-in no longer escalates', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload({ minutes: 5 }));
      const id = started.body.data.checkIn.id;

      await makeDue(id, { escalate: true });
      await checkInService.promptDue();
      await auth(token).patch(`/api/check-ins/${id}/extend`).send({ minutes: 30 });

      const result = await checkInService.escalateOverdue();

      expect(result).toBe(0);
      expect(await SosEvent.countDocuments()).toBe(0);
    });

    it('cancels a check-in', async () => {
      const { token } = await createUser();
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      const response = await auth(token).patch(`/api/check-ins/${id}/cancel`).send({});

      expect(response.status).toBe(200);
      expect(response.body.data.checkIn.status).toBe(CHECKIN_STATUS.CANCELLED);
    });

    it('refuses to answer a check-in that is already closed', async () => {
      const { token } = await createUser();
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;
      await auth(token).patch(`/api/check-ins/${id}/safe`).send({});

      const again = await auth(token).patch(`/api/check-ins/${id}/safe`).send({});

      expect(again.status).toBe(400);
      expect(again.body.code).toBe('CHECKIN_CLOSED');
    });
  });

  describe('When the timer runs out', () => {
    it('asks the user to confirm, in the app and by email', async () => {
      const { token, user } = await createUser();
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      await makeDue(id);
      const prompted = await checkInService.promptDue();

      expect(prompted).toBe(1);

      const stored = await SafetyCheckIn.findById(id);
      expect(stored.status).toBe(CHECKIN_STATUS.AWAITING);
      expect(stored.promptedAt).toBeTruthy();

      const notification = await Notification.findOne({ user: user.id, type: 'checkin-due' });
      expect(notification).toBeTruthy();

      const mail = await MailJob.findOne({ kind: 'checkin-due' });
      expect(mail).toBeTruthy();
      expect(mail.subject).toMatch(/are you safe/i);
    });

    it('asks only once, however often the scheduler runs', async () => {
      const { token } = await createUser();
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      await makeDue(started.body.data.checkIn.id);

      await checkInService.promptDue();
      const second = await checkInService.promptDue();

      expect(second).toBe(0);
      expect(await MailJob.countDocuments({ kind: 'checkin-due' })).toBe(1);
    });

    it('does not ask before the timer is up', async () => {
      const { token } = await createUser();
      await auth(token).post('/api/check-ins').send(startPayload({ minutes: 60 }));

      expect(await checkInService.promptDue()).toBe(0);
    });
  });

  describe('Escalation - the predefined emergency procedure', () => {
    it('raises a real SOS when nobody answers in time', async () => {
      const { token, user } = await createUser();
      await addContact(token, { email: 'mother@example.com' });
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      await makeDue(id, { escalate: true });
      await checkInService.promptDue();
      const escalated = await checkInService.escalateOverdue();
      await settle();

      expect(escalated).toBe(1);

      const stored = await SafetyCheckIn.findById(id);
      expect(stored.status).toBe(CHECKIN_STATUS.ESCALATED);
      expect(stored.escalatedSos).toBeTruthy();

      // The same alert the red button raises, not a lesser one.
      const sos = await SosEvent.findById(stored.escalatedSos);
      expect(sos).toBeTruthy();
      expect(String(sos.user)).toBe(String(user.id));
      expect(sos.status).toBe('active');
      expect(sos.trigger).toBe('timer');
      expect(sos.message).toMatch(/missed safety check-in/i);

      // ...and the contacts were actually emailed.
      const alert = await MailJob.findOne({ kind: 'sos-alert', to: 'mother@example.com' });
      expect(alert).toBeTruthy();
    });

    it('carries the check-in location into the alert', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      await makeDue(id, { escalate: true });
      await checkInService.runDueChecks();
      await settle();

      const stored = await SafetyCheckIn.findById(id);
      const sos = await SosEvent.findById(stored.escalatedSos);

      expect(sos.startLocation.coordinates[1]).toBeCloseTo(DHAKA.lat, 4);
      expect(sos.startLocation.coordinates[0]).toBeCloseTo(DHAKA.lng, 4);
    });

    it('still raises the alert when the check-in had no location', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token)
        .post('/api/check-ins')
        .send({ label: 'Late bus home', minutes: 15 });
      const id = started.body.data.checkIn.id;

      await makeDue(id, { escalate: true });
      await checkInService.runDueChecks();
      await settle();

      const stored = await SafetyCheckIn.findById(id);
      expect(stored.status).toBe(CHECKIN_STATUS.ESCALATED);

      const sos = await SosEvent.findById(stored.escalatedSos);
      expect(sos).toBeTruthy();
      expect(sos.startLocation?.coordinates).toBeUndefined();
    });

    it('does not escalate inside the grace period', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      await makeDue(started.body.data.checkIn.id); // due, but grace has not run out

      await checkInService.promptDue();
      const escalated = await checkInService.escalateOverdue();

      expect(escalated).toBe(0);
      expect(await SosEvent.countDocuments()).toBe(0);
    });

    it('does not escalate one the user answered', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      await makeDue(id, { escalate: true });
      await checkInService.promptDue();
      await auth(token).patch(`/api/check-ins/${id}/safe`).send({});

      expect(await checkInService.escalateOverdue()).toBe(0);
      expect(await SosEvent.countDocuments()).toBe(0);
    });

    it('escalates once, not once per scheduler tick', async () => {
      const { token } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      await makeDue(started.body.data.checkIn.id, { escalate: true });

      await checkInService.runDueChecks();
      await checkInService.runDueChecks();
      await settle();

      expect(await SosEvent.countDocuments()).toBe(1);
    });

    it('tells the user their contacts were alerted', async () => {
      const { token, user } = await createUser();
      await addContact(token);
      const started = await auth(token).post('/api/check-ins').send(startPayload());
      await makeDue(started.body.data.checkIn.id, { escalate: true });

      await checkInService.runDueChecks();
      await settle();

      const notification = await Notification.findOne({
        user: user.id,
        type: 'checkin-escalated',
      });
      expect(notification).toBeTruthy();
    });
  });

  describe('Reading them back', () => {
    it('finds the running check-in', async () => {
      const { token } = await createUser();
      await auth(token).post('/api/check-ins').send(startPayload());

      const response = await auth(token).get('/api/check-ins/active');

      expect(response.status).toBe(200);
      expect(response.body.data.checkIn.label).toBe('Walking home from campus');
      expect(response.body.data.checkIn.secondsUntilDue).toBeGreaterThan(0);
    });

    it('returns null when nothing is running', async () => {
      const { token } = await createUser();

      const response = await auth(token).get('/api/check-ins/active');

      expect(response.status).toBe(200);
      expect(response.body.data.checkIn).toBeNull();
    });

    it('lists past check-ins, newest first', async () => {
      const { token } = await createUser();

      const first = await auth(token).post('/api/check-ins').send(startPayload({ label: 'First trip' }));
      await auth(token).patch(`/api/check-ins/${first.body.data.checkIn.id}/safe`).send({});
      const second = await auth(token).post('/api/check-ins').send(startPayload({ label: 'Second trip' }));
      await auth(token).patch(`/api/check-ins/${second.body.data.checkIn.id}/safe`).send({});

      const response = await auth(token).get('/api/check-ins');

      expect(response.body.data.checkIns).toHaveLength(2);
      expect(response.body.data.checkIns[0].label).toBe('Second trip');
    });
  });

  describe('Privacy', () => {
    it('does not show one user another user check-in', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const started = await auth(owner.token).post('/api/check-ins').send(startPayload());
      const id = started.body.data.checkIn.id;

      expect((await auth(stranger.token).get(`/api/check-ins/${id}`)).status).toBe(404);
      expect((await auth(stranger.token).patch(`/api/check-ins/${id}/safe`).send({})).status).toBe(404);
      expect((await auth(stranger.token).patch(`/api/check-ins/${id}/cancel`).send({})).status).toBe(404);
    });

    it('keeps one user check-ins out of another user list', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      await auth(owner.token).post('/api/check-ins').send(startPayload());

      const response = await auth(stranger.token).get('/api/check-ins');
      expect(response.body.data.checkIns).toHaveLength(0);
    });

    it('requires a session', async () => {
      const { request, app } = await import('./helpers.js');
      const response = await request(app).get('/api/check-ins/active');
      expect(response.status).toBe(401);
    });
  });
});
