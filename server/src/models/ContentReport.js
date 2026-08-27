import mongoose from 'mongoose';
import { CONTENT_REPORT_REASONS, CONTENT_REPORT_STATUS, REPORTABLE_TYPES, MODERATION_ACTIONS } from '../config/constants.js';

/**
 * FR-12 and FR-13. A flag raised by a member, and the moderator's disposition
 * of it. The pair lives in one document so the audit trail is a single read.
 */
const contentReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    targetType: { type: String, enum: REPORTABLE_TYPES, required: true },

    /**
     * Polymorphic. `refPath` lets populate() resolve against the right
     * collection based on `targetModel`.
     */
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, enum: ['Incident', 'Comment'], required: true },

    /** Snapshot of the author, kept so the queue still reads correctly after a delete. */
    targetAuthor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetExcerpt: { type: String, maxlength: 300, default: '' },

    reason: { type: String, enum: CONTENT_REPORT_REASONS, required: true },

    details: { type: String, trim: true, maxlength: 1000, default: '' },

    status: {
      type: String,
      enum: Object.values(CONTENT_REPORT_STATUS),
      default: CONTENT_REPORT_STATUS.OPEN,
      index: true,
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    actionTaken: { type: String, enum: MODERATION_ACTIONS, default: 'none' },
    moderatorNote: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

// A person can flag a given item once. Re-flagging updates rather than piles up.
contentReportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
contentReportSchema.index({ status: 1, createdAt: -1 });
contentReportSchema.index({ targetType: 1, targetId: 1 });

export default mongoose.model('ContentReport', contentReportSchema);
