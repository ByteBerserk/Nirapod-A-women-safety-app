import mongoose from 'mongoose';
import { AUDIT_ACTION_VALUES, AUDIT_SEVERITY } from '../config/constants.js';

/**
 * NFR-15. Append-only record of the things that matter: SOS activations,
 * report submissions, moderation and admin actions, and server errors.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTION_VALUES, required: true, index: true },

    /** Who did it. Null for anonymous or system-generated entries. */
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, default: '' }, // snapshot: survives account deletion
    actorRole: { type: String, default: '' },

    /** What it was done to. */
    targetType: { type: String, default: '' },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    severity: { type: String, enum: AUDIT_SEVERITY, default: 'info' },

    message: { type: String, trim: true, maxlength: 500, default: '' },

    /** Extra context. Never put passwords, tokens or full request bodies here. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip: { type: String, default: '' },
    userAgent: { type: String, maxlength: 300, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only: never updated
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// One year of retention. Long enough to investigate, short enough for M0.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export default mongoose.model('AuditLog', auditLogSchema);
