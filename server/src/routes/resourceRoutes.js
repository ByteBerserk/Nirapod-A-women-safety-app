import express from 'express';
import * as controller from '../controllers/resourceController.js';
import { protect, optionalAuth, restrictTo } from '../middleware/auth.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';
import { RESOURCE_CATEGORIES, BOOKMARK_TARGETS, ROLES } from '../config/constants.js';

const router = express.Router();

/* FR-22 - registered before "/:idOrSlug" so "bookmarks" is not read as a slug. */
router.get('/bookmarks', protect, controller.listBookmarks);

router.post(
  '/bookmarks',
  protect,
  validate({
    targetType: { required: true, label: 'Type', rules: [rules.oneOf(BOOKMARK_TARGETS)] },
    targetId: { required: true, label: 'Item', rules: [rules.objectId()] },
    note: { label: 'Note', rules: [rules.string({ max: 300 })] },
  }),
  controller.addBookmark
);

router.delete(
  '/bookmarks/:targetType/:targetId',
  protect,
  validateObjectId('targetId'),
  controller.removeBookmark
);

/* FR-21 - safety information is public; there is no reason to gate it. */
router.get('/', optionalAuth, controller.listResources);
router.get('/:idOrSlug', optionalAuth, controller.getResource);

/* FR-25 */
router.post(
  '/',
  protect,
  restrictTo(ROLES.ADMIN),
  validate({
    title: { required: true, label: 'Title', rules: [rules.string({ min: 5, max: 160 })] },
    category: { required: true, label: 'Category', rules: [rules.oneOf(RESOURCE_CATEGORIES)] },
    content: { required: true, label: 'Content', rules: [rules.string({ min: 30, max: 20000 })] },
    summary: { label: 'Summary', rules: [rules.string({ max: 300 })] },
    externalUrl: { label: 'Link', rules: [rules.url()] },
  }),
  controller.createResource
);

router.patch('/:id', protect, restrictTo(ROLES.ADMIN), validateObjectId(), controller.updateResource);
router.delete('/:id', protect, restrictTo(ROLES.ADMIN), validateObjectId(), controller.deleteResource);

export default router;
