import * as logger from '../config/logger.js';
import SafetyCheckIn from '../models/SafetyCheckIn.js';
import User from '../models/User.js';
import * as sosService from './sosService.js';
import * as mailService from './mailService.js';
import * as notificationService from './notificationService.js';
import * as auditService from './auditService.js';
import * as templates from '../views/emails/templates.js';
import AppError from '../utils/AppError.js';
import { CHECKIN_STATUS, AUDIT_ACTIONS, LIMITS } from '../config/constants.js';
import { emitToUser } from '../sockets/emitter.js';
import { runInBackground } from '../utils/background.js';

/**
 * FR-26: safety check-in.
 *
 * The whole feature is two timestamps and a scheduler. What makes it worth
 * having is the last step: when the grace period runs out this does not invent
 * its own notion of an emergency, it calls the same `sosService.activate` the
 * red button calls. Contacts get the identical email, the identical live
 * tracking link, and every safety group is alerted the same way - so a
 * check-in that escalates is indistinguishable from an SOS that was pressed.
 */

/* ------------------------------------------------------------------ start --- */

/**
 * @param {object} options
 * @param {object} options.user
 * @param {string} options.label
 * @param {number} options.minutes       how long until we ask
 * @param {number} [options.graceMinutes] how long they have to answer
 * @param {{lat:number,lng:number}} [options.location]
 * @param {string} [options.note]
 * @param {object} [options.req]         for the audit trail
 */
