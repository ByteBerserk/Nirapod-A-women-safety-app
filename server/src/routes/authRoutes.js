import express from 'express';
import * as controller from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, rules } from '../validators/validate.js';

const router = express.Router();

router.post(
  '/register',
  limiter.auth,
  validate({
    name: { required: true, label: 'Name', rules: [rules.string({ min: 2, max: 80 })] },
    username: { required: true, label: 'Username', rules: [rules.username()] },
    email: { required: true, label: 'Email', rules: [rules.email()] },
    password: { required: true, label: 'Password', rules: [rules.password()] },
    phone: { rules: [rules.phone()] },
  }),
  controller.register
);

router.post(
  '/login',
  limiter.auth,
  validate({
    identifier: { required: true, label: 'Email or username', requiredMessage: 'Enter your email address or username.' },
    password: { required: true, label: 'Password' },
  }),
  controller.login
);

router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

router.post(
  '/forgot-password',
  limiter.passwordReset,
  validate({ email: { required: true, label: 'Email', rules: [rules.email()] } }),
  controller.forgotPassword
);

router.post(
  '/reset-password',
  limiter.passwordReset,
  validate({
    token: { required: true, label: 'Reset token' },
    password: { required: true, label: 'New password', rules: [rules.password()] },
  }),
  controller.resetPassword
);

router.use(protect);

router.get('/me', controller.me);
router.post('/logout-all', controller.logoutAll);

router.patch(
  '/change-password',
  validate({
    currentPassword: { required: true, label: 'Current password' },
    newPassword: { required: true, label: 'New password', rules: [rules.password()] },
  }),
  controller.changePassword
);

export default router;
