import express from 'express';
import * as controller from '../controllers/checkInController.js';
import { protect } from '../middleware/auth.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { CHECKIN_STATUS_VALUES, LIMITS } from '../config/constants.js';

const router = express.Router();

/** FR-26: safety check-in. Everything here is about the caller's own timer. */
router.use(protect);

router
  .route('/')
  .get(
    validate({
      status: { label: 'Status', rules: [rules.oneOf(CHECKIN_STATUS_VALUES)] },
    }),
    controller.listCheckIns
  )
  .post(
    validate({
      label: {
        required: true,
        label: 'Name',
        requiredMessage: 'Say what this check-in is for, so your contacts have context.',
        rules: [rules.string({ min: 2, max: 120 })],
      },
      minutes: {
        required: true,
        label: 'Minutes',
        requiredMessage: 'Choose how long the timer should run for.',
        rules: [
          rules.number({
            min: LIMITS.CHECKIN_MIN_MINUTES,
            max: LIMITS.CHECKIN_MAX_MINUTES,
            integer: true,
          }),
        ],
      },
      graceMinutes: {
        label: 'Grace period',
        rules: [
          rules.number({
            min: LIMITS.CHECKIN_MIN_GRACE_MINUTES,
            max: LIMITS.CHECKIN_MAX_GRACE_MINUTES,
            integer: true,
          }),
        ],
      },
      note: { label: 'Note', rules: [rules.string({ max: 500 })] },
    }),
    controller.startCheckIn
  );

/* Before /:id, or "active" is read as an id. */
router.get('/active', controller.getActiveCheckIn);

router.get('/:id', validateObjectId(), controller.getCheckIn);

router.patch(
  '/:id/safe',
  validateObjectId(),
  validate({ note: { label: 'Note', rules: [rules.string({ max: 500 })] } }),
  controller.confirmSafe
);

router.patch(
  '/:id/extend',
  validateObjectId(),
  validate({
    minutes: {
      label: 'Minutes',
      rules: [
        rules.number({
          min: LIMITS.CHECKIN_MIN_MINUTES,
          max: LIMITS.CHECKIN_MAX_MINUTES,
          integer: true,
        }),
      ],
    },
  }),
  controller.extendCheckIn
);

router.patch('/:id/cancel', validateObjectId(), controller.cancelCheckIn);

export default router;
