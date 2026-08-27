import Resource from '../models/Resource.js';
import Bookmark from '../models/Bookmark.js';
import Incident from '../models/Incident.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent, paginationMeta } from '../utils/apiResponse.js';
import * as commonView from '../views/commonView.js';
import * as incidentView from '../views/incidentView.js';
import * as auditService from '../services/auditService.js';
import { getPagination, keywordFilter, parseEnumList } from '../utils/query.js';
import { normaliseText, normaliseMultiline } from '../utils/sanitize.js';
import { RESOURCE_CATEGORIES, AUDIT_ACTIONS, ROLES } from '../config/constants.js';

const isStaff = (user) => user && (user.role === ROLES.ADMIN || user.role === ROLES.MODERATOR);

export const listResources = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (!isStaff(req.user)) filter.isPublished = true;
  else if (req.query.published === 'false') filter.isPublished = false;

  const categories = parseEnumList(req.query.category, RESOURCE_CATEGORIES);
  if (categories.length) filter.category = { $in: categories };

  const search = keywordFilter(req.query.q, ['title', 'summary', 'content']);
  if (search) Object.assign(filter, search);

  const [resources, total] = await Promise.all([
    Resource.find(filter)
      .select('-content')
      .sort('-isPinned -createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Resource.countDocuments(filter),
  ]);

  let savedIds = new Set();
  if (req.user && resources.length) {
    const saved = await Bookmark.find({
      user: req.user._id,
      targetType: 'resource',
      targetId: { $in: resources.map((r) => r._id) },
    })
      .select('targetId')
      .lean();
    savedIds = new Set(saved.map((b) => String(b.targetId)));
  }

  return ok(
    res,
    {
      resources: resources.map((doc) => ({
        ...commonView.resource(doc),
        isBookmarked: savedIds.has(String(doc._id)),
      })),
      categories: RESOURCE_CATEGORIES,
    },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const getResource = asyncHandler(async (req, res) => {

  const key = req.params.idOrSlug;
  const query = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : { slug: key };

  const resource = await Resource.findOne(query);
  if (!resource) throw AppError.notFound('That resource was not found.');
  if (!resource.isPublished && !isStaff(req.user)) {
    throw AppError.notFound('That resource was not found.');
  }

  Resource.updateOne({ _id: resource._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  const payload = { resource: commonView.resource(resource, { includeContent: true }) };

  if (req.user) {
    payload.isBookmarked = Boolean(
      await Bookmark.exists({ user: req.user._id, targetType: 'resource', targetId: resource._id })
    );
  }

  return ok(res, payload);
});

export const createResource = asyncHandler(async (req, res) => {
  const resource = await Resource.create({
    title: normaliseText(req.body.title),
    category: req.body.category,
    summary: normaliseText(req.body.summary || ''),
    content: normaliseMultiline(req.body.content, 20000),
    tags: Array.isArray(req.body.tags)
      ? req.body.tags.map((t) => normaliseText(t).toLowerCase()).filter(Boolean).slice(0, 10)
      : [],
    contactNumbers: Array.isArray(req.body.contactNumbers)
      ? req.body.contactNumbers
          .filter((c) => c && c.number)
          .map((c) => ({
            label: normaliseText(c.label || ''),
            number: normaliseText(c.number),
          }))
          .slice(0, 10)
      : [],
    externalUrl: normaliseText(req.body.externalUrl || ''),
    isPublished: req.body.isPublished !== false,
    isPinned: req.body.isPinned === true,
    createdBy: req.user._id,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_RESOURCE,
    req,
    targetType: 'Resource',
    targetId: resource._id,
    message: `Resource created: ${resource.title}`,
  });

  return created(res, { resource: commonView.resource(resource, { includeContent: true }) });
});

export const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw AppError.notFound('That resource was not found.');

  if (req.body.title !== undefined) resource.title = normaliseText(req.body.title);
  if (req.body.category !== undefined) resource.category = req.body.category;
  if (req.body.summary !== undefined) resource.summary = normaliseText(req.body.summary);
  if (req.body.content !== undefined) {
    resource.content = normaliseMultiline(req.body.content, 20000);
  }
  if (req.body.externalUrl !== undefined) {
    resource.externalUrl = normaliseText(req.body.externalUrl);
  }
  if (req.body.isPublished !== undefined) resource.isPublished = Boolean(req.body.isPublished);
  if (req.body.isPinned !== undefined) resource.isPinned = Boolean(req.body.isPinned);
  if (Array.isArray(req.body.tags)) {
    resource.tags = req.body.tags.map((t) => normaliseText(t).toLowerCase()).filter(Boolean).slice(0, 10);
  }
  if (Array.isArray(req.body.contactNumbers)) {
    resource.contactNumbers = req.body.contactNumbers
      .filter((c) => c && c.number)
      .map((c) => ({ label: normaliseText(c.label || ''), number: normaliseText(c.number) }))
      .slice(0, 10);
  }

  resource.updatedBy = req.user._id;
  await resource.save();

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_RESOURCE,
    req,
    targetType: 'Resource',
    targetId: resource._id,
    message: `Resource updated: ${resource.title}`,
  });

  return ok(res, { resource: commonView.resource(resource, { includeContent: true }) }, 'Saved.');
});

