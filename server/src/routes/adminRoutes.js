import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as moderationController from '../controllers/moderationController.js';
import * as userController from '../controllers/userController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { ROLES, ROLE_VALUES, ACCOUNT_STATUS_VALUES, CONTENT_REPORT_REASONS, REPORTABLE_TYPES } from '../config/constants.js';

const router = express.Router();

router.use(protect);

/* ------------------------------------------------------------- FR-12 ------ */
/* Reporting content is something any member does, so it sits outside the
   moderator gate below. */
router.post(
  '/reports',
  validate({
    targetType: { required: true, label: 'Type', rules: [rules.oneOf(REPORTABLE_TYPES)] },
    targetId: { required: true, label: 'Item', rules: [rules.objectId()] },
    reason: { required: true, label: 'Reason', rules: [rules.oneOf(CONTENT_REPORT_REASONS)] },
    details: { label: 'Details', rules: [rules.string({ max: 1000 })] },
  }),
  moderationController.reportContent
);

/* ------------------------------------------------- FR-13: moderators up --- */
router.use(restrictTo(ROLES.MODERATOR));

router.get('/reports', moderationController.listReports);
router.get('/reports/:id', validateObjectId(), moderationController.getReportDetail);
router.patch('/reports/:id/resolve', validateObjectId(), moderationController.resolveReport);

router.get('/users', userController.listUsers);
router.get('/users/:id', validateObjectId(), adminController.getUserDetail);

router.patch(
  '/users/:id/status',
  validateObjectId(),
  validate({
    status: { required: true, label: 'Status', rules: [rules.oneOf(ACCOUNT_STATUS_VALUES)] },
    reason: { label: 'Reason', rules: [rules.string({ max: 500 })] },
    days: { label: 'Days', rules: [rules.number({ min: 1, max: 365, integer: true })] },
  }),
  adminController.setUserStatus
);

/* ------------------------------------------------- FR-24: admins only ----- */
router.use(restrictTo(ROLES.ADMIN));

router.get('/dashboard', adminController.getDashboard);
router.get('/analytics/categories', adminController.getCategoryBreakdown);
router.get('/analytics/trends', adminController.getTrends);
router.get('/analytics/hotspots', adminController.getHotspots);

router.patch(
  '/users/:id/role',
  validateObjectId(),
  validate({ role: { required: true, label: 'Role', rules: [rules.oneOf(ROLE_VALUES)] } }),
  adminController.setUserRole
);

/* NFR-15 */
router.get('/audit-logs', adminController.listAuditLogs);

/* NFR-12 */
router.get('/mail-queue', adminController.getMailQueueStatus);
router.post('/mail-queue/retry', adminController.retryFailedMail);

export default router;
