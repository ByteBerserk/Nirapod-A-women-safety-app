import Notification from '../models/Notification.js';
import * as logger from '../config/logger.js';
import * as commonView from '../views/commonView.js';
import { emitToUser } from '../sockets/emitter.js';

async function notify({ user, type, title, body = '', link = '', data = {}, isUrgent = false }) {
  try {
    const doc = await Notification.create({ user, type, title, body, link, data, isUrgent });
    emitToUser(user, 'notification:new', commonView.notification(doc));
    return doc;
  } catch (error) {
    logger.error('Failed to create notification', { type, message: error.message });
    return null;
  }
}

async function notifyMany(userIds, payload) {
  const ids = [...new Set(userIds.map(String))].filter(Boolean);
  if (!ids.length) return [];

  try {
    const docs = await Notification.insertMany(
      ids.map((user) => ({ user, ...payload })),
      { ordered: false }
    );

    for (const doc of docs) {
      emitToUser(doc.user, 'notification:new', commonView.notification(doc));
    }
    return docs;
  } catch (error) {
    logger.error('Failed to create bulk notifications', {
      type: payload?.type,
      message: error.message,
    });
    return [];
  }
}

export { notify, notifyMany };
