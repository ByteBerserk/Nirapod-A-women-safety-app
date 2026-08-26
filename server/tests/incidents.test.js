import { app, request, createUser, createUserWithFreshToken, auth, DHAKA, offsetNorth } from './helpers.js';
import Incident from '../src/models/Incident.js';
import Comment from '../src/models/Comment.js';
import { ROLES } from '../src/config/constants.js';

/** FR-6 to FR-13. */

function incidentPayload(overrides = {}) {
  return {
    title: 'Man following women near the bus stop',
    description:
      'A man in a grey jacket followed two women from the bus stop towards the lake road. ' +
      'He turned back when they went into a shop.',
    category: 'stalking',
    severity: 'high',
    lat: DHAKA.lat,
    lng: DHAKA.lng,
    area: 'Dhanmondi',
    city: 'Dhaka',
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
    ...overrides,
  };
}

async function createIncident(token, overrides = {}) {
  const response = await auth(token).post('/api/incidents').send(incidentPayload(overrides));
  expect(response.status).toBe(201);
  return response.body.data.incident;
}

describe('Incident reports', () => {
  describe('Creating (FR-6, FR-7)', () => {
    it('publishes a report', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/incidents').send(incidentPayload());

      expect(response.status).toBe(201);
      expect(response.body.data.incident.category).toBe('stalking');
      expect(response.body.data.incident.status).toBe('pending');
    });

    it('rejects a category that is not in the list', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/incidents')
        .send(incidentPayload({ category: 'alien-invasion' }));

      expect(response.status).toBe(422);
      expect(response.body.details.category).toBeDefined();
    });

    it('rejects a description that is too short to be useful', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/incidents')
        .send(incidentPayload({ description: 'bad' }));

      expect(response.status).toBe(422);
      expect(response.body.details.description).toBeDefined();
    });

    it('rejects an incident dated in the future', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .post('/api/incidents')
        .send(
          incidentPayload({ occurredAt: new Date(Date.now() + 86400000).toISOString() })
        );

      expect(response.status).toBe(422);
      expect(response.body.details.occurredAt).toBeDefined();
    });

    it('rejects a report with no location', async () => {
      const { token } = await createUser();
      const payload = incidentPayload();
      delete payload.lat;
      delete payload.lng;

      const response = await auth(token).post('/api/incidents').send(payload);

      expect(response.status).toBe(422);
      expect(response.body.details.location).toBeDefined();
    });

    it('requires a session', async () => {
      const response = await request(app).post('/api/incidents').send(incidentPayload());
      expect(response.status).toBe(401);
    });

    it('hides the reporter on an anonymous report', async () => {
      const { token } = await createUser({ name: 'Ayesha Rahman' });
      const incident = await createIncident(token, { isAnonymous: true });

      const response = await request(app).get(`/api/incidents/${incident.id}`);

      expect(response.body.data.incident.reporter.name).toBe('Anonymous');
      expect(response.body.data.incident.reporter.id).toBeNull();
      expect(JSON.stringify(response.body)).not.toContain('Ayesha Rahman');
    });

    it('lets a moderator see who wrote an anonymous report', async () => {
      const author = await createUser({ name: 'Ayesha Rahman' });
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(author.token, { isAnonymous: true });
      const response = await auth(moderator.token).get(`/api/incidents/${incident.id}`);

      expect(response.body.data.incident.trueReporter.name).toBe('Ayesha Rahman');
    });
  });

  describe('Listing and searching (FR-9)', () => {
    it('is readable without signing in', async () => {
      const { token } = await createUser();
      await createIncident(token);

      const response = await request(app).get('/api/incidents');

      expect(response.status).toBe(200);
      expect(response.body.data.incidents).toHaveLength(1);
    });

    it('filters by category', async () => {
      const { token } = await createUser();
      await createIncident(token, { category: 'theft', title: 'Phone snatched at the crossing' });
      await createIncident(token, { category: 'harassment', title: 'Shouting outside the market' });

      const response = await request(app).get('/api/incidents?category=theft');

      expect(response.body.data.incidents).toHaveLength(1);
      expect(response.body.data.incidents[0].category).toBe('theft');
    });

    it('finds reports by keyword', async () => {
      const { token } = await createUser();
      await createIncident(token, { title: 'Unlit alley behind the pharmacy' });
      await createIncident(token, { title: 'Crowd blocking the footbridge' });

      const response = await request(app).get('/api/incidents?q=pharmacy');

      expect(response.body.data.incidents.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.incidents[0].title).toMatch(/pharmacy/i);
    });

    it('does not fall over on a search containing regex characters', async () => {
      const { token } = await createUser();
      await createIncident(token);

      const response = await request(app).get('/api/incidents?q=' + encodeURIComponent('c++ ( ['));

      expect(response.status).toBe(200);
    });

    it('filters by distance', async () => {
      const { token } = await createUser();
      await createIncident(token, { lat: DHAKA.lat, lng: DHAKA.lng });
      // Roughly 90 km north - far outside a 5 km search.
      await createIncident(token, { lat: DHAKA.lat + 0.8, lng: DHAKA.lng });

      const response = await request(app).get(
        `/api/incidents?lat=${DHAKA.lat}&lng=${DHAKA.lng}&radius=5000`
      );

      expect(response.body.data.incidents).toHaveLength(1);
    });

    it('paginates and reports totals', async () => {
      const { token } = await createUser();
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await createIncident(token, { title: `Incident number ${i} on the main road` });
      }

      const response = await request(app).get('/api/incidents?limit=2&page=2');

      expect(response.body.data.incidents).toHaveLength(2);
      expect(response.body.meta.total).toBe(5);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.meta.hasNextPage).toBe(true);
    });

    it('caps an absurd page size instead of honouring it', async () => {
      const { token } = await createUser();
      await createIncident(token);

      const response = await request(app).get('/api/incidents?limit=100000');

      expect(response.body.meta.limit).toBeLessThanOrEqual(100);
    });

    it('hides removed reports from the public list', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);
      await Incident.updateOne({ _id: incident.id }, { $set: { status: 'removed' } });

      const response = await request(app).get('/api/incidents');
      expect(response.body.data.incidents).toHaveLength(0);
    });
  });

  describe('Map pins (FR-8)', () => {
    it('returns lightweight pins around a point', async () => {
      const { token } = await createUser();
      await createIncident(token);

      const response = await request(app).get(
        `/api/incidents/map?lat=${DHAKA.lat}&lng=${DHAKA.lng}&radius=5000`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.pins).toHaveLength(1);
      // The pin payload must stay small - no description on the map.
      expect(response.body.data.pins[0].description).toBeUndefined();
      expect(response.body.data.counts.total).toBe(1);
    });

    it('requires a map centre', async () => {
      const response = await request(app).get('/api/incidents/map');
      expect(response.status).toBe(400);
    });
  });

  describe('Editing and deleting', () => {
    it('lets the author edit their own report', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);

      const response = await auth(token)
        .patch(`/api/incidents/${incident.id}`)
        .send({ title: 'Updated title for this report' });

      expect(response.status).toBe(200);
      expect(response.body.data.incident.title).toBe('Updated title for this report');
    });

    it('does not let a stranger edit someone else’s report', async () => {
      const author = await createUser();
      const stranger = await createUser();
      const incident = await createIncident(author.token);

      const response = await auth(stranger.token)
        .patch(`/api/incidents/${incident.id}`)
        .send({ title: 'Hijacked title goes here' });

      expect(response.status).toBe(403);
    });

    it('sends an edited verified report back for review', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);
      await Incident.updateOne({ _id: incident.id }, { $set: { status: 'verified' } });

      const response = await auth(token)
        .patch(`/api/incidents/${incident.id}`)
        .send({ description: 'Completely different description of what happened that night.' });

      expect(response.body.data.incident.status).toBe('pending');
    });

    it('removes the comments when a report is deleted', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const incident = await createIncident(author.token);

      await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'I saw this too.' });

      await auth(author.token).delete(`/api/incidents/${incident.id}`);

      expect(await Comment.countDocuments({ incident: incident.id })).toBe(0);
    });

    it('returns 404 for a malformed id rather than crashing', async () => {
      const response = await request(app).get('/api/incidents/not-an-object-id');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('INVALID_ID');
    });
  });

  describe('Reactions (FR-11)', () => {
    it('adds a reaction', async () => {
      const author = await createUser();
      const reader = await createUser();
      const incident = await createIncident(author.token);

      const response = await auth(reader.token)
        .post(`/api/incidents/${incident.id}/react`)
        .send({ type: 'helpful' });

      expect(response.status).toBe(200);
      expect(response.body.data.reactionCounts.helpful).toBe(1);
      expect(response.body.data.myReaction).toBe('helpful');
    });

    it('removes the reaction when the same one is tapped again', async () => {
      const author = await createUser();
      const reader = await createUser();
      const incident = await createIncident(author.token);

      await auth(reader.token).post(`/api/incidents/${incident.id}/react`).send({ type: 'helpful' });
      const response = await auth(reader.token)
        .post(`/api/incidents/${incident.id}/react`)
        .send({ type: 'helpful' });

      expect(response.body.data.action).toBe('removed');
      expect(response.body.data.reactionCounts.helpful).toBe(0);
    });

    it('switches the reaction rather than counting both', async () => {
      const author = await createUser();
      const reader = await createUser();
      const incident = await createIncident(author.token);

      await auth(reader.token).post(`/api/incidents/${incident.id}/react`).send({ type: 'helpful' });
      const response = await auth(reader.token)
        .post(`/api/incidents/${incident.id}/react`)
        .send({ type: 'important' });

      expect(response.body.data.reactionCounts.helpful).toBe(0);
      expect(response.body.data.reactionCounts.important).toBe(1);
    });

    it('counts one reaction per person no matter how many times they tap', async () => {
      const author = await createUser();
      const readerOne = await createUser();
      const readerTwo = await createUser();
      const incident = await createIncident(author.token);

      await auth(readerOne.token).post(`/api/incidents/${incident.id}/react`).send({ type: 'helpful' });
      await auth(readerTwo.token).post(`/api/incidents/${incident.id}/react`).send({ type: 'helpful' });
      // Re-sending the same reaction from reader one toggles it off.
      await auth(readerOne.token).post(`/api/incidents/${incident.id}/react`).send({ type: 'helpful' });
      const response = await auth(readerOne.token)
        .post(`/api/incidents/${incident.id}/react`)
        .send({ type: 'helpful' });

      expect(response.body.data.reactionCounts.helpful).toBe(2);
    });

    it('rejects an invented reaction type', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);

      const response = await auth(token)
        .post(`/api/incidents/${incident.id}/react`)
        .send({ type: 'angry' });

      expect(response.status).toBe(422);
    });
  });

  describe('Comments (FR-9)', () => {
    it('posts a comment and increments the count', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const incident = await createIncident(author.token);

      const response = await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'The street light there has been out for weeks.' });

      expect(response.status).toBe(201);

      const detail = await request(app).get(`/api/incidents/${incident.id}`);
      expect(detail.body.data.incident.commentCount).toBe(1);
    });

    it('rejects an empty comment', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);

      const response = await auth(token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: '   ' });

      expect(response.status).toBe(422);
    });

    it('lets the author delete their own comment and decrements the count', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const incident = await createIncident(author.token);

      const created = await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'I saw this happen too.' });

      await auth(commenter.token).delete(
        `/api/incidents/${incident.id}/comments/${created.body.data.comment.id}`
      );

      const detail = await request(app).get(`/api/incidents/${incident.id}`);
      expect(detail.body.data.incident.commentCount).toBe(0);
    });

    it('does not let a stranger delete someone else’s comment', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const stranger = await createUser();
      const incident = await createIncident(author.token);

      const created = await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'This is my comment on the matter.' });

      const response = await auth(stranger.token).delete(
        `/api/incidents/${incident.id}/comments/${created.body.data.comment.id}`
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Moderation (FR-12, FR-13)', () => {
    it('accepts a flag from a member', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      const response = await auth(reporter.token).post('/api/admin/reports').send({
        targetType: 'incident',
        targetId: incident.id,
        reason: 'fake',
        details: 'This did not happen.',
      });

      expect(response.status).toBe(201);
    });

    it('refuses to let someone flag their own post', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);

      const response = await auth(token)
        .post('/api/admin/reports')
        .send({ targetType: 'incident', targetId: incident.id, reason: 'spam' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SELF_REPORT');
    });

    it('keeps the moderation queue away from ordinary members', async () => {
      const { token } = await createUser();

      const response = await auth(token).get('/api/admin/reports');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('lets a moderator remove flagged content', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);

      const flag = await auth(reporter.token)
        .post('/api/admin/reports')
        .send({ targetType: 'incident', targetId: incident.id, reason: 'fake' });

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${flag.body.data.report.id}/resolve`)
        .send({ action: 'remove-content', note: 'Fabricated report.' });

      expect(response.status).toBe(200);

      const record = await Incident.findById(incident.id).lean();
      expect(record.status).toBe('removed');
    });

    it('resolves every other flag on the same item at once', async () => {
      const author = await createUser();
      const reporterOne = await createUser();
      const reporterTwo = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);

      const first = await auth(reporterOne.token)
        .post('/api/admin/reports')
        .send({ targetType: 'incident', targetId: incident.id, reason: 'fake' });
      await auth(reporterTwo.token)
        .post('/api/admin/reports')
        .send({ targetType: 'incident', targetId: incident.id, reason: 'spam' });

      await auth(moderator.token)
        .patch(`/api/admin/reports/${first.body.data.report.id}/resolve`)
        .send({ action: 'dismiss' });

      const queue = await auth(moderator.token).get('/api/admin/reports?status=open');
      expect(queue.body.data.reports).toHaveLength(0);
    });

    it('lets a moderator verify a report', async () => {
      const author = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);

      const response = await auth(moderator.token)
        .patch(`/api/incidents/${incident.id}/status`)
        .send({ status: 'verified' });

      expect(response.status).toBe(200);
      expect(response.body.data.incident.status).toBe('verified');
    });

    it('does not let an ordinary member verify a report', async () => {
      const { token } = await createUser();
      const incident = await createIncident(token);

      const response = await auth(token)
        .patch(`/api/incidents/${incident.id}/status`)
        .send({ status: 'verified' });

      expect(response.status).toBe(403);
    });
  });
  /*
   * FR-6 evidence, NFR-4. `file.mimetype` is whatever the client wrote in the
   * multipart part - a claim, not a fact. Trusting it alone meant a Windows
   * executable renamed to evidence.png and labelled image/png was accepted and
   * stored as incident evidence.
   */
  describe('Evidence uploads are checked against their contents (FR-6)', () => {
    /* A real, if tiny, 1x1 PNG. */
    const PNG_1X1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    function withFields(builder) {
      const payload = incidentPayload();
      return builder
        .field('title', payload.title)
        .field('description', payload.description)
        .field('category', payload.category)
        .field('lat', String(payload.lat))
        .field('lng', String(payload.lng));
    }

    it('accepts a genuine image', async () => {
      const { token } = await createUser();

      const response = await withFields(auth(token).post('/api/incidents')).attach(
        'media',
        PNG_1X1,
        { filename: 'evidence.png', contentType: 'image/png' }
      );

      expect(response.status).toBe(201);
      expect(response.body.data.incident.media).toHaveLength(1);
    });

    it('rejects an executable renamed to .png', async () => {
      const { token } = await createUser();
      const exe = Buffer.from('4d5a90000300000004000000ffff0000b800', 'hex'); // "MZ" header

      const response = await withFields(auth(token).post('/api/incidents')).attach(
        'media',
        exe,
        { filename: 'payload.png', contentType: 'image/png' }
      );

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('CONTENT_TYPE_MISMATCH');
    });

    it('rejects an HTML page claiming to be a JPEG', async () => {
      const { token } = await createUser();
      const html = Buffer.from('<html><script>alert(1)</script></html>');

      const response = await withFields(auth(token).post('/api/incidents')).attach(
        'media',
        html,
        { filename: 'x.jpg', contentType: 'image/jpeg' }
      );

      expect(response.status).toBe(400);
    });

    it('does not store the incident when its evidence is rejected', async () => {
      const { token } = await createUser();
      const before = await Incident.countDocuments();

      await withFields(auth(token).post('/api/incidents')).attach(
        'media',
        Buffer.from('nonsense'),
        { filename: 'fake.png', contentType: 'image/png' }
      );

      expect(await Incident.countDocuments()).toBe(before);
    });

    it('rejects a profile picture that is not really an image', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .patch('/api/users/profile/avatar')
        .attach('avatar', Buffer.from('definitely not a png'), {
          filename: 'me.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(400);
    });

    it('still accepts a real profile picture', async () => {
      const { token } = await createUser();

      const response = await auth(token)
        .patch('/api/users/profile/avatar')
        .attach('avatar', PNG_1X1, { filename: 'me.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
    });
  });
});
