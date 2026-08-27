import mongoose from 'mongoose';
import { SOS_STATUS, SOS_STATUS_VALUES, SOS_TRIGGERS, LIMITS } from '../config/constants.js';
import { hashToken, randomToken } from '../utils/tokens.js';

const trailPointSchema = new mongoose.Schema(
  {
    coordinates: {
      type: [Number],
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
    accuracy: { type: Number, min: 0, default: null },
    speed: { type: Number, min: 0, default: null },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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

    currentLocation: {
      coordinates: { type: [Number], default: undefined },
      accuracy: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    trail: { type: [trailPointSchema], default: [] },

    notifiedContacts: { type: [notifiedContactSchema], default: [] },

    notifiedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SafetyGroup' }],

    trackingTokenHash: { type: String, default: null, index: true },
    trackingExpiresAt: { type: Date, default: null },
    trackingViews: { type: Number, default: 0 },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },

    durationMs: { type: Number, default: null },
  },
  { timestamps: true }
);

sosEventSchema.index({ 'startLocation.coordinates': '2dsphere' });
sosEventSchema.index({ user: 1, createdAt: -1 });
sosEventSchema.index({ status: 1, createdAt: -1 });

sosEventSchema.index({ status: 1, updatedAt: 1 });

sosEventSchema.virtual('isActive').get(function isActive() {
  return this.status === SOS_STATUS.ACTIVE;
});

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

sosEventSchema.methods.appendTrailPoint = function appendTrailPoint(point) {
  const entry = {
    coordinates: [point.lng, point.lat],
    accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null,
    speed: Number.isFinite(point.speed) ? point.speed : null,
    recordedAt: point.recordedAt ? new Date(point.recordedAt) : new Date(),
  };

  this.trail.push(entry);

  if (this.trail.length > LIMITS.MAX_SOS_TRAIL_POINTS) {

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
