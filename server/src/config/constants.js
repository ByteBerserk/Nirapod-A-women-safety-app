const ROLES = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
};

const ROLE_VALUES = Object.values(ROLES);

const ROLE_RANK = {
  [ROLES.USER]: 1,
  [ROLES.MODERATOR]: 2,
  [ROLES.ADMIN]: 3,
};

const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
};

const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUS);

const GENDERS = ['female', 'male', 'non-binary', 'prefer-not-to-say'];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

const INCIDENT_CATEGORIES = {
  HARASSMENT: 'harassment',
  STALKING: 'stalking',
  THEFT: 'theft',
  ROBBERY: 'robbery',
  ASSAULT: 'assault',
  DOMESTIC_VIOLENCE: 'domestic-violence',
  SUSPICIOUS_PERSON: 'suspicious-person',
  UNSAFE_AREA: 'unsafe-area',
  OTHER: 'other',
};

const INCIDENT_CATEGORY_VALUES = Object.values(INCIDENT_CATEGORIES);

const INCIDENT_CATEGORY_LABELS = {
  harassment: 'Harassment',
  stalking: 'Stalking',
  theft: 'Theft',
  robbery: 'Robbery',
  assault: 'Assault',
  'domestic-violence': 'Domestic violence',
  'suspicious-person': 'Suspicious person',
  'unsafe-area': 'Unsafe area',
  other: 'Other',
};

const INCIDENT_SEVERITY = ['low', 'medium', 'high', 'critical'];

const INCIDENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  REMOVED: 'removed',
};

const INCIDENT_STATUS_VALUES = Object.values(INCIDENT_STATUS);

const REACTION_TYPES = ['helpful', 'important', 'support'];

const CONTENT_REPORT_REASONS = [
  'fake',
  'offensive',
  'spam',
  'abusive',
  'harmful',
  'duplicate',
  'other',
];

const CONTENT_REPORT_STATUS = {
  OPEN: 'open',
  REVIEWING: 'reviewing',
  ACTIONED: 'actioned',
  DISMISSED: 'dismissed',
};

const REPORTABLE_TYPES = ['incident', 'comment'];

const MODERATION_ACTIONS = [
  'none',
  'content-removed',
  'content-restored',
  'user-warned',
  'user-suspended',
];

const GROUP_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
};

const GROUP_ROLE_VALUES = Object.values(GROUP_ROLES);

const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  REVOKED: 'revoked',
};

const INVITE_STATUS_VALUES = Object.values(INVITE_STATUS);

const MESSAGE_TYPES = ['text', 'location', 'system', 'sos'];

const SOS_STATUS = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

const SOS_STATUS_VALUES = Object.values(SOS_STATUS);

const SOS_TRIGGERS = ['manual', 'shake', 'timer', 'group'];

const CHECKIN_STATUS = {
  ACTIVE: 'active',
  AWAITING: 'awaiting',
  SAFE: 'safe',
  CANCELLED: 'cancelled',
  ESCALATED: 'escalated',
};

const CHECKIN_STATUS_VALUES = Object.values(CHECKIN_STATUS);

const SAFE_PLACE_TYPES = [
  'home',
  'work',
  'university',
  'school',
  'friend',
  'relative',
  'other',
];

const SAFE_PLACE_EVENTS = ['enter', 'leave'];

const RESOURCE_CATEGORIES = [
  'safety-tips',
  'self-defense',
  'legal-rights',
  'emergency-guide',
  'mental-health',
  'helpline',
];

const BOOKMARK_TARGETS = ['resource', 'incident'];

const FEEDBACK_TYPES = ['suggestion', 'feature-request', 'bug', 'complaint', 'other'];

const FEEDBACK_STATUS = {
  NEW: 'new',
  TRIAGED: 'triaged',
  IN_PROGRESS: 'in-progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

const FEEDBACK_STATUS_VALUES = Object.values(FEEDBACK_STATUS);

const NOTIFICATION_TYPES = [
  'sos-alert',
  'sos-resolved',
  'group-invite',
  'group-joined',
  'group-message',
  'group-location',
  'safe-place-enter',
  'safe-place-leave',
  'checkin-due',
  'checkin-escalated',
  'incident-comment',
  'incident-reaction',
  'incident-status',
  'moderation',
  'account',
  'feedback',
  'system',
];

const MAIL_STATUS = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  ABANDONED: 'abandoned',
};

const MAIL_STATUS_VALUES = Object.values(MAIL_STATUS);

