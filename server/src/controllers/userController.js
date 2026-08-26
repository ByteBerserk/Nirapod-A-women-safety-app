import fs from 'fs';
import path from 'path';
import env from '../config/env.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, paginationMeta } from '../utils/apiResponse.js';
import * as userView from '../views/userView.js';
import * as auditService from '../services/auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { getPagination, keywordFilter } from '../utils/query.js';
import { normaliseText, normalisePhone, pick } from '../utils/sanitize.js';
import { removeUploadedFiles, persistUpload } from '../middleware/upload.js';

/** FR-1: view and update the personal profile. */

/** Fields the owner is allowed to change. Role and status are not among them. */
const EDITABLE = [
  'name',
  'phone',
  'gender',
  'dateOfBirth',
  'bloodGroup',
  'medicalInfo',
  'address',
];

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw AppError.notFound('Account not found.');
  return ok(res, { user: userView.self(user) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw AppError.notFound('Account not found.');

  const updates = pick(req.body, EDITABLE);

  if (updates.name !== undefined) user.name = normaliseText(updates.name);
  if (updates.phone !== undefined) user.phone = normalisePhone(updates.phone);
  if (updates.gender !== undefined) user.gender = updates.gender;
  if (updates.bloodGroup !== undefined) user.bloodGroup = updates.bloodGroup;
  if (updates.medicalInfo !== undefined) {
    user.medicalInfo = String(updates.medicalInfo).trim().slice(0, 1000);
  }
  if (updates.dateOfBirth !== undefined) {
    user.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
  }
  if (updates.address && typeof updates.address === 'object') {
    for (const key of ['line1', 'city', 'state', 'postalCode', 'country']) {
      if (updates.address[key] !== undefined) {
        user.address[key] = normaliseText(updates.address[key]);
      }
    }
  }

  // The username is changeable but must stay unique, so it is handled apart
  // from the bulk assignment above.
  if (req.body.username !== undefined) {
    const username = String(req.body.username).trim().toLowerCase();
    if (username !== user.username) {
      if (await User.exists({ username, _id: { $ne: user._id } })) {
        throw AppError.validation({ username: 'That username is already taken.' });
      }
      user.username = username;
    }
  }

  await user.save();

  auditService.recordAsync({
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    req,
    targetType: 'User',
    targetId: user._id,
    message: 'Profile updated',
    metadata: { fields: Object.keys(updates) },
  });

  return ok(res, { user: userView.self(user) }, 'Your profile has been updated.');
});

export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Please choose an image to upload.');

  const user = await User.findById(req.user._id);
  if (!user) {
    removeUploadedFiles(req.file);
    throw AppError.notFound('Account not found.');
  }

  const previous = user.avatar;

  // Whichever driver is active returns the URL the browser should use.
  const stored = await persistUpload(req.file);
  user.avatar = stored.url;
  await user.save({ validateBeforeSave: false });

  // Delete the old picture so storage does not grow forever. Only avatars this
  // application created are ever touched.
  if (previous && previous.startsWith('/uploads/avatars/')) {
    const oldPath = path.join(env.uploads.dir, 'avatars', path.basename(previous));
    fs.promises.unlink(oldPath).catch(() => {});
  }

  return ok(res, { user: userView.self(user) }, 'Your profile picture has been updated.');
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw AppError.notFound('Account not found.');

  const { notificationPrefs, privacyPrefs } = req.body;

  if (notificationPrefs && typeof notificationPrefs === 'object') {
    for (const key of [
      'emailSosAlerts',
      'emailGroupAlerts',
      'emailSafePlace',
      'inAppNotifications',
    ]) {
      if (notificationPrefs[key] !== undefined) {
        user.notificationPrefs[key] = Boolean(notificationPrefs[key]);
      }
    }
  }

  if (privacyPrefs && typeof privacyPrefs === 'object') {
    for (const key of [
      'shareLocationWithGroups',
      'showProfileToGroupMembers',
      'notifyContactsOnSafePlace',
    ]) {
      if (privacyPrefs[key] !== undefined) {
        user.privacyPrefs[key] = Boolean(privacyPrefs[key]);
      }
    }
  }

  await user.save();
  return ok(res, { user: userView.self(user) }, 'Your preferences have been saved.');
});

/**
 * Used when inviting somebody to a safety group. Returns public profiles only,
 * requires at least three characters, and is capped at ten results so it cannot
 * be walked to enumerate the user base (NFR-5).
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 3) {
    return ok(res, { users: [] }, 'Type at least three characters to search.');
  }

  const filter = keywordFilter(term, ['name', 'username']);
  const users = await User.find({ ...filter, accountStatus: 'active' })
    .select('name username avatar role')
    .limit(10)
    .lean();

  return ok(res, { users: users.map(userView.publicProfile) });
});

export const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('name username avatar role accountStatus');
  if (!user || user.accountStatus !== 'active') throw AppError.notFound('That user was not found.');
  return ok(res, { user: userView.publicProfile(user) });
});

/**
 * Self-service deactivation. The account is flagged rather than deleted so that
 * incident reports and group history do not develop holes (NFR-10). Deletion of
 * personal data is an admin action with its own audit trail.
 */
export const deactivateAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw AppError.notFound('Account not found.');

  if (!(await user.comparePassword(String(req.body.password || '')))) {
    throw AppError.validation({ password: 'Please enter your password to confirm.' });
  }

  user.accountStatus = 'deactivated';
  user.tokenVersion += 1; // kills every existing session
  await user.save({ validateBeforeSave: false });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_USER_STATUS,
    req,
    actor: user,
    targetType: 'User',
    targetId: user._id,
    severity: 'notice',
    message: 'Account deactivated by its owner',
  });

  res.clearCookie('refreshToken', { path: '/api/auth' });
  return ok(res, null, 'Your account has been deactivated.');
});

/** FR-25 support: the admin user list. */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.accountStatus = req.query.status;

  const search = keywordFilter(req.query.q, ['name', 'username', 'email']);
  if (search) Object.assign(filter, search);

  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return ok(
    res,
    { users: users.map(userView.adminRow) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});
