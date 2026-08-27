import { createUser, createUserWithFreshToken, auth, DHAKA, settle } from './helpers.js';
import Incident from '../src/models/Incident.js';
import Comment from '../src/models/Comment.js';
import ContentReport from '../src/models/ContentReport.js';
import User from '../src/models/User.js';
import MailJob from '../src/models/MailJob.js';
import { ROLES, INCIDENT_STATUS, ACCOUNT_STATUS } from '../src/config/constants.js';

function incidentPayload(overrides = {}) {
  return {
    title: 'Group shouting at passers-by outside the market',
    description:
      'Four men were shouting at women walking past the market gate and would not let them by.',
    category: 'harassment',
    severity: 'medium',
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

async function reportIncident(token, incidentId, body = {}) {
  return auth(token)
    .post('/api/admin/reports')
    .send({ targetType: 'incident', targetId: incidentId, reason: 'fake', ...body });
}

describe('Moderation', () => {
  describe('Reporting content (FR-12)', () => {
    it('accepts a report from another member', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      const response = await reportIncident(reporter.token, incident.id, {
        reason: 'fake',
        details: 'This never happened, I was there all evening.',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.report.reason).toBe('fake');
      expect(await ContentReport.countDocuments({})).toBe(1);
    });

    it('counts the report on the incident so the queue can rank it', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      await reportIncident(reporter.token, incident.id);

      const stored = await Incident.findById(incident.id).lean();
      expect(stored.reportCount).toBe(1);
    });

    it('refuses a reason that is not on the list', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      const response = await reportIncident(reporter.token, incident.id, { reason: 'because' });

      expect(response.status).toBe(422);
      expect(response.body.details.reason).toBeDefined();
    });

    it('tells someone to delete their own post rather than report it', async () => {
      const author = await createUser();
      const incident = await createIncident(author.token);

      const response = await reportIncident(author.token, incident.id);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SELF_REPORT');
    });

    it('updates the existing report instead of stacking duplicates', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      await reportIncident(reporter.token, incident.id, { reason: 'fake' });
      const second = await reportIncident(reporter.token, incident.id, { reason: 'abusive' });

      expect(second.status).toBe(200);
      expect(await ContentReport.countDocuments({})).toBe(1);
      const stored = await ContentReport.findOne({}).lean();
      expect(stored.reason).toBe('abusive');
    });

    it('reports a comment as well as an incident', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const reporter = await createUser();
      const incident = await createIncident(author.token);

      const posted = await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'Nonsense, nothing happened here.' });
      expect(posted.status).toBe(201);

      const response = await auth(reporter.token).post('/api/admin/reports').send({
        targetType: 'comment',
        targetId: posted.body.data.comment.id,
        reason: 'offensive',
      });

      expect(response.status).toBe(201);
    });

    it('404s on something that does not exist', async () => {
      const reporter = await createUser();

      const response = await reportIncident(reporter.token, '507f1f77bcf86cd799439011');

      expect(response.status).toBe(404);
    });
  });

  describe('The queue (FR-13)', () => {
    it('is closed to ordinary members', async () => {
      const member = await createUser();

      const response = await auth(member.token).get('/api/admin/reports');

      expect(response.status).toBe(403);
    });

    it('lists open reports for a moderator', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);
      await reportIncident(reporter.token, incident.id);

      const response = await auth(moderator.token).get('/api/admin/reports');

      expect(response.status).toBe(200);
      expect(response.body.data.reports).toHaveLength(1);
      expect(response.body.data.reports[0].status).toBe('open');
    });

    it('shows the detail of one report', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);

      const response = await auth(moderator.token).get(
        `/api/admin/reports/${reported.body.data.report.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.report.reason).toBe('fake');
    });
  });

  describe('Resolving a report (FR-13)', () => {

    async function scenario() {
      const author = await createUser({ email: 'author@example.com' });
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);

      return { author, reporter, moderator, incident, reportId: reported.body.data.report.id };
    }

    it('removes the content', async () => {
      const { moderator, incident, reportId } = await scenario();

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'remove-content', note: 'Fabricated report.' });

      expect(response.status).toBe(200);
      const stored = await Incident.findById(incident.id).lean();
      expect(stored.status).toBe(INCIDENT_STATUS.REMOVED);
      expect(stored.removedAt).not.toBeNull();
    });

    it('dismisses a report and leaves the content alone', async () => {
      const { moderator, incident, reportId } = await scenario();

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'dismiss', note: 'Looks genuine.' });

      expect(response.status).toBe(200);
      const stored = await Incident.findById(incident.id).lean();
      expect(stored.status).not.toBe(INCIDENT_STATUS.REMOVED);
    });

    it('restores content that was removed by mistake', async () => {
      const { author, reporter, moderator, incident } = await scenario();
      const first = await ContentReport.findOne({}).lean();

      await auth(moderator.token)
        .patch(`/api/admin/reports/${first._id}/resolve`)
        .send({ action: 'remove-content' });

      const another = await createUser();
      const reReported = await reportIncident(another.token, incident.id);

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reReported.body.data.report.id}/resolve`)
        .send({ action: 'restore-content' });

      expect(response.status).toBe(200);
      const stored = await Incident.findById(incident.id).lean();
      expect(stored.status).toBe(INCIDENT_STATUS.PENDING);
      expect(author).toBeDefined();
      expect(reporter).toBeDefined();
    });

    it('suspends the author and emails them why', async () => {
      const { author, moderator, reportId } = await scenario();

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'suspend-user', note: 'Repeated false reports.', suspendDays: 14 });

      expect(response.status).toBe(200);
      await settle();

      const stored = await User.findById(author.user.id).lean();
      expect(stored.accountStatus).toBe(ACCOUNT_STATUS.SUSPENDED);
      expect(stored.suspension.reason).toBe('Repeated false reports.');

      const mail = await MailJob.findOne({ kind: 'account-status', to: 'author@example.com' });
      expect(mail).not.toBeNull();
    });

    it('ends the suspended user’s session immediately', async () => {
      const { author, moderator, reportId } = await scenario();

      const before = await auth(author.token).get('/api/auth/me');
      expect(before.status).toBe(200);

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'suspend-user' });

      const after = await auth(author.token).get('/api/auth/me');
      expect(after.status).toBe(401);
    });

    it('refuses an action that is not on the list', async () => {
      const { moderator, reportId } = await scenario();

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'delete-everything' });

      expect(response.status).toBe(422);
      expect(response.body.details.action).toBeDefined();
    });

    it('cannot resolve the same report twice', async () => {
      const { moderator, reportId } = await scenario();

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'dismiss' });

      const second = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'dismiss' });

      expect(second.status).toBe(409);
    });

    it('does not let a moderator suspend an administrator', async () => {
      const admin = await createUserWithFreshToken({
        role: ROLES.ADMIN,
        email: 'boss@example.com',
      });
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(admin.token);
      const reported = await reportIncident(reporter.token, incident.id);

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reported.body.data.report.id}/resolve`)
        .send({ action: 'suspend-user' });

      expect(response.status).toBe(403);
      const stored = await User.findById(admin.user.id).lean();
      expect(stored.accountStatus).toBe(ACCOUNT_STATUS.ACTIVE);
    });
  });

  describe('Removed content', () => {
    it('disappears from the public feed', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reported.body.data.report.id}/resolve`)
        .send({ action: 'remove-content' });

      const feed = await auth(reporter.token).get('/api/incidents');

      expect(feed.status).toBe(200);
      expect(feed.body.data.incidents.map((i) => i.id)).not.toContain(incident.id);
    });

    it('hides a removed comment from the thread', async () => {
      const author = await createUser();
      const commenter = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });
      const incident = await createIncident(author.token);

      const posted = await auth(commenter.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'Something abusive goes here.' });

      const reported = await auth(reporter.token).post('/api/admin/reports').send({
        targetType: 'comment',
        targetId: posted.body.data.comment.id,
        reason: 'abusive',
      });

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reported.body.data.report.id}/resolve`)
        .send({ action: 'remove-content' });

      const stored = await Comment.findById(posted.body.data.comment.id).lean();
      expect(stored.isRemoved).toBe(true);

      const thread = await auth(reporter.token).get(`/api/incidents/${incident.id}/comments`);
      expect(thread.body.data.comments.map((c) => c.id)).not.toContain(
        posted.body.data.comment.id
      );
    });
  });

  describe('Undoing a removal (FR-13)', () => {
    it('restores content that a moderator removed by mistake', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);
      const reportId = reported.body.data.report.id;

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'remove-content', note: 'Removed in error.' });

      expect((await Incident.findById(incident.id).lean()).status).toBe(INCIDENT_STATUS.REMOVED);

      const restored = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'restore-content', note: 'Appeal upheld.' });

      expect(restored.status).toBe(200);

      const stored = await Incident.findById(incident.id).lean();
      expect(stored.status).toBe(INCIDENT_STATUS.PENDING);
      expect(stored.removedAt).toBeNull();

      const publicView = await auth(reporter.token).get(`/api/incidents/${incident.id}`);
      expect(publicView.status).toBe(200);
    });

    it('restores a removed comment', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(author.token);
      const posted = await auth(author.token)
        .post(`/api/incidents/${incident.id}/comments`)
        .send({ body: 'A comment that will be removed and then put back.' });

      const reported = await auth(reporter.token).post('/api/admin/reports').send({
        targetType: 'comment',
        targetId: posted.body.data.comment.id,
        reason: 'abusive',
      });
      const reportId = reported.body.data.report.id;

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'remove-content' });

      const restored = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'restore-content' });

      expect(restored.status).toBe(200);
      expect((await Comment.findById(posted.body.data.comment.id).lean()).isRemoved).toBe(false);
    });

    it('refuses to restore content that is not removed', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);

      const response = await auth(moderator.token)
        .patch(`/api/admin/reports/${reported.body.data.report.id}/resolve`)
        .send({ action: 'restore-content' });

      expect(response.status).toBe(409);
    });

    it('still refuses every other action on a report already reviewed', async () => {
      const author = await createUser();
      const reporter = await createUser();
      const moderator = await createUserWithFreshToken({ role: ROLES.MODERATOR });

      const incident = await createIncident(author.token);
      const reported = await reportIncident(reporter.token, incident.id);
      const reportId = reported.body.data.report.id;

      await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'dismiss' });

      const again = await auth(moderator.token)
        .patch(`/api/admin/reports/${reportId}/resolve`)
        .send({ action: 'remove-content' });

      expect(again.status).toBe(409);
    });
  });
});
