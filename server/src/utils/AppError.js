/**
 * An error we raised on purpose, as opposed to something that blew up. The
 * error handler trusts the message of an AppError and shows it to the user;
 * anything else gets a generic message so internals never leak (NFR-4/14).
 */
class AppError extends Error {
  /**
   * @param {string} message  Safe to show to the end user.
   * @param {number} statusCode
   * @param {object} [options]
   * @param {string} [options.code]    Stable machine-readable code for the client.
   * @param {object} [options.details] Field level errors, e.g. { email: 'Already in use' }.
   */
  constructor(message, statusCode = 400, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? 'error' : 'fail';
    this.isOperational = true;
    this.code = options.code || defaultCode(statusCode);
    if (options.details) this.details = options.details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Invalid request.', options) {
    return new AppError(message, 400, options);
  }

  static unauthorized(message = 'You need to sign in to continue.', options) {
    return new AppError(message, 401, options);
  }

  static forbidden(message = 'You do not have permission to do that.', options) {
    return new AppError(message, 403, options);
  }

  static notFound(message = 'We could not find what you were looking for.', options) {
    return new AppError(message, 404, options);
  }

  static conflict(message = 'That conflicts with something that already exists.', options) {
    return new AppError(message, 409, options);
  }

  static validation(details, message = 'Please correct the highlighted fields.') {
    return new AppError(message, 422, { code: 'VALIDATION_ERROR', details });
  }

  static tooMany(message = 'Too many requests. Please slow down.', options) {
    return new AppError(message, 429, options);
  }

  static internal(message = 'Something went wrong on our side.', options) {
    return new AppError(message, 500, options);
  }
}

function defaultCode(statusCode) {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    }[statusCode] || 'ERROR'
  );
}

export default AppError;
