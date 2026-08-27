import mongoose from 'mongoose';
import { SAFE_PLACE_TYPES, LIMITS } from '../config/constants.js';

const safePlaceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    label: {
      type: String,
      required: [true, 'Please name this place.'],
      trim: true,
      minlength: [2, 'Place names must be at least 2 characters.'],
      maxlength: [60, 'Place names cannot be longer than 60 characters.'],
    },

    type: { type: String, enum: SAFE_PLACE_TYPES, default: 'other' },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        required: [true, 'Please choose the location of this place.'],
        validate: {
          validator: (v) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90,
          message: 'The location must be a valid longitude/latitude pair.',
        },
      },
    },

    address: { type: String, trim: true, maxlength: 300, default: '' },

    radiusMeters: {
      type: Number,
      default: 150,
      min: [LIMITS.SAFE_PLACE_MIN_RADIUS_M, 'The radius must be at least 50 metres.'],
      max: [LIMITS.SAFE_PLACE_MAX_RADIUS_M, 'The radius cannot be more than 5 kilometres.'],
    },

    notifyOnEnter: { type: Boolean, default: true },
    notifyOnLeave: { type: Boolean, default: true },
    notifyContacts: { type: Boolean, default: false },

    isInside: { type: Boolean, default: false },
    lastTransitionAt: { type: Date, default: null },
    lastEvaluatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

safePlaceSchema.index({ location: '2dsphere' });
safePlaceSchema.index({ owner: 1, createdAt: -1 });
safePlaceSchema.index({ owner: 1, label: 1 }, { unique: true });

export default mongoose.model('SafePlace', safePlaceSchema);
