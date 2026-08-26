import mongoose from 'mongoose';
import { CHECKIN_STATUS, CHECKIN_STATUS_VALUES, LIMITS } from '../config/constants.js';

/**
 * FR-26: a countdown you set before doing something you are not sure about.
 *
 * "I am walking home, ask me in twenty minutes whether I made it." When the
 * timer runs out the app asks. If nobody answers within the grace period the
 * predefined emergency procedure runs - which here means the same SOS fan-out
 * as the button, so the contacts, the emails, the live tracking link and the
 * group alerts are all identical. That reuse is the point: a check-in that
 * escalated must not be a second-class alert.
 *
 * The two timestamps are what the scheduler reads:
 *   dueAt        ask them
 *   escalateAt   stop waiting
 */
const safetyCheckInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** What they are doing. Goes into the alert so a contact has context. */
    label: {
      type: String,
      required: [true, 'Please say what this check-in is for.'],
      trim: true,
      minlength: [2, 'Give the check-in a name of at least 2 characters.'],
      maxlength: [120, 'Keep the name under 120 characters.'],
    },

    /** Anything the contacts should know if this escalates. */
    note: { type: String, trim: true, maxlength: 500, default: '' },

    status: {
      type: String,
      enum: CHECKIN_STATUS_VALUES,
      default: CHECKIN_STATUS.ACTIVE,
      index: true,
    },

    /** When the app should ask "are you safe?". */
    dueAt: { type: Date, required: true, index: true },

    /** How long they have to answer once asked. */
    graceMinutes: {
      type: Number,
      default: LIMITS.CHECKIN_DEFAULT_GRACE_MINUTES,
      min: [LIMITS.CHECKIN_MIN_GRACE_MINUTES, 'The grace period must be at least a minute.'],
      max: [LIMITS.CHECKIN_MAX_GRACE_MINUTES, 'The grace period cannot be more than an hour.'],
    },

    /** dueAt + graceMinutes. Stored rather than computed so it can be indexed. */
    escalateAt: { type: Date, required: true, index: true },

    /**
     * Where they were when they set it. Not required - someone can start a
     * check-in indoors with no fix, and the alert still has to be able to go
     * out (see the same decision on SosEvent.startLocation).
     */
    startLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
        validate: {
          validator: (v) => v === undefined || (Array.isArray(v) && v.length === 2),
          message: 'A location must be a [longitude, latitude] pair.',
        },
      },
      address: { type: String, default: '' },
    },

    /** When the "are you safe?" prompt went out, so it is only sent once. */
    promptedAt: { type: Date, default: null },

    /** How many times they pushed the timer back. Kept for the audit trail. */
    extensionCount: { type: Number, default: 0, min: 0 },

    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },

    /** The alert this turned into, when nobody answered. */
    escalatedSos: { type: mongoose.Schema.Types.ObjectId, ref: 'SosEvent', default: null },
  },
  { timestamps: true }
);

/* The scheduler's two queries: what is due to be asked, what is out of time. */
safetyCheckInSchema.index({ status: 1, dueAt: 1 });
safetyCheckInSchema.index({ status: 1, escalateAt: 1 });
safetyCheckInSchema.index({ user: 1, createdAt: -1 });

/** True while the check-in is still counting down or waiting for an answer. */
safetyCheckInSchema.virtual('isOpen').get(function isOpen() {
  return [CHECKIN_STATUS.ACTIVE, CHECKIN_STATUS.AWAITING].includes(this.status);
});

/**
 * One open check-in per person, mirroring the one-live-SOS rule. Two overlapping
 * timers would mean two escalations and two sets of alarmed contacts.
 */
safetyCheckInSchema.statics.findOpenForUser = function findOpenForUser(userId) {
  return this.findOne({
    user: userId,
    status: { $in: [CHECKIN_STATUS.ACTIVE, CHECKIN_STATUS.AWAITING] },
  });
};

/** Moves dueAt (and escalateAt with it) forward by `minutes`. */
safetyCheckInSchema.methods.extendBy = function extendBy(minutes) {
  const from = Math.max(Date.now(), new Date(this.dueAt).getTime());
  this.dueAt = new Date(from + minutes * 60 * 1000);
  this.escalateAt = new Date(this.dueAt.getTime() + this.graceMinutes * 60 * 1000);

  // Extending after the prompt puts it back into the countdown, and clears the
  // prompt so a later expiry asks again rather than escalating in silence.
  this.status = CHECKIN_STATUS.ACTIVE;
  this.promptedAt = null;
  this.extensionCount += 1;

  return this;
};

export default mongoose.model('SafetyCheckIn', safetyCheckInSchema);
