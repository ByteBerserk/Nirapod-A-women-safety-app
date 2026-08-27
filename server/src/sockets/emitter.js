/**
 * A tiny indirection so services can emit without importing socket.io and
 * without caring whether a socket server exists at all. In the test suite no
 * server is registered and every emit is a silent no-op.
 */

let io = null;

function registerIo(instance) {
  io = instance;
}

/** Room names. Kept in one place so a typo cannot silently drop events. */
const rooms = {
  user: (userId) => `user:${userId}`,
  group: (groupId) => `group:${groupId}`,
  sos: (sosId) => `sos:${sosId}`,
};

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(rooms.user(String(userId))).emit(event, payload);
}

function emitToGroup(groupId, event, payload, { exceptSocketId } = {}) {
  if (!io || !groupId) return;
  const channel = io.to(rooms.group(String(groupId)));
  if (exceptSocketId) channel.except(exceptSocketId).emit(event, payload);
  else channel.emit(event, payload);
}

/** The public tracking page joins this room without authenticating. */
function emitToSos(sosId, event, payload) {
  if (!io || !sosId) return;
  io.to(rooms.sos(String(sosId))).emit(event, payload);
}

export { registerIo, rooms, emitToUser, emitToGroup, emitToSos };