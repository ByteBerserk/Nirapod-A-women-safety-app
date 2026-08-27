import * as userView from './userView.js';
import { idOf } from './present.js';


function contact(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    name: doc.name,
    email: doc.email,
    phone: doc.phone || '',
    relationship: doc.relationship || '',
    priority: doc.priority,
    isActive: doc.isActive,
    lastNotifiedAt: doc.lastNotifiedAt || null,
    notifyCount: doc.notifyCount || 0,
    createdAt: doc.createdAt,
  };
}

function safePlace(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    label: doc.label,
    type: doc.type,
    location: Array.isArray(doc.location?.coordinates)
      ? { lat: doc.location.coordinates[1], lng: doc.location.coordinates[0] }
      : null,
    address: doc.address || '',
    radiusMeters: doc.radiusMeters,
    notifyOnEnter: doc.notifyOnEnter,
    notifyOnLeave: doc.notifyOnLeave,
    notifyContacts: doc.notifyContacts,
    isInside: Boolean(doc.isInside),
    lastTransitionAt: doc.lastTransitionAt || null,
    createdAt: doc.createdAt,
  };
}

function safePlaceEvent(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    placeId: idOf(doc.place),
    placeLabel: doc.placeLabel,
    event: doc.event,
    location: Array.isArray(doc.coordinates)
      ? { lat: doc.coordinates[1], lng: doc.coordinates[0] }
      : null,
    distanceMeters: doc.distanceMeters ?? null,
    contactsNotified: doc.contactsNotified || 0,
    occurredAt: doc.occurredAt,
  };
}

function resource(doc, { includeContent = false } = {}) {
  if (!doc) return null;
  const out = {
    id: idOf(doc),
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    summary: doc.summary || '',
    tags: doc.tags || [],
    externalUrl: doc.externalUrl || '',
    contactNumbers: doc.contactNumbers || [],
    isPinned: Boolean(doc.isPinned),
    isPublished: Boolean(doc.isPublished),
    viewCount: doc.viewCount || 0,
    bookmarkCount: doc.bookmarkCount || 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  if (includeContent) out.content = doc.content;
  return out;
}

function bookmark(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    targetType: doc.targetType,
    targetId: idOf(doc.targetId),
    note: doc.note || '',
    createdAt: doc.createdAt,
    // Populated by the controller when the target still exists.
    target: doc.target ?? null,
  };
}

function feedback(doc, { forAdmin = false } = {}) {
  if (!doc) return null;
  const out = {
    id: idOf(doc),
    type: doc.type,
    subject: doc.subject,
    message: doc.message,
    status: doc.status,
    adminResponse: doc.adminResponse || '',
    respondedAt: doc.respondedAt || null,
    createdAt: doc.createdAt,
  };
  if (forAdmin) {
    out.email = doc.email;
    out.user = doc.user ? userView.publicProfile(doc.user) : null;
    out.appVersion = doc.appVersion || '';
    out.userAgent = doc.userAgent || '';
  }
  return out;
}

function notification(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    type: doc.type,
    title: doc.title,
    body: doc.body || '',
    link: doc.link || '',
    data: doc.data || {},
    isUrgent: Boolean(doc.isUrgent),
    isRead: Boolean(doc.isRead),
    readAt: doc.readAt || null,
    createdAt: doc.createdAt,
  };
}

function contentReport(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    targetType: doc.targetType,
    targetId: idOf(doc.targetId),
    targetExcerpt: doc.targetExcerpt || '',
    targetAuthor: doc.targetAuthor ? userView.publicProfile(doc.targetAuthor) : null,
    reason: doc.reason,
    details: doc.details || '',
    status: doc.status,
    reporter: userView.publicProfile(doc.reporter),
    reviewedBy: doc.reviewedBy ? userView.publicProfile(doc.reviewedBy) : null,
    reviewedAt: doc.reviewedAt || null,
    actionTaken: doc.actionTaken,
    moderatorNote: doc.moderatorNote || '',
    createdAt: doc.createdAt,
  };
}

function auditEntry(doc) {
  if (!doc) return null;
  return {
    id: idOf(doc),
    action: doc.action,
    severity: doc.severity,
    message: doc.message || '',
    actor: doc.actor ? userView.publicProfile(doc.actor) : null,
    actorEmail: doc.actorEmail || '',
    targetType: doc.targetType || '',
    targetId: idOf(doc.targetId),
    metadata: doc.metadata || {},
    ip: doc.ip || '',
    createdAt: doc.createdAt,
  };
}

export { contact, safePlace, safePlaceEvent, resource, bookmark, feedback, notification, contentReport, auditEntry };