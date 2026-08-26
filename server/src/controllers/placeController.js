import SafePlace from '../models/SafePlace.js';
import SafePlaceEvent from '../models/SafePlaceEvent.js';
import EmergencyContact from '../models/EmergencyContact.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent, paginationMeta } from '../utils/apiResponse.js';
import * as commonView from '../views/commonView.js';
import * as logger from '../config/logger.js';
import * as geoService from '../services/geoService.js';
import * as mailService from '../services/mailService.js';
import * as notificationService from '../services/notificationService.js';
import * as auditService from '../services/auditService.js';
import * as templates from '../views/emails/templates.js';
import { parseCoordinates, distanceInMeters } from '../utils/geo.js';
import { getPagination } from '../utils/query.js';
import { normaliseText } from '../utils/sanitize.js';
import { AUDIT_ACTIONS, LIMITS, SAFE_PLACE_TYPES } from '../config/constants.js';
import { runInBackground } from '../utils/background.js';

/** FR-18, FR-19, FR-20. */

/* ------------------------------------------------- FR-18: nearby services --- */

export const findNearby = asyncHandler(async (req, res) => {
  const centre = parseCoordinates({ lat: req.query.lat, lng: req.query.lng });
  if (!centre) {
    throw AppError.badRequest(
      'We need your location to find nearby services. Please allow location access.'
    );
  }

  const kind = String(req.query.kind || 'police');
  const radius = Number(req.query.radius) || 5000;

  const places = await geoService.findNearby(kind, centre, radius);

  return ok(res, {
    kind,
    centre,
    radius: Math.min(LIMITS.NEARBY_MAX_RADIUS_M, Math.max(200, radius)),
    count: places.length,
    places,
  });
});

/** All three categories at once, for the "nearby help" screen. */
export const findAllNearby = asyncHandler(async (req, res) => {
  const centre = parseCoordinates({ lat: req.query.lat, lng: req.query.lng });
  if (!centre) throw AppError.badRequest('We need your location to find nearby services.');

  const radius = Number(req.query.radius) || 5000;
  const kinds = ['police', 'hospital', 'pharmacy'];

  /*
   * One request covering all three categories, not three in parallel.
   *
   * Overpass allows two concurrent slots per client, so asking for three at
   * once reliably lost at least one - a category came back empty with nothing
   * on screen to explain why. The service now fetches the lot in a single
   * query and splits the answer by tag.
   */
  const results = {};
  const failed = [];

  try {
    const grouped = await geoService.findNearbyMany(kinds, centre, radius);
    for (const kind of kinds) results[kind] = (grouped[kind] || []).slice(0, 15);
  } catch (error) {
    for (const kind of kinds) results[kind] = [];
    failed.push(...kinds);
    logger.warn('Nearby lookup failed', { message: error.message });
  }

  return ok(
    res,
    { centre, radius, results, failed },
    failed.length
      ? 'The map service is busy right now, so nearby places could not be loaded. Please try again in a moment.'
      : undefined
  );
});

export const searchPlaces = asyncHandler(async (req, res) => {
  const results = await geoService.searchPlaces(req.query.q, Number(req.query.limit) || 5);
  return ok(res, { results });
});

export const reverseGeocode = asyncHandler(async (req, res) => {
  const point = parseCoordinates({ lat: req.query.lat, lng: req.query.lng });
  if (!point) throw AppError.badRequest('Valid coordinates are required.');

  const result = await geoService.reverseGeocode(point.lat, point.lng);
  return ok(res, { location: point, ...result });
});

/* ---------------------------------------------------- FR-19: safe places --- */

export const listSafePlaces = asyncHandler(async (req, res) => {
  const places = await SafePlace.find({ owner: req.user._id }).sort('-createdAt').lean();

  return ok(res, {
    places: places.map(commonView.safePlace),
    limit: LIMITS.MAX_SAFE_PLACES,
    types: SAFE_PLACE_TYPES,
  });
});

