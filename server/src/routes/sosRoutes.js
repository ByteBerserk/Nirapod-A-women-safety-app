import express from 'express';
import * as controller from '../controllers/sosController.js';
import { protect } from '../middleware/auth.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { SOS_TRIGGERS } from '../config/constants.js';

const router = express.Router();

router.get('/track/:token', controller.getTrackingByToken);

router.use(protect);

router.post(
  '/',
  limiter.sos,
  validate({
    message: { label: 'Message', rules: [rules.string({ max: 500 })] },
    trigger: { label: 'Trigger', rules: [rules.oneOf(SOS_TRIGGERS)] },
  }),
  controller.activateSos
);

router.get('/active', controller.getActiveSos);
router.get('/history', controller.listSosHistory);

router.get('/:id', validateObjectId(), controller.getSosDetail);
router.get('/:id/alert-status', validateObjectId(), controller.getAlertStatus);

router.patch('/:id/location', limiter.locationPing, validateObjectId(), controller.updateLocation);
router.patch('/:id/resolve', validateObjectId(), controller.resolveSos);
router.patch('/:id/revoke-tracking', validateObjectId(), controller.revokeTracking);
router.post('/:id/resend', validateObjectId(), controller.resendAlerts);

export default router;
