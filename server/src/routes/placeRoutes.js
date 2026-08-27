import express from 'express';
import * as controller from '../controllers/placeController.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { SAFE_PLACE_TYPES, LIMITS } from '../config/constants.js';

const router = express.Router();

/**
 * FR-18: finding the nearest police station should not require an account.
 * Somebody in trouble on a borrowed phone still gets an answer.
 */
router.get('/nearby', optionalAuth, limiter.externalGeo, controller.findNearby);
router.get('/nearby/all', optionalAuth, limiter.externalGeo, controller.findAllNearby);
router.get('/search', optionalAuth, limiter.externalGeo, controller.searchPlaces);
router.get('/reverse', optionalAuth, limiter.externalGeo, controller.reverseGeocode);

router.use(protect);

/* FR-19 */
router
  .route('/safe-places')
  .get(controller.listSafePlaces)
  .post(
    validate({
      label: { required: true, label: 'Name', rules: [rules.string({ min: 2, max: 60 })] },
      type: { label: 'Type', rules: [rules.oneOf(SAFE_PLACE_TYPES)] },
      radiusMeters: {
        label: 'Radius',
        rules: [
          rules.number({
            min: LIMITS.SAFE_PLACE_MIN_RADIUS_M,
            max: LIMITS.SAFE_PLACE_MAX_RADIUS_M,
          }),
        ],
      },
    }),
    controller.createSafePlace
  );

/* FR-20 - registered before "/safe-places/:id" so "check" is not read as an id. */
router.post('/safe-places/check', limiter.locationPing, controller.checkLocation);
router.get('/safe-places/events', controller.listSafePlaceEvents);

router
  .route('/safe-places/:id')
  .patch(
    validateObjectId(),
    validate({
      label: { label: 'Name', rules: [rules.string({ min: 2, max: 60 })] },
      type: { label: 'Type', rules: [rules.oneOf(SAFE_PLACE_TYPES)] },
      radiusMeters: {
        label: 'Radius',
        rules: [
          rules.number({
            min: LIMITS.SAFE_PLACE_MIN_RADIUS_M,
            max: LIMITS.SAFE_PLACE_MAX_RADIUS_M,
          }),
        ],
      },
    }),
    controller.updateSafePlace
  )
  .delete(validateObjectId(), controller.deleteSafePlace);

export default router;
