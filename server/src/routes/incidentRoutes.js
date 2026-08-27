import express from 'express';
import * as controller from '../controllers/incidentController.js';
import * as moderationController from '../controllers/moderationController.js';
import { protect, optionalAuth, restrictTo } from '../middleware/auth.js';
import { uploadIncidentMedia } from '../middleware/upload.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { INCIDENT_CATEGORY_VALUES, INCIDENT_SEVERITY, REACTION_TYPES, ROLES } from '../config/constants.js';

const router = express.Router();

router.get('/', optionalAuth, controller.listIncidents);
router.get('/map', optionalAuth, controller.getMapPins);

router.post(
  '/',
  protect,
  limiter.write,

  uploadIncidentMedia,
  validate({
    title: { required: true, label: 'Title', rules: [rules.string({ min: 5, max: 140 })] },
    description: {
      required: true,
      label: 'Description',
      rules: [rules.string({ min: 20, max: 5000 })],
    },
    category: { required: true, label: 'Category', rules: [rules.oneOf(INCIDENT_CATEGORY_VALUES)] },
    severity: { label: 'Severity', rules: [rules.oneOf(INCIDENT_SEVERITY)] },
    occurredAt: { label: 'Date and time', rules: [rules.date({ allowFuture: false })] },
  }),
  controller.createIncident
);

router.get('/:id', validateObjectId(), optionalAuth, controller.getIncident);

router.patch(
  '/:id',
  protect,
  validateObjectId(),
  validate({
    title: { label: 'Title', rules: [rules.string({ min: 5, max: 140 })] },
    description: { label: 'Description', rules: [rules.string({ min: 20, max: 5000 })] },
    category: { label: 'Category', rules: [rules.oneOf(INCIDENT_CATEGORY_VALUES)] },
    severity: { label: 'Severity', rules: [rules.oneOf(INCIDENT_SEVERITY)] },
  }),
  controller.updateIncident
);

router.delete('/:id', protect, validateObjectId(), controller.deleteIncident);

router.post(
  '/:id/react',
  protect,
  validateObjectId(),
  validate({ type: { required: true, label: 'Reaction', rules: [rules.oneOf(REACTION_TYPES)] } }),
  controller.reactToIncident
);

router.get('/:id/comments', validateObjectId(), optionalAuth, controller.listComments);

router.post(
  '/:id/comments',
  protect,
  validateObjectId(),
  limiter.write,
  validate({
    body: { required: true, label: 'Comment', rules: [rules.string({ min: 2, max: 1000 })] },
  }),
  controller.addComment
);

router.delete(
  '/:id/comments/:commentId',
  protect,
  validateObjectId('id', 'commentId'),
  controller.deleteComment
);

router.patch(
  '/:id/status',
  protect,
  restrictTo(ROLES.MODERATOR),
  validateObjectId(),
  moderationController.setIncidentStatus
);

export default router;
