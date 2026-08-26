import AuditLog from '../models/AuditLog.js';
import * as logger from '../config/logger.js';

/**
 * NFR-15. Writing an audit row must never be able to fail the operation it is
 * recording - if the log write throws, we log the failure and carry on.
 */

/** Trims the proxy chain down to the client address. */
function clientIp(req) {
  if (!req) return '';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  return String(req.ip || req.connection?.remoteAddress || '').slice(0, 45);
}

/**
 * @param {object} entry
 * @param {string} entry.action     One of AUDIT_ACTIONS.
 * @param {object} [entry.req]      Express request, for actor/ip/user-agent.
 * @param {object} [entry.actor]    Overrides req.user.
 * @param {string} [entry.targetType]
 * @param {*}      [entry.targetId]
 * @param {string} [entry.severity]
 * @param {string} [entry.message]
 * @param {object} [entry.metadata] Small, non-sensitive context only.
 */
async function record(entry) {
  try {
    const req = entry.req;
    const actor = entry.actor || req?.user || null;

    await AuditLog.create({
      action: entry.action,
      actor: actor?._id || actor?.id || null,
      actorEmail: actor?.email || '',
      actorRole: actor?.role || '',
      targetType: entry.targetType || '',
      targetId: entry.targetId || null,
      severity: entry.severity || 'info',
      message: entry.message || '',
      metadata: entry.metadata || {},
      ip: entry.ip || clientIp(req),
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300),
    });
  } catch (error) {
    logger.error('Failed to write audit log entry', {
      action: entry?.action,
      message: error.message,
    });
  }
}

/**
 * Fire-and-forget variant for hot paths (an SOS should not wait on a log
 * write). The promise is still caught so an unhandled rejection cannot happen.
 */
function recordAsync(entry) {
  record(entry).catch(() => {});
}

export { record, recordAsync };