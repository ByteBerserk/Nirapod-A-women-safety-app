import env from '../config/env.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import * as userView from '../views/userView.js';
import * as templates from '../views/emails/templates.js';
import * as mailService from '../services/mailService.js';
import * as auditService from '../services/auditService.js';
import { AUDIT_ACTIONS, ACCOUNT_STATUS } from '../config/constants.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, durationToMs } from '../utils/tokens.js';
import { normaliseEmail, normaliseText } from '../utils/sanitize.js';
import { runInBackground } from '../utils/background.js';

/**
 * Accounts and sessions. The refresh token lives in an httpOnly cookie so
 * JavaScript on the page cannot read it; the short-lived access token is
 * returned in the body for the client to hold in memory (NFR-4).
 */

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd, // requires HTTPS in production
    sameSite: env.isProd ? 'none' : 'lax', // 'none' so the SPA can sit on another origin
    path: '/api/auth',
    maxAge: durationToMs(env.jwt.refreshExpiresIn) || 30 * 24 * 60 * 60 * 1000,
  };
}

function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  return { accessToken, refreshToken };
}

/* ---------------------------------------------------------------- register --- */

export const register = asyncHandler(async (req, res) => {
  const name = normaliseText(req.body.name);
  const email = normaliseEmail(req.body.email);
  const username = String(req.body.username || '').trim().toLowerCase();

  // Checked up front so the user gets a field-level message rather than a
  // generic duplicate-key error, and so we can point at the right input.
  const [emailTaken, usernameTaken] = await Promise.all([
    User.exists({ email }),
    User.exists({ username }),
  ]);

  const details = {};
  if (emailTaken) details.email = 'That email address is already registered.';
  if (usernameTaken) details.username = 'That username is already taken.';
  if (Object.keys(details).length) throw AppError.validation(details);

  const user = await User.create({
    name,
    email,
    username,
    password: req.body.password,
    phone: req.body.phone ? String(req.body.phone).trim() : '',
    gender: req.body.gender || undefined,
    bloodGroup: req.body.bloodGroup || undefined,
  });

  const { accessToken } = issueSession(res, user);

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_REGISTER,
    req,
    actor: user,
    targetType: 'User',
    targetId: user._id,
    message: `New account created: ${user.username}`,
  });

  // Queued rather than awaited - a slow SMTP server must not slow down signup.
  mailService
    .enqueue({
      kind: 'welcome',
      to: user.email,
      toName: user.name,
      priority: 7,
      relatedUser: user._id,
      ...templates.welcome({ name: user.name, loginUrl: `${env.clientUrl}/dashboard` }),
    })
    .catch(() => {});

  return created(
    res,
    { user: userView.self(user), accessToken },
    'Welcome to Nirapod. Your account is ready.'
  );
});

/* ------------------------------------------------------------------- login --- */

