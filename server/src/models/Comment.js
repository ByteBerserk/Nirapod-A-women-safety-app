import mongoose from 'mongoose';

/** FR-9: community advice and extra detail attached to a report. */
const commentSchema = new mongoose.Schema(
  {
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
      index: true,
    },

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    body: {
      type: String,
      required: [true, 'Please write your comment.'],
      trim: true,
      minlength: [2, 'Comments must be at least 2 characters.'],
      maxlength: [1000, 'Comments cannot be longer than 1000 characters.'],
    },

    isAnonymous: { type: Boolean, default: false },

    /**
     * Soft delete. A hard delete would leave the incident's commentCount and
     * any moderation report pointing at nothing.
     */
    isRemoved: { type: Boolean, default: false },
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    removalReason: { type: String, trim: true, maxlength: 300, default: '' },

    editedAt: { type: Date, default: null },
    reportCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

commentSchema.index({ incident: 1, createdAt: 1 });
commentSchema.index({ incident: 1, isRemoved: 1, createdAt: -1 });

export default mongoose.model('Comment', commentSchema);
