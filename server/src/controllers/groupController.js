import env from '../config/env.js';
import SafetyGroup from '../models/SafetyGroup.js';
import GroupMessage from '../models/GroupMessage.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent, paginationMeta } from '../utils/apiResponse.js';
import * as groupView from '../views/groupView.js';
import * as mailService from '../services/mailService.js';
import * as notificationService from '../services/notificationService.js';
import * as auditService from '../services/auditService.js';
import * as templates from '../views/emails/templates.js';
import { emitToGroup, emitToUser } from '../sockets/emitter.js';
import { hashToken } from '../utils/tokens.js';
import { getPagination } from '../utils/query.js';
import { normaliseText, normaliseEmail, normaliseMultiline } from '../utils/sanitize.js';
import { parseCoordinates } from '../utils/geo.js';
import { runInBackground } from '../utils/background.js';
import { GROUP_ROLES, INVITE_STATUS, AUDIT_ACTIONS, LIMITS } from '../config/constants.js';

async function loadMemberGroup(groupId, userId, { populate = false } = {}) {
  const query = SafetyGroup.findById(groupId);
  if (populate) {
    query.populate('members.user', 'name username avatar role email notificationPrefs accountStatus');
    query.populate('owner', 'name username avatar role');
    query.populate('invites.invitedBy', 'name username avatar');
  }

  const group = await query;
  if (!group || group.isArchived) throw AppError.notFound('That group was not found.');
  if (!group.isMember(userId)) {

    throw AppError.notFound('That group was not found.');
  }
  return group;
}

export const createGroup = asyncHandler(async (req, res) => {
  const owned = await SafetyGroup.countDocuments({ owner: req.user._id, isArchived: false });
  if (owned >= 10) {
    throw AppError.badRequest('You can own up to 10 safety groups at a time.');
  }

  const group = await SafetyGroup.create({
    name: normaliseText(req.body.name),
    description: normaliseMultiline(req.body.description || '', 500),
    owner: req.user._id,
    members: [{ user: req.user._id, role: GROUP_ROLES.OWNER, joinedAt: new Date() }],
    alertMembersOnSos: req.body.alertMembersOnSos !== false,
  });

  await GroupMessage.create({
    group: group._id,
    type: 'system',
    body: `${req.user.name} created the group.`,
  });

  await group.populate('owner', 'name username avatar role');
  await group.populate('members.user', 'name username avatar role');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.GROUP_CREATE,
    req,
    targetType: 'SafetyGroup',
    targetId: group._id,
    message: `Safety group created: ${group.name}`,
  });

  return created(
    res,
    { group: groupView.detail(group, req.user._id) },
    `"${group.name}" is ready. Invite the people you trust.`
  );
});

export const listGroups = asyncHandler(async (req, res) => {
  const groups = await SafetyGroup.find({ 'members.user': req.user._id, isArchived: false })
    .sort('-lastMessageAt -createdAt')
    .populate('owner', 'name username avatar role')
    .lean();

  const invitedTo = await SafetyGroup.find({
    'invites.email': req.user.email,
    'invites.status': INVITE_STATUS.PENDING,
    isArchived: false,
    'members.user': { $ne: req.user._id },
  })
    .populate('invites.invitedBy', 'name username avatar')
    .lean();

  const invitations = [];
  for (const group of invitedTo) {
    const invite = group.invites.find(
      (i) => i.email === req.user.email && i.status === INVITE_STATUS.PENDING
    );
    if (invite && new Date(invite.expiresAt).getTime() > Date.now()) {
      invitations.push(groupView.invitation(group, invite));
    }
  }

  return ok(res, {
    groups: groups.map((group) => groupView.summary(group, req.user._id)),
    invitations,
  });
});

