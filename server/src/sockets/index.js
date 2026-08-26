import { Server } from 'socket.io';
import env from '../config/env.js';
import * as logger from '../config/logger.js';
import User from '../models/User.js';
import SafetyGroup from '../models/SafetyGroup.js';
import SosEvent from '../models/SosEvent.js';
import { verifyAccessToken, hashToken } from '../utils/tokens.js';
import { ACCOUNT_STATUS, SOS_STATUS } from '../config/constants.js';
import { registerIo, rooms } from './emitter.js';

/**
 * Realtime gateway. Two kinds of client connect here:
 *
 *   1. A signed-in user, who joins their own room plus a room per safety group.
 *   2. An emergency contact on the public tracking page, who has no account and
 *      joins exactly one SOS room using the token from their email.
 *
 * The second case is why authentication is optional at the handshake but
 * enforced per event.
 */

async function authenticate(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

  // No token is allowed - such a socket can only join a tracking room.
  if (!token) {
    socket.data.user = null;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('name username avatar role accountStatus tokenVersion');

    if (!user) return next(new Error('Account not found'));
    if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) return next(new Error('Account suspended'));
    // A stale token from before a password change must not open a socket.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return next(new Error('Session expired'));

    socket.data.user = {
      id: String(user._id),
      name: user.name,
      username: user.username,
      role: user.role,
    };
    return next();
  } catch {
    // An expired token should not stop the page loading; it just means the
    // socket is unauthenticated and can only be used for public tracking.
    socket.data.user = null;
    return next();
  }
}

function initSockets(httpServer) {
  /*
   * Leaving `io` unregistered makes every emitter a no-op, which is what a test
   * run wants: the suites assert on what was written, not on what was pushed.
   */
  if (!env.realtimeEnabled) return null;

  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Long enough to survive a lift or a tunnel, short enough to notice a
    // phone that has genuinely gone away during an SOS.
    pingTimeout: 25000,
    pingInterval: 20000,
    maxHttpBufferSize: 1e6,
  });

  io.use(authenticate);

  io.on('connection', async (socket) => {
    const user = socket.data.user;

    if (user) {
      socket.join(rooms.user(user.id));

      // Join a room per group so group chat and group SOS need no lookup later.
      try {
        const groups = await SafetyGroup.find({ 'members.user': user.id, isArchived: false })
          .select('_id')
          .lean();
        for (const group of groups) socket.join(rooms.group(String(group._id)));
      } catch (error) {
        logger.error('Failed to join group rooms', { userId: user.id, message: error.message });
      }

      logger.debug(`Socket connected: ${user.username}`);
    }

    /**
     * The tracking page calls this with the token from the email. We resolve
     * the token to an SOS here rather than trusting a client-supplied id.
     */
    socket.on('sos:watch', async (payload, ack) => {
      const token = typeof payload === 'string' ? payload : payload?.token;
      const respond = typeof ack === 'function' ? ack : () => {};

      if (!token) return respond({ ok: false, error: 'A tracking token is required.' });

      try {
        const sos = await SosEvent.findOne({
          trackingTokenHash: hashToken(token),
          trackingExpiresAt: { $gt: new Date() },
        })
          .select('_id status')
          .lean();

        if (!sos) return respond({ ok: false, error: 'This tracking link is no longer valid.' });

        socket.join(rooms.sos(String(sos._id)));
        return respond({ ok: true, sosId: String(sos._id), status: sos.status });
      } catch (error) {
        logger.error('sos:watch failed', { message: error.message });
        return respond({ ok: false, error: 'Could not start tracking.' });
      }
    });

    socket.on('sos:unwatch', (payload) => {
      const sosId = typeof payload === 'string' ? payload : payload?.sosId;
      if (sosId) socket.leave(rooms.sos(String(sosId)));
    });

    /** Typing indicator. Membership is checked before the event is relayed. */
    socket.on('group:typing', async ({ groupId, isTyping } = {}) => {
      if (!user || !groupId) return;
      if (!socket.rooms.has(rooms.group(String(groupId)))) return;

      socket.to(rooms.group(String(groupId))).emit('group:typing', {
        groupId: String(groupId),
        user: { id: user.id, name: user.name },
        isTyping: Boolean(isTyping),
      });
    });

    /** Called after accepting an invite so the new member gets messages at once. */
    socket.on('group:join', async ({ groupId } = {}) => {
      if (!user || !groupId) return;
      try {
        const isMember = await SafetyGroup.exists({ _id: groupId, 'members.user': user.id });
        if (isMember) socket.join(rooms.group(String(groupId)));
      } catch {
        /* a bad id is not worth logging */
      }
    });

    socket.on('group:leave', ({ groupId } = {}) => {
      if (groupId) socket.leave(rooms.group(String(groupId)));
    });

    socket.on('disconnect', (reason) => {
      if (user) logger.debug(`Socket disconnected: ${user.username} (${reason})`);
    });
  });

  registerIo(io);
  logger.info('Realtime gateway ready');
  return io;
}

export { initSockets, SOS_STATUS };