async function start({ user, label, minutes, graceMinutes, location, note = '', req }) {
  const existing = await SafetyCheckIn.findOpenForUser(user._id);
  if (existing) {
    throw AppError.conflict(
      'You already have a check-in running. Finish or cancel it before starting another.',
      { code: 'CHECKIN_ALREADY_OPEN' }
    );
  }

  const grace = clamp(
    graceMinutes ?? LIMITS.CHECKIN_DEFAULT_GRACE_MINUTES,
    LIMITS.CHECKIN_MIN_GRACE_MINUTES,
    LIMITS.CHECKIN_MAX_GRACE_MINUTES
  );

  const dueAt = new Date(Date.now() + minutes * 60 * 1000);

  const checkIn = await SafetyCheckIn.create({
    user: user._id,
    label,
    note: String(note || '').slice(0, 500),
    dueAt,
    graceMinutes: grace,
    escalateAt: new Date(dueAt.getTime() + grace * 60 * 1000),
    ...(location
      ? {
          startLocation: {
            type: 'Point',
            coordinates: [location.lng, location.lat],
          },
        }
      : {}),
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CHECKIN_START,
    req,
    actor: user,
    targetType: 'SafetyCheckIn',
    targetId: checkIn._id,
    message: `Check-in started: "${label}" due in ${minutes} minute(s)`,
    metadata: { minutes, graceMinutes: grace },
  });

  return checkIn;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

/* -------------------------------------------------------------- responses --- */

/** "Yes, I am safe." Closes the check-in without alerting anybody. */
async function confirmSafe({ checkIn, user, note = '', req }) {
  if (!checkIn.isOpen) {
    throw AppError.badRequest('That check-in is already closed.', { code: 'CHECKIN_CLOSED' });
  }

  checkIn.status = CHECKIN_STATUS.SAFE;
  checkIn.resolvedAt = new Date();
  checkIn.resolutionNote = String(note || '').slice(0, 500);
  await checkIn.save();

  emitToUser(user._id, 'checkin:resolved', {
    checkInId: String(checkIn._id),
    status: checkIn.status,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CHECKIN_SAFE,
    req,
    actor: user,
    targetType: 'SafetyCheckIn',
    targetId: checkIn._id,
    message: `Confirmed safe: "${checkIn.label}"`,
  });

  return checkIn;
}

/** "Not yet - give me longer." */
async function extend({ checkIn, user, minutes, req }) {
  if (!checkIn.isOpen) {
    throw AppError.badRequest('That check-in is already closed.', { code: 'CHECKIN_CLOSED' });
  }

  checkIn.extendBy(minutes);
  await checkIn.save();

  emitToUser(user._id, 'checkin:updated', {
    checkInId: String(checkIn._id),
    dueAt: checkIn.dueAt,
    escalateAt: checkIn.escalateAt,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CHECKIN_EXTEND,
    req,
    actor: user,
    targetType: 'SafetyCheckIn',
    targetId: checkIn._id,
    message: `Check-in extended by ${minutes} minute(s): "${checkIn.label}"`,
  });

  return checkIn;
}

/** Called off before it was needed. */
async function cancel({ checkIn, user, req }) {
  if (!checkIn.isOpen) {
    throw AppError.badRequest('That check-in is already closed.', { code: 'CHECKIN_CLOSED' });
  }

  checkIn.status = CHECKIN_STATUS.CANCELLED;
  checkIn.resolvedAt = new Date();
  await checkIn.save();

  emitToUser(user._id, 'checkin:resolved', {
    checkInId: String(checkIn._id),
    status: checkIn.status,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CHECKIN_CANCEL,
    req,
    actor: user,
    targetType: 'SafetyCheckIn',
    targetId: checkIn._id,
    message: `Check-in cancelled: "${checkIn.label}"`,
  });

  return checkIn;
}

/* -------------------------------------------------------------- scheduler --- */

/**
 * Asks everyone whose timer has just run out whether they are safe.
 *
 * In-app and by email, because the person may not have the tab open - and the
 * whole design rests on them getting a chance to answer before their contacts
 * are alarmed.
 *
 * @returns {Promise<number>} how many were prompted
 */
async function promptDue(now = new Date()) {
  const due = await SafetyCheckIn.find({
    status: CHECKIN_STATUS.ACTIVE,
    dueAt: { $lte: now },
  }).populate('user', 'name email notificationPrefs accountStatus');

  let prompted = 0;

  for (const checkIn of due) {
    const owner = checkIn.user;
    if (!owner) continue;

    checkIn.status = CHECKIN_STATUS.AWAITING;
    checkIn.promptedAt = now;
    /* eslint-disable no-await-in-loop */
    await checkIn.save();

    const minutes = checkIn.graceMinutes;

    notificationService
      .notify({
        user: owner._id,
        type: 'checkin-due',
        title: 'Are you safe?',
        body: `Your check-in "${checkIn.label}" is due. Confirm within ${minutes} minute${
          minutes === 1 ? '' : 's'
        } or your emergency contacts will be alerted.`,
        link: '/check-in',
        data: { checkInId: String(checkIn._id) },
        isUrgent: true,
      })
      .catch(() => {});

    emitToUser(owner._id, 'checkin:due', {
      checkInId: String(checkIn._id),
      label: checkIn.label,
      escalateAt: checkIn.escalateAt,
    });

    if (owner.email && owner.accountStatus === 'active') {
      mailService
        .enqueue({
          kind: 'checkin-due',
          to: owner.email,
          toName: owner.name,
          priority: 2, // behind an SOS, ahead of everything else
          dedupeKey: `checkin-due:${checkIn._id}`,
          relatedUser: owner._id,
          ...templates.checkInDue({
            name: owner.name,
            label: checkIn.label,
            escalateAt: checkIn.escalateAt,
            graceMinutes: minutes,
          }),
        })
        .catch((error) =>
          logger.error('Failed to queue check-in prompt', { message: error.message })
        );
    }

    auditService.recordAsync({
      action: AUDIT_ACTIONS.CHECKIN_DUE,
      actor: owner,
      targetType: 'SafetyCheckIn',
      targetId: checkIn._id,
      severity: 'notice',
      message: `Check-in due, asked for confirmation: "${checkIn.label}"`,
    });

    prompted += 1;
  }

  if (prompted) {
    runInBackground(mailService.processQueue(prompted + 2), 'check-in prompt mail');
    logger.info(`Check-in: asked ${prompted} user(s) to confirm they are safe`);
  }

  return prompted;
}

/**
 * Nobody answered. Runs the predefined emergency procedure.
 *
 * Deliberately `sosService.activate` rather than a bespoke notification: the
 * requirement says the *emergency procedure*, and there is exactly one of those
 * in this application. Going through it means the contacts get the tracking
 * link and the medical details they would get from the button, and the event
 * lands in the SOS history where it can be reviewed afterwards.
 *
 * @returns {Promise<number>} how many escalated
 */
async function escalateOverdue(now = new Date()) {
  const overdue = await SafetyCheckIn.find({
    status: CHECKIN_STATUS.AWAITING,
    escalateAt: { $lte: now },
  });

  let escalated = 0;

  for (const checkIn of overdue) {
    /* eslint-disable no-await-in-loop */
    const owner = await User.findById(checkIn.user);
    if (!owner) {
      checkIn.status = CHECKIN_STATUS.CANCELLED;
      checkIn.resolutionNote = 'The account no longer exists.';
      await checkIn.save();
      continue;
    }

    const point = coordinatesOf(checkIn);

    try {
      const { sos } = await sosService.activate({
        user: owner,
        location: point,
        message:
          `Missed safety check-in: "${checkIn.label}".` +
          (checkIn.note ? ` They said: ${checkIn.note}` : '') +
          ' They did not confirm they were safe in time.',
        trigger: 'timer',
      });

      checkIn.escalatedSos = sos._id;
      checkIn.status = CHECKIN_STATUS.ESCALATED;
      checkIn.resolvedAt = now;
      await checkIn.save();

      emitToUser(owner._id, 'checkin:escalated', {
        checkInId: String(checkIn._id),
        sosId: String(sos._id),
      });

      notificationService
        .notify({
          user: owner._id,
          type: 'checkin-escalated',
          title: 'Your contacts have been alerted',
          body: `You did not confirm "${checkIn.label}" in time, so an emergency alert was sent.`,
          link: '/sos/active',
          data: { checkInId: String(checkIn._id), sosId: String(sos._id) },
          isUrgent: true,
        })
        .catch(() => {});

      auditService.recordAsync({
        action: AUDIT_ACTIONS.CHECKIN_ESCALATE,
        actor: owner,
        targetType: 'SafetyCheckIn',
        targetId: checkIn._id,
        severity: 'critical',
        message: `Check-in missed, emergency alert raised: "${checkIn.label}"`,
        metadata: { sosId: String(sos._id) },
      });

      escalated += 1;
    } catch (error) {
      /*
       * Left in `awaiting` on purpose. The next tick tries again, which is the
       * right behaviour for a failure here: giving up quietly on the one path
       * that exists to raise the alarm would be the worst possible outcome.
       */
      logger.error('Check-in escalation failed, will retry next tick', {
        checkIn: String(checkIn._id),
        message: error.message,
      });
    }
  }

  if (escalated) {
    logger.warn(`Check-in: ${escalated} missed, emergency alerts raised`);
  }

  return escalated;
}

function coordinatesOf(checkIn) {
  const coordinates = checkIn.startLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { lat: coordinates[1], lng: coordinates[0] };
}

/** One tick of the scheduler: ask whoever is due, escalate whoever is out of time. */
async function runDueChecks(now = new Date()) {
  const prompted = await promptDue(now);
  const escalated = await escalateOverdue(now);
  return { prompted, escalated };
}

export { start, confirmSafe, extend, cancel, promptDue, escalateOverdue, runDueChecks };
