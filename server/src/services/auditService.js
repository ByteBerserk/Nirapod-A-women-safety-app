import AuditLog from '../models/AuditLog.js';
import * as logger from '../config/logger.js';

function clientIp(req) {
  if (!req) return '';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  return String(req.ip || req.connection?.remoteAddress || '').slice(0, 45);
}

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

function recordAsync(entry) {
  record(entry).catch(() => {});
}

export { record, recordAsync };