const MAIL_KINDS = [
  'sos-alert',
  'checkin-due',
  'sos-resolved',
  'group-sos',
  'group-invite',
  'safe-place',
  'password-reset',
  'welcome',
  'account-status',
  'feedback-ack',
  'test',
];

const AUDIT_ACTIONS = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',
  PROFILE_UPDATE: 'profile.update',
  CONTACT_ADD: 'contact.add',
  CONTACT_REMOVE: 'contact.remove',
  SOS_ACTIVATE: 'sos.activate',
  SOS_LOCATION: 'sos.location',
  SOS_RESOLVE: 'sos.resolve',
  SOS_ALERT_SENT: 'sos.alert_sent',
  CHECKIN_START: 'checkin.start',
  CHECKIN_SAFE: 'checkin.safe',
  CHECKIN_EXTEND: 'checkin.extend',
  CHECKIN_CANCEL: 'checkin.cancel',
  CHECKIN_DUE: 'checkin.due',
  CHECKIN_ESCALATE: 'checkin.escalate',
  INCIDENT_CREATE: 'incident.create',
  INCIDENT_UPDATE: 'incident.update',
  INCIDENT_DELETE: 'incident.delete',
  INCIDENT_STATUS: 'incident.status_change',
  CONTENT_REPORT: 'content.report',
  MODERATION_ACTION: 'moderation.action',
  GROUP_CREATE: 'group.create',
  GROUP_INVITE: 'group.invite',
  GROUP_JOIN: 'group.join',
  GROUP_LEAVE: 'group.leave',
  GROUP_DELETE: 'group.delete',
  SAFE_PLACE_CREATE: 'safe_place.create',
  SAFE_PLACE_DELETE: 'safe_place.delete',
  SAFE_PLACE_TRANSITION: 'safe_place.transition',
  ADMIN_ROLE_CHANGE: 'admin.role_change',
  ADMIN_USER_STATUS: 'admin.user_status',
  ADMIN_RESOURCE: 'admin.resource',
  SYSTEM_ERROR: 'system.error',
};

const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS);

const AUDIT_SEVERITY = ['info', 'notice', 'warning', 'critical'];

const LIMITS = {
  MAX_EMERGENCY_CONTACTS: 10,
  MAX_GROUP_MEMBERS: 50,
  MAX_SAFE_PLACES: 25,
  MAX_INCIDENT_MEDIA: 5,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_SOS_TRAIL_POINTS: 2000,
  SOS_AUTO_EXPIRE_HOURS: 12,
  TRACKING_TOKEN_TTL_HOURS: 24,

  CHECKIN_MIN_MINUTES: 1,
  CHECKIN_MAX_MINUTES: 720,
  CHECKIN_DEFAULT_MINUTES: 30,

  CHECKIN_MIN_GRACE_MINUTES: 1,
  CHECKIN_MAX_GRACE_MINUTES: 60,
  CHECKIN_DEFAULT_GRACE_MINUTES: 5,
  MAIL_MAX_ATTEMPTS: 5,
  SAFE_PLACE_MIN_RADIUS_M: 50,
  SAFE_PLACE_MAX_RADIUS_M: 5000,
  NEARBY_MAX_RADIUS_M: 20000,
  MAP_MAX_RADIUS_M: 50000,
};

export { ROLES, ROLE_VALUES, ROLE_RANK, ACCOUNT_STATUS, ACCOUNT_STATUS_VALUES, GENDERS, BLOOD_GROUPS, INCIDENT_CATEGORIES, INCIDENT_CATEGORY_VALUES, INCIDENT_CATEGORY_LABELS, INCIDENT_SEVERITY, INCIDENT_STATUS, INCIDENT_STATUS_VALUES, REACTION_TYPES, CONTENT_REPORT_REASONS, CONTENT_REPORT_STATUS, REPORTABLE_TYPES, MODERATION_ACTIONS, GROUP_ROLES, GROUP_ROLE_VALUES, INVITE_STATUS, INVITE_STATUS_VALUES, MESSAGE_TYPES, SOS_STATUS, SOS_STATUS_VALUES, SOS_TRIGGERS, CHECKIN_STATUS, CHECKIN_STATUS_VALUES, SAFE_PLACE_TYPES, SAFE_PLACE_EVENTS, RESOURCE_CATEGORIES, BOOKMARK_TARGETS, FEEDBACK_TYPES, FEEDBACK_STATUS, FEEDBACK_STATUS_VALUES, NOTIFICATION_TYPES, MAIL_STATUS, MAIL_STATUS_VALUES, MAIL_KINDS, AUDIT_ACTIONS, AUDIT_ACTION_VALUES, AUDIT_SEVERITY, LIMITS };
