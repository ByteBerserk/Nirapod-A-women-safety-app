import api, { GEO_TIMEOUT_MS } from './client';

const unwrap = (response) => response.data?.data ?? null;

const unwrapFull = (response) => response.data ?? {};

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then(unwrapFull),
  login: (payload) => api.post('/auth/login', payload).then(unwrapFull),
  refresh: () => api.post('/auth/refresh').then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrapFull),
  logoutAll: () => api.post('/auth/logout-all').then(unwrapFull),
  me: () => api.get('/auth/me').then(unwrap),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then(unwrapFull),
  resetPassword: (payload) => api.post('/auth/reset-password', payload).then(unwrapFull),
  changePassword: (payload) => api.patch('/auth/change-password', payload).then(unwrapFull),
};

export const userApi = {
  getProfile: () => api.get('/users/profile').then(unwrap),
  updateProfile: (payload) => api.patch('/users/profile', payload).then(unwrapFull),
  updatePreferences: (payload) => api.patch('/users/preferences', payload).then(unwrapFull),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.patch('/users/profile/avatar', form).then(unwrapFull);
  },
  search: (q) => api.get('/users/search', { params: { q } }).then(unwrap),
  deactivate: (password) => api.post('/users/deactivate', { password }).then(unwrapFull),
};

export const contactApi = {
  list: () => api.get('/contacts').then(unwrap),
  create: (payload) => api.post('/contacts', payload).then(unwrapFull),
  update: (id, payload) => api.patch(`/contacts/${id}`, payload).then(unwrapFull),
  remove: (id) => api.delete(`/contacts/${id}`),
};

export const sosApi = {
  activate: (payload) => api.post('/sos', payload).then(unwrapFull),
  updateLocation: (id, payload) => api.patch(`/sos/${id}/location`, payload).then(unwrap),
  resolve: (id, payload) => api.patch(`/sos/${id}/resolve`, payload).then(unwrapFull),
  getActive: () => api.get('/sos/active').then(unwrap),
  history: (params) => api.get('/sos/history', { params }).then(unwrapFull),
  detail: (id) => api.get(`/sos/${id}`).then(unwrap),
  alertStatus: (id) => api.get(`/sos/${id}/alert-status`).then(unwrap),
  resend: (id) => api.post(`/sos/${id}/resend`).then(unwrapFull),
  revokeTracking: (id) => api.patch(`/sos/${id}/revoke-tracking`).then(unwrapFull),

  track: (token) => api.get(`/sos/track/${token}`).then(unwrap),
};

export const incidentApi = {
  list: (params) => api.get('/incidents', { params }).then(unwrapFull),
  mapPins: (params) => api.get('/incidents/map', { params }).then(unwrap),
  detail: (id) => api.get(`/incidents/${id}`).then(unwrap),
  create: (formData) => api.post('/incidents', formData).then(unwrapFull),
  update: (id, payload) => api.patch(`/incidents/${id}`, payload).then(unwrapFull),
  remove: (id) => api.delete(`/incidents/${id}`),
  react: (id, type) => api.post(`/incidents/${id}/react`, { type }).then(unwrap),
  listComments: (id, params) => api.get(`/incidents/${id}/comments`, { params }).then(unwrapFull),
  addComment: (id, payload) => api.post(`/incidents/${id}/comments`, payload).then(unwrap),
  deleteComment: (id, commentId) => api.delete(`/incidents/${id}/comments/${commentId}`),
  setStatus: (id, payload) => api.patch(`/incidents/${id}/status`, payload).then(unwrapFull),
};

export const groupApi = {
  list: () => api.get('/groups').then(unwrap),
  create: (payload) => api.post('/groups', payload).then(unwrapFull),
  detail: (id) => api.get(`/groups/${id}`).then(unwrap),
  update: (id, payload) => api.patch(`/groups/${id}`, payload).then(unwrapFull),
  remove: (id) => api.delete(`/groups/${id}`),
  invite: (id, payload) => api.post(`/groups/${id}/invites`, payload).then(unwrapFull),
  revokeInvite: (id, inviteId) => api.delete(`/groups/${id}/invites/${inviteId}`).then(unwrapFull),
  previewInvite: (id, code) => api.get(`/groups/invite/${id}/${code}`).then(unwrap),
  respondToInvite: (id, code, accept) =>
    api.post(`/groups/invite/${id}/${code}`, { accept }).then(unwrapFull),
  leave: (id) => api.post(`/groups/${id}/leave`).then(unwrapFull),
  removeMember: (id, userId) => api.delete(`/groups/${id}/members/${userId}`).then(unwrapFull),
  setRole: (id, userId, role) =>
    api.patch(`/groups/${id}/members/${userId}/role`, { role }).then(unwrapFull),
  messages: (id, params) => api.get(`/groups/${id}/messages`, { params }).then(unwrapFull),
  sendMessage: (id, body) => api.post(`/groups/${id}/messages`, { body }).then(unwrap),
  shareLocation: (id, payload) => api.post(`/groups/${id}/location`, payload).then(unwrapFull),
  stopSharing: (id) => api.delete(`/groups/${id}/location`).then(unwrapFull),
  locations: (id) => api.get(`/groups/${id}/locations`).then(unwrap),
  mute: (id, muted) => api.patch(`/groups/${id}/mute`, { muted }).then(unwrap),
};

