import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../config/constants.js';

/** The in-app bell. Email is the primary channel; this is the durable record. */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, trim: true, maxlength: 500, default: '' },

    /** Where tapping it should take the user, e.g. "/sos/track/abc123". */
    link: { type: String, trim: true, maxlength: 300, default: '' },

    /** Small free-form payload: group id, sos id, coordinates for a map preview. */
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    /** SOS notifications are rendered in red and never auto-collapse. */
    isUrgent: { type: Boolean, default: false },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
// The feed only shows 60 days; keeping more just grows the free-tier database.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

notificationSchema.statics.unreadCount = function unreadCount(userId) {
  return this.countDocuments({ user: userId, isRead: false });
};

export default mongoose.model('Notification', notificationSchema);
