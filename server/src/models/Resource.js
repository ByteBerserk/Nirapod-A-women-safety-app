import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from '../config/constants.js';

/** FR-21: safety tips, self-defence guides, legal rights, helpline numbers. */
const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please give the resource a title.'],
      trim: true,
      minlength: [5, 'Titles must be at least 5 characters.'],
      maxlength: [160, 'Titles cannot be longer than 160 characters.'],
    },

    // The index is declared explicitly below. Adding `index: true` here as well
    // would generate two indexes both named "slug_1" and MongoDB rejects that.
    slug: { type: String, trim: true, lowercase: true },

    category: { type: String, enum: RESOURCE_CATEGORIES, required: true, index: true },

    summary: { type: String, trim: true, maxlength: 300, default: '' },

    /** Markdown-ish plain text. Rendered as escaped text on the client. */
    content: {
      type: String,
      required: [true, 'Please write the content of the resource.'],
      trim: true,
      minlength: [30, 'Resource content must be at least 30 characters.'],
      maxlength: [20000, 'Resource content cannot be longer than 20000 characters.'],
    },

    /** Helpline entries need a dialable number rather than an article body. */
    contactNumbers: [
      {
        label: { type: String, trim: true, maxlength: 80 },
        number: { type: String, trim: true, maxlength: 30 },
        _id: false,
      },
    ],

    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],

    externalUrl: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (v) => !v || /^https?:\/\//i.test(v),
        message: 'External links must start with http:// or https://',
      },
    },

    isPublished: { type: Boolean, default: true, index: true },
    /** Pinned resources appear first regardless of date. */
    isPinned: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    viewCount: { type: Number, default: 0, min: 0 },
    bookmarkCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

resourceSchema.index({ title: 'text', summary: 'text', content: 'text', tags: 'text' });
resourceSchema.index({ isPublished: 1, isPinned: -1, createdAt: -1 });
resourceSchema.index({ slug: 1 }, { unique: true, sparse: true });

/** Slugs are derived, not typed, so two articles cannot fight over one URL. */
resourceSchema.pre('validate', function buildSlug(next) {
  if (this.isModified('title') || !this.slug) {
    const base = String(this.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
    // The suffix keeps two resources with the same title from colliding.
    this.slug = `${base || 'resource'}-${this._id.toString().slice(-6)}`;
  }
  next();
});

export default mongoose.model('Resource', resourceSchema);
