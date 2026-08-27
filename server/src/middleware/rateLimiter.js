import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';

function handler(message) {
  return (req, res, next) => next(AppError.tooMany(message));
}

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

const sos = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('An SOS is already being processed. Please wait a few seconds.'),
});

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

const externalGeo = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many map lookups. Please wait a few seconds.'),
});

export { general, auth, passwordReset, sos, locationPing, write, upload, externalGeo };