export const createSafePlace = asyncHandler(async (req, res) => {
  const count = await SafePlace.countDocuments({ owner: req.user._id });
  if (count >= LIMITS.MAX_SAFE_PLACES) {
    throw AppError.badRequest(`You can save up to ${LIMITS.MAX_SAFE_PLACES} places.`);
  }

  const location = parseCoordinates(req.body.location || req.body);
  if (!location) throw AppError.validation({ location: 'Please choose the location on the map.' });

  let address = normaliseText(req.body.address || '');
  if (!address) {
    // Best effort - a saved place without a street name still works.
    const resolved = await geoService.reverseGeocode(location.lat, location.lng).catch(() => null);
    address = resolved?.address || '';
  }

  const place = await SafePlace.create({
    owner: req.user._id,
    label: normaliseText(req.body.label),
    type: req.body.type || 'other',
    location: { type: 'Point', coordinates: [location.lng, location.lat] },
    address,
    radiusMeters: Number(req.body.radiusMeters) || 150,
    notifyOnEnter: req.body.notifyOnEnter !== false,
    notifyOnLeave: req.body.notifyOnLeave !== false,
    notifyContacts: req.body.notifyContacts === true,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SAFE_PLACE_CREATE,
    req,
    targetType: 'SafePlace',
    targetId: place._id,
    message: `Safe place saved: ${place.label}`,
  });

  return created(res, { place: commonView.safePlace(place) }, `"${place.label}" has been saved.`);
});

export const updateSafePlace = asyncHandler(async (req, res) => {
  const place = await SafePlace.findOne({ _id: req.params.id, owner: req.user._id });
  if (!place) throw AppError.notFound('That place was not found.');

  if (req.body.label !== undefined) place.label = normaliseText(req.body.label);
  if (req.body.type !== undefined) place.type = req.body.type;
  if (req.body.address !== undefined) place.address = normaliseText(req.body.address);
  if (req.body.radiusMeters !== undefined) place.radiusMeters = Number(req.body.radiusMeters);
  if (req.body.notifyOnEnter !== undefined) place.notifyOnEnter = Boolean(req.body.notifyOnEnter);
  if (req.body.notifyOnLeave !== undefined) place.notifyOnLeave = Boolean(req.body.notifyOnLeave);
  if (req.body.notifyContacts !== undefined) {
    place.notifyContacts = Boolean(req.body.notifyContacts);
  }

  const location = parseCoordinates(req.body.location);
  if (location) {
    place.location = { type: 'Point', coordinates: [location.lng, location.lat] };
    // Moving the fence invalidates the remembered inside/outside state.
    place.isInside = false;
    place.lastTransitionAt = null;
  }

  await place.save();
  return ok(res, { place: commonView.safePlace(place) }, 'Saved.');
});

export const deleteSafePlace = asyncHandler(async (req, res) => {
  const place = await SafePlace.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!place) throw AppError.notFound('That place was not found.');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.SAFE_PLACE_DELETE,
    req,
    targetType: 'SafePlace',
    targetId: place._id,
    message: `Safe place removed: ${place.label}`,
  });

  return noContent(res);
});

/* ------------------------------------------- FR-20: geofence evaluation ---- */

/**
 * The client posts its position every so often; the server compares it against
 * every saved fence and reports any transitions.
 *
 * Evaluating server-side rather than in the browser is deliberate: a phone with
 * the tab in the background gets throttled and would miss transitions, and the
 * emails to family have to be sent from here anyway.
 */
