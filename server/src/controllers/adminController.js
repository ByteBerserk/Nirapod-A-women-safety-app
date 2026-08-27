import User from '../models/User.js';
import Incident from '../models/Incident.js';
import SosEvent from '../models/SosEvent.js';
import ContentReport from '../models/ContentReport.js';
import SafetyGroup from '../models/SafetyGroup.js';
import Feedback from '../models/Feedback.js';
import AuditLog from '../models/AuditLog.js';
import MailJob from '../models/MailJob.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, paginationMeta } from '../utils/apiResponse.js';
import * as userView from '../views/userView.js';
import * as commonView from '../views/commonView.js';
import * as auditService from '../services/auditService.js';
import * as mailService from '../services/mailService.js';
import * as templates from '../views/emails/templates.js';
import { getPagination, dateRangeFilter } from '../utils/query.js';
import { normaliseText } from '../utils/sanitize.js';
import { runInBackground } from '../utils/background.js';
import { ROLES, ROLE_VALUES, ACCOUNT_STATUS, INCIDENT_STATUS, INCIDENT_CATEGORY_LABELS, SOS_STATUS, CONTENT_REPORT_STATUS, FEEDBACK_STATUS, MAIL_STATUS, AUDIT_ACTIONS } from '../config/constants.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const previousSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    newUsers,
    previousNewUsers,
    totalIncidents,
    recentIncidents,
    previousIncidents,
    pendingIncidents,
    verifiedIncidents,
    totalSos,
    recentSos,
    activeSos,
    openReports,
    totalGroups,
    newFeedback,
    failedMail,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ accountStatus: ACCOUNT_STATUS.ACTIVE }),
    User.countDocuments({ accountStatus: ACCOUNT_STATUS.SUSPENDED }),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ createdAt: { $gte: previousSince, $lt: since } }),
    Incident.countDocuments(),
    Incident.countDocuments({ createdAt: { $gte: since } }),
    Incident.countDocuments({ createdAt: { $gte: previousSince, $lt: since } }),
    Incident.countDocuments({ status: INCIDENT_STATUS.PENDING }),
    Incident.countDocuments({ status: INCIDENT_STATUS.VERIFIED }),
    SosEvent.countDocuments(),
    SosEvent.countDocuments({ createdAt: { $gte: since } }),
    SosEvent.countDocuments({ status: SOS_STATUS.ACTIVE }),
    ContentReport.countDocuments({ status: CONTENT_REPORT_STATUS.OPEN }),
    SafetyGroup.countDocuments({ isArchived: false }),
    Feedback.countDocuments({ status: FEEDBACK_STATUS.NEW }),
    MailJob.countDocuments({ status: MAIL_STATUS.ABANDONED }),
  ]);

  const trend = (current, previous) => {
    if (!previous) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return ok(res, {
    period: { days, since },
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      new: newUsers,
      trend: trend(newUsers, previousNewUsers),
    },
    incidents: {
      total: totalIncidents,
      recent: recentIncidents,
      pending: pendingIncidents,
      verified: verifiedIncidents,
      trend: trend(recentIncidents, previousIncidents),
    },
    sos: { total: totalSos, recent: recentSos, active: activeSos },
    moderation: { openReports, newFeedback },
    groups: { total: totalGroups },
    system: { failedEmails: failedMail },
  });
});

export const getCategoryBreakdown = asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await Incident.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: INCIDENT_STATUS.REMOVED } } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        verified: {
          $sum: { $cond: [{ $eq: ['$status', INCIDENT_STATUS.VERIFIED] }, 1, 0] },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return ok(res, {
    total,
    categories: rows.map((row) => ({
      category: row._id,
      label: INCIDENT_CATEGORY_LABELS[row._id] || row._id,
      count: row.count,
      verified: row.verified,
      percentage: total ? Math.round((row.count / total) * 1000) / 10 : 0,
    })),
  });
});

export const getTrends = asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const groupByDay = {
    $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 },
    },
  };

  const [incidentRows, sosRows, userRows] = await Promise.all([
    Incident.aggregate([{ $match: { createdAt: { $gte: since } } }, groupByDay, { $sort: { _id: 1 } }]),
    SosEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, groupByDay, { $sort: { _id: 1 } }]),
    User.aggregate([{ $match: { createdAt: { $gte: since } } }, groupByDay, { $sort: { _id: 1 } }]),
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [r._id, r.count]));
  const incidentMap = toMap(incidentRows);
  const sosMap = toMap(sosRows);
  const userMap = toMap(userRows);

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({
      date,
      incidents: incidentMap.get(date) || 0,
      sos: sosMap.get(date) || 0,
      signups: userMap.get(date) || 0,
    });
  }

  return ok(res, { days, series });
});

export const getHotspots = asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 15));

  const rows = await Incident.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $in: [INCIDENT_STATUS.PENDING, INCIDENT_STATUS.VERIFIED] },
      },
    },
    {
      $project: {
        area: 1,
        city: 1,
        category: 1,
        severity: 1,

        gridLat: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 2] },
        gridLng: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 2] },
      },
    },
    {
      $group: {
        _id: { lat: '$gridLat', lng: '$gridLng' },
        count: { $sum: 1 },
        areas: { $addToSet: '$area' },
        cities: { $addToSet: '$city' },
        categories: { $push: '$category' },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
      },
    },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const hotspots = rows.map((row) => {
    const tally = row.categories.reduce((acc, category) => {
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];

    return {
      lat: row._id.lat,
      lng: row._id.lng,
      count: row.count,
      criticalCount: row.critical,
      area: row.areas.filter(Boolean)[0] || '',
      city: row.cities.filter(Boolean)[0] || '',
      topCategory: top ? top[0] : null,
      topCategoryLabel: top ? INCIDENT_CATEGORY_LABELS[top[0]] || top[0] : null,
    };
  });

  return ok(res, { days, hotspots });
});

