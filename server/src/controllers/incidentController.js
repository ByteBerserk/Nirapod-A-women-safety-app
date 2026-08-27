import fs from 'fs';
import path from 'path';
import env from '../config/env.js';
import Incident from '../models/Incident.js';
import Comment from '../models/Comment.js';
import Bookmark from '../models/Bookmark.js';
import ContentReport from '../models/ContentReport.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent, paginationMeta } from '../utils/apiResponse.js';
import * as incidentView from '../views/incidentView.js';
import * as geoService from '../services/geoService.js';
import * as auditService from '../services/auditService.js';
import * as notificationService from '../services/notificationService.js';
import { removeUploadedFiles, persistUploads } from '../middleware/upload.js';
import { parseCoordinates, metersToRadians } from '../utils/geo.js';
import { normaliseText, normaliseMultiline } from '../utils/sanitize.js';
import { getPagination, getSort, parseEnumList, dateRangeFilter, keywordFilter } from '../utils/query.js';
import { INCIDENT_STATUS, INCIDENT_CATEGORY_VALUES, INCIDENT_SEVERITY, REACTION_TYPES, AUDIT_ACTIONS, ROLES, LIMITS } from '../config/constants.js';

const SORTABLE = ['createdAt', 'occurredAt', 'viewCount', 'commentCount'];

function isStaff(user) {
  return user && (user.role === ROLES.ADMIN || user.role === ROLES.MODERATOR);
}

function buildIncidentFilter(query, viewer) {
  const filter = {};

  if (isStaff(viewer) && query.status) {
    filter.status = query.status;
  } else if (isStaff(viewer) && query.includeRemoved === 'true') {

  } else {
    filter.status = { $in: [INCIDENT_STATUS.PENDING, INCIDENT_STATUS.VERIFIED] };
  }

  const categories = parseEnumList(query.category, INCIDENT_CATEGORY_VALUES);
  if (categories.length) filter.category = { $in: categories };

  const severities = parseEnumList(query.severity, INCIDENT_SEVERITY);
  if (severities.length) filter.severity = { $in: severities };

  const occurred = dateRangeFilter(query.from, query.to);
  if (occurred) filter.occurredAt = occurred;

  if (query.mine === 'true' && viewer) filter.reporter = viewer._id;

  return filter;
}

function applyGeoFilter(filter, query) {
  const centre = parseCoordinates({ lat: query.lat, lng: query.lng });
  if (!centre) return null;

  const radius = Math.min(
    LIMITS.MAP_MAX_RADIUS_M,
    Math.max(100, Number(query.radius) || 5000)
  );

  filter.location = {
    $geoWithin: { $centerSphere: [[centre.lng, centre.lat], metersToRadians(radius)] },
  };
  return { centre, radius };
}

export const createIncident = asyncHandler(async (req, res) => {
  const location = parseCoordinates(req.body.location || req.body);

  if (!location) {
    removeUploadedFiles(req.files);
    throw AppError.validation({
      location: 'Please pin the location of the incident on the map.',
    });
  }

  const occurredAt = req.body.occurredAt ? new Date(req.body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    removeUploadedFiles(req.files);
    throw AppError.validation({ occurredAt: 'Please enter a valid date and time.' });
  }

  const media = await persistUploads(req.files);

  try {
    const incident = await Incident.create({
      reporter: req.user._id,
      title: normaliseText(req.body.title),
      description: normaliseMultiline(req.body.description, 5000),
      category: req.body.category,
      severity: req.body.severity || 'medium',
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      address: normaliseText(req.body.address || ''),
      area: normaliseText(req.body.area || ''),
      city: normaliseText(req.body.city || ''),
      occurredAt,
      media,
      isAnonymous: req.body.isAnonymous === true || req.body.isAnonymous === 'true',
    });

    auditService.recordAsync({
      action: AUDIT_ACTIONS.INCIDENT_CREATE,
      req,
      targetType: 'Incident',
      targetId: incident._id,
      message: `Incident reported: ${incident.category}`,
      metadata: { category: incident.category, anonymous: incident.isAnonymous },
    });

    if (!incident.address || !incident.area) {
      geoService
        .reverseGeocode(location.lat, location.lng)
        .then((resolved) => {
          if (!resolved?.address) return null;
          return Incident.updateOne(
            { _id: incident._id },
            {
              $set: {
                address: incident.address || resolved.address,
                area: incident.area || resolved.area,
                city: incident.city || resolved.city,
              },
            }
          );
        })
        .catch(() => {});
    }

    await incident.populate('reporter', 'name username avatar role');

    return created(
      res,
      { incident: incidentView.detail(incident, req.user) },
      'Thank you. Your report has been published to the community map.'
    );
  } catch (error) {

    removeUploadedFiles(req.files);
    throw error;
  }
});

