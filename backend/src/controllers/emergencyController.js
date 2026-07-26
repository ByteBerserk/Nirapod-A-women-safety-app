import { addContact, getContactsForUser, updateContact, removeContact } from "../models/emergencyContactModel.js";

const createContact = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const contact = await addContact(userId, req.body);
    res.status(201).json({ contact });
  } catch (err) {
    next(err);
  }
};

const listContacts = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const contacts = await getContactsForUser(userId);
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
};

const editContact = async (req, res, next) => {
  try {
    const { userId, contactId } = req.params;
    const updated = await updateContact(userId, contactId, req.body);
    res.json({ contact: updated });
  } catch (err) {
    next(err);
  }
};

const deleteContact = async (req, res, next) => {
  try {
    const { userId, contactId } = req.params;
    await removeContact(userId, contactId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export { createContact, listContacts, editContact, deleteContact };