export const checkLocation = asyncHandler(async (req, res) => {
  const point = parseCoordinates(req.body.location || req.body);
  if (!point) throw AppError.validation({ location: 'A valid location is required.' });

  const places = await SafePlace.find({ owner: req.user._id });
  if (!places.length) return ok(res, { transitions: [], inside: [] });

  const now = new Date();
  const transitions = [];
  const inside = [];

  // Loaded once, not once per place, and only if a transition needs it.
  let contacts = null;
  let profile = null;

  for (const place of places) {
    const centre = {
      lat: place.location.coordinates[1],
      lng: place.location.coordinates[0],
    };
    const distance = distanceInMeters(point, centre);

    /*
     * Hysteresis. Using the same threshold in both directions makes a phone
     * sitting on the boundary flip repeatedly and mail the family every
     * minute. Entering needs the radius; leaving needs the radius plus 20%
     * (at least 30 m), so noise in the GPS fix cannot trigger an alert.
     */
    const enterThreshold = place.radiusMeters;
    const leaveThreshold = place.radiusMeters + Math.max(30, place.radiusMeters * 0.2);

    const wasInside = place.isInside;
    const isInside = wasInside ? distance <= leaveThreshold : distance <= enterThreshold;

    place.lastEvaluatedAt = now;

    if (isInside === wasInside) {
      if (isInside) inside.push({ id: String(place._id), label: place.label });
      /* eslint-disable no-await-in-loop */
      await place.save();
      continue;
    }

    const event = isInside ? 'enter' : 'leave';
    place.isInside = isInside;
    place.lastTransitionAt = now;
    await place.save();

    if (isInside) inside.push({ id: String(place._id), label: place.label });

    const wantsAlert =
      (event === 'enter' && place.notifyOnEnter) || (event === 'leave' && place.notifyOnLeave);
    if (!wantsAlert) continue;

    let contactsNotified = 0;

    // FR-20: family members may receive these too, if both the place and the
    // account-wide privacy setting allow it.
    if (place.notifyContacts) {
      if (!profile) profile = await User.findById(req.user._id).select('name privacyPrefs');

      if (profile?.privacyPrefs?.notifyContactsOnSafePlace) {
        if (!contacts) contacts = await EmergencyContact.activeForOwner(req.user._id);

        for (const contact of contacts) {
          try {
            await mailService.enqueue({
              kind: 'safe-place',
              to: contact.email,
              toName: contact.name,
              priority: 6,
              relatedUser: req.user._id,
              // One mail per transition per contact, even if the phone
              // re-posts the same fix.
              dedupeKey: `place:${place._id}:${event}:${contact._id}:${now.toISOString().slice(0, 16)}`,
              ...templates.safePlaceTransition({
                contactName: contact.name,
                user: { name: profile.name },
                placeLabel: place.label,
                event,
                occurredAt: now,
              }),
            });
            contactsNotified += 1;
          } catch {
            /* one bad address must not stop the rest */
          }
        }
      }
    }

    const record = await SafePlaceEvent.create({
      owner: req.user._id,
      place: place._id,
      placeLabel: place.label,
      event,
      coordinates: [point.lng, point.lat],
      distanceMeters: Math.round(distance),
      contactsNotified,
      occurredAt: now,
    });

    notificationService
      .notify({
        user: req.user._id,
        type: event === 'enter' ? 'safe-place-enter' : 'safe-place-leave',
        title: event === 'enter' ? `Arrived at ${place.label}` : `Left ${place.label}`,
        body:
          contactsNotified > 0
            ? `${contactsNotified} contact${contactsNotified === 1 ? '' : 's'} were told.`
            : '',
        data: { placeId: String(place._id), event },
      })
      .catch(() => {});

    transitions.push(commonView.safePlaceEvent(record));

    auditService.recordAsync({
      action: AUDIT_ACTIONS.SAFE_PLACE_TRANSITION,
      req,
      targetType: 'SafePlace',
      targetId: place._id,
      message: `${event === 'enter' ? 'Entered' : 'Left'} ${place.label}`,
      metadata: { contactsNotified },
    });
  }

  if (transitions.length) {
    runInBackground(mailService.processQueue(10), 'safe place mail delivery');
  }

  return ok(res, { transitions, inside });
});

export const listSafePlaceEvents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);

  const filter = { owner: req.user._id };
  if (req.query.placeId) filter.place = req.query.placeId;

  const [events, total] = await Promise.all([
    SafePlaceEvent.find(filter).sort('-occurredAt').skip(skip).limit(limit).lean(),
    SafePlaceEvent.countDocuments(filter),
  ]);

  return ok(
    res,
    { events: events.map(commonView.safePlaceEvent) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});
