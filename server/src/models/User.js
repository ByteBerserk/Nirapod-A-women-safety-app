import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import env from '../config/env.js';
import { hashToken, randomToken } from '../utils/tokens.js';
import { ROLES, ROLE_VALUES, ACCOUNT_STATUS, ACCOUNT_STATUS_VALUES, GENDERS, BLOOD_GROUPS } from '../config/constants.js';

const notificationPrefsSchema = new mongoose.Schema(
  {
    emailSosAlerts: { type: Boolean, default: true },
    emailGroupAlerts: { type: Boolean, default: true },
    emailSafePlace: { type: Boolean, default: false },
    inAppNotifications: { type: Boolean, default: true },
  },
  { _id: false }
);

const privacyPrefsSchema = new mongoose.Schema(
  {
    // FR-16 / NFR-5: sharing is opt-in, never assumed.
    shareLocationWithGroups: { type: Boolean, default: false },
    showProfileToGroupMembers: { type: Boolean, default: true },
    // FR-20: let family see safe-place transitions.
    notifyContactsOnSafePlace: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please tell us your name.'],
      trim: true,
      minlength: [2, 'Your name must be at least 2 characters.'],
      maxlength: [80, 'Your name cannot be longer than 80 characters.'],
    },

    username: {
      type: String,
      required: [true, 'Please choose a username.'],
      trim: true,
      lowercase: true,
      minlength: [3, 'Usernames must be at least 3 characters.'],
      maxlength: [30, 'Usernames cannot be longer than 30 characters.'],
      match: [
        /^[a-z0-9_.]+$/,
        'Usernames may only contain lowercase letters, numbers, underscores and dots.',
      ],
    },

    email: {
      type: String,
      required: [true, 'Please provide your email address.'],
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: 'That does not look like a valid email address.',
      },
    },

    password: {
      type: String,
      required: [true, 'Please choose a password.'],
      minlength: [8, 'Passwords must be at least 8 characters.'],
      select: false, // never comes back from a query unless explicitly asked for
    },

    phone: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (value) => !value || /^\+?\d{6,15}$/.test(value),
        message: 'Please enter a valid phone number.',
      },
    },

    avatar: { type: String, default: '' },

    gender: { type: String, enum: GENDERS, default: 'prefer-not-to-say' },

    dateOfBirth: {
      type: Date,
      validate: {
        validator(value) {
          if (!value) return true;
          return value < new Date() && value > new Date('1900-01-01');
        },
        message: 'Please enter a valid date of birth.',
      },
    },

    // FR-1: emergency responders need these at a glance.
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: 'unknown' },

    medicalInfo: {
      type: String,
      trim: true,
      maxlength: [1000, 'Medical information cannot be longer than 1000 characters.'],
      default: '',
    },

    address: {
      line1: { type: String, trim: true, maxlength: 160, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      postalCode: { type: String, trim: true, maxlength: 20, default: '' },
      country: { type: String, trim: true, maxlength: 80, default: '' },
    },

    role: { type: String, enum: ROLE_VALUES, default: ROLES.USER },

    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUS_VALUES,
      default: ACCOUNT_STATUS.ACTIVE,
    },

    suspension: {
      reason: { type: String, trim: true, maxlength: 500, default: '' },
      until: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },

    notificationPrefs: { type: notificationPrefsSchema, default: () => ({}) },
    privacyPrefs: { type: privacyPrefsSchema, default: () => ({}) },

    /**
     * Incremented whenever every existing session must die: password change,
     * password reset, suspension, "sign out of all devices".
     */
    tokenVersion: { type: Number, default: 0 },

    passwordChangedAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
    lastKnownLocation: {
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
      updatedAt: { type: Date, default: null },
    },

    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/*
 * Indexes. Unique constraints are declared here rather than with `unique: true`
 * on the path so the collation is explicit and the error message is ours.
 */
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', username: 'text', email: 'text' });

userSchema.virtual('isSuspended').get(function isSuspended() {
  if (this.accountStatus !== ACCOUNT_STATUS.SUSPENDED) return false;
  // A suspension with no end date is indefinite.
  if (!this.suspension || !this.suspension.until) return true;
  return this.suspension.until.getTime() > Date.now();
});

userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, env.bcryptRounds);

  // Skip on first save so a brand new account is not treated as "password
  // changed after the token was issued".
  if (!this.isNew) {
    // A second in the past absorbs the clock skew between hashing and signing.
    this.passwordChangedAt = new Date(Date.now() - 1000);
    this.tokenVersion += 1;
  }
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

/** True when the password changed after a JWT with this `iat` was issued. */
userSchema.methods.passwordChangedAfter = function passwordChangedAfter(issuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > issuedAtSeconds;
};

/**
 * Creates a password reset token. The plain token is returned for the email;
 * only its hash is persisted.
 */
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const token = randomToken(32);
  this.passwordResetTokenHash = hashToken(token);
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token;
};

userSchema.methods.clearPasswordReset = function clearPasswordReset() {
  this.passwordResetTokenHash = null;
  this.passwordResetExpires = null;
};

/** The subset of the profile that goes into an SOS email (FR-4). */
userSchema.methods.emergencySnapshot = function emergencySnapshot() {
  return {
    name: this.name,
    phone: this.phone || '',
    bloodGroup: this.bloodGroup || 'unknown',
    medicalInfo: this.medicalInfo || '',
  };
};

export default mongoose.model('User', userSchema);
