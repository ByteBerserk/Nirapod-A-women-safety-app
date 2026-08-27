import env from '../config/env.js';
import * as logger from '../config/logger.js';
import SosEvent from '../models/SosEvent.js';
import EmergencyContact from '../models/EmergencyContact.js';
import SafetyGroup from '../models/SafetyGroup.js';
import GroupMessage from '../models/GroupMessage.js';
import * as mailService from './mailService.js';
import * as notificationService from './notificationService.js';
import * as auditService from './auditService.js';
import * as geoService from './geoService.js';
import * as templates from '../views/emails/templates.js';
import * as sosView from '../views/sosView.js';
import * as groupView from '../views/groupView.js';
import AppError from '../utils/AppError.js';
import { SOS_STATUS, AUDIT_ACTIONS, LIMITS } from '../config/constants.js';
import { emitToSos, emitToGroup, emitToUser } from '../sockets/emitter.js';
import { runInBackground } from '../utils/background.js';

async function activate({ user, location, accuracy = null, message = '', trigger = 'manual', req }) {

  const existing = await SosEvent.findActiveForUser(user._id);
  if (existing) {

    if (location) {
      existing.appendTrailPoint({ lat: location.lat, lng: location.lng, accuracy });
    }
    if (message) existing.message = message;
    await existing.save();

    if (location) {
      emitToSos(existing._id, 'sos:location', {
        sosId: String(existing._id),
        lat: location.lat,
        lng: location.lng,
        accuracy,
        recordedAt: new Date(),
      });
    }

    return { sos: existing, alreadyActive: true, contactsQueued: 0, groupsAlerted: 0 };
  }

  const sos = new SosEvent({
    user: user._id,
    trigger,
    message: String(message || '').slice(0, 500),

    ...(location
      ? {
          startLocation: {
            type: 'Point',
            coordinates: [location.lng, location.lat],
            accuracy,
          },
          currentLocation: {
            coordinates: [location.lng, location.lat],
            accuracy,
            updatedAt: new Date(),
          },
          trail: [
            {
              coordinates: [location.lng, location.lat],
              accuracy,
              recordedAt: new Date(),
            },
          ],
        }
      : {}),
  });

  const trackingToken = sos.issueTrackingToken();
  await sos.save();

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SOS_ACTIVATE,
    req,
    actor: user,
    targetType: 'SosEvent',
    targetId: sos._id,
    severity: 'critical',
    message: `SOS activated by ${user.username || user.name}`,
    metadata: { trigger, lat: location?.lat ?? null, lng: location?.lng ?? null },
  });

  runInBackground(

    fanOut({ sos, user, trackingToken, location: location && { ...location, accuracy } }),
    `SOS fan-out for ${sos._id}`
  );

  return { sos, alreadyActive: false, trackingToken };
}

const ADDRESS_LOOKUP_BUDGET_MS = 1200;

