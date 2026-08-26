import express from 'express';
import * as controller from '../controllers/feedbackController.js';
import { protect, optionalAuth, restrictTo } from '../middleware/auth.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { FEEDBACK_TYPES, FEEDBACK_STATUS_VALUES, ROLES } from '../config/constants.js';

const router = express.Router();

/* FR-23 - a bug report should not require a working sign-in. */
router.post(
  '/',
  optionalAuth,
  limiter.write,
  validate({
    subject: { required: true, label: 'Subject', rules: [rules.string({ min: 5, max: 140 })] },
    message: { required: true, label: 'Message', rules: [rules.string({ min: 10, max: 4000 })] },
    type: { label: 'Type', rules: [rules.oneOf(FEEDBACK_TYPES)] },
    email: { label: 'Email', rules: [rules.email()] },
  }),
  controller.submitFeedback
);

router.get('/mine', protect, controller.listMyFeedback);

/* FR-25 */
router.get('/', protect, restrictTo(ROLES.ADMIN), controller.listAllFeedback);

router.patch(
  '/:id',
  protect,
  restrictTo(ROLES.ADMIN),
  validateObjectId(),
  validate({
    status: { label: 'Status', rules: [rules.oneOf(FEEDBACK_STATUS_VALUES)] },
    response: { label: 'Response', rules: [rules.string({ max: 2000 })] },
  }),
  controller.respondToFeedback
);

export default router;
