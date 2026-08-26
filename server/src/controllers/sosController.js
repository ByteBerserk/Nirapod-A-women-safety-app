import env from '../config/env.js';
import User from '../models/User.js';
import SosEvent from '../models/SosEvent.js';
import EmergencyContact from '../models/EmergencyContact.js';
import MailJob from '../models/MailJob.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginationMeta } from '../utils/apiResponse.js';
import * as sosView from '../views/sosView.js';
import * as sosService from '../services/sosService.js';
import * as mailService from '../services/mailService.js';
import * as auditService from '../services/auditService.js';
import { hashToken } from '../utils/tokens.js';
import { parseCoordinates } from '../utils/geo.js';
import { getPagination, dateRangeFilter } from '../utils/query.js';
import { SOS_STATUS, AUDIT_ACTIONS, MAIL_STATUS } from '../config/constants.js';
import { runInBackground } from '../utils/background.js';

/** FR-2, FR-3, FR-4, FR-10. */

/* -------------------------------------------------------------- activate --- */

export const activateSos = asyncHandler(async (req, res) => {
  /*
   * A missing location no longer blocks the alert.
   *
   * Refusing without coordinates meant that a phone indoors, with location
   * switched off, or that had just had the permission denied could not raise
   * the alarm at all - the contacts heard nothing. An alert that says "she
   * needs help, we could not read her location, call her" is far better than
   * silence, and the alert email has always had a branch for exactly that.
   * The trail starts as soon as the device manages a fix.
   *
   * Coordinates that were *sent* but are nonsense are a different matter, and
   * are still rejected: silently treating lat=200 as "no location" would hide a
   * broken client on the one call where hiding a fault is least acceptable.
   */
  const source = req.body.location || req.body;
  const sentCoordinates =
    (source?.lat ?? source?.latitude) !== undefined ||
    (source?.lng ?? source?.lon ?? source?.longitude) !== undefined;

  const location = parseCoordinates(source);

  if (sentCoordinates && !location) {
    throw AppError.validation({
      location:
        'Those coordinates are not valid. Latitude must be between -90 and 90, and ' +
        'longitude between -180 and 180.',
    });
  }

  // The full document is needed here - `protect` selects a slim projection and
  // the alert email carries the blood group and medical notes.
  const user = await User.findById(req.user._id);
  if (!user) throw AppError.notFound('Account not found.');

  const contactCount = await EmergencyContact.countDocuments({
    owner: user._id,
    isActive: true,
  });

  const { sos, alreadyActive, trackingToken } = await sosService.activate({
    user,
    location,
    accuracy: Number.isFinite(Number(req.body.accuracy)) ? Number(req.body.accuracy) : null,
    message: req.body.message,
    trigger: req.body.trigger || 'manual',
    req,
  });

  const payload = {
    sos: sosView.detail(sos),
    trackingToken: trackingToken || null,
    trackingUrl: trackingToken ? `${env.clientUrl}/track/${trackingToken}` : null,
    contactCount,
  };

  if (alreadyActive) {
    return ok(res, payload, 'An alert is already running. Your location has been updated.');
  }

  // An honest message rather than a reassuring lie: if nobody is on the list,
  // nobody was emailed, and the user needs to know that right now. The same
  // applies to a missing fix - the alert went out, but without a place on it.
  const withoutLocation = location
    ? ''
    : ' Your location could not be read, so the alert asks them to call you.';

  const message = contactCount
    ? `Emergency alert sent. ${contactCount} contact${contactCount === 1 ? '' : 's'} are being notified by email.${withoutLocation}`
    : 'Emergency alert started, but you have no emergency contacts yet, so no one was emailed.';

  return created(res, payload, message);
});

/* ------------------------------------------------------------ live trail --- */

export const updateLocation = asyncHandler(async (req, res) => {
  const location = parseCoordinates(req.body.location || req.body);
  if (!location) throw AppError.validation({ location: 'A valid location is required.' });

  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id });
  if (!sos) throw AppError.notFound('That alert was not found.');

  await sosService.appendLocation({
    sos,
    lat: location.lat,
    lng: location.lng,
    accuracy: Number.isFinite(Number(req.body.accuracy)) ? Number(req.body.accuracy) : null,
    speed: Number.isFinite(Number(req.body.speed)) ? Number(req.body.speed) : null,
    recordedAt: req.body.recordedAt,
  });

  // No body: this fires every few seconds and the client already knows where
  // it is. Returning the trail each time would waste the user's data.
  return ok(res, { trailPointCount: sos.trail.length });
});

/* --------------------------------------------------------------- resolve --- */