export const getGroup = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id, { populate: true });
  return ok(res, { group: groupView.detail(group, req.user._id) });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  if (!group.canManage(req.user._id)) {
    throw AppError.forbidden('Only the group owner or an admin can change these settings.');
  }

  if (req.body.name !== undefined) group.name = normaliseText(req.body.name);
  if (req.body.description !== undefined) {
    group.description = normaliseMultiline(req.body.description, 500);
  }
  if (req.body.alertMembersOnSos !== undefined) {
    group.alertMembersOnSos = Boolean(req.body.alertMembersOnSos);
  }

  await group.save();
  await group.populate('owner', 'name username avatar role');
  await group.populate('members.user', 'name username avatar role');

  emitToGroup(group._id, 'group:updated', groupView.summary(group, req.user._id));
  return ok(res, { group: groupView.detail(group, req.user._id) }, 'Group settings saved.');
});

export const inviteMember = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  if (!group.canManage(req.user._id)) {
    throw AppError.forbidden('Only the group owner or an admin can invite people.');
  }
  if (group.members.length >= LIMITS.MAX_GROUP_MEMBERS) {
    throw AppError.badRequest(`This group is full (${LIMITS.MAX_GROUP_MEMBERS} members).`);
  }

  let email = normaliseEmail(req.body.email || '');
  let invitedUser = null;

  if (req.body.username) {
    invitedUser = await User.findOne({
      username: String(req.body.username).trim().toLowerCase(),
    }).select('name email accountStatus');

    if (!invitedUser) throw AppError.validation({ username: 'No account with that username.' });
    if (invitedUser.accountStatus !== 'active') {
      throw AppError.validation({ username: 'That account is not active.' });
    }
    email = invitedUser.email;
  } else if (email) {
    invitedUser = await User.findOne({ email }).select('name email accountStatus');
  }

  if (!email) {
    throw AppError.validation({ email: 'Provide an email address or a username to invite.' });
  }
  if (email === req.user.email) {
    throw AppError.validation({ email: 'You are already in this group.' });
  }

  if (invitedUser && group.isMember(invitedUser._id)) {
    throw AppError.conflict('That person is already in this group.');
  }

  const { code, invite } = group.createInvite({
    email,
    invitedBy: req.user._id,
    invitedUser: invitedUser?._id || null,
  });
  await group.save();

  const acceptUrl = `${env.clientUrl}/groups/invite/${group._id}/${code}`;

  await mailService.enqueue({
    kind: 'group-invite',
    to: email,
    toName: invitedUser?.name || '',
    priority: 6,
    relatedUser: invitedUser?._id || null,
    ...templates.groupInvite({
      inviteeName: invitedUser?.name || '',
      inviterName: req.user.name,
      groupName: group.name,
      acceptUrl,
      expiresAt: invite.expiresAt,
    }),
  });
  runInBackground(mailService.processQueue(5), 'group invite mail delivery');

  if (invitedUser) {
    notificationService
      .notify({
        user: invitedUser._id,
        type: 'group-invite',
        title: `Invitation to "${group.name}"`,
        body: `${req.user.name} invited you to join their safety group.`,
        link: `/groups/invite/${group._id}/${code}`,
        data: { groupId: String(group._id) },
      })
      .catch(() => {});
  }

  auditService.recordAsync({
    action: AUDIT_ACTIONS.GROUP_INVITE,
    req,
    targetType: 'SafetyGroup',
    targetId: group._id,
    message: `Invitation sent to ${email}`,
  });

  return created(res, { email }, `An invitation has been emailed to ${email}.`);
});

export const previewInvite = asyncHandler(async (req, res) => {
  const group = await SafetyGroup.findById(req.params.id)
    .populate('invites.invitedBy', 'name username avatar')
    .populate('owner', 'name username avatar');

  if (!group || group.isArchived) throw AppError.notFound('That invitation is no longer valid.');

  const invite = group.invites.find(
    (i) => i.codeHash === hashToken(req.params.code) && i.status === INVITE_STATUS.PENDING
  );

  if (!invite) throw AppError.notFound('That invitation is no longer valid.');
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    throw AppError.badRequest('That invitation has expired. Ask for a new one.', {
      code: 'INVITE_EXPIRED',
    });
  }

  return ok(res, { invitation: groupView.invitation(group, invite) });
});

