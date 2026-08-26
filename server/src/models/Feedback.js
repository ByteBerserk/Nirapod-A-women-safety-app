import mongoose from 'mongoose';
import validator from 'validator';
import { FEEDBACK_TYPES, FEEDBACK_STATUS, FEEDBACK_STATUS_VALUES } from '../config/constants.js';

/** FR-23: suggestions, feature requests, bug reports and complaints. */
const feedbackSchema = new mongoose.Schema(
  {
    /** Null when submitted from the signed-out support form. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    /** Where to reply. Filled from the account when signed in. */
    email: {
      type: String,
      required: [true, 'We need an email address to reply to you.'],
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: 'That does not look like a valid email address.',
      },
    },

    type: { type: String, enum: FEEDBACK_TYPES, default: 'suggestion' },

    subject: {
      type: String,
      required: [true, 'Please add a subject.'],
      trim: true,
      minlength: [5, 'Subjects must be at least 5 characters.'],
      maxlength: [140, 'Subjects cannot be longer than 140 characters.'],
    },

    message: {
      type: String,
      required: [true, 'Please describe the issue or idea.'],
      trim: true,
      minlength: [10, 'Please write at least 10 characters.'],
      maxlength: [4000, 'Messages cannot be longer than 4000 characters.'],
    },

    /** Helps reproduce bug reports. Collected from the client, never trusted. */
    appVersion: { type: String, trim: true, maxlength: 40, default: '' },
    userAgent: { type: String, trim: true, maxlength: 300, default: '' },

    status: {
      type: String,
      enum: FEEDBACK_STATUS_VALUES,
      default: FEEDBACK_STATUS.NEW,
      index: true,
    },

    adminResponse: { type: String, trim: true, maxlength: 2000, default: '' },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
