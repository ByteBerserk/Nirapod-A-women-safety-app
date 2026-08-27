import multer from 'multer';
import env from '../config/env.js';
import * as logger from '../config/logger.js';
import AppError from '../utils/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import * as auditService from '../services/auditService.js';

/**
 * NFR-14. Every failure path ends here. The rules are:
 *   - an AppError is trusted and its message is shown to the user
 *   - a known library error (Mongoose, JWT, Multer) is translated into one
 *   - anything else becomes a generic 500 and the real detail goes to the log
 */

/** "Cast to ObjectId failed" -> a sentence a person can read. */
function handleCastError(error) {
  if (error.path === '_id') {
    return AppError.notFound('We could not find that item.', { code: 'INVALID_ID' });
  }
  return AppError.badRequest(`The value provided for "${error.path}" is not valid.`, {
    code: 'INVALID_VALUE',
  });
}

/** Turns a Mongoose ValidationError into per-field messages the form can show. */
function handleValidationError(error) {
  const details = {};
  for (const [field, issue] of Object.entries(error.errors || {})) {
    // Nested paths arrive as "address.city"; the client keys forms the same way.
    details[field] = issue.message;
  }
  return AppError.validation(details);
}

/** E11000 - a unique index rejected the write. */
function handleDuplicateKeyError(error) {
  const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';

  const friendly = {
    email: 'That email address is already registered.',
    username: 'That username is already taken.',
    slug: 'A resource with a very similar title already exists.',
  };

  // Compound indexes need their own wording.
  const keys = Object.keys(error.keyPattern || {});
  if (keys.includes('owner') && keys.includes('email')) {
    return AppError.conflict('That person is already one of your emergency contacts.', {
      code: 'DUPLICATE',
      details: { email: 'Already in your contact list.' },
    });
  }
  if (keys.includes('owner') && keys.includes('label')) {
    return AppError.conflict('You already have a saved place with that name.', {
      code: 'DUPLICATE',
      details: { label: 'Already used.' },
    });
  }
  if (keys.includes('reporter') && keys.includes('targetId')) {
    return AppError.conflict('You have already reported this.', { code: 'DUPLICATE' });
  }
  if (keys.includes('user') && keys.includes('targetId')) {
    return AppError.conflict('You have already saved this.', { code: 'DUPLICATE' });
  }

  return AppError.conflict(friendly[field] || `That ${field} is already in use.`, {
    code: 'DUPLICATE',
    details: { [field]: 'Already in use.' },
  });
}

function handleMulterError(error) {
  const messages = {
    LIMIT_FILE_SIZE: `That file is too large. The limit is ${Math.round(
      env.uploads.maxBytes / (1024 * 1024)
    )} MB.`,
    LIMIT_FILE_COUNT: 'You attached more files than are allowed.',
    LIMIT_UNEXPECTED_FILE: 'One of the attached files was not expected here.',
    LIMIT_PART_COUNT: 'The upload had too many parts.',
  };
  return new AppError(messages[error.code] || 'That upload could not be accepted.', 400, {
    code: error.code,
  });
}

function normalise(error) {
  if (error instanceof AppError) return error;

  if (error.name === 'CastError') return handleCastError(error);
  if (error.name === 'ValidationError' && error.errors) return handleValidationError(error);
  if (error.code === 11000) return handleDuplicateKeyError(error);
  if (error instanceof multer.MulterError) return handleMulterError(error);

  if (error.name === 'JsonWebTokenError') {
    return AppError.unauthorized('Your session is not valid. Please sign in again.');
  }
  if (error.name === 'TokenExpiredError') {
    return AppError.unauthorized('Your session has expired.', { code: 'TOKEN_EXPIRED' });
  }

  // Body parser: malformed JSON.
  if (error.type === 'entity.parse.failed') {
    return AppError.badRequest('The request body was not valid JSON.');
  }
  if (error.type === 'entity.too.large') {
    return new AppError('That request was too large.', 413);
  }

  // The database is unreachable. 503 tells the client it is worth retrying.
  if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoNetworkError') {
    return new AppError(
      'We are having trouble reaching the database. Please try again in a moment.',
      503,
      { code: 'DB_UNAVAILABLE' }
    );
  }

  return null; // genuinely unexpected
}

/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, next) {
  const known = normalise(err);
  const error =
    known ||
    AppError.internal(
      env.isProd
        ? 'Something went wrong on our side. Please try again.'
        : err.message || 'Unexpected error'
    );

  // Only genuine surprises and 5xx responses are worth a stack trace.
  if (!known || error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${error.statusCode}`, err);

    // Recording server errors is explicitly part of NFR-15. Loaded lazily to
    // avoid a require cycle between the error handler and the models.
    if (error.statusCode >= 500) {
      try {
        auditService.recordAsync({
          action: AUDIT_ACTIONS.SYSTEM_ERROR,
          req,
          severity: 'critical',
          message: String(err.message || 'Unhandled error').slice(0, 500),
          metadata: { path: req.originalUrl, method: req.method, name: err.name },
        });
      } catch {
        /* never let audit logging mask the original error */
      }
    }
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${error.statusCode}: ${error.message}`);
  }

  const body = {
    success: false,
    status: error.status,
    code: error.code,
    message: error.message,
  };
  if (error.details) body.details = error.details;
  if (!env.isProd && !known) body.stack = err.stack;

  res.status(error.statusCode).json(body);
}

/** 404 for anything the router did not match. */
function notFoundHandler(req, res, next) {
  next(
    AppError.notFound(`No route matches ${req.method} ${req.originalUrl}.`, { code: 'NO_ROUTE' })
  );
}

export { errorHandler, notFoundHandler };