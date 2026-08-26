import Notification from '../models/Notification.js';
import * as logger from '../config/logger.js';
import * as commonView from '../views/commonView.js';
import { emitToUser } from '../sockets/emitter.js';

/**
 * In-app notifications. Creates the durable record and pushes it over the
 * socket in one step, so a user with the app open sees it immediately and a
 * user who was offline finds it waiting.
 */

/**
 * @param {object} options
 * @param {string} options.user   Recipient id.
 * @param {string} options.type   One of NOTIFICATION_TYPES.
 * @param {string} options.title
 * @param {string} [options.body]
 * @param {string} [options.link]
 * @param {object} [options.data]
 * @param {boolean} [options.isUrgent]
 */
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

/**
 * Same payload to many recipients. `insertMany` with `ordered: false` means one
 * bad row (say a deleted user) does not stop the rest being written - which
 * matters when the payload is a group SOS.
 */
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