export const setUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!ROLE_VALUES.includes(role)) {
    throw AppError.validation({ role: `Role must be one of: ${ROLE_VALUES.join(', ')}.` });
  }

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('That account was not found.');

  if (String(user._id) === String(req.user._id)) {
    throw AppError.badRequest('You cannot change your own role.');
  }

  if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
    const adminCount = await User.countDocuments({
      role: ROLES.ADMIN,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    });
    if (adminCount <= 1) {
      throw AppError.badRequest('This is the only administrator. Promote someone else first.');
    }
  }

  const previous = user.role;
  user.role = role;

  user.tokenVersion += 1;
  await user.save({ validateBeforeSave: false });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGE,
    req,
    targetType: 'User',
    targetId: user._id,
    severity: 'warning',
    message: `Role changed: ${previous} -> ${role}`,
  });

  return ok(res, { user: userView.adminRow(user) }, `${user.name} is now a ${role}.`);
});

export const setUserStatus = asyncHandler(async (req, res) => {
  const { status, reason, days } = req.body;

  if (![ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.DEACTIVATED].includes(status)) {
    throw AppError.validation({ status: 'That is not a valid account status.' });
  }

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('That account was not found.');

  if (String(user._id) === String(req.user._id)) {
    throw AppError.badRequest('You cannot change your own account status.');
  }
  if (user.role === ROLES.ADMIN && req.user.role !== ROLES.ADMIN) {
    throw AppError.forbidden('Only an administrator can act on another administrator.');
  }

  const previous = user.accountStatus;
  user.accountStatus = status;

  if (status === ACCOUNT_STATUS.SUSPENDED) {
    const suspendDays = Math.min(365, Math.max(1, Number(days) || 7));
    user.suspension = {
      reason: normaliseText(reason || 'Breach of the community guidelines'),
      until: new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000),
      by: req.user._id,
      at: new Date(),
    };
    user.tokenVersion += 1;
  } else {
    user.suspension = { reason: '', until: null, by: null, at: null };
    if (status === ACCOUNT_STATUS.DEACTIVATED) user.tokenVersion += 1;
  }

  await user.save({ validateBeforeSave: false });

  if (status === ACCOUNT_STATUS.SUSPENDED || previous === ACCOUNT_STATUS.SUSPENDED) {
    mailService
      .enqueue({
        kind: 'account-status',
        to: user.email,
        toName: user.name,
        priority: 4,
        relatedUser: user._id,
        ...templates.accountStatus({
          name: user.name,
          status,
          reason: user.suspension?.reason,
          until: user.suspension?.until,
        }),
      })
      .catch(() => {});
  }

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_USER_STATUS,
    req,
    targetType: 'User',
    targetId: user._id,
    severity: 'warning',
    message: `Account status: ${previous} -> ${status}`,
    metadata: { reason: user.suspension?.reason || '' },
  });

  return ok(res, { user: userView.adminRow(user) }, 'Account status updated.');
});

export const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('That account was not found.');

  const [incidents, sosEvents, groups, reportsAgainst] = await Promise.all([
    Incident.countDocuments({ reporter: user._id }),
    SosEvent.countDocuments({ user: user._id }),
    SafetyGroup.countDocuments({ 'members.user': user._id, isArchived: false }),
    ContentReport.countDocuments({ targetAuthor: user._id }),
  ]);

  return ok(res, {
    user: userView.adminRow(user),
    stats: { incidents, sosEvents, groups, reportsAgainst },
  });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 50);

  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.actor) filter.actor = req.query.actor;

  const range = dateRangeFilter(req.query.from, req.query.to);
  if (range) filter.createdAt = range;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('actor', 'name username avatar role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return ok(
    res,
    { logs: logs.map(commonView.auditEntry) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const getMailQueueStatus = asyncHandler(async (req, res) => {
  const rows = await MailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

  const counts = rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const failures = await MailJob.find({ status: MAIL_STATUS.ABANDONED })
    .sort('-updatedAt')
    .limit(20)
    .select('kind to subject attempts lastError updatedAt')
    .lean();

  return ok(res, {
    counts: {
      queued: counts[MAIL_STATUS.QUEUED] || 0,
      sending: counts[MAIL_STATUS.SENDING] || 0,
      sent: counts[MAIL_STATUS.SENT] || 0,
      abandoned: counts[MAIL_STATUS.ABANDONED] || 0,
    },
    recentFailures: failures.map((job) => ({
      id: String(job._id),
      kind: job.kind,
      to: job.to,
      subject: job.subject,
      attempts: job.attempts,
      lastError: job.lastError,
      updatedAt: job.updatedAt,
    })),
  });
});

export const retryFailedMail = asyncHandler(async (req, res) => {
  const result = await MailJob.updateMany(
    { status: MAIL_STATUS.ABANDONED },
    { $set: { status: MAIL_STATUS.QUEUED, attempts: 0, nextAttemptAt: new Date() } }
  );

  if (result.modifiedCount) runInBackground(mailService.processQueue(50), 'mail queue retry');

  return ok(res, { retried: result.modifiedCount }, `Requeued ${result.modifiedCount} message(s).`);
});
