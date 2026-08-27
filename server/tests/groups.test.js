import { createUser, auth, DHAKA, offsetNorth, settle } from './helpers.js';
import SafetyGroup from '../src/models/SafetyGroup.js';
import MailJob from '../src/models/MailJob.js';
import Notification from '../src/models/Notification.js';
import { hashToken } from '../src/utils/tokens.js';

async function createGroup(token, name = 'Family') {
  const response = await auth(token).post('/api/groups').send({ name });
  expect(response.status).toBe(201);
  return response.body.data.group;
}

async function inviteAndGetCode(ownerToken, groupId, email) {
  const response = await auth(ownerToken).post(`/api/groups/${groupId}/invites`).send({ email });
  expect(response.status).toBe(201);
  await settle();

  const job = await MailJob.findOne({ kind: 'group-invite', to: email }).sort('-createdAt').lean();
  expect(job).not.toBeNull();

  const match = /\/groups\/invite\/[a-f0-9]{24}\/([A-Za-z0-9_-]+)/.exec(job.html);
  expect(match).not.toBeNull();
  return match[1];
}

describe('Safety groups', () => {
  describe('Creating and membership (FR-14)', () => {
    it('creates a group with the creator as owner', async () => {
      const { token, user } = await createUser();

      const group = await createGroup(token);

      expect(group.memberCount).toBe(1);
      expect(group.isOwner).toBe(true);
      expect(group.members[0].id).toBe(user.id);
      expect(group.members[0].groupRole).toBe('owner');
    });

    it('hides a group from people who are not in it', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const group = await createGroup(owner.token);

      const response = await auth(stranger.token).get(`/api/groups/${group.id}`);

      expect(response.status).toBe(404);
    });

    it('rejects a name that is too short', async () => {
      const { token } = await createUser();

      const response = await auth(token).post('/api/groups').send({ name: 'ab' });

      expect(response.status).toBe(422);
      expect(response.body.details.name).toBeDefined();
    });
  });

  describe('Invitations (FR-14)', () => {
    it('emails an invitation containing a working link', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');

      expect(code).toEqual(expect.any(String));
      expect(code.length).toBeGreaterThan(10);
    });

    it('stores only the hash of the invitation code', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');

      const record = await SafetyGroup.findById(group.id).lean();
      expect(record.invites[0].codeHash).toBe(hashToken(code));
      expect(record.invites[0].codeHash).not.toBe(code);
    });

    it('adds the invitee when they accept', async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: 'invitee@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');

      const response = await auth(invitee.token)
        .post(`/api/groups/invite/${group.id}/${code}`)
        .send({ accept: true });

      expect(response.status).toBe(200);

      const detail = await auth(invitee.token).get(`/api/groups/${group.id}`);
      expect(detail.body.data.group.memberCount).toBe(2);
    });

    it('refuses an invitation addressed to someone else', async () => {
      const owner = await createUser();
      const intruder = await createUser({ email: 'intruder@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');

      const response = await auth(intruder.token)
        .post(`/api/groups/invite/${group.id}/${code}`)
        .send({ accept: true });

      expect(response.status).toBe(403);
    });

    it('refuses a made-up code', async () => {
      const owner = await createUser();
      const other = await createUser();
      const group = await createGroup(owner.token);

      const response = await auth(other.token)
        .post(`/api/groups/invite/${group.id}/fabricated-code`)
        .send({ accept: true });

      expect(response.status).toBe(404);
    });

    it('refuses an expired invitation', async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: 'invitee@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');
      await SafetyGroup.updateOne(
        { _id: group.id },
        { $set: { 'invites.0.expiresAt': new Date(Date.now() - 1000) } }
      );

      const response = await auth(invitee.token)
        .post(`/api/groups/invite/${group.id}/${code}`)
        .send({ accept: true });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVITE_EXPIRED');
    });

    it('lets a code be used only once', async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: 'invitee@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'invitee@example.com');

      await auth(invitee.token)
        .post(`/api/groups/invite/${group.id}/${code}`)
        .send({ accept: true });
      const second = await auth(invitee.token)
        .post(`/api/groups/invite/${group.id}/${code}`)
        .send({ accept: true });

      expect(second.status).toBe(404);
    });

    it('does not let an ordinary member invite people', async () => {
      const owner = await createUser();
      const member = await createUser({ email: 'member@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'member@example.com');
      await auth(member.token).post(`/api/groups/invite/${group.id}/${code}`).send({ accept: true });

      const response = await auth(member.token)
        .post(`/api/groups/${group.id}/invites`)
        .send({ email: 'another@example.com' });

      expect(response.status).toBe(403);
    });
  });

  describe('Messaging (FR-15)', () => {
    it('posts a message that members can read', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const sent = await auth(owner.token)
        .post(`/api/groups/${group.id}/messages`)
        .send({ body: 'Anyone walking back from campus tonight?' });

      expect(sent.status).toBe(201);

      const list = await auth(owner.token).get(`/api/groups/${group.id}/messages`);
      const bodies = list.body.data.messages.map((m) => m.body);
      expect(bodies).toContain('Anyone walking back from campus tonight?');
    });

    it('returns messages oldest first, for a chat window', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      await auth(owner.token).post(`/api/groups/${group.id}/messages`).send({ body: 'First' });
      await auth(owner.token).post(`/api/groups/${group.id}/messages`).send({ body: 'Second' });

      const list = await auth(owner.token).get(`/api/groups/${group.id}/messages`);
      const texts = list.body.data.messages.filter((m) => !m.isSystem).map((m) => m.body);

      expect(texts).toEqual(['First', 'Second']);
    });

    it('rejects an empty message', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const response = await auth(owner.token)
        .post(`/api/groups/${group.id}/messages`)
        .send({ body: '   ' });

      expect(response.status).toBe(422);
    });

    it('does not let a non-member post or read', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const group = await createGroup(owner.token);

      const post = await auth(stranger.token)
        .post(`/api/groups/${group.id}/messages`)
        .send({ body: 'Let me in' });
      const read = await auth(stranger.token).get(`/api/groups/${group.id}/messages`);

      expect(post.status).toBe(404);
      expect(read.status).toBe(404);
    });
  });

  describe('Location sharing (FR-16)', () => {
    it('shares a location and lists it', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const shared = await auth(owner.token)
        .post(`/api/groups/${group.id}/location`)
        .send({ ...DHAKA, accuracy: 15 });

      expect(shared.status).toBe(200);

      const response = await auth(owner.token).get(`/api/groups/${group.id}/locations`);
      expect(response.body.data.locations).toHaveLength(1);
      expect(response.body.data.locations[0].lat).toBeCloseTo(DHAKA.lat, 4);
    });

    it('hides the location again once sharing is switched off', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      await auth(owner.token).post(`/api/groups/${group.id}/location`).send(DHAKA);
      await auth(owner.token).delete(`/api/groups/${group.id}/location`);

      const response = await auth(owner.token).get(`/api/groups/${group.id}/locations`);
      expect(response.body.data.locations).toHaveLength(0);
    });

    it('does not include the coordinates of a member who is not sharing', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const detail = await auth(owner.token).get(`/api/groups/${group.id}`);

      expect(detail.body.data.group.members[0].lastLocation).toBeNull();
    });

    it('rejects a location share from a non-member', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const group = await createGroup(owner.token);

      const response = await auth(stranger.token)
        .post(`/api/groups/${group.id}/location`)
        .send(DHAKA);

      expect(response.status).toBe(404);
    });
  });

  describe('Group emergency alerts (FR-17)', () => {
    it('notifies every other member when someone raises an SOS', async () => {
      const owner = await createUser();
      const member = await createUser({ email: 'member@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'member@example.com');
      await auth(member.token).post(`/api/groups/invite/${group.id}/${code}`).send({ accept: true });

      await auth(owner.token).post('/api/sos').send(DHAKA);
      await settle();

      const notifications = await Notification.find({
        user: member.user.id,
        type: 'sos-alert',
      }).lean();
      expect(notifications.length).toBeGreaterThan(0);

      const groupMail = await MailJob.findOne({
        kind: 'group-sos',
        to: 'member@example.com',
      }).lean();
      expect(groupMail).not.toBeNull();
    });

    it('does not alert the person who raised it', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      await auth(owner.token).post('/api/sos').send(DHAKA);
      await settle();

      const selfMail = await MailJob.findOne({
        kind: 'group-sos',
        relatedUser: owner.user.id,
        to: owner.user.email,
      }).lean();
      expect(selfMail).toBeNull();
    });

    it('respects a group with SOS alerts switched off', async () => {
      const owner = await createUser();
      const member = await createUser({ email: 'quiet@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'quiet@example.com');
      await auth(member.token).post(`/api/groups/invite/${group.id}/${code}`).send({ accept: true });

      await auth(owner.token)
        .patch(`/api/groups/${group.id}`)
        .send({ alertMembersOnSos: false });

      await auth(owner.token).post('/api/sos').send(DHAKA);
      await settle();

      const mail = await MailJob.findOne({ kind: 'group-sos', to: 'quiet@example.com' }).lean();
      expect(mail).toBeNull();
    });
  });

  describe('Leaving and ownership', () => {
    it('passes ownership on when the owner leaves', async () => {
      const owner = await createUser();
      const member = await createUser({ email: 'member@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'member@example.com');
      await auth(member.token).post(`/api/groups/invite/${group.id}/${code}`).send({ accept: true });

      await auth(owner.token).post(`/api/groups/${group.id}/leave`);

      const record = await SafetyGroup.findById(group.id).lean();
      expect(String(record.owner)).toBe(member.user.id);
      expect(record.members).toHaveLength(1);
      expect(record.members[0].role).toBe('owner');
    });

    it('archives the group when the last member leaves', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      await auth(owner.token).post(`/api/groups/${group.id}/leave`);

      const record = await SafetyGroup.findById(group.id).lean();
      expect(record.isArchived).toBe(true);
    });

    it('does not let a member remove the owner', async () => {
      const owner = await createUser();
      const member = await createUser({ email: 'member@example.com' });
      const group = await createGroup(owner.token);

      const code = await inviteAndGetCode(owner.token, group.id, 'member@example.com');
      await auth(member.token).post(`/api/groups/invite/${group.id}/${code}`).send({ accept: true });

      const response = await auth(member.token).delete(
        `/api/groups/${group.id}/members/${owner.user.id}`
      );

      expect(response.status).toBe(403);
    });

    it('does not let the owner be removed even by themselves through the members route', async () => {
      const owner = await createUser();
      const group = await createGroup(owner.token);

      const response = await auth(owner.token).delete(
        `/api/groups/${group.id}/members/${owner.user.id}`
      );

      expect(response.status).toBe(400);
    });
  });
});