export const login = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  // Sign in with either an email address or a username.
  const user = await User.findOne(
    identifier.includes('@') ? { email: identifier } : { username: identifier }
  ).select('+password +failedLoginAttempts +lockedUntil');

  // One message for both "no such user" and "wrong password" so the endpoint
  // cannot be used to find out which addresses are registered.
  const genericFailure = AppError.unauthorized(
    'That email or password is not correct.',
    { code: 'BAD_CREDENTIALS' }
  );

  if (!user) {
    auditService.recordAsync({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      req,
      severity: 'notice',
      message: `Sign-in attempt for unknown account: ${identifier}`,
    });
    throw genericFailure;
  }

  if (user.isLocked) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw AppError.tooMany(
      `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      { code: 'ACCOUNT_LOCKED' }
    );
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });

    auditService.recordAsync({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      req,
      actor: user,
      severity: 'notice',
      message: 'Incorrect password',
    });
    throw genericFailure;
  }

  if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) {
    throw AppError.forbidden('This account has been deactivated.');
  }
  if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    if (user.suspension?.until && user.suspension.until.getTime() <= Date.now()) {
      user.accountStatus = ACCOUNT_STATUS.ACTIVE;
      user.suspension = { reason: '', until: null, by: null, at: null };
    } else {
      throw AppError.forbidden(
        user.suspension?.reason
          ? `Your account is suspended: ${user.suspension.reason}`
          : 'Your account has been suspended.',
        { code: 'ACCOUNT_SUSPENDED' }
      );
    }
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const { accessToken } = issueSession(res, user);

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    req,
    actor: user,
    message: `Signed in: ${user.username}`,
  });

  return ok(res, { user: userView.self(user), accessToken }, 'Signed in successfully.');
});

/* ----------------------------------------------------------------- refresh --- */

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw AppError.unauthorized('No session to refresh.', { code: 'NO_REFRESH_TOKEN' });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });
    throw AppError.unauthorized('Your session has expired. Please sign in again.', {
      code: 'REFRESH_EXPIRED',
    });
  }

  const user = await User.findById(payload.sub);
  if (!user || (payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });
    throw AppError.unauthorized('Your session has ended. Please sign in again.', {
      code: 'SESSION_REVOKED',
    });
  }
  if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
    throw AppError.forbidden('This account is not active.');
  }

  // The refresh cookie is reissued too, so an active user is never logged out
  // by the refresh token quietly ageing past its expiry.
  const { accessToken } = issueSession(res, user);
  return ok(res, { user: userView.self(user), accessToken });
});

/* ------------------------------------------------------------------ logout --- */

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });

  if (req.user) {
    auditService.recordAsync({ action: AUDIT_ACTIONS.AUTH_LOGOUT, req, message: 'Signed out' });
  }
  return ok(res, null, 'Signed out.');
});

/** Invalidates every session on every device by bumping tokenVersion. */
export const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    req,
    message: 'Signed out of all devices',
  });
  return ok(res, null, 'You have been signed out on every device.');
});

/* ---------------------------------------------------------------- identity --- */

export const me = asyncHandler(async (req, res) => ok(res, { user: userView.self(req.user) }));

/* ---------------------------------------------------------- password reset --- */

export const forgotPassword = asyncHandler(async (req, res) => {
  const email = normaliseEmail(req.body.email);
  const user = await User.findOne({ email });

  // Always the same reply. Otherwise this endpoint tells an attacker which
  // addresses have accounts.
  const genericReply = () =>
    ok(res, null, 'If that address has an account, a reset link is on its way.');

  if (!user || user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) return genericReply();

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.clientUrl}/reset-password?token=${resetToken}`;

  try {
    await mailService.enqueue({
      kind: 'password-reset',
      to: user.email,
      toName: user.name,
      priority: 2,
      relatedUser: user._id,
      ...templates.passwordReset({ name: user.name, resetUrl }),
    });
    // Send now rather than waiting up to a minute for the cron tick.
    runInBackground(mailService.processQueue(3), 'auth mail delivery');
  } catch (error) {
    // If we cannot even queue it, throw the token away so a stale one is not
    // left sitting on the account.
    user.clearPasswordReset();
    await user.save({ validateBeforeSave: false });
    throw AppError.internal('We could not send the reset email. Please try again shortly.');
  }

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUEST,
    req,
    actor: user,
    message: 'Password reset requested',
  });

  return genericReply();
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires');

  if (!user) {
    throw AppError.badRequest('That reset link is invalid or has expired. Please request a new one.', {
      code: 'RESET_TOKEN_INVALID',
    });
  }

  user.password = password; // the pre-save hook hashes it and bumps tokenVersion
  user.clearPasswordReset();
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET,
    req,
    actor: user,
    severity: 'notice',
    message: 'Password reset completed',
  });

  // Deliberately not signed in automatically: whoever reset it should prove
  // they know the new password.
  res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });
  return ok(res, null, 'Your password has been changed. Please sign in with it.');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw AppError.notFound('Account not found.');

  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.validation({ currentPassword: 'That is not your current password.' });
  }
  if (currentPassword === newPassword) {
    throw AppError.validation({ newPassword: 'Please choose a password you have not used here.' });
  }

  user.password = newPassword;
  await user.save();

  // tokenVersion changed, so the caller's own token is now dead too - hand
  // them a fresh session rather than logging them out of the tab they are in.
  const { accessToken } = issueSession(res, user);

  auditService.recordAsync({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGE,
    req,
    actor: user,
    severity: 'notice',
    message: 'Password changed',
  });

  return ok(res, { accessToken }, 'Your password has been updated on all devices.');
});
