import express from 'express';
import * as controller from '../controllers/groupController.js';
import { protect } from '../middleware/auth.js';
import * as limiter from '../middleware/rateLimiter.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { GROUP_ROLE_VALUES } from '../config/constants.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(controller.listGroups)
  .post(
    validate({
      name: { required: true, label: 'Group name', rules: [rules.string({ min: 3, max: 80 })] },
      description: { label: 'Description', rules: [rules.string({ max: 500 })] },
    }),
    controller.createGroup
  );

router.get('/invite/:id/:code', validateObjectId(), controller.previewInvite);
router.post('/invite/:id/:code', validateObjectId(), controller.respondToInvite);

router
  .route('/:id')
  .get(validateObjectId(), controller.getGroup)
  .patch(
    validateObjectId(),
    validate({
      name: { label: 'Group name', rules: [rules.string({ min: 3, max: 80 })] },
      description: { label: 'Description', rules: [rules.string({ max: 500 })] },
    }),
    controller.updateGroup
  )
  .delete(validateObjectId(), controller.deleteGroup);

router.post(
  '/:id/invites',
  validateObjectId(),
  validate({
    email: { label: 'Email', rules: [rules.email()] },
    username: { label: 'Username', rules: [rules.username()] },
  }),
  controller.inviteMember
);
router.delete('/:id/invites/:inviteId', validateObjectId('id', 'inviteId'), controller.revokeInvite);

router.post('/:id/leave', validateObjectId(), controller.leaveGroup);
router.delete('/:id/members/:userId', validateObjectId('id', 'userId'), controller.removeMember);

router.patch(
  '/:id/members/:userId/role',
  validateObjectId('id', 'userId'),
  validate({ role: { required: true, label: 'Role', rules: [rules.oneOf(GROUP_ROLE_VALUES)] } }),
  controller.setMemberRole
);

router.get('/:id/messages', validateObjectId(), controller.listMessages);
router.post(
  '/:id/messages',
  validateObjectId(),
  limiter.write,
  validate({
    body: { required: true, label: 'Message', rules: [rules.string({ min: 1, max: 2000 })] },
  }),
  controller.sendMessage
);

router.post('/:id/location', validateObjectId(), limiter.locationPing, controller.shareLocation);
router.delete('/:id/location', validateObjectId(), controller.stopSharingLocation);
router.get('/:id/locations', validateObjectId(), controller.getGroupLocations);

router.patch('/:id/mute', validateObjectId(), controller.muteGroup);

export default router;
