let io = null;

function registerIo(instance) {
  io = instance;
}

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

function emitToSos(sosId, event, payload) {
  if (!io || !sosId) return;
  io.to(rooms.sos(String(sosId))).emit(event, payload);
}

export { registerIo, rooms, emitToUser, emitToGroup, emitToSos };
