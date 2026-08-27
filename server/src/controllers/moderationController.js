import ContentReport from '../models/ContentReport.js';
import Incident from '../models/Incident.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginationMeta } from '../utils/apiResponse.js';
import * as commonView from '../views/commonView.js';
import * as auditService from '../services/auditService.js';
import * as notificationService from '../services/notificationService.js';
import * as mailService from '../services/mailService.js';
import * as templates from '../views/emails/templates.js';
import { getPagination } from '../utils/query.js';
import { normaliseText } from '../utils/sanitize.js';
import { CONTENT_REPORT_STATUS, CONTENT_REPORT_REASONS, INCIDENT_STATUS, ACCOUNT_STATUS, AUDIT_ACTIONS, ROLES } from '../config/constants.js';

/** FR-12 and FR-13. */

const MODEL_FOR = { incident: Incident, comment: Comment };
const MODEL_NAME = { incident: 'Incident', comment: 'Comment' };

/** Loads the flagged item and pulls out the bits the queue needs to show. */
async function loadTarget(targetType, targetId) {
  const Model = MODEL_FOR[targetType];
  if (!Model) throw AppError.badRequest('That kind of content cannot be reported.');

  const doc = await Model.findById(targetId);
  if (!doc) throw AppError.notFound('That content was not found. It may already be gone.');

  return {
    doc,
    author: targetType === 'incident' ? doc.reporter : doc.author,
    excerpt: String(targetType === 'incident' ? doc.title : doc.body).slice(0, 300),
  };
}

/* --------------------------------------------------------- FR-12: report --- */

export const reportContent = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason } = req.body;

  if (!CONTENT_REPORT_REASONS.includes(reason)) {
    throw AppError.validation({
      reason: `Please choose a reason: ${CONTENT_REPORT_REASONS.join(', ')}.`,
    });
  }

  const { doc, author, excerpt } = await loadTarget(targetType, targetId);

  if (String(author) === String(req.user._id)) {
    throw AppError.badRequest(
      'This is your own content. Delete it instead of reporting it.',
      { code: 'SELF_REPORT' }
    );
  }

  // Re-flagging updates the existing row rather than creating a second one,
  // which is what the unique index on (reporter, targetType, targetId) enforces.
  const existing = await ContentReport.findOne({
    reporter: req.user._id,
    targetType,
    targetId,
  });

  if (existing) {
    if (existing.status !== CONTENT_REPORT_STATUS.OPEN) {
      throw AppError.conflict('You have already reported this and it has been reviewed.');
    }
    existing.reason = reason;
    existing.details = normaliseText(req.body.details || '');
    await existing.save();
    return ok(res, { report: commonView.contentReport(existing) }, 'Your report has been updated.');
  }

  const report = await ContentReport.create({
    reporter: req.user._id,
    targetType,
    targetId,
    targetModel: MODEL_NAME[targetType],
    targetAuthor: author,
    targetExcerpt: excerpt,
    reason,
    details: normaliseText(req.body.details || ''),
  });

  // The counter drives the moderation queue's ordering.
  await doc.updateOne({ $inc: { reportCount: 1 } });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CONTENT_REPORT,
    req,
    targetType: MODEL_NAME[targetType],
    targetId,
    severity: 'notice',
    message: `Content reported as ${reason}`,
  });

  return created(
    res,
    { report: commonView.contentReport(report) },
    'Thank you. A moderator will review this.'
  );
});

/* ------------------------------------------------------ FR-13: the queue --- */

