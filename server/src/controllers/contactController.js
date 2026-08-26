import EmergencyContact from '../models/EmergencyContact.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/apiResponse.js';
import * as commonView from '../views/commonView.js';
import * as auditService from '../services/auditService.js';
import { AUDIT_ACTIONS, LIMITS } from '../config/constants.js';
import { normaliseText, normaliseEmail, normalisePhone } from '../utils/sanitize.js';

/** FR-5: add and remove the trusted people who receive SOS mail. */

export const listContacts = asyncHandler(async (req, res) => {
  const contacts = await EmergencyContact.find({ owner: req.user._id })
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  return ok(res, {
    contacts: contacts.map(commonView.contact),
    // The dashboard uses this to nag when the SOS button has nobody to alert.
    activeCount: contacts.filter((c) => c.isActive).length,
    limit: LIMITS.MAX_EMERGENCY_CONTACTS,
  });
});

export const createContact = asyncHandler(async (req, res) => {
  const count = await EmergencyContact.countDocuments({ owner: req.user._id });
  if (count >= LIMITS.MAX_EMERGENCY_CONTACTS) {
    throw AppError.badRequest(
      `You can have up to ${LIMITS.MAX_EMERGENCY_CONTACTS} emergency contacts. ` +
        'Remove one before adding another.',
      { code: 'CONTACT_LIMIT' }
    );
  }

  const email = normaliseEmail(req.body.email);

  // Alerting yourself helps nobody, and it would double every SOS email.
  if (email === req.user.email) {
    throw AppError.validation({
      email: 'This is your own address. Add someone who can come and help you.',
    });
  }

  const contact = await EmergencyContact.create({
    owner: req.user._id,
    name: normaliseText(req.body.name),
    email,
    phone: normalisePhone(req.body.phone || ''),
    relationship: normaliseText(req.body.relationship || ''),
    priority: Number(req.body.priority) || 1,
  });

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CONTACT_ADD,
    req,
    targetType: 'EmergencyContact',
    targetId: contact._id,
    message: `Emergency contact added: ${contact.name}`,
  });

  return created(res, { contact: commonView.contact(contact) }, `${contact.name} has been added.`);
});

export const updateContact = asyncHandler(async (req, res) => {
  // Scoping the query by owner is what stops one user editing another's
  // contacts, rather than fetching first and comparing afterwards.
  const contact = await EmergencyContact.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!contact) throw AppError.notFound('That contact was not found.');

  if (req.body.name !== undefined) contact.name = normaliseText(req.body.name);
  if (req.body.phone !== undefined) contact.phone = normalisePhone(req.body.phone);
  if (req.body.relationship !== undefined) {
    contact.relationship = normaliseText(req.body.relationship);
  }
  if (req.body.priority !== undefined) contact.priority = Number(req.body.priority) || 1;
  if (req.body.isActive !== undefined) contact.isActive = Boolean(req.body.isActive);

  if (req.body.email !== undefined) {
    const email = normaliseEmail(req.body.email);
    if (email !== contact.email) {
      if (email === req.user.email) {
        throw AppError.validation({ email: 'This is your own address.' });
      }
      const clash = await EmergencyContact.exists({
        owner: req.user._id,
        email,
        _id: { $ne: contact._id },
      });
      if (clash) {
        throw AppError.validation({ email: 'Another of your contacts already uses that address.' });
      }
      contact.email = email;
    }
  }

  await contact.save();
  return ok(res, { contact: commonView.contact(contact) }, 'Contact updated.');
});

export const deleteContact = asyncHandler(async (req, res) => {
  const contact = await EmergencyContact.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!contact) throw AppError.notFound('That contact was not found.');

  auditService.recordAsync({
    action: AUDIT_ACTIONS.CONTACT_REMOVE,
    req,
    targetType: 'EmergencyContact',
    targetId: contact._id,
    message: `Emergency contact removed: ${contact.name}`,
  });

  return noContent(res);
});
