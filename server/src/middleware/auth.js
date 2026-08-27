import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ACCOUNT_STATUS, ROLE_RANK } from '../config/constants.js';

/** Pulls the bearer token out of the Authorization header. */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  // Fallback for the tracking page, which cannot set headers on an <img>/<a>.
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

/**
 * Loads the user behind the token and rejects anything stale. Four separate
 * things can invalidate a technically-valid JWT:
 *   - the account was deleted
 *   - the account is suspended
 *   - the password changed after the token was issued
 *   - tokenVersion was bumped ("sign out everywhere")
 */
const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw AppError.unauthorized('Please sign in to continue.', { code: 'NO_TOKEN' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // A distinct code so the client knows to hit /auth/refresh rather than
      // bouncing the user to the login screen.
      throw AppError.unauthorized('Your session has expired.', { code: 'TOKEN_EXPIRED' });
    }
    throw AppError.unauthorized('Your session is not valid. Please sign in again.', {
      code: 'INVALID_TOKEN',
    });
  }

  const user = await User.findById(payload.sub).select(
    '+failedLoginAttempts name username email avatar role accountStatus tokenVersion ' +
      'passwordChangedAt suspension notificationPrefs privacyPrefs phone bloodGroup medicalInfo'
  );

  if (!user) {
    throw AppError.unauthorized('This account no longer exists.', { code: 'USER_GONE' });
  }

  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw AppError.unauthorized('Your session has ended. Please sign in again.', {
      code: 'SESSION_REVOKED',
    });
  }

  if (payload.iat && user.passwordChangedAfter(payload.iat)) {
    throw AppError.unauthorized('Your password changed. Please sign in again.', {
      code: 'PASSWORD_CHANGED',
    });
  }

  if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) {
    throw AppError.forbidden('This account has been deactivated.', { code: 'ACCOUNT_DEACTIVATED' });
  }

  if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    // A timed suspension that has run out lifts itself on the next request,
    // so nobody has to remember to un-suspend an account by hand.
    if (user.suspension?.until && user.suspension.until.getTime() <= Date.now()) {
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      user.suspension = { reason: '', until: null, by: null, at: null };
      await user.save({ validateBeforeSave: false });
    } else {
      const until = user.suspension?.until;
      throw AppError.forbidden(
        until
          ? `Your account is suspended until ${until.toISOString().slice(0, 10)}.`
          : 'Your account has been suspended.',
        { code: 'ACCOUNT_SUSPENDED', details: { reason: user.suspension?.reason || '' } }
      );
    }
  }

  req.user = user;
  req.tokenPayload = payload;
  return next();
});

/**
 * Attaches req.user when a valid token is present, but never rejects. Used on
 * endpoints that show more to a signed-in visitor - the incident feed marks
 * "your reaction", for instance.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select(
      'name username email avatar role accountStatus tokenVersion'
    );
    if (
      user &&
      user.accountStatus === ACCOUNT_STATUS.ACTIVE &&
      (payload.tv ?? 0) === (user.tokenVersion ?? 0)
    ) {
      req.user = user;
    }
  } catch {
    /* an invalid token on an optional route is simply ignored */
  }

  return next();
});

/**
 * Role gate. Because roles are ranked, `restrictTo('moderator')` also lets an
 * admin through - otherwise every moderator route would need both names.
 */
function restrictTo(...allowedRoles) {
  const minimumRank = Math.min(...allowedRoles.map((role) => ROLE_RANK[role] ?? 99));

  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Please sign in to continue.'));
    }
    if ((ROLE_RANK[req.user.role] ?? 0) < minimumRank) {
      return next(
        AppError.forbidden('You do not have permission to perform this action.', {
          code: 'INSUFFICIENT_ROLE',
        })
      );
    }
    return next();
  };
}

export { protect, optionalAuth, restrictTo };