import express from 'express';
import * as controller from '../controllers/userController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { GENDERS, BLOOD_GROUPS, ROLES } from '../config/constants.js';

const router = express.Router();

router.use(protect);

/* FR-1 */
router.get('/profile', controller.getProfile);

router.patch(
  '/profile',
  validate({
    name: { label: 'Name', rules: [rules.string({ min: 2, max: 80 })] },
    username: { label: 'Username', rules: [rules.username()] },
    phone: { label: 'Phone', rules: [rules.phone()] },
    gender: { label: 'Gender', rules: [rules.oneOf(GENDERS)] },
    bloodGroup: { label: 'Blood group', rules: [rules.oneOf(BLOOD_GROUPS)] },
    medicalInfo: { label: 'Medical information', rules: [rules.string({ max: 1000 })] },
    dateOfBirth: { label: 'Date of birth', rules: [rules.date({ allowFuture: false })] },
  }),
  controller.updateProfile
);

router.patch('/profile/avatar', limiter.upload, uploadAvatar, controller.updateAvatar);
router.patch('/preferences', controller.updatePreferences);

router.post(
  '/deactivate',
  validate({ password: { required: true, label: 'Password' } }),
  controller.deactivateAccount
);

/* Used when inviting people to a safety group. */
router.get('/search', controller.searchUsers);
router.get('/:id', validateObjectId(), controller.getPublicProfile);

/* FR-25 */
router.get('/', restrictTo(ROLES.MODERATOR), controller.listUsers);

export default router;