export const resolveSos = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id });
  if (!sos) throw AppError.notFound('That alert was not found.');

  const user = await User.findById(req.user._id).select('name email');

  await sosService.resolve({
    sos,
    user,
    note: req.body.note,
    status: req.body.cancelled ? SOS_STATUS.CANCELLED : SOS_STATUS.RESOLVED,
    req,
  });

  return ok(
    res,
    { sos: sosView.detail(sos) },
    'Your contacts have been told you are safe. The tracking link has been switched off.'
  );
});

/* ------------------------------------------------------------ current/list --- */

export const getActiveSos = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findActiveForUser(req.user._id);
  return ok(res, { sos: sos ? sosView.detail(sos) : null });
});

/** FR-10: the SOS history, with date and duration. */
export const listSosHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const dateRange = dateRangeFilter(req.query.from, req.query.to);
  if (dateRange) filter.createdAt = dateRange;

  const [events, total] = await Promise.all([
    SosEvent.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      // The trail can hold thousands of points; a list view never needs it.
      .select('-trail')
      .lean(),
    SosEvent.countDocuments(filter),
  ]);

  return ok(
    res,
    { events: events.map(sosView.summary) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const getSosDetail = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!sos) throw AppError.notFound('That alert was not found.');
  return ok(res, { sos: sosView.detail(sos) });
});

/* ------------------------------------------------- public tracking (FR-2) --- */

/**
 * Opened by an emergency contact straight from their email. No account, no
 * sign-in - just the token. The presenter decides what they may see.
 */
export const getTrackingByToken = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({
    trackingTokenHash: hashToken(req.params.token),
    trackingExpiresAt: { $gt: new Date() },
  }).populate('user', 'name phone bloodGroup medicalInfo avatar');

  if (!sos) {
    throw AppError.notFound(
      'This tracking link is no longer active. The person may have marked themselves safe.',
      { code: 'TRACKING_EXPIRED' }
    );
  }

  // Counted with an atomic update so two contacts opening it at once cannot
  // overwrite each other's increment.
  SosEvent.updateOne({ _id: sos._id }, { $inc: { trackingViews: 1 } }).catch(() => {});

  return ok(res, {
    tracking: sosView.publicTracking(sos, sos.user),
    sosId: String(sos._id), // the socket needs this to join the room
  });
});

/** Lets the user kill a live tracking link without closing the alert. */
export const revokeTracking = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id });
  if (!sos) throw AppError.notFound('That alert was not found.');

  sos.revokeTrackingToken();
  await sos.save();

  return ok(res, null, 'The tracking link has been switched off.');
});

/* -------------------------------------------------- NFR-12: resend/status --- */

/**
 * Delivery status per contact, so the UI can say "3 of 4 delivered" rather than
 * leaving the user to hope.
 */
export const getAlertStatus = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!sos) throw AppError.notFound('That alert was not found.');

  const jobs = await MailJob.find({ relatedSos: sos._id })
    .select('to toName status attempts lastError sentAt kind')
    .lean();

  return ok(res, {
    recipients: jobs.map((job) => ({
      email: job.to,
      name: job.toName,
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError || '',
      sentAt: job.sentAt,
    })),
    summary: {
      total: jobs.length,
      sent: jobs.filter((j) => j.status === MAIL_STATUS.SENT).length,
      pending: jobs.filter((j) =>
        [MAIL_STATUS.QUEUED, MAIL_STATUS.SENDING].includes(j.status)
      ).length,
      failed: jobs.filter((j) => j.status === MAIL_STATUS.ABANDONED).length,
    },
  });
});

/** Manual retry for alerts the queue gave up on (NFR-12). */
export const resendAlerts = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findOne({ _id: req.params.id, user: req.user._id });
  if (!sos) throw AppError.notFound('That alert was not found.');

  const result = await MailJob.updateMany(
    { relatedSos: sos._id, status: MAIL_STATUS.ABANDONED },
    { $set: { status: MAIL_STATUS.QUEUED, attempts: 0, nextAttemptAt: new Date() } }
  );

  if (result.modifiedCount) runInBackground(mailService.processQueue(20), 'SOS resend');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SOS_ALERT_SENT,
    req,
    targetType: 'SosEvent',
    targetId: sos._id,
    message: `Manually retried ${result.modifiedCount} failed alert(s)`,
  });

  return ok(
    res,
    { retried: result.modifiedCount },
    result.modifiedCount
      ? `Retrying ${result.modifiedCount} failed alert(s).`
      : 'There are no failed alerts to retry.'
  );
});
