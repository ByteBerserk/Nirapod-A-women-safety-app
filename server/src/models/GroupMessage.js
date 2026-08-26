import mongoose from 'mongoose';
import { MESSAGE_TYPES } from '../config/constants.js';

/** FR-15 and FR-16: group chat, including shared-location and SOS notices. */
const groupMessageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SafetyGroup',
      required: true,
      index: true,
    },

    /** Null for system messages ("Aisha joined the group"). */
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },

    body: {
      type: String,
      trim: true,
      maxlength: [2000, 'Messages cannot be longer than 2000 characters.'],
      default: '',
    },

    /** Present on `location` and `sos` messages. */
    location: {
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
      accuracy: { type: Number, default: null },
      label: { type: String, default: '' },
    },

    relatedSos: { type: mongoose.Schema.Types.ObjectId, ref: 'SosEvent', default: null },

    isRemoved: { type: Boolean, default: false },
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Who has seen it. Enough for "seen by 3" without a separate collection. */
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

groupMessageSchema.index({ group: 1, createdAt: -1 });

/**
 * A text message must actually contain text. Without this a client bug can fill
 * the chat with empty bubbles.
 */
groupMessageSchema.pre('validate', function requireBody(next) {
  if (this.type === 'text' && !String(this.body || '').trim()) {
    return next(new Error('A message cannot be empty.'));
  }
  if (this.type === 'location' && !Array.isArray(this.location?.coordinates)) {
    return next(new Error('A location message must include coordinates.'));
  }
  return next();
});

export default mongoose.model('GroupMessage', groupMessageSchema);
