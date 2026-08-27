import express from 'express';
import * as controller from '../controllers/contactController.js';
import { protect } from '../middleware/auth.js';
import { validate, validateObjectId, rules } from '../validators/validate.js';

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(controller.listContacts)
  .post(
    validate({
      name: { required: true, label: 'Name', rules: [rules.string({ min: 2, max: 80 })] },
      email: {
        required: true,
        label: 'Email',
        requiredMessage: 'An email address is required - that is how alerts are sent.',
        rules: [rules.email()],
      },
      phone: { label: 'Phone', rules: [rules.phone()] },
      relationship: { label: 'Relationship', rules: [rules.string({ max: 40 })] },
      priority: { label: 'Priority', rules: [rules.number({ min: 1, max: 10, integer: true })] },
    }),
    controller.createContact
  );

router
  .route('/:id')
  .patch(
    validateObjectId(),
    validate({
      name: { label: 'Name', rules: [rules.string({ min: 2, max: 80 })] },
      email: { label: 'Email', rules: [rules.email()] },
      phone: { label: 'Phone', rules: [rules.phone()] },
      priority: { label: 'Priority', rules: [rules.number({ min: 1, max: 10, integer: true })] },
    }),
    controller.updateContact
  )
  .delete(validateObjectId(), controller.deleteContact);

export default router;
