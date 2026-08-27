import mongoose from 'mongoose';
import { AUDIT_ACTION_VALUES, AUDIT_SEVERITY } from '../config/constants.js';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTION_VALUES, required: true, index: true },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: '' },

    targetType: { type: String, default: '' },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    severity: { type: String, enum: AUDIT_SEVERITY, default: 'info' },

    message: { type: String, trim: true, maxlength: 500, default: '' },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip: { type: String, default: '' },
    userAgent: { type: String, maxlength: 300, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export default mongoose.model('AuditLog', auditLogSchema);
