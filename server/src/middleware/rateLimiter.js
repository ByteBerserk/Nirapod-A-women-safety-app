import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';

/**
 * NFR-4. Limits are deliberately uneven: brute-forcing a login is a real
 * threat, so that bucket is tight, while an SOS must never be blocked by a
 * limiter - a woman in trouble tapping the button four times is not an attack.
 */

function handler(message) {
  return (req, res, next) => next(AppError.tooMany(message));
}

/** Disabled under test so the suite does not trip over its own request volume. */
const skip = () => env.isTest;

const general = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('You are making requests too quickly. Please wait a moment.'),
});

const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  // Only failures count, so someone repeatedly signing in on a shared network
  // is not punished for someone else's typos.
  skipSuccessfulRequests: true,
  handler: handler('Too many sign-in attempts. Please try again in 15 minutes.'),
});

const passwordReset = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many password reset requests. Please try again later.'),
});

/**
 * Generous on purpose. It exists only to stop a runaway client loop from
 * mailing someone's entire contact list, not to ration emergencies.
 */
const sos = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('An SOS is already being processed. Please wait a few seconds.'),
});

/** Location pings during an SOS - one every few seconds is normal. */
const locationPing = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Location updates are being sent too quickly.'),
});

const write = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('You have posted a lot recently. Please try again later.'),
});

const upload = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many uploads. Please try again later.'),
});

/** Outbound calls to Nominatim and Overpass, which are donated services. */
const externalGeo = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many map lookups. Please wait a few seconds.'),
});

export { general, auth, passwordReset, sos, locationPing, write, upload, externalGeo };