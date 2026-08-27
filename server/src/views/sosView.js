import * as userView from './userView.js';
import { idOf, pointOf } from './present.js';

function summary(sos) {
  if (!sos) return null;

  const notified = sos.notifiedContacts || [];

  return {
    id: idOf(sos),
    status: sos.status,
    trigger: sos.trigger,
    message: sos.message || '',
    startLocation: pointOf(sos.startLocation?.coordinates, {
      accuracy: sos.startLocation?.accuracy ?? null,
      address: sos.startLocation?.address || '',
    }),
    currentLocation: pointOf(sos.currentLocation?.coordinates, {
      accuracy: sos.currentLocation?.accuracy ?? null,
      updatedAt: sos.currentLocation?.updatedAt || null,
    }),
    trailPointCount: Array.isArray(sos.trail) ? sos.trail.length : 0,
    contactsNotified: notified.length,
    contactsDelivered: notified.filter((c) => c.status === 'sent').length,
    contactsFailed: notified.filter((c) => c.status === 'failed').length,
    groupsNotified: (sos.notifiedGroups || []).length,
    trackingViews: sos.trackingViews || 0,
    hasActiveTracking: Boolean(
      sos.trackingTokenHash &&
        sos.trackingExpiresAt &&
        new Date(sos.trackingExpiresAt).getTime() > Date.now()
    ),
    startedAt: sos.createdAt,
    resolvedAt: sos.resolvedAt || null,
    durationMs: sos.durationMs ?? null,
    resolutionNote: sos.resolutionNote || '',
  };
}

function detail(sos) {
  if (!sos) return null;

  return {
    ...summary(sos),
    trail: (sos.trail || []).map((point) => ({
      lat: point.coordinates[1],
      lng: point.coordinates[0],
      accuracy: point.accuracy ?? null,
      speed: point.speed ?? null,
      recordedAt: point.recordedAt,
    })),
    notifiedContacts: (sos.notifiedContacts || []).map((entry) => ({
      name: entry.name,
      email: entry.email,
      channel: entry.channel,
      status: entry.status,
      error: entry.error || '',
      sentAt: entry.sentAt || null,
    })),
    trackingExpiresAt: sos.trackingExpiresAt || null,
  };
}

function publicTracking(sos, user) {
  if (!sos) return null;

  return {
    id: idOf(sos),
    status: sos.status,
    startedAt: sos.createdAt,
    resolvedAt: sos.resolvedAt || null,
    message: sos.message || '',
    person: {
      name: user?.name || 'A Nirapod user',
      phone: user?.phone || '',
      bloodGroup: user?.bloodGroup || 'unknown',
      medicalInfo: user?.medicalInfo || '',
      avatar: user?.avatar || '',
    },
    startLocation: pointOf(sos.startLocation?.coordinates, {
      address: sos.startLocation?.address || '',
    }),
    currentLocation:
      pointOf(sos.currentLocation?.coordinates, {
        accuracy: sos.currentLocation?.accuracy ?? null,
        updatedAt: sos.currentLocation?.updatedAt || null,
      }) || pointOf(sos.startLocation?.coordinates),
    trail: (sos.trail || []).map((point) => ({
      lat: point.coordinates[1],
      lng: point.coordinates[0],
      recordedAt: point.recordedAt,
    })),
    expiresAt: sos.trackingExpiresAt || null,
  };
}

function groupAlert(sos, user) {
  if (!sos) return null;
  return {
    id: idOf(sos),
    status: sos.status,
    startedAt: sos.createdAt,
    message: sos.message || '',
    person: userView.publicProfile(user),
    location:
      pointOf(sos.currentLocation?.coordinates) || pointOf(sos.startLocation?.coordinates),
  };
}

export { summary, detail, publicTracking, groupAlert };
