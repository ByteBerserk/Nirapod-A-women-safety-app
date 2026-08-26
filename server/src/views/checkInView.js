import { CHECKIN_STATUS } from '../config/constants.js';
import { idOf, pointOf } from './present.js';

/** FR-26. What the owner is allowed to see about their own check-in. */


/**
 * @param {object} doc a SafetyCheckIn
 */
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

    /*
     * Sent alongside the timestamps so a clock that is a few minutes out does
     * not show a countdown that disagrees with the server - the server is the
     * one that decides when this escalates.
     */
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

/** Row in the history list. Same shape, minus the live countdown. */
function summary(doc) {
  const full = detail(doc);
  if (!full) return null;

  const { secondsUntilDue, secondsUntilEscalation, ...rest } = full;
  return rest;
}

export { detail, summary };
