import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";

const normalizeText = (v) => (typeof v === "string" ? v.trim() : "");
const GMAIL_REGEX = /^[^@\s]+@gmail\.com$/i;

const addContact = async (userId, payload) => {
  const name = normalizeText(payload.name);
  const phone = normalizeText(payload.phone);
  const email = normalizeText(payload.email).toLowerCase();

  if (!name || !phone || !email) {
    const err = new Error("Name, phone and email are required.");
    err.statusCode = 400;
    throw err;
  }

  if (!GMAIL_REGEX.test(email)) {
    const err = new Error("Email must be a valid Gmail address.");
    err.statusCode = 400;
    throw err;
  }

  const db = getDatabase();
  const contact = {
    id: randomUUID(),
    userId,
    name,
    phone,
    email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection("emergencyContacts").insertOne(contact);
  return contact;
};

const getContactsForUser = async (userId) => {
  const db = getDatabase();
  return db.collection("emergencyContacts").find({ userId }).sort({ createdAt: -1 }).toArray();
};

const updateContact = async (userId, contactId, payload) => {
  const db = getDatabase();
  const query = { userId, $or: [{ id: contactId }] };
  if (ObjectId.isValid(contactId)) {
    query.$or.push({ _id: new ObjectId(contactId) });
  }
  const contact = await db.collection("emergencyContacts").findOne(query);
  if (!contact) {
    const err = new Error("Contact not found.");
    err.statusCode = 404;
    throw err;
  }

  const name = payload.name !== undefined ? normalizeText(payload.name) : contact.name;
  const phone = payload.phone !== undefined ? normalizeText(payload.phone) : contact.phone;
  const email = payload.email !== undefined ? normalizeText(payload.email).toLowerCase() : contact.email;

  if (!name || !phone || !email) {
    const err = new Error("Name, phone and email are required.");
    err.statusCode = 400;
    throw err;
  }

  if (!GMAIL_REGEX.test(email)) {
    const err = new Error("Email must be a valid Gmail address.");
    err.statusCode = 400;
    throw err;
  }

  const result = await db.collection("emergencyContacts").findOneAndUpdate(
    { id: contactId, userId },
    { $set: { name, phone, email, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" }
  );

  return result.value;
};

const removeContact = async (userId, contactId) => {
  const db = getDatabase();
  const query = { userId, $or: [{ id: contactId }] };
  if (ObjectId.isValid(contactId)) {
    query.$or.push({ _id: new ObjectId(contactId) });
  }
  const result = await db.collection("emergencyContacts").findOneAndDelete(query);
  if (!result.value) {
    const err = new Error("Contact not found.");
    err.statusCode = 404;
    throw err;
  }
  return true;
};

export { addContact, getContactsForUser, updateContact, removeContact };
