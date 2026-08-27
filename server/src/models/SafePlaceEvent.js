import mongoose from 'mongoose';
import { SAFE_PLACE_EVENTS } from '../config/constants.js';

const safePlaceEventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    place: { type: mongoose.Schema.Types.ObjectId, ref: 'SafePlace', required: true, index: true },
    placeLabel: { type: String, default: '' },
    event: { type: String, enum: SAFE_PLACE_EVENTS, required: true },
    coordinates: { type: [Number], default: undefined },
    distanceMeters: { type: Number, default: null },
    contactsNotified: { type: Number, default: 0 },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

safePlaceEventSchema.index({ owner: 1, occurredAt: -1 });

safePlaceEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model('SafePlaceEvent', safePlaceEventSchema);
