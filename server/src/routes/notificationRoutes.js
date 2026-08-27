import express from 'express';
import * as controller from '../controllers/feedbackController.js';
import { protect } from '../middleware/auth.js';
import { validateObjectId } from '../validators/validate.js';

const router = express.Router();

router.use(protect);

router.get('/', controller.listNotifications);
router.patch('/read-all', controller.markAllNotificationsRead);
router.patch('/:id/read', validateObjectId(), controller.markNotificationRead);
router.delete('/:id', validateObjectId(), controller.deleteNotification);

export default router;
