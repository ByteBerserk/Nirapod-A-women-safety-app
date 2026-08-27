import express from "express";
import { createContact, listContacts, editContact, deleteContact } from "../controllers/emergencyController.js";

const router = express.Router();

// POST   /api/emergency/:userId        create contact
// GET    /api/emergency/:userId        list contacts
// PUT    /api/emergency/:userId/:contactId  update contact
// DELETE /api/emergency/:userId/:contactId  delete contact

router.post("/:userId", createContact);
router.get("/:userId", listContacts);
router.put("/:userId/:contactId", editContact);
router.delete("/:userId/:contactId", deleteContact);

export default router;