export const listReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  filter.status = req.query.status || CONTENT_REPORT_STATUS.OPEN;
  if (req.query.status === 'all') delete filter.status;
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.reason) filter.reason = req.query.reason;

  const [reports, total] = await Promise.all([
    ContentReport.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('reporter', 'name username avatar role')
      .populate('targetAuthor', 'name username avatar role')
      .populate('reviewedBy', 'name username avatar role')
      .lean(),
    ContentReport.countDocuments(filter),
  ]);

  const openCount = await ContentReport.countDocuments({ status: CONTENT_REPORT_STATUS.OPEN });

  return ok(
    res,
    { reports: reports.map(commonView.contentReport), openCount },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

/** The flagged item alongside every flag raised against it. */
export const getReportDetail = asyncHandler(async (req, res) => {
  const report = await ContentReport.findById(req.params.id)
    .populate('reporter', 'name username avatar role')
    .populate('targetAuthor', 'name username avatar role')
    .populate('reviewedBy', 'name username avatar role');

  if (!report) throw AppError.notFound('That report was not found.');

  const Model = MODEL_FOR[report.targetType];
  const target = await Model.findById(report.targetId).lean();

  const siblings = await ContentReport.find({
    targetType: report.targetType,
    targetId: report.targetId,
    _id: { $ne: report._id },
  })
    .populate('reporter', 'name username avatar role')
    .lean();

  return ok(res, {
    report: commonView.contentReport(report),
    target: target
      ? {
          id: String(target._id),
          type: report.targetType,
          title: target.title || '',
          body: target.description || target.body || '',
          status: target.status || (target.isRemoved ? 'removed' : 'active'),
          createdAt: target.createdAt,
        }
      : null,
    otherReports: siblings.map(commonView.contentReport),
  });
});

/**
 * Resolve a flag. `action` decides what happens to the content and the author:
 *   dismiss           - the flag was wrong, nothing changes
 *   remove-content    - hide the report or comment
 *   restore-content   - undo a previous removal
 *   warn-user         - notify the author, leave the content up
 *   suspend-user      - remove the content and suspend the author
 */
export const resolveReport = asyncHandler(async (req, res) => {
  const { action, note, suspendDays } = req.body;

  const allowed = ['dismiss', 'remove-content', 'restore-content', 'warn-user', 'suspend-user'];
  if (!allowed.includes(action)) {
    throw AppError.validation({ action: `Choose one of: ${allowed.join(', ')}.` });
  }

  const report = await ContentReport.findById(req.params.id);
  if (!report) throw AppError.notFound('That report was not found.');

  const Model = MODEL_FOR[report.targetType];
  const target = await Model.findById(report.targetId);

  /*
   * Restoring is the one action that only makes sense on a report that has
   * already been reviewed - it exists to undo a removal, and a removal always
   * leaves the report "actioned". Blocking every non-open report therefore made
   * restore-content unreachable: a moderator who removed the wrong post had no
   * way back, even though the UI offered the button. So the "already reviewed"
   * guard applies to the other four actions, and restore has its own rule -
   * the content must actually be removed right now.
   */
  const targetIsRemoved = target
    ? report.targetType === 'incident'
      ? target.status === INCIDENT_STATUS.REMOVED
      : Boolean(target.isRemoved)
    : false;

  if (action === 'restore-content') {
    if (!target) throw AppError.notFound('That content no longer exists, so it cannot be restored.');
    if (!targetIsRemoved) {
      throw AppError.conflict('That content is not currently removed, so there is nothing to restore.');
    }
  } else if (report.status !== CONTENT_REPORT_STATUS.OPEN) {
    throw AppError.conflict('This report has already been reviewed.');
  }

  let actionTaken = 'none';
  let authorMessage = '';

  if (action === 'remove-content' || action === 'suspend-user') {
    if (target) {
      if (report.targetType === 'incident') {
        target.status = INCIDENT_STATUS.REMOVED;
        target.removedAt = new Date();
        target.removedBy = req.user._id;
        target.moderationNote = normaliseText(note || '');
      } else {
        target.isRemoved = true;
        target.removedAt = new Date();
        target.removedBy = req.user._id;
        target.removalReason = normaliseText(note || 'Removed by a moderator');
      }
      await target.save();
    }
    actionTaken = 'content-removed';
    authorMessage = 'One of your posts was removed because it broke the community guidelines.';
  }

  if (action === 'restore-content' && target) {
    if (report.targetType === 'incident') {
      target.status = INCIDENT_STATUS.PENDING;
      target.removedAt = null;
      target.removedBy = null;
    } else {
      target.isRemoved = false;
      target.removedAt = null;
      target.removedBy = null;
    }
    await target.save();
    actionTaken = 'content-restored';
  }

  if (action === 'warn-user') {
    actionTaken = 'user-warned';
    authorMessage = normaliseText(note) || 'A moderator has reviewed one of your posts.';
  }

  if (action === 'suspend-user' && report.targetAuthor) {
    const author = await User.findById(report.targetAuthor);

    if (author) {
      // Nobody suspends themselves by accident, and a moderator must not be
      // able to suspend an admin.
      if (String(author._id) === String(req.user._id)) {
        throw AppError.badRequest('You cannot suspend your own account.');
      }
      if (author.role === ROLES.ADMIN && req.user.role !== ROLES.ADMIN) {
        throw AppError.forbidden('Only an administrator can suspend another administrator.');
      }

      const days = Math.min(365, Math.max(1, Number(suspendDays) || 7));
      author.accountStatus = ACCOUNT_STATUS.SUSPENDED;
      author.suspension = {
        reason: normaliseText(note || 'Breach of the community guidelines'),
        until: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        by: req.user._id,
        at: new Date(),
      };
      author.tokenVersion += 1; // ends every session immediately
      await author.save({ validateBeforeSave: false });

      actionTaken = 'user-suspended';

      mailService
        .enqueue({
          kind: 'account-status',
          to: author.email,
          toName: author.name,
          priority: 4,
          relatedUser: author._id,
          ...templates.accountStatus({
            name: author.name,
            status: 'suspended',
            reason: author.suspension.reason,
            until: author.suspension.until,
          }),
        })
        .catch(() => {});
    }
  }

  report.status =
    action === 'dismiss' ? CONTENT_REPORT_STATUS.DISMISSED : CONTENT_REPORT_STATUS.ACTIONED;
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  report.actionTaken = actionTaken;
  report.moderatorNote = normaliseText(note || '');
  await report.save();

  // Every other open flag on the same item is resolved the same way, so the
  // queue does not make a moderator handle one piece of content five times.
  await ContentReport.updateMany(
    {
      targetType: report.targetType,
      targetId: report.targetId,
      status: CONTENT_REPORT_STATUS.OPEN,
      _id: { $ne: report._id },
    },
    {
      $set: {
        status: report.status,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        actionTaken,
        moderatorNote: 'Resolved together with another report on the same content.',
      },
    }
  );

  if (authorMessage && report.targetAuthor) {
    notificationService
      .notify({
        user: report.targetAuthor,
        type: 'moderation',
        title: 'A moderator reviewed your content',
        body: authorMessage,
        isUrgent: false,
      })
      .catch(() => {});
  }

  auditService.recordAsync({
    action: AUDIT_ACTIONS.MODERATION_ACTION,
    req,
    targetType: report.targetModel,
    targetId: report.targetId,
    severity: action === 'suspend-user' ? 'warning' : 'notice',
    message: `Moderation: ${action}`,
    metadata: { reportId: String(report._id), actionTaken },
  });

  return ok(res, { report: commonView.contentReport(report) }, 'The report has been resolved.');
});

/**
 * FR-25: verify or reject a report directly, without a flag being raised.
 * Verification is what turns a pending pin into a trusted one on the map.
 */
export const setIncidentStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  if (![INCIDENT_STATUS.VERIFIED, INCIDENT_STATUS.REJECTED, INCIDENT_STATUS.PENDING, INCIDENT_STATUS.REMOVED].includes(status)) {
    throw AppError.validation({ status: 'That is not a valid status.' });
  }

  const incident = await Incident.findById(req.params.id);
  if (!incident) throw AppError.notFound('That report was not found.');

  const previous = incident.status;
  incident.status = status;
  incident.moderationNote = normaliseText(note || '');

  if (status === INCIDENT_STATUS.VERIFIED) {
    incident.verifiedBy = req.user._id;
    incident.verifiedAt = new Date();
    incident.removedAt = null;
    incident.removedBy = null;
  } else if (status === INCIDENT_STATUS.REMOVED) {
    incident.removedAt = new Date();
    incident.removedBy = req.user._id;
  } else {
    incident.verifiedBy = null;
    incident.verifiedAt = null;
  }

  await incident.save();

  notificationService
    .notify({
      user: incident.reporter,
      type: 'incident-status',
      title:
        status === INCIDENT_STATUS.VERIFIED
          ? 'Your report has been verified'
          : `Your report is now marked "${status}"`,
      body: incident.title,
      link: `/incidents/${incident._id}`,
      data: { incidentId: String(incident._id), status },
    })
    .catch(() => {});

  auditService.recordAsync({
    action: AUDIT_ACTIONS.INCIDENT_STATUS,
    req,
    targetType: 'Incident',
    targetId: incident._id,
    severity: 'notice',
    message: `Incident status: ${previous} -> ${status}`,
  });

  return ok(res, { incident: { id: String(incident._id), status: incident.status } }, 'Status updated.');
});
