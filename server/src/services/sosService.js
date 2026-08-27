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

/**
 * FR-2, FR-3, FR-4, FR-10, FR-17.
 *
 * The ordering inside `activate` is deliberate and is the most important design
 * decision in the codebase: the SOS document is written and the response is
 * sent before any email work happens. Alerting is durable because it goes
 * through the MailJob queue, so the user's phone never waits on an SMTP
 * handshake, and a crash mid-send does not lose the alert (NFR-1, NFR-3).
 */

/* --------------------------------------------------------------- activate --- */

/**
 * @param {object} options
 * @param {object} options.user      Full user document (needs medical fields).
 * @param {{lat:number,lng:number}} options.location
 * @param {number} [options.accuracy]
 * @param {string} [options.message]
 * @param {string} [options.trigger]
 * @param {object} [options.req]     For the audit trail.
 */
async function activate({ user, location, accuracy = null, message = '', trigger = 'manual', req }) {
  // One live SOS per person. A second tap on a flaky connection should update
  // the alert that is already running, not start a parallel one that splits
  // the contact list in half.
  const existing = await SosEvent.findActiveForUser(user._id);
  if (existing) {
    // A second tap may be the one that finally has a fix, so a location is
    // appended when there is one and skipped quietly when there is not.
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
    // An alert with no fix still gets raised; the trail fills in the moment the
    // device manages to report a position.
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

  // Deliberately not awaited. The caller responds as soon as the document
  // exists; fan-out continues in the background and is durable via MailJob.
  runInBackground(
    // Accuracy travels with the point so the alert email can say how much to
    // trust it - a wifi-derived fix can be a kilometre out while looking every
    // bit as precise as a GPS one.
    fanOut({ sos, user, trackingToken, location: location && { ...location, accuracy } }),
    `SOS fan-out for ${sos._id}`
  );

  return { sos, alreadyActive: false, trackingToken };
}

/**
 * How long an alert may wait for a street name before it goes out with
 * coordinates only.
 *
 * The whole SOS path has a five second budget (NFR-1) and Nominatim is a free
 * shared service with a one-request-per-second policy, so a best-effort
 * address lookup must never be able to spend that budget. Missing the window
 * does not cancel the lookup: it keeps running and writes the address to the
 * event on its own, so the tracking page and the SOS history still show it.
 */
const ADDRESS_LOOKUP_BUDGET_MS = 1200;

/**
 * Reverse geocodes the start point, returning whatever is ready within
 * `ADDRESS_LOOKUP_BUDGET_MS` and an empty string otherwise.
 *
 * @returns {Promise<string>} the address, or '' if it did not arrive in time
 */
function resolveAddressWithinBudget(sos, location) {
  // A test run must not depend on a third-party service being reachable, and
  // no suite asserts on the resolved address.
  if (env.isTest) return Promise.resolve('');

  const lookup = geoService
    .reverseGeocode(location.lat, location.lng)
    .then(async (resolved) => {
      const address = resolved?.address || '';
      if (address) {
        // A targeted update rather than sos.save(): by the time this lands the
        // trail may already have new points on it, and a full save of a stale
        // document would drop them.
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
    // Never hold the process open just to wait out this timer.
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([lookup, budget]);
}

/**
 * Everything that happens after the SOS document exists: resolve the address,
 * queue an email per contact, alert every safety group, write notifications.
 * Each step is individually guarded so one failure cannot stop the others.
 */
async function fanOut({ sos, user, trackingToken, location }) {
  const trackingUrl = `${env.clientUrl}/track/${trackingToken}`;

  // Nothing to reverse geocode when the device could not produce a fix.
  const address = location ? await resolveAddressWithinBudget(sos, location) : '';

  const snapshot = {
    name: user.name,
    phone: user.phone || '',
    bloodGroup: user.bloodGroup || 'unknown',
    medicalInfo: user.medicalInfo || '',
  };

  /* ---- FR-4: email every active emergency contact --------------------- */

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

      /* eslint-disable no-await-in-loop */
      const job = await mailService.enqueue({
        kind: 'sos-alert',
        to: contact.email,
        toName: contact.name,
        priority: 1, // nothing outranks an SOS
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

  // Bump each contact's counters in one round trip rather than one per contact.
  if (contacts.length) {
    EmergencyContact.updateMany(
      { _id: { $in: contacts.map((c) => c._id) } },
      { $set: { lastNotifiedAt: new Date() }, $inc: { notifyCount: 1 } }
    ).catch(() => {});
  }

  /* ---- FR-17: alert every safety group the user belongs to ------------ */

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

    // In-app first: it is instant and cannot bounce.
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

    // A permanent record in the group chat, so the alert is still visible to
    // someone who opens the app an hour later.
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
      // Members can turn group emails off without leaving the group.
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

  /*
   * A targeted update, not sos.save().
   *
   * By the time fan-out reaches this line the phone has usually already pushed
   * a live location point or two - that is the design, the trail starts moving
   * the moment the alert goes out. Each of those requests loads its own copy of
   * this document, pushes to `trail` and bumps `__v`. Saving the stale copy we
   * have been holding since activation therefore fails its version check with
   * "No matching document found ... version 0", and because fan-out runs
   * detached in the background the throw was only ever logged.
   *
   * The damage was invisible but serious: the record of who had been notified
   * was never written, so the SOS history reported "0 of 2 contacts reached",
   * and `resolve()` - which reads notifiedContacts to decide who gets the
   * all-clear - emailed nobody. The same loss took notifiedGroups with it, so
   * fellow group members were never told the person was safe.
   *
   * $set on the two fields fan-out owns cannot collide with a trail append.
   */
  await SosEvent.updateOne(
    { _id: sos._id },
    { $set: { notifiedContacts: notified, notifiedGroups: alertedGroupIds } }
  );

  // Keep the in-memory copy in step for anything still holding this instance.
  sos.notifiedContacts = notified;
  sos.notifiedGroups = alertedGroupIds;

  // Drain immediately instead of waiting for the next cron tick. The queue is
  // still the source of truth, so a failure here just becomes a retry.
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

/* ------------------------------------------------------------- FR-3 trail --- */

/**
 * Appends a point to a running SOS and pushes it to everyone watching. Called
 * every few seconds by the browser while an alert is live.
 */
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

  // Everyone holding a valid tracking link, plus every alerted group.
  emitToSos(sos._id, 'sos:location', payload);
  for (const groupId of sos.notifiedGroups || []) {
    emitToGroup(groupId, 'sos:location', payload);
  }

  return point;
}

/* --------------------------------------------------------------- resolve --- */

/**
 * Closes an alert: revokes the tracking link, records the duration, and tells
 * everyone who was worried that the person is safe.
 */
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
  sos.revokeTrackingToken(); // the link in the email stops working now

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

  // Only the people who were told about it get the all-clear.
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

/* -------------------------------------------------------------- caretaker --- */

/**
 * Closes alerts that were never resolved - a flat battery, a phone left in a
 * bag. Without this the "active SOS" banner would follow the user forever and
 * the tracking link would keep working. Run hourly by the cron job.
 */
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
    /* eslint-disable no-await-in-loop */
    await sos.save();

    emitToSos(sos._id, 'sos:resolved', { sosId: String(sos._id), status: SOS_STATUS.EXPIRED });
    emitToUser(sos.user, 'sos:resolved', { sosId: String(sos._id), status: SOS_STATUS.EXPIRED });
  }

  if (stale.length) logger.info(`Expired ${stale.length} stale SOS event(s)`);
  return stale.length;
}

export { activate, appendLocation, resolve, expireStale };