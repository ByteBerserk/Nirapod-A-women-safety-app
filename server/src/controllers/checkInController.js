import SafetyCheckIn from '../models/SafetyCheckIn.js';
import EmergencyContact from '../models/EmergencyContact.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginationMeta } from '../utils/apiResponse.js';
import * as checkInService from '../services/checkInService.js';
import * as checkInView from '../views/checkInView.js';
import { parseCoordinates } from '../utils/geo.js';
import { getPagination } from '../utils/query.js';
import { normaliseText } from '../utils/sanitize.js';
import { LIMITS } from '../config/constants.js';

async function ownedCheckIn(req) {
  const checkIn = await SafetyCheckIn.findOne({ _id: req.params.id, user: req.user._id });
  if (!checkIn) throw AppError.notFound('That check-in was not found.');
  return checkIn;
}

export const startCheckIn = asyncHandler(async (req, res) => {
  const minutes = Number(req.body.minutes);
  const location = parseCoordinates(req.body.location || req.body);

  const checkIn = await checkInService.start({
    user: req.user,
    label: normaliseText(req.body.label),
    minutes,
    graceMinutes: req.body.graceMinutes,
    location,
    note: normaliseText(req.body.note || ''),
    req,
  });

  const contactCount = await EmergencyContact.countDocuments({
    owner: req.user._id,
    isActive: true,
  });

  const message = contactCount
    ? `Check-in set. If you do not confirm, ${contactCount} contact${
        contactCount === 1 ? '' : 's'
      } will be alerted.`
    : 'Check-in set, but you have no emergency contacts yet, so nobody would be alerted.';

  return created(res, { checkIn: checkInView.detail(checkIn), contactCount }, message);
});

export const getActiveCheckIn = asyncHandler(async (req, res) => {
  const checkIn = await SafetyCheckIn.findOpenForUser(req.user._id);
  return ok(res, { checkIn: checkIn ? checkInView.detail(checkIn) : null });
});

export const listCheckIns = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    SafetyCheckIn.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    SafetyCheckIn.countDocuments(filter),
  ]);

  return ok(
    res,
    { checkIns: items.map(checkInView.summary) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const getCheckIn = asyncHandler(async (req, res) => {
  const checkIn = await ownedCheckIn(req);
  return ok(res, { checkIn: checkInView.detail(checkIn) });
});

export const confirmSafe = asyncHandler(async (req, res) => {
  const checkIn = await ownedCheckIn(req);

  await checkInService.confirmSafe({
    checkIn,
    user: req.user,
    note: normaliseText(req.body.note || ''),
    req,
  });

  return ok(
    res,
    { checkIn: checkInView.detail(checkIn) },
    'Good. Your check-in is closed and nobody was alerted.'
  );
});

export const extendCheckIn = asyncHandler(async (req, res) => {
  const checkIn = await ownedCheckIn(req);

  const minutes = Math.min(
    LIMITS.CHECKIN_MAX_MINUTES,
    Math.max(LIMITS.CHECKIN_MIN_MINUTES, Number(req.body.minutes) || LIMITS.CHECKIN_DEFAULT_MINUTES)
  );

  await checkInService.extend({ checkIn, user: req.user, minutes, req });

  return ok(
    res,
    { checkIn: checkInView.detail(checkIn) },
    `Timer pushed back by ${minutes} minute${minutes === 1 ? '' : 's'}.`
  );
});

export const cancelCheckIn = asyncHandler(async (req, res) => {
  const checkIn = await ownedCheckIn(req);
  await checkInService.cancel({ checkIn, user: req.user, req });

  return ok(res, { checkIn: checkInView.detail(checkIn) }, 'Check-in cancelled.');
});
