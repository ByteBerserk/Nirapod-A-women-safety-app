import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ACCOUNT_STATUS, ROLE_RANK } from '../config/constants.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();

  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

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

  }

  return next();
});

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
