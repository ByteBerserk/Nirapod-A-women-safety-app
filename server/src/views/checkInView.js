import { CHECKIN_STATUS } from '../config/constants.js';
import { idOf, pointOf } from './present.js';

function detail(doc) {
  if (!doc) return null;

  const dueAt = doc.dueAt ? new Date(doc.dueAt) : null;
  const escalateAt = doc.escalateAt ? new Date(doc.escalateAt) : null;
  const open = [CHECKIN_STATUS.ACTIVE, CHECKIN_STATUS.AWAITING].includes(doc.status);

  return {
    id: idOf(doc),
    label: doc.label,
    note: doc.note || '',
    status: doc.status,
    isOpen: open,

    dueAt,
    escalateAt,
    graceMinutes: doc.graceMinutes,

    secondsUntilDue: open && dueAt ? Math.max(0, Math.round((dueAt - Date.now()) / 1000)) : null,
    secondsUntilEscalation:
      open && escalateAt ? Math.max(0, Math.round((escalateAt - Date.now()) / 1000)) : null,

    startLocation: pointOf(doc.startLocation?.coordinates),
    promptedAt: doc.promptedAt || null,
    extensionCount: doc.extensionCount || 0,

    resolvedAt: doc.resolvedAt || null,
    resolutionNote: doc.resolutionNote || '',
    escalatedSos: idOf(doc.escalatedSos),

    createdAt: doc.createdAt,
  };
}

function summary(doc) {
  const full = detail(doc);
  if (!full) return null;

  const { secondsUntilDue, secondsUntilEscalation, ...rest } = full;
  return rest;
}

export { detail, summary };
