import mongoose from 'mongoose';
import { BOOKMARK_TARGETS } from '../config/constants.js';

/** FR-22: saved articles and saved reports, in one polymorphic collection. */
const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    targetType: { type: String, enum: BOOKMARK_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, enum: ['Resource', 'Incident'], required: true },

    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true }
);

// Saving the same thing twice is a no-op, not a duplicate row.
bookmarkSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Bookmark', bookmarkSchema);
