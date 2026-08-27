import * as userView from './userView.js';
import { INCIDENT_CATEGORY_LABELS, ROLES } from '../config/constants.js';
import { idOf } from './present.js';

function myReaction(incident, viewerId) {
  if (!viewerId || !Array.isArray(incident.reactions)) return null;
  const mine = incident.reactions.find((r) => String(r.user) === String(viewerId));
  return mine ? mine.type : null;
}

function isStaff(viewer) {
  return viewer && (viewer.role === ROLES.ADMIN || viewer.role === ROLES.MODERATOR);
}

function baseFields(incident) {
  return {
    id: idOf(incident),
    title: incident.title,
    category: incident.category,
    categoryLabel: INCIDENT_CATEGORY_LABELS[incident.category] || incident.category,
    severity: incident.severity,
    status: incident.status,
    location: Array.isArray(incident.location?.coordinates)
      ? { lat: incident.location.coordinates[1], lng: incident.location.coordinates[0] }
      : null,
    address: incident.address || '',
    area: incident.area || '',
    city: incident.city || '',
    occurredAt: incident.occurredAt,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    mediaCount: (incident.media || []).length,
    reactionCounts: {
      helpful: incident.reactionCounts?.helpful || 0,
      important: incident.reactionCounts?.important || 0,
      support: incident.reactionCounts?.support || 0,
    },
    commentCount: incident.commentCount || 0,
    viewCount: incident.viewCount || 0,
    isAnonymous: Boolean(incident.isAnonymous),
  };
}

function summary(incident, viewer) {
  if (!incident) return null;

  return {
    ...baseFields(incident),
    excerpt:
      String(incident.description || '').slice(0, 220) +
      (String(incident.description || '').length > 220 ? '...' : ''),
    reporter: userView.author(incident.reporter, incident.isAnonymous),
    thumbnail: (incident.media || []).find((m) => m.type === 'image')?.url || null,
    myReaction: myReaction(incident, viewer?.id || viewer?._id),
    isMine: Boolean(viewer && String(idOf(incident.reporter)) === String(viewer.id || viewer._id)),
  };
}

function detail(incident, viewer) {
  if (!incident) return null;

  const viewerId = viewer?.id || viewer?._id;
  const mine = viewer && String(idOf(incident.reporter)) === String(viewerId);

  const result = {
    ...baseFields(incident),
    description: incident.description,
    media: (incident.media || []).map((m) => ({
      url: m.url,
      type: m.type,
      mimeType: m.mimeType,
      size: m.size,
      originalName: m.originalName,
    })),
    reporter: userView.author(incident.reporter, incident.isAnonymous),
    myReaction: myReaction(incident, viewerId),
    isMine: Boolean(mine),
    canEdit: Boolean(mine || isStaff(viewer)),
    verifiedAt: incident.verifiedAt || null,
    moderationNote: incident.moderationNote || '',
  };

  if (isStaff(viewer) || mine) {
    result.reportCount = incident.reportCount || 0;
  }

  if (isStaff(viewer) && incident.isAnonymous) {
    result.trueReporter = userView.publicProfile(incident.reporter);
  }

  return result;
}

function mapPin(incident) {
  if (!incident || !Array.isArray(incident.location?.coordinates)) return null;
  return {
    id: idOf(incident),
    title: incident.title,
    category: incident.category,
    severity: incident.severity,
    status: incident.status,
    lat: incident.location.coordinates[1],
    lng: incident.location.coordinates[0],
    occurredAt: incident.occurredAt,
  };
}

function comment(doc, viewer) {
  if (!doc) return null;
  const viewerId = viewer?.id || viewer?._id;

  return {
    id: idOf(doc),
    body: doc.isRemoved ? '[This comment was removed by a moderator]' : doc.body,
    author: userView.author(doc.author, doc.isAnonymous),
    isRemoved: Boolean(doc.isRemoved),
    isMine: Boolean(viewerId && String(idOf(doc.author)) === String(viewerId)),
    canDelete: Boolean(
      (viewerId && String(idOf(doc.author)) === String(viewerId)) || isStaff(viewer)
    ),
    editedAt: doc.editedAt || null,
    createdAt: doc.createdAt,
  };
}

export { summary, detail, mapPin, comment };
