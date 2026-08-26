import mongoose from 'mongoose';
import validator from 'validator';

/**
 * FR-5. A trusted person who receives SOS mail and can follow the live
 * tracking link. Kept in its own collection rather than embedded in the user so
 * that delivery statistics per contact stay cheap to update during an SOS.
 */
const emergencyContactSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Please give this contact a name.'],
      trim: true,
      minlength: [2, 'Contact names must be at least 2 characters.'],
      maxlength: [80, 'Contact names cannot be longer than 80 characters.'],
    },

    email: {
      type: String,
      required: [true, 'An email address is required - alerts are sent by email.'],
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: 'That does not look like a valid email address.',
      },
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

    relationship: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },

    /**
     * Contacts are notified in ascending priority order. Not a hard guarantee
     * of delivery order - it decides who is listed first in digests and who is
     * retried first when the queue is backed up.
     */
    priority: { type: Number, default: 1, min: 1, max: 10 },

    isActive: { type: Boolean, default: true },

    /** Set when this contact opens a tracking link. Useful reassurance for the user. */
    lastNotifiedAt: { type: Date, default: null },
    lastViewedAt: { type: Date, default: null },
    notifyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One person cannot be added twice under the same account (NFR-10).
emergencyContactSchema.index({ owner: 1, email: 1 }, { unique: true });
emergencyContactSchema.index({ owner: 1, priority: 1, createdAt: 1 });

/** Active contacts for a user, in the order they should be alerted. */
emergencyContactSchema.statics.activeForOwner = function activeForOwner(ownerId) {
  return this.find({ owner: ownerId, isActive: true })
    .sort({ priority: 1, createdAt: 1 })
    .lean();
};

export default mongoose.model('EmergencyContact', emergencyContactSchema);