function resolveAddressWithinBudget(sos, location) {

  if (env.isTest) return Promise.resolve('');

  const lookup = geoService
    .reverseGeocode(location.lat, location.lng)
    .then(async (resolved) => {
      const address = resolved?.address || '';
      if (address) {

        await SosEvent.updateOne(
          { _id: sos._id },
          { $set: { 'startLocation.address': address } }
        );
        sos.startLocation.address = address;
      }
      return address;
    })
    .catch(() => '');

  const budget = new Promise((resolve) => {
    const timer = setTimeout(resolve, ADDRESS_LOOKUP_BUDGET_MS, '');

    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([lookup, budget]);
}

async function fanOut({ sos, user, trackingToken, location }) {
  const trackingUrl = `${env.clientUrl}/track/${trackingToken}`;

  const address = location ? await resolveAddressWithinBudget(sos, location) : '';

  const snapshot = {
    name: user.name,
    phone: user.phone || '',
    bloodGroup: user.bloodGroup || 'unknown',
    medicalInfo: user.medicalInfo || '',
  };

  const contacts = await EmergencyContact.activeForOwner(user._id);
  const notified = [];

  for (const contact of contacts) {
    try {
      const mail = templates.sosAlert({
        contactName: contact.name,
        user: snapshot,
        location,
        address,
        message: sos.message,
        trackingUrl,
        startedAt: sos.createdAt,
      });

      const job = await mailService.enqueue({
        kind: 'sos-alert',
        to: contact.email,
        toName: contact.name,
        priority: 1,
        dedupeKey: `sos:${sos._id}:${contact.email}`,
        relatedUser: user._id,
        relatedSos: sos._id,
        ...mail,
      });

      notified.push({
        contact: contact._id,
        name: contact.name,
        email: contact.email,
        channel: 'email',
        status: 'queued',
        mailJob: job?._id || null,
      });
    } catch (error) {
      logger.error('Failed to queue SOS email', { contact: contact.email, message: error.message });
      notified.push({
        contact: contact._id,
        name: contact.name,
        email: contact.email,
        channel: 'email',
        status: 'failed',
        error: error.message.slice(0, 200),
      });
    }
  }

  if (contacts.length) {
    EmergencyContact.updateMany(
      { _id: { $in: contacts.map((c) => c._id) } },
      { $set: { lastNotifiedAt: new Date() }, $inc: { notifyCount: 1 } }
    ).catch(() => {});
  }

  const groups = await SafetyGroup.find({
    'members.user': user._id,
    isArchived: false,
    alertMembersOnSos: true,
  })
    .populate('members.user', 'name email notificationPrefs accountStatus')
    .select('name members alertMembersOnSos');

  const alertedGroupIds = [];

  for (const group of groups) {
    const others = group.members.filter(
      (member) => member.user && String(member.user._id) !== String(user._id)
    );
    if (!others.length) continue;

    alertedGroupIds.push(group._id);

    notificationService
      .notifyMany(
        others.map((member) => member.user._id),
        {
          type: 'sos-alert',
          title: `${user.name} needs help`,
          body: `An SOS was raised in "${group.name}".`,
          link: `/track/${trackingToken}`,
          data: { sosId: String(sos._id), groupId: String(group._id) },
          isUrgent: true,
        }
      )
      .catch(() => {});

    GroupMessage.create({
      group: group._id,
      sender: user._id,
      type: 'sos',
      body: `${user.name} activated an emergency SOS.`,
      ...(location
        ? { location: { coordinates: [location.lng, location.lat], label: address } }
        : {}),
      relatedSos: sos._id,
    })
      .then((doc) => emitToGroup(group._id, 'group:message', groupView.message(doc, null)))
      .catch(() => {});

    emitToGroup(group._id, 'group:sos', {
      groupId: String(group._id),
      ...sosView.groupAlert(sos, user),
      trackingToken,
    });

    for (const member of others) {
      const recipient = member.user;
      if (!recipient?.email) continue;
      if (recipient.accountStatus && recipient.accountStatus !== 'active') continue;

      if (recipient.notificationPrefs && recipient.notificationPrefs.emailGroupAlerts === false) {
        continue;
      }

      try {
        await mailService.enqueue({
          kind: 'group-sos',
          to: recipient.email,
          toName: recipient.name,
          priority: 1,
          dedupeKey: `sos:${sos._id}:group:${recipient._id}`,
          relatedUser: user._id,
          relatedSos: sos._id,
          ...templates.groupSosAlert({
            memberName: recipient.name,
            user: snapshot,
            groupName: group.name,
            location,
            trackingUrl,
            startedAt: sos.createdAt,
          }),
        });

        notified.push({
          user: recipient._id,
          name: recipient.name,
          email: recipient.email,
          channel: 'email',
          status: 'queued',
        });
      } catch (error) {
        logger.error('Failed to queue group SOS email', {
          member: recipient.email,
          message: error.message,
        });
      }
    }
  }

  await SosEvent.updateOne(
    { _id: sos._id },
    { $set: { notifiedContacts: notified, notifiedGroups: alertedGroupIds } }
  );

  sos.notifiedContacts = notified;
  sos.notifiedGroups = alertedGroupIds;

  runInBackground(
    mailService.processQueue(Math.max(10, notified.length + 2)),
    'SOS alert mail delivery'
  );

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SOS_ALERT_SENT,
    actor: user,
    targetType: 'SosEvent',
    targetId: sos._id,
    severity: 'critical',
    message: `SOS alerts queued for ${notified.length} recipient(s)`,
    metadata: { contacts: contacts.length, groups: alertedGroupIds.length },
  });

  logger.info('SOS fan-out complete', {
    sosId: String(sos._id),
    recipients: notified.length,
    groups: alertedGroupIds.length,
  });

  return { recipients: notified.length, groups: alertedGroupIds.length };
}

