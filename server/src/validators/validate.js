import mongoose from 'mongoose';
import validator from 'validator';
import AppError from '../utils/AppError.js';
import { parseCoordinates } from '../utils/geo.js';

/**
 * A small declarative validator. It exists instead of express-validator so that
 * every failure comes back in exactly the shape the React forms already read
 * ({ details: { field: 'message' } }), and so the rules sit next to the routes
 * rather than in a chain of middleware calls.
 */

const isPresent = (value) =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

/* ------------------------------------------------------------------ rules --- */

const rules = {
  string:
    ({ min = 0, max = Infinity, label } = {}) =>
    (value, field) => {
      if (typeof value !== 'string') return `${label || field} must be text.`;
      const trimmed = value.trim();
      if (trimmed.length < min) {
        return `${label || field} must be at least ${min} character${min === 1 ? '' : 's'}.`;
      }
      if (trimmed.length > max) {
        return `${label || field} cannot be longer than ${max} characters.`;
      }
      return null;
    },

  /*
   * Trimmed before checking, because every controller downstream stores the
   * address through normaliseEmail(), which trims. Without this a pasted
   * "  ammu@example.com " is refused as malformed even though the value the
   * system would go on to save is perfectly valid.
   */
  email: () => (value) =>
    validator.isEmail(String(value).trim()) ? null : 'Please enter a valid email address.',

  /**
   * Deliberately not "one uppercase, one symbol, one Greek letter". Length plus
   * a mix of letters and numbers keeps out the worst passwords without pushing
   * people towards Password1! on a sticky note.
   */
  password: () => (value) => {
    const str = String(value);
    if (str.length < 8) return 'Your password must be at least 8 characters.';
    if (str.length > 128) return 'Your password cannot be longer than 128 characters.';
    if (!/[a-zA-Z]/.test(str) || !/\d/.test(str)) {
      return 'Your password must contain at least one letter and one number.';
    }
    return null;
  },

  username: () => (value) => {
    const str = String(value).trim().toLowerCase();
    if (str.length < 3 || str.length > 30) return 'Usernames must be 3 to 30 characters.';
    if (!/^[a-z0-9_.]+$/.test(str)) {
      return 'Usernames may only contain letters, numbers, underscores and dots.';
    }
    if (/^[._]|[._]$/.test(str)) return 'Usernames cannot start or end with a dot or underscore.';
    return null;
  },

  phone: () => (value) =>
    /^\+?\d{6,15}$/.test(String(value).trim()) ? null : 'Please enter a valid phone number.',

  oneOf:
    (allowed, label) =>
    (value, field) =>
      allowed.includes(value)
        ? null
        : `${label || field} must be one of: ${allowed.join(', ')}.`,

  number:
    ({ min = -Infinity, max = Infinity, integer = false, label } = {}) =>
    (value, field) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return `${label || field} must be a number.`;
      if (integer && !Number.isInteger(num)) return `${label || field} must be a whole number.`;
      if (num < min) return `${label || field} must be at least ${min}.`;
      if (num > max) return `${label || field} cannot be more than ${max}.`;
      return null;
    },

  boolean: () => (value, field) =>
    typeof value === 'boolean' || value === 'true' || value === 'false'
      ? null
      : `${field} must be true or false.`,

  objectId: () => (value) =>
    mongoose.isValidObjectId(value) ? null : 'That identifier is not valid.',

  date:
    ({ allowFuture = true, allowPast = true, label } = {}) =>
    (value, field) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return `${label || field} is not a valid date.`;
      // 30 minutes of tolerance for a phone whose clock is slightly ahead.
      if (!allowFuture && date.getTime() > Date.now() + 30 * 60 * 1000) {
        return `${label || field} cannot be in the future.`;
      }
      if (!allowPast && date.getTime() < Date.now()) {
        return `${label || field} cannot be in the past.`;
      }
      return null;
    },

  /** Accepts { lat, lng } in any of the usual spellings. */
  coordinates: () => (value) =>
    parseCoordinates(value)
      ? null
      : 'A valid location is required (latitude between -90 and 90, longitude between -180 and 180).',

  latitude: () => (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= -90 && num <= 90
      ? null
      : 'Latitude must be between -90 and 90.';
  },

  longitude: () => (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= -180 && num <= 180
      ? null
      : 'Longitude must be between -180 and 180.';
  },

  url: () => (value) =>
    validator.isURL(String(value), { protocols: ['http', 'https'], require_protocol: true })
      ? null
      : 'Please enter a valid link starting with http:// or https://',

  array:
    ({ min = 0, max = Infinity, label } = {}) =>
    (value, field) => {
      if (!Array.isArray(value)) return `${label || field} must be a list.`;
      if (value.length < min) return `${label || field} needs at least ${min} item(s).`;
      if (value.length > max) return `${label || field} cannot have more than ${max} item(s).`;
      return null;
    },
};

/* --------------------------------------------------------------- runner --- */

/**
 * Builds a middleware from a schema.
 *
 * @param {object} schema  field -> { required?, in?, rules?, default? }
 * @param {'body'|'query'|'params'} source
 *
 * @example
 *   validate({ email: { required: true, rules: [rules.email()] } })
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const input = req[source] || {};
    const details = {};

    for (const [field, config] of Object.entries(schema)) {
      const value = input[field];

      if (!isPresent(value)) {
        if (config.required) {
          details[field] = config.requiredMessage || `${config.label || field} is required.`;
        }
        continue; // optional and absent - nothing to check
      }

      for (const rule of config.rules || []) {
        const message = rule(value, config.label || field);
        if (message) {
          details[field] = message;
          break; // one message per field is all a form can show
        }
      }
    }

    if (Object.keys(details).length) {
      return next(AppError.validation(details));
    }
    return next();
  };
}

/** Guards `:id`-style parameters before they ever reach a database call. */
function validateObjectId(...paramNames) {
  const names = paramNames.length ? paramNames : ['id'];

  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !mongoose.isValidObjectId(value)) {
        return next(
          AppError.notFound('We could not find that item.', { code: 'INVALID_ID' })
        );
      }
    }
    return next();
  };
}

export { validate, validateObjectId, rules };