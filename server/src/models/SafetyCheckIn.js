import mongoose from 'mongoose';
import { CHECKIN_STATUS, CHECKIN_STATUS_VALUES, LIMITS } from '../config/constants.js';

const safetyCheckInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    label: {
      type: String,
      required: [true, 'Please say what this check-in is for.'],
      trim: true,
      minlength: [2, 'Give the check-in a name of at least 2 characters.'],
      maxlength: [120, 'Keep the name under 120 characters.'],
    },

    note: { type: String, trim: true, maxlength: 500, default: '' },

    status: {
      type: String,
      enum: CHECKIN_STATUS_VALUES,
      default: CHECKIN_STATUS.ACTIVE,
      index: true,
    },

    dueAt: { type: Date, required: true, index: true },

    graceMinutes: {
      type: Number,
      default: LIMITS.CHECKIN_DEFAULT_GRACE_MINUTES,
      min: [LIMITS.CHECKIN_MIN_GRACE_MINUTES, 'The grace period must be at least a minute.'],
      max: [LIMITS.CHECKIN_MAX_GRACE_MINUTES, 'The grace period cannot be more than an hour.'],
    },

    escalateAt: { type: Date, required: true, index: true },

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
      address: { type: String, default: '' },
    },

    promptedAt: { type: Date, default: null },

    extensionCount: { type: Number, default: 0, min: 0 },

    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },

    escalatedSos: { type: mongoose.Schema.Types.ObjectId, ref: 'SosEvent', default: null },
  },
  { timestamps: true }
);

safetyCheckInSchema.index({ status: 1, dueAt: 1 });
safetyCheckInSchema.index({ status: 1, escalateAt: 1 });
safetyCheckInSchema.index({ user: 1, createdAt: -1 });

safetyCheckInSchema.virtual('isOpen').get(function isOpen() {
  return [CHECKIN_STATUS.ACTIVE, CHECKIN_STATUS.AWAITING].includes(this.status);
});

safetyCheckInSchema.statics.findOpenForUser = function findOpenForUser(userId) {
  return this.findOne({
    user: userId,
    status: { $in: [CHECKIN_STATUS.ACTIVE, CHECKIN_STATUS.AWAITING] },
  });
};

safetyCheckInSchema.methods.extendBy = function extendBy(minutes) {
  const from = Math.max(Date.now(), new Date(this.dueAt).getTime());
  this.dueAt = new Date(from + minutes * 60 * 1000);
  this.escalateAt = new Date(this.dueAt.getTime() + this.graceMinutes * 60 * 1000);

  this.status = CHECKIN_STATUS.ACTIVE;
  this.promptedAt = null;
  this.extensionCount += 1;

  return this;
};

export default mongoose.model('SafetyCheckIn', safetyCheckInSchema);