export const respondToInvite = asyncHandler(async (req, res) => {
  const accept = req.body.accept !== false;

  const group = await SafetyGroup.findById(req.params.id);
  if (!group || group.isArchived) throw AppError.notFound('That invitation is no longer valid.');

  const invite = group.invites.find(
    (i) => i.codeHash === hashToken(req.params.code) && i.status === INVITE_STATUS.PENDING
  );
  if (!invite) throw AppError.notFound('That invitation is no longer valid.');

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    invite.status = INVITE_STATUS.REVOKED;
    await group.save();
    throw AppError.badRequest('That invitation has expired. Ask for a new one.', {
      code: 'INVITE_EXPIRED',
    });
  }

  if (invite.email !== req.user.email) {
    throw AppError.forbidden('This invitation was sent to a different email address.');
  }

  invite.respondedAt = new Date();

  if (!accept) {
    invite.status = INVITE_STATUS.DECLINED;
    await group.save();
    return ok(res, null, 'Invitation declined.');
  }

  if (group.isMember(req.user._id)) {
    invite.status = INVITE_STATUS.ACCEPTED;
    await group.save();
    return ok(res, { groupId: String(group._id) }, 'You are already in this group.');
  }

  if (group.members.length >= LIMITS.MAX_GROUP_MEMBERS) {
    throw AppError.badRequest('That group is full.');
  }

  invite.status = INVITE_STATUS.ACCEPTED;
  group.members.push({ user: req.user._id, role: GROUP_ROLES.MEMBER, joinedAt: new Date() });
  await group.save();

  const systemMessage = await GroupMessage.create({
    group: group._id,
    type: 'system',
    body: `${req.user.name} joined the group.`,
  });

  emitToGroup(group._id, 'group:message', groupView.message(systemMessage, req.user._id));
  emitToGroup(group._id, 'group:member-joined', {
    groupId: String(group._id),
    user: { id: String(req.user._id), name: req.user.name, username: req.user.username },
  });

  notificationService
    .notify({
      user: group.owner,
      type: 'group-joined',
      title: `${req.user.name} joined "${group.name}"`,
      link: `/groups/${group._id}`,
      data: { groupId: String(group._id) },
    })
    .catch(() => {});

  auditService.recordAsync({
    action: AUDIT_ACTIONS.GROUP_JOIN,
    req,
    targetType: 'SafetyGroup',
    targetId: group._id,
    message: `Joined group: ${group.name}`,
  });

  return ok(res, { groupId: String(group._id) }, `You have joined "${group.name}".`);
});

export const revokeInvite = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  if (!group.canManage(req.user._id)) {
    throw AppError.forbidden('Only the group owner or an admin can cancel invitations.');
  }

  const invite = group.invites.id(req.params.inviteId);
  if (!invite || invite.status !== INVITE_STATUS.PENDING) {
    throw AppError.notFound('That invitation was not found.');
  }

  invite.status = INVITE_STATUS.REVOKED;
  invite.respondedAt = new Date();
  await group.save();

  return ok(res, null, 'Invitation cancelled.');
});

export const leaveGroup = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  const isOwner = String(group.owner) === String(req.user._id);

  if (isOwner) {
    const others = group.members.filter((m) => String(m.user) !== String(req.user._id));

    if (others.length === 0) {

      group.isArchived = true;
      await group.save();

      auditService.recordAsync({
        action: AUDIT_ACTIONS.GROUP_DELETE,
        req,
        targetType: 'SafetyGroup',
        targetId: group._id,
        message: `Group archived on owner leaving: ${group.name}`,
      });
      return ok(res, null, 'You were the last member, so the group has been closed.');
    }

    const successor =
      others.find((m) => m.role === GROUP_ROLES.ADMIN) ||
      others.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];

    successor.role = GROUP_ROLES.OWNER;
    group.owner = successor.user;

    await GroupMessage.create({
      group: group._id,
      type: 'system',
      body: `${req.user.name} left. Ownership has passed to another member.`,
    });
  } else {
    await GroupMessage.create({
      group: group._id,
      type: 'system',
      body: `${req.user.name} left the group.`,
    });
  }

  group.members = group.members.filter((m) => String(m.user) !== String(req.user._id));
  await group.save();

  emitToGroup(group._id, 'group:member-left', {
    groupId: String(group._id),
    userId: String(req.user._id),
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.GROUP_LEAVE,
    req,
    targetType: 'SafetyGroup',
    targetId: group._id,
    message: `Left group: ${group.name}`,
  });

  return ok(res, null, `You have left "${group.name}".`);
});

