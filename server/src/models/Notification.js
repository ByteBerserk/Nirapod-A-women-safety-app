import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../config/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, trim: true, maxlength: 500, default: '' },

    link: { type: String, trim: true, maxlength: 300, default: '' },

    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    isUrgent: { type: Boolean, default: false },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

notificationSchema.statics.unreadCount = function unreadCount(userId) {
  return this.countDocuments({ user: userId, isRead: false });
};

export default mongoose.model('Notification', notificationSchema);
