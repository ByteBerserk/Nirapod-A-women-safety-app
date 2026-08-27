import mongoose from 'mongoose';
import { SOS_STATUS, SOS_STATUS_VALUES, SOS_TRIGGERS, LIMITS } from '../config/constants.js';
import { hashToken, randomToken } from '../utils/tokens.js';

/** One point on the live trail (FR-3). */
const trailPointSchema = new mongoose.Schema(
  {
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v[0] >= -180 &&
          v[0] <= 180 &&
          v[1] >= -90 &&
          v[1] <= 90,
        message: 'Trail points must be [longitude, latitude] within valid ranges.',
      },
    },
    accuracy: { type: Number, min: 0, default: null }, // metres, from the browser
    speed: { type: Number, min: 0, default: null }, // m/s
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Per-recipient delivery record, which is what makes NFR-12 auditable. */
const notifiedContactSchema = new mongoose.Schema(
  {
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyContact', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    channel: { type: String, enum: ['email', 'in-app'], default: 'email' },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
    },
    mailJob: { type: mongoose.Schema.Types.ObjectId, ref: 'MailJob', default: null },
    error: { type: String, default: '' },
    sentAt: { type: Date, default: null },
  },
  { _id: false }
);

const sosEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: SOS_STATUS_VALUES, default: SOS_STATUS.ACTIVE, index: true },

    trigger: { type: String, enum: SOS_TRIGGERS, default: 'manual' },

    message: { type: String, trim: true, maxlength: 500, default: '' },

    /**
     * Where the SOS started. Indexed so admins can map hotspots (FR-24).
     *
     * Optional on purpose. A phone that has location switched off, is indoors
     * with no fix, or has just had the permission denied must still be able to
     * raise the alarm - an alert saying "she needs help, we do not know where"
     * is worth far more than no alert at all, and the alert email already has
     * a branch that tells the contact to ring her instead. The 2dsphere index
     * simply skips a document with no coordinates.
     */
    startLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: {
          validator: (v) => v === undefined || (Array.isArray(v) && v.length === 2),
          message: 'A location must be a [longitude, latitude] pair.',
        },
      },
      accuracy: { type: Number, default: null },
      address: { type: String, default: '' },
    },

    /** The most recent point, denormalised so the tracking page is a single read. */
    currentLocation: {
      coordinates: { type: [Number], default: undefined },
      accuracy: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    trail: { type: [trailPointSchema], default: [] },

    notifiedContacts: { type: [notifiedContactSchema], default: [] },

    /** Groups that were fanned out to (FR-17). */
    notifiedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SafetyGroup' }],

    /**
     * Public tracking link. Only the hash is stored; the plain token lives in
     * the email that was sent. Expires so a forwarded email cannot follow
     * someone forever (NFR-5).
     */
    trackingTokenHash: { type: String, default: null, index: true },
    trackingExpiresAt: { type: Date, default: null },
    trackingViews: { type: Number, default: 0 },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },

    /** Milliseconds between activation and resolution (FR-10). */
    durationMs: { type: Number, default: null },
  },
  { timestamps: true }
);

sosEventSchema.index({ 'startLocation.coordinates': '2dsphere' });
sosEventSchema.index({ user: 1, createdAt: -1 });
sosEventSchema.index({ status: 1, createdAt: -1 });
// Supports the "expire stale SOS events" job without a collection scan.
sosEventSchema.index({ status: 1, updatedAt: 1 });

sosEventSchema.virtual('isActive').get(function isActive() {
  return this.status === SOS_STATUS.ACTIVE;
});

/**
 * Issues a fresh tracking token, returning the plain value for the email.
 * Calling it again rotates the token, which is how a user revokes access.
 */
sosEventSchema.methods.issueTrackingToken = function issueTrackingToken() {
  const token = randomToken(24);
  this.trackingTokenHash = hashToken(token);
  this.trackingExpiresAt = new Date(
    Date.now() + LIMITS.TRACKING_TOKEN_TTL_HOURS * 60 * 60 * 1000
  );
  return token;
};

sosEventSchema.methods.revokeTrackingToken = function revokeTrackingToken() {
  this.trackingTokenHash = null;
  this.trackingExpiresAt = null;
};

/**
 * Appends a point to the trail and updates the denormalised current location.
 * The trail is capped so a phone left transmitting for hours cannot grow the
 * document past MongoDB's 16 MB limit (NFR-10).
 */
sosEventSchema.methods.appendTrailPoint = function appendTrailPoint(point) {
  const entry = {
    coordinates: [point.lng, point.lat],
    accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null,
    speed: Number.isFinite(point.speed) ? point.speed : null,
    recordedAt: point.recordedAt ? new Date(point.recordedAt) : new Date(),
  };

  this.trail.push(entry);

  if (this.trail.length > LIMITS.MAX_SOS_TRAIL_POINTS) {
    // Keep the very first point (where it began) and drop the oldest middle
    // ones, so the shape of the journey survives trimming.
    const first = this.trail[0];
    this.trail = [first, ...this.trail.slice(-(LIMITS.MAX_SOS_TRAIL_POINTS - 1))];
  }

  this.currentLocation = {
    coordinates: entry.coordinates,
    accuracy: entry.accuracy,
    updatedAt: entry.recordedAt,
  };

  return entry;
};

sosEventSchema.statics.findActiveForUser = function findActiveForUser(userId) {
  return this.findOne({ user: userId, status: SOS_STATUS.ACTIVE }).sort({ createdAt: -1 });
};

export default mongoose.model('SosEvent', sosEventSchema);
