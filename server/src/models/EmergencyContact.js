import mongoose from 'mongoose';
import validator from 'validator';

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

    priority: { type: Number, default: 1, min: 1, max: 10 },

    isActive: { type: Boolean, default: true },

    lastNotifiedAt: { type: Date, default: null },
    lastViewedAt: { type: Date, default: null },
    notifyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

emergencyContactSchema.index({ owner: 1, email: 1 }, { unique: true });
emergencyContactSchema.index({ owner: 1, priority: 1, createdAt: 1 });

emergencyContactSchema.statics.activeForOwner = function activeForOwner(ownerId) {
  return this.find({ owner: ownerId, isActive: true })
    .sort({ priority: 1, createdAt: 1 })
    .lean();
};

export default mongoose.model('EmergencyContact', emergencyContactSchema);
