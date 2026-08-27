import mongoose from 'mongoose';
import { CONTENT_REPORT_REASONS, CONTENT_REPORT_STATUS, REPORTABLE_TYPES, MODERATION_ACTIONS } from '../config/constants.js';

const contentReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    targetType: { type: String, enum: REPORTABLE_TYPES, required: true },

    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, enum: ['Incident', 'Comment'], required: true },

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

contentReportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
contentReportSchema.index({ status: 1, createdAt: -1 });
contentReportSchema.index({ targetType: 1, targetId: 1 });

export default mongoose.model('ContentReport', contentReportSchema);