async function appendLocation({ sos, lat, lng, accuracy = null, speed = null, recordedAt }) {
  if (sos.status !== SOS_STATUS.ACTIVE) {
    throw AppError.badRequest('This alert is no longer active.', { code: 'SOS_NOT_ACTIVE' });
  }

  const point = sos.appendTrailPoint({ lat, lng, accuracy, speed, recordedAt });
  await sos.save();

  const payload = {
    sosId: String(sos._id),
    lat,
    lng,
    accuracy,
    speed,
    recordedAt: point.recordedAt,
    trailPointCount: sos.trail.length,
  };

  emitToSos(sos._id, 'sos:location', payload);
  for (const groupId of sos.notifiedGroups || []) {
    emitToGroup(groupId, 'sos:location', payload);
  }

  return point;
}

async function resolve({ sos, user, note = '', status = SOS_STATUS.RESOLVED, req }) {
  if (sos.status !== SOS_STATUS.ACTIVE) {
    throw AppError.badRequest('This alert has already been closed.', { code: 'SOS_NOT_ACTIVE' });
  }

  const resolvedAt = new Date();
  sos.status = status;
  sos.resolvedAt = resolvedAt;
  sos.resolvedBy = user._id;
  sos.resolutionNote = String(note || '').slice(0, 500);
  sos.durationMs = resolvedAt.getTime() - new Date(sos.createdAt).getTime();
  sos.revokeTrackingToken();

  await sos.save();

  emitToSos(sos._id, 'sos:resolved', {
    sosId: String(sos._id),
    status,
    resolvedAt,
    durationMs: sos.durationMs,
  });
  for (const groupId of sos.notifiedGroups || []) {
    emitToGroup(groupId, 'sos:resolved', { sosId: String(sos._id), status, resolvedAt });
  }
  emitToUser(user._id, 'sos:resolved', { sosId: String(sos._id), status, resolvedAt });

  const emailed = new Set();
  for (const entry of sos.notifiedContacts || []) {
    if (!entry.email || emailed.has(entry.email)) continue;
    emailed.add(entry.email);

    mailService
      .enqueue({
        kind: 'sos-resolved',
        to: entry.email,
        toName: entry.name,
        priority: 3,
        dedupeKey: `sos-resolved:${sos._id}:${entry.email}`,
        relatedUser: user._id,
        relatedSos: sos._id,
        ...templates.sosResolved({
          contactName: entry.name,
          user: { name: user.name },
          startedAt: sos.createdAt,
          resolvedAt,
          durationMs: sos.durationMs,
          note: sos.resolutionNote,
        }),
      })
      .catch((error) => logger.error('Failed to queue all-clear email', { message: error.message }));
  }

  if ((sos.notifiedGroups || []).length) {
    const groups = await SafetyGroup.find({ _id: { $in: sos.notifiedGroups } })
      .select('members.user name')
      .lean();

    const memberIds = groups
      .flatMap((group) => group.members.map((m) => String(m.user)))
      .filter((id) => id !== String(user._id));

    notificationService
      .notifyMany(memberIds, {
        type: 'sos-resolved',
        title: `${user.name} is safe`,
        body: 'The emergency alert has been closed.',
        data: { sosId: String(sos._id) },
      })
      .catch(() => {});
  }

  runInBackground(mailService.processQueue(10), 'SOS all-clear mail delivery');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SOS_RESOLVE,
    req,
    actor: user,
    targetType: 'SosEvent',
    targetId: sos._id,
    severity: 'notice',
    message: `SOS ${status} after ${Math.round(sos.durationMs / 1000)}s`,
  });

  return sos;
}

async function expireStale() {
  const cutoff = new Date(Date.now() - LIMITS.SOS_AUTO_EXPIRE_HOURS * 60 * 60 * 1000);

  const stale = await SosEvent.find({
    status: SOS_STATUS.ACTIVE,
    updatedAt: { $lt: cutoff },
  }).select('_id user createdAt notifiedGroups');

  for (const sos of stale) {
    sos.status = SOS_STATUS.EXPIRED;
    sos.resolvedAt = new Date();
    sos.durationMs = sos.resolvedAt.getTime() - new Date(sos.createdAt).getTime();
    sos.resolutionNote = 'Automatically closed after inactivity.';
    sos.revokeTrackingToken();

    await sos.save();

    emitToSos(sos._id, 'sos:resolved', { sosId: String(sos._id), status: SOS_STATUS.EXPIRED });
    emitToUser(sos.user, 'sos:resolved', { sosId: String(sos._id), status: SOS_STATUS.EXPIRED });
  }

  if (stale.length) logger.info(`Expired ${stale.length} stale SOS event(s)`);
  return stale.length;
}

export { activate, appendLocation, resolve, expireStale };