export const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findByIdAndDelete(req.params.id);
  if (!resource) throw AppError.notFound('That resource was not found.');

  await Bookmark.deleteMany({ targetType: 'resource', targetId: resource._id });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.ADMIN_RESOURCE,
    req,
    targetType: 'Resource',
    targetId: resource._id,
    severity: 'notice',
    message: `Resource deleted: ${resource.title}`,
  });

  return noContent(res);
});

const BOOKMARK_MODELS = { resource: Resource, incident: Incident };

export const addBookmark = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.body;

  const Model = BOOKMARK_MODELS[targetType];
  if (!Model) throw AppError.validation({ targetType: 'You can save resources and reports.' });

  const exists = await Model.exists({ _id: targetId });
  if (!exists) throw AppError.notFound('That item was not found.');

  try {
    const bookmark = await Bookmark.create({
      user: req.user._id,
      targetType,
      targetId,
      targetModel: targetType === 'resource' ? 'Resource' : 'Incident',
      note: normaliseText(req.body.note || ''),
    });

    if (targetType === 'resource') {
      await Resource.updateOne({ _id: targetId }, { $inc: { bookmarkCount: 1 } });
    }

    return created(res, { bookmark: commonView.bookmark(bookmark) }, 'Saved.');
  } catch (error) {

    if (error.code === 11000) {
      const existing = await Bookmark.findOne({ user: req.user._id, targetType, targetId });
      return ok(res, { bookmark: commonView.bookmark(existing) }, 'Already saved.');
    }
    throw error;
  }
});

export const listBookmarks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { user: req.user._id };
  if (req.query.type && BOOKMARK_MODELS[req.query.type]) filter.targetType = req.query.type;

  const [bookmarks, total] = await Promise.all([
    Bookmark.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    Bookmark.countDocuments(filter),
  ]);

  const resourceIds = bookmarks.filter((b) => b.targetType === 'resource').map((b) => b.targetId);
  const incidentIds = bookmarks.filter((b) => b.targetType === 'incident').map((b) => b.targetId);

  const [resources, incidents] = await Promise.all([
    resourceIds.length
      ? Resource.find({ _id: { $in: resourceIds } }).select('-content').lean()
      : [],
    incidentIds.length
      ? Incident.find({ _id: { $in: incidentIds } })
          .populate('reporter', 'name username avatar role')
          .lean()
      : [],
  ]);

  const byId = new Map();
  for (const doc of resources) byId.set(String(doc._id), commonView.resource(doc));
  for (const doc of incidents) byId.set(String(doc._id), incidentView.summary(doc, req.user));

  const items = bookmarks
    .map((b) => ({ ...commonView.bookmark(b), target: byId.get(String(b.targetId)) || null }))
    .filter((b) => b.target !== null);

  return ok(res, { bookmarks: items }, undefined, paginationMeta({ page, limit }, total));
});

export const removeBookmark = asyncHandler(async (req, res) => {

  const { targetType, targetId } = req.params;

  const bookmark = await Bookmark.findOneAndDelete({
    user: req.user._id,
    targetType,
    targetId,
  });
  if (!bookmark) throw AppError.notFound('That item is not in your saved list.');

  if (targetType === 'resource') {
    await Resource.updateOne(
      { _id: targetId, bookmarkCount: { $gt: 0 } },
      { $inc: { bookmarkCount: -1 } }
    );
  }

  return noContent(res);
});