export const removeMember = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  if (!group.canManage(req.user._id)) {
    throw AppError.forbidden('Only the group owner or an admin can remove members.');
  }

  const targetId = String(req.params.userId);
  if (targetId === String(group.owner)) {
    throw AppError.badRequest('The group owner cannot be removed. Transfer ownership first.');
  }
  if (targetId === String(req.user._id)) {
    throw AppError.badRequest('Use "leave group" to remove yourself.');
  }

  const target = group.findMember(targetId);
  if (!target) throw AppError.notFound('That person is not in this group.');

  const actor = group.findMember(req.user._id);
  if (target.role === GROUP_ROLES.ADMIN && actor.role !== GROUP_ROLES.OWNER) {
    throw AppError.forbidden('Only the group owner can remove an admin.');
  }

  group.members = group.members.filter((m) => String(m.user) !== targetId);
  await group.save();

  emitToGroup(group._id, 'group:member-left', { groupId: String(group._id), userId: targetId });
  emitToUser(targetId, 'group:removed', { groupId: String(group._id), name: group.name });

  notificationService
    .notify({
      user: targetId,
      type: 'account',
      title: `You were removed from "${group.name}"`,
      body: 'You no longer receive alerts or messages from this group.',
    })
    .catch(() => {});

  return ok(res, null, 'Member removed.');
});

export const setMemberRole = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);

  if (String(group.owner) !== String(req.user._id)) {
    throw AppError.forbidden('Only the group owner can change roles.');
  }

  const role = req.body.role;
  if (![GROUP_ROLES.ADMIN, GROUP_ROLES.MEMBER, GROUP_ROLES.OWNER].includes(role)) {
    throw AppError.validation({ role: 'Choose owner, admin or member.' });
  }

  const member = group.findMember(req.params.userId);
  if (!member) throw AppError.notFound('That person is not in this group.');

  if (role === GROUP_ROLES.OWNER) {

    const currentOwner = group.findMember(req.user._id);
    if (currentOwner) currentOwner.role = GROUP_ROLES.ADMIN;
    member.role = GROUP_ROLES.OWNER;
    group.owner = member.user;
  } else {
    if (String(member.user) === String(group.owner)) {
      throw AppError.badRequest('Transfer ownership to someone else before changing your own role.');
    }
    member.role = role;
  }

  await group.save();
  return ok(res, null, 'Role updated.');
});

export const listMessages = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  const { page, limit, skip } = getPagination(req.query, 40);

  const [messages, total] = await Promise.all([
    GroupMessage.find({ group: group._id })
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name username avatar role')
      .lean(),
    GroupMessage.countDocuments({ group: group._id }),
  ]);

  const ordered = messages.reverse().map((doc) => groupView.message(doc, req.user._id));

  const member = group.findMember(req.user._id);
  if (member) {
    member.lastReadAt = new Date();
    group.save().catch(() => {});
  }

  return ok(res, { messages: ordered }, undefined, paginationMeta({ page, limit }, total));
});

