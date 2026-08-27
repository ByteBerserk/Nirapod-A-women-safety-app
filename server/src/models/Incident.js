import mongoose from 'mongoose';
import { INCIDENT_CATEGORY_VALUES, INCIDENT_SEVERITY, INCIDENT_STATUS, INCIDENT_STATUS_VALUES, REACTION_TYPES, LIMITS } from '../config/constants.js';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video', 'audio'], required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: REACTION_TYPES, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: {
      type: String,
      required: [true, 'Please give the report a short title.'],
      trim: true,
      minlength: [5, 'Titles must be at least 5 characters.'],
      maxlength: [140, 'Titles cannot be longer than 140 characters.'],
    },

    description: {
      type: String,
      required: [true, 'Please describe what happened.'],
      trim: true,
      minlength: [20, 'Please write at least 20 characters so others understand the situation.'],
      maxlength: [5000, 'Descriptions cannot be longer than 5000 characters.'],
    },

    category: {
      type: String,
      enum: {
        values: INCIDENT_CATEGORY_VALUES,
        message: 'Please choose one of the available incident categories.',
      },
      required: [true, 'Please choose a category.'],
      index: true,
    },

    severity: { type: String, enum: INCIDENT_SEVERITY, default: 'medium' },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        required: [true, 'Please pin the location on the map.'],
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
    area: { type: String, trim: true, maxlength: 120, default: '', index: true },
    city: { type: String, trim: true, maxlength: 120, default: '' },

    occurredAt: {
      type: Date,
      required: true,
      validate: {
        validator(value) {

          return value.getTime() <= Date.now() + 30 * 60 * 1000;
        },
        message: 'An incident cannot have happened in the future.',
      },
    },

    media: {
      type: [mediaSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_INCIDENT_MEDIA,
        message: `You can attach at most ${LIMITS.MAX_INCIDENT_MEDIA} files.`,
      },
    },

    isAnonymous: { type: Boolean, default: false },

    status: {
      type: String,
      enum: INCIDENT_STATUS_VALUES,
      default: INCIDENT_STATUS.PENDING,
      index: true,
    },

    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    moderationNote: { type: String, trim: true, maxlength: 500, default: '' },

    reactions: { type: [reactionSchema], default: [] },

    reactionCounts: {
      helpful: { type: Number, default: 0, min: 0 },
      important: { type: Number, default: 0, min: 0 },
      support: { type: Number, default: 0, min: 0 },
    },

    commentCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },

    reportCount: { type: Number, default: 0, min: 0 },

    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

incidentSchema.index({ location: '2dsphere' });
incidentSchema.index({ status: 1, occurredAt: -1 });
incidentSchema.index({ category: 1, occurredAt: -1 });
incidentSchema.index({ reporter: 1, createdAt: -1 });
incidentSchema.index({ createdAt: -1 });

incidentSchema.index(
  { title: 'text', description: 'text', address: 'text', area: 'text', city: 'text' },
  { weights: { title: 10, area: 6, address: 4, city: 3, description: 1 }, name: 'incident_search' }
);

incidentSchema.virtual('totalReactions').get(function totalReactions() {
  const c = this.reactionCounts || {};
  return (c.helpful || 0) + (c.important || 0) + (c.support || 0);
});

incidentSchema.methods.recalculateReactionCounts = function recalculateReactionCounts() {
  const counts = { helpful: 0, important: 0, support: 0 };
  for (const reaction of this.reactions) {
    if (counts[reaction.type] !== undefined) counts[reaction.type] += 1;
  }
  this.reactionCounts = counts;
  return counts;
};

incidentSchema.statics.publicFilter = function publicFilter() {
  return { status: { $in: [INCIDENT_STATUS.PENDING, INCIDENT_STATUS.VERIFIED] } };
};

export default mongoose.model('Incident', incidentSchema);
