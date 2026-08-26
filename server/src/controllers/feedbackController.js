import Feedback from '../models/Feedback.js';
import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent, paginationMeta } from '../utils/apiResponse.js';
import * as commonView from '../views/commonView.js';
import * as mailService from '../services/mailService.js';
import * as notificationService from '../services/notificationService.js';
import * as templates from '../views/emails/templates.js';
import { getPagination } from '../utils/query.js';
import { normaliseText, normaliseMultiline, normaliseEmail } from '../utils/sanitize.js';
import { FEEDBACK_STATUS, FEEDBACK_TYPES } from '../config/constants.js';

/** FR-23, plus the in-app notification feed. */

export const submitFeedback = asyncHandler(async (req, res) => {
  // Signed-in submissions always use the account's address, so a reply cannot
  // be misdirected by a typo in the form.
  const email = req.user ? req.user.email : normaliseEmail(req.body.email);
  if (!email) throw AppError.validation({ email: 'We need an email address to reply to you.' });

  const feedback = await Feedback.create({
    user: req.user?._id || null,
    email,
    type: FEEDBACK_TYPES.includes(req.body.type) ? req.body.type : 'suggestion',
    subject: normaliseText(req.body.subject),
    message: normaliseMultiline(req.body.message, 4000),
    appVersion: normaliseText(req.body.appVersion || ''),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
  });

  mailService
    .enqueue({
      kind: 'feedback-ack',
      to: email,
      toName: req.user?.name || '',
      priority: 8,
      relatedUser: req.user?._id || null,
      ...templates.feedbackAck({
        name: req.user?.name || '',
        subject: feedback.subject,
        type: feedback.type,
      }),
    })
    .catch(() => {});

  return created(
    res,
    { feedback: commonView.feedback(feedback) },
    'Thank you. We have logged your message and will get back to you.'
  );
});

export const listMyFeedback = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const [items, total] = await Promise.all([
    Feedback.find({ user: req.user._id }).sort('-createdAt').skip(skip).limit(limit).lean(),
    Feedback.countDocuments({ user: req.user._id }),
  ]);

  return ok(
    res,
    { feedback: items.map((doc) => commonView.feedback(doc)) },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

/* ---------------------------------------------------------- FR-25: triage --- */

export const listAllFeedback = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const [items, total, newCount] = await Promise.all([
    Feedback.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatar role')
      .lean(),
    Feedback.countDocuments(filter),
    Feedback.countDocuments({ status: FEEDBACK_STATUS.NEW }),
  ]);

  return ok(
    res,
    { feedback: items.map((doc) => commonView.feedback(doc, { forAdmin: true })), newCount },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const respondToFeedback = asyncHandler(async (req, res) => {
  const feedback = await Feedback.findById(req.params.id);
  if (!feedback) throw AppError.notFound('That message was not found.');

  if (req.body.status && Object.values(FEEDBACK_STATUS).includes(req.body.status)) {
    feedback.status = req.body.status;
  }

  if (req.body.response) {
    feedback.adminResponse = normaliseMultiline(req.body.response, 2000);
    feedback.respondedBy = req.user._id;
    feedback.respondedAt = new Date();

    // Only registered submitters get an in-app notification; anonymous ones
    // are answered by email outside the app.
    if (feedback.user) {
      notificationService
        .notify({
          user: feedback.user,
          type: 'feedback',
          title: 'We replied to your message',
          body: feedback.subject,
          link: '/feedback',
          data: { feedbackId: String(feedback._id) },
        })
        .catch(() => {});
    }
  }

  await feedback.save();
  return ok(
    res,
    { feedback: commonView.feedback(feedback, { forAdmin: true }) },
    'Feedback updated.'
  );
});

/* -------------------------------------------------- in-app notifications --- */

export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 25);

  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.isRead = false;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.unreadCount(req.user._id),
  ]);

  return ok(
    res,
    { notifications: items.map(commonView.notification), unreadCount: unread },
    undefined,
    paginationMeta({ page, limit }, total)
  );
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) throw AppError.notFound('That notification was not found.');

  return ok(res, { notification: commonView.notification(notification) });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return ok(res, { updated: result.modifiedCount }, 'All notifications marked as read.');
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const deleted = await Notification.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!deleted) throw AppError.notFound('That notification was not found.');
  return noContent(res);
});