export const listIncidents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildIncidentFilter(req.query, req.user);
  applyGeoFilter(filter, req.query);

  const term = String(req.query.q || '').trim();
  let sort = getSort(req.query.sort, SORTABLE, '-occurredAt');
  let projection;

  if (term) {
    if (filter.location) {
      Object.assign(filter, keywordFilter(term, ['title', 'description', 'address', 'area', 'city']));
    } else {
      filter.$text = { $search: term };
      projection = { score: { $meta: 'textScore' } };
      if (!req.query.sort) sort = { score: { $meta: 'textScore' } };
    }
  }

  const queryBuilder = Incident.find(filter, projection)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('reporter', 'name username avatar role')
    .lean();

  const [incidents, total] = await Promise.all([
    queryBuilder,
    Incident.countDocuments(filter),
  ]);

  return ok(
    res,
    { incidents: incidents.map((doc) => incidentView.summary(doc, req.user)) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const getMapPins = asyncHandler(async (req, res) => {
  const filter = buildIncidentFilter(req.query, req.user);
  const geo = applyGeoFilter(filter, req.query);

  if (!geo) {
    throw AppError.badRequest(
      'Please provide a map centre (lat and lng) so we know which area to load.'
    );
  }

  if (!filter.occurredAt) {
    const days = Math.min(1825, Math.max(1, Number(req.query.days) || 365));
    filter.occurredAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  const cap = Math.min(1000, Math.max(50, Number(req.query.limit) || 500));

  const incidents = await Incident.find(filter)
    .select('title category severity status location occurredAt')
    .sort('-occurredAt')
    .limit(cap)
    .lean();

  const pins = incidents.map(incidentView.mapPin).filter(Boolean);

  const byCategory = pins.reduce((acc, pin) => {
    acc[pin.category] = (acc[pin.category] || 0) + 1;
    return acc;
  }, {});

  return ok(res, {
    pins,
    centre: geo.centre,
    radius: geo.radius,
    counts: { total: pins.length, byCategory },
    truncated: pins.length >= cap,
  });
});

export const getIncident = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(req.params.id).populate(
    'reporter',
    'name username avatar role'
  );

  if (!incident) throw AppError.notFound('That report was not found.');

  const removed = [INCIDENT_STATUS.REMOVED, INCIDENT_STATUS.REJECTED].includes(incident.status);
  const isOwner = String(incident.reporter?._id) === String(req.user?._id);

  if (removed && !isStaff(req.user) && !isOwner) {
    throw AppError.notFound('That report is no longer available.');
  }

  if (!isOwner) {
    Incident.updateOne({ _id: incident._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  }

  const payload = { incident: incidentView.detail(incident, req.user) };

  if (req.user) {
    payload.isBookmarked = Boolean(
      await Bookmark.exists({ user: req.user._id, targetType: 'incident', targetId: incident._id })
    );
  }

  return ok(res, payload);
});

export const updateIncident = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(req.params.id);
  if (!incident) throw AppError.notFound('That report was not found.');

  const isOwner = String(incident.reporter) === String(req.user._id);
  if (!isOwner && !isStaff(req.user)) {
    throw AppError.forbidden('You can only edit reports that you submitted.');
  }
  if (incident.status === INCIDENT_STATUS.REMOVED && !isStaff(req.user)) {
    throw AppError.forbidden('This report was removed by a moderator and cannot be edited.');
  }

  if (req.body.title !== undefined) incident.title = normaliseText(req.body.title);
  if (req.body.description !== undefined) {
    incident.description = normaliseMultiline(req.body.description, 5000);
  }
  if (req.body.category !== undefined) incident.category = req.body.category;
  if (req.body.severity !== undefined) incident.severity = req.body.severity;
  if (req.body.address !== undefined) incident.address = normaliseText(req.body.address);
  if (req.body.area !== undefined) incident.area = normaliseText(req.body.area);
  if (req.body.city !== undefined) incident.city = normaliseText(req.body.city);
  if (req.body.isAnonymous !== undefined) {
    incident.isAnonymous = req.body.isAnonymous === true || req.body.isAnonymous === 'true';
  }
  if (req.body.occurredAt !== undefined) {
    const date = new Date(req.body.occurredAt);
    if (Number.isNaN(date.getTime())) {
      throw AppError.validation({ occurredAt: 'Please enter a valid date and time.' });
    }
    incident.occurredAt = date;
  }

  const location = parseCoordinates(req.body.location);
  if (location) incident.location = { type: 'Point', coordinates: [location.lng, location.lat] };

  if (incident.status === INCIDENT_STATUS.VERIFIED && isOwner && !isStaff(req.user)) {
    incident.status = INCIDENT_STATUS.PENDING;
    incident.verifiedAt = null;
    incident.verifiedBy = null;
  }

  await incident.save();
  await incident.populate('reporter', 'name username avatar role');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.INCIDENT_UPDATE,
    req,
    targetType: 'Incident',
    targetId: incident._id,
    message: 'Incident report updated',
  });

  return ok(res, { incident: incidentView.detail(incident, req.user) }, 'Your report has been updated.');
});