export const sendMessage = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);

  const body = normaliseMultiline(req.body.body || '', 2000);
  if (!body) throw AppError.validation({ body: 'Please write a message.' });

  const message = await GroupMessage.create({
    group: group._id,
    sender: req.user._id,
    type: 'text',
    body,
    readBy: [req.user._id],
  });

  await SafetyGroup.updateOne(
    { _id: group._id },
    { $set: { lastMessageAt: message.createdAt }, $inc: { messageCount: 1 } }
  );

  await message.populate('sender', 'name username avatar role');
  const payload = groupView.message(message, null);

  emitToGroup(group._id, 'group:message', payload);

  const recipients = group.members
    .filter((m) => String(m.user) !== String(req.user._id) && !m.muted)
    .map((m) => m.user);

  if (recipients.length) {
    notificationService
      .notifyMany(recipients, {
        type: 'group-message',
        title: group.name,
        body: `${req.user.name}: ${body.slice(0, 120)}`,
        link: `/groups/${group._id}`,
        data: { groupId: String(group._id) },
      })
      .catch(() => {});
  }

  return created(res, { message: groupView.message(message, req.user._id) });
});

export const shareLocation = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);

  const location = parseCoordinates(req.body.location || req.body);
  if (!location) throw AppError.validation({ location: 'A valid location is required.' });

  const member = group.findMember(req.user._id);
  member.shareLocation = true;
  member.lastLocation = {
    coordinates: [location.lng, location.lat],
    accuracy: Number.isFinite(Number(req.body.accuracy)) ? Number(req.body.accuracy) : null,
    updatedAt: new Date(),
  };
  await group.save();

  if (req.body.postToChat !== false) {
    const message = await GroupMessage.create({
      group: group._id,
      sender: req.user._id,
      type: 'location',
      body: normaliseText(req.body.label || 'Shared their location'),
      location: {
        coordinates: [location.lng, location.lat],
        accuracy: member.lastLocation.accuracy,
        label: normaliseText(req.body.label || ''),
      },
    });
    await message.populate('sender', 'name username avatar role');
    emitToGroup(group._id, 'group:message', groupView.message(message, null));
  }

  emitToGroup(group._id, 'group:location', {
    groupId: String(group._id),
    userId: String(req.user._id),
    name: req.user.name,
    lat: location.lat,
    lng: location.lng,
    accuracy: member.lastLocation.accuracy,
    updatedAt: member.lastLocation.updatedAt,
  });

  return ok(res, null, 'Your location has been shared with the group.');
});

export const stopSharingLocation = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);

  const member = group.findMember(req.user._id);
  member.shareLocation = false;
  member.lastLocation = { coordinates: undefined, accuracy: null, updatedAt: null };
  await group.save();

  emitToGroup(group._id, 'group:location-stopped', {
    groupId: String(group._id),
    userId: String(req.user._id),
  });

  return ok(res, null, 'You have stopped sharing your location with this group.');
});

export const getGroupLocations = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id, { populate: true });

  const locations = group.members
    .filter((m) => m.shareLocation && Array.isArray(m.lastLocation?.coordinates))
    .map((m) => ({
      userId: String(m.user._id),
      name: m.user.name,
      username: m.user.username,
      avatar: m.user.avatar || '',
      lat: m.lastLocation.coordinates[1],
      lng: m.lastLocation.coordinates[0],
      accuracy: m.lastLocation.accuracy,
      updatedAt: m.lastLocation.updatedAt,
    }));

  return ok(res, { locations });
});

export const muteGroup = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  const member = group.findMember(req.user._id);
  member.muted = req.body.muted !== false;
  await group.save();

  return ok(res, { muted: member.muted }, member.muted ? 'Group muted.' : 'Group unmuted.');
});

export const deleteGroup = asyncHandler(async (req, res) => {
  const group = await loadMemberGroup(req.params.id, req.user._id);
  if (String(group.owner) !== String(req.user._id)) {
    throw AppError.forbidden('Only the group owner can delete the group.');
  }

  group.isArchived = true;
  await group.save();

  emitToGroup(group._id, 'group:deleted', { groupId: String(group._id), name: group.name });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.GROUP_DELETE,
    req,
    targetType: 'SafetyGroup',
    targetId: group._id,
    severity: 'notice',
    message: `Group deleted: ${group.name}`,
  });

  return noContent(res);
});