export const checkInApi = {
  active: () => api.get('/check-ins/active').then(unwrap),
  list: (params) => api.get('/check-ins', { params }).then(unwrapFull),
  start: (payload) => api.post('/check-ins', payload).then(unwrapFull),
  safe: (id, payload) => api.patch(`/check-ins/${id}/safe`, payload).then(unwrapFull),
  extend: (id, minutes) => api.patch(`/check-ins/${id}/extend`, { minutes }).then(unwrapFull),
  cancel: (id) => api.patch(`/check-ins/${id}/cancel`).then(unwrapFull),
};

const geo = { timeout: GEO_TIMEOUT_MS };

export const placeApi = {
  nearby: (params) => api.get('/places/nearby', { params, ...geo }).then(unwrap),
  nearbyAll: (params) => api.get('/places/nearby/all', { params, ...geo }).then(unwrapFull),
  search: (q) => api.get('/places/search', { params: { q }, ...geo }).then(unwrap),
  reverse: (lat, lng) => api.get('/places/reverse', { params: { lat, lng }, ...geo }).then(unwrap),
  listSafePlaces: () => api.get('/places/safe-places').then(unwrap),
  createSafePlace: (payload) => api.post('/places/safe-places', payload).then(unwrapFull),
  updateSafePlace: (id, payload) => api.patch(`/places/safe-places/${id}`, payload).then(unwrapFull),
  deleteSafePlace: (id) => api.delete(`/places/safe-places/${id}`),
  checkLocation: (payload) => api.post('/places/safe-places/check', payload).then(unwrap),
  events: (params) => api.get('/places/safe-places/events', { params }).then(unwrapFull),
};

export const resourceApi = {
  list: (params) => api.get('/resources', { params }).then(unwrapFull),
  detail: (idOrSlug) => api.get(`/resources/${idOrSlug}`).then(unwrap),
  create: (payload) => api.post('/resources', payload).then(unwrapFull),
  update: (id, payload) => api.patch(`/resources/${id}`, payload).then(unwrapFull),
  remove: (id) => api.delete(`/resources/${id}`),
  listBookmarks: (params) => api.get('/resources/bookmarks', { params }).then(unwrapFull),
  addBookmark: (payload) => api.post('/resources/bookmarks', payload).then(unwrapFull),
  removeBookmark: (targetType, targetId) =>
    api.delete(`/resources/bookmarks/${targetType}/${targetId}`),
};

export const feedbackApi = {
  submit: (payload) => api.post('/feedback', payload).then(unwrapFull),
  mine: (params) => api.get('/feedback/mine', { params }).then(unwrapFull),
  listAll: (params) => api.get('/feedback', { params }).then(unwrapFull),
  respond: (id, payload) => api.patch(`/feedback/${id}`, payload).then(unwrapFull),
};

export const notificationApi = {
  list: (params) => api.get('/notifications', { params }).then(unwrapFull),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then(unwrap),
  markAllRead: () => api.patch('/notifications/read-all').then(unwrapFull),
  remove: (id) => api.delete(`/notifications/${id}`),
};

export const adminApi = {
  dashboard: (days) => api.get('/admin/dashboard', { params: { days } }).then(unwrap),
  categories: (days) => api.get('/admin/analytics/categories', { params: { days } }).then(unwrap),
  trends: (days) => api.get('/admin/analytics/trends', { params: { days } }).then(unwrap),
  hotspots: (params) => api.get('/admin/analytics/hotspots', { params }).then(unwrap),
  listUsers: (params) => api.get('/admin/users', { params }).then(unwrapFull),
  userDetail: (id) => api.get(`/admin/users/${id}`).then(unwrap),
  setUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then(unwrapFull),
  setUserStatus: (id, payload) => api.patch(`/admin/users/${id}/status`, payload).then(unwrapFull),
  listReports: (params) => api.get('/admin/reports', { params }).then(unwrapFull),
  reportDetail: (id) => api.get(`/admin/reports/${id}`).then(unwrap),
  resolveReport: (id, payload) => api.patch(`/admin/reports/${id}/resolve`, payload).then(unwrapFull),
  reportContent: (payload) => api.post('/admin/reports', payload).then(unwrapFull),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }).then(unwrapFull),
  mailQueue: () => api.get('/admin/mail-queue').then(unwrap),
  retryMail: () => api.post('/admin/mail-queue/retry').then(unwrapFull),
};

export const metaApi = {
  get: () => api.get('/meta').then(unwrap),
  health: () => api.get('/health').then((r) => r.data),
};