export const deleteIncident = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(req.params.id);
  if (!incident) throw AppError.notFound('That report was not found.');

  const isOwner = String(incident.reporter) === String(req.user._id);
  if (!isOwner && req.user.role !== ROLES.ADMIN) {
    throw AppError.forbidden('You can only delete reports that you submitted.');
  }

  await Promise.all([
    Comment.deleteMany({ incident: incident._id }),
    ContentReport.deleteMany({ targetType: 'incident', targetId: incident._id }),
    Bookmark.deleteMany({ targetType: 'incident', targetId: incident._id }),
  ]);

  for (const item of incident.media || []) {
    if (typeof item.url === 'string' && item.url.startsWith('/uploads/')) {

      fs.promises
        .unlink(path.join(env.uploads.dir, 'incidents', path.basename(item.url)))
        .catch(() => {});
    }
  }

  await incident.deleteOne();

  auditService.recordAsync({
    action: AUDIT_ACTIONS.INCIDENT_DELETE,
    req,
    targetType: 'Incident',
    targetId: incident._id,
    severity: 'notice',
    message: 'Incident report deleted',
  });

  return noContent(res);
});

export const reactToIncident = asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!REACTION_TYPES.includes(type)) {
    throw AppError.validation({
      type: `A reaction must be one of: ${REACTION_TYPES.join(', ')}.`,
    });
  }

  const incident = await Incident.findById(req.params.id);
  if (!incident) throw AppError.notFound('That report was not found.');

  const userId = String(req.user._id);
  const index = incident.reactions.findIndex((r) => String(r.user) === userId);

  let action;
  if (index === -1) {
    incident.reactions.push({ user: req.user._id, type });
    action = 'added';
  } else if (incident.reactions[index].type === type) {

    incident.reactions.splice(index, 1);
    action = 'removed';
  } else {
    incident.reactions[index].type = type;
    incident.reactions[index].createdAt = new Date();
    action = 'changed';
  }

  incident.recalculateReactionCounts();
  await incident.save();

  if (action === 'added' && String(incident.reporter) !== userId) {
    notificationService
      .notify({
        user: incident.reporter,
        type: 'incident-reaction',
        title: 'Someone found your report useful',
        body: `${req.user.name} marked "${incident.title}" as ${type}.`,
        link: `/incidents/${incident._id}`,
        data: { incidentId: String(incident._id) },
      })
      .catch(() => {});
  }

  return ok(res, {
    action,
    myReaction: action === 'removed' ? null : type,
    reactionCounts: incident.reactionCounts,
  });
});

export const listComments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);

  const incidentExists = await Incident.exists({ _id: req.params.id });
  if (!incidentExists) throw AppError.notFound('That report was not found.');

  const filter = { incident: req.params.id };

  if (!isStaff(req.user)) filter.isRemoved = false;

  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .sort('createdAt')
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username avatar role')
      .lean(),
    Comment.countDocuments(filter),
  ]);

  return ok(
    res,
    { comments: comments.map((doc) => incidentView.comment(doc, req.user)) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const addComment = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(req.params.id).select('reporter title status');
  if (!incident) throw AppError.notFound('That report was not found.');

  if ([INCIDENT_STATUS.REMOVED, INCIDENT_STATUS.REJECTED].includes(incident.status)) {
    throw AppError.forbidden('Comments are closed on this report.');
  }

  const comment = await Comment.create({
    incident: incident._id,
    author: req.user._id,
    body: normaliseMultiline(req.body.body, 1000),
    isAnonymous: req.body.isAnonymous === true || req.body.isAnonymous === 'true',
  });

  await Incident.updateOne({ _id: incident._id }, { $inc: { commentCount: 1 } });
  await comment.populate('author', 'name username avatar role');

  if (String(incident.reporter) !== String(req.user._id)) {
    notificationService
      .notify({
        user: incident.reporter,
        type: 'incident-comment',
        title: 'New comment on your report',
        body: `${comment.isAnonymous ? 'Someone' : req.user.name} commented on "${incident.title}".`,
        link: `/incidents/${incident._id}`,
        data: { incidentId: String(incident._id), commentId: String(comment._id) },
      })
      .catch(() => {});
  }

  return created(res, { comment: incidentView.comment(comment, req.user) }, 'Comment posted.');
});

export const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.commentId);
  if (!comment || comment.isRemoved) throw AppError.notFound('That comment was not found.');

  const isAuthor = String(comment.author) === String(req.user._id);
  if (!isAuthor && !isStaff(req.user)) {
    throw AppError.forbidden('You can only delete your own comments.');
  }

  if (isAuthor) {

    await comment.deleteOne();
    await Incident.updateOne(
      { _id: comment.incident, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } }
    );
  } else {

    comment.isRemoved = true;
    comment.removedAt = new Date();
    comment.removedBy = req.user._id;
    comment.removalReason = normaliseText(req.body.reason || 'Removed by a moderator');
    await comment.save();

    auditService.recordAsync({
      action: AUDIT_ACTIONS.MODERATION_ACTION,
      req,
      targetType: 'Comment',
      targetId: comment._id,
      severity: 'notice',
      message: 'Comment removed by a moderator',
    });
  }

  return noContent(res);
});
