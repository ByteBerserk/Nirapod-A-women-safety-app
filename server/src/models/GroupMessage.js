import mongoose from 'mongoose';
import { MESSAGE_TYPES } from '../config/constants.js';

const groupMessageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SafetyGroup',
      required: true,
      index: true,
    },

    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },

    body: {
      type: String,
      trim: true,
      maxlength: [2000, 'Messages cannot be longer than 2000 characters.'],
      default: '',
    },

    location: {
      coordinates: { type: [Number], default: undefined },
      accuracy: { type: Number, default: null },
      label: { type: String, default: '' },
    },

    relatedSos: { type: mongoose.Schema.Types.ObjectId, ref: 'SosEvent', default: null },

    isRemoved: { type: Boolean, default: false },
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

groupMessageSchema.index({ group: 1, createdAt: -1 });

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
