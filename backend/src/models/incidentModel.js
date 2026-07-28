import { randomUUID } from "crypto";
import { getDatabase } from "../config/database.js";

const INCIDENT_CATEGORIES = [
  "Harassment",
  "Theft",
  "Assault",
  "Domestic Violence",
  "Suspicious Person",
  "Other",
];

const createIncident = async (payload) => {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const description =
    typeof payload.description === "string"
      ? payload.description.trim()
      : "";
  const category =
    typeof payload.category === "string" ? payload.category.trim() : "";
  const location =
    typeof payload.location === "string" ? payload.location.trim() : "";
  const reportedBy = payload.reportedBy || null;

  if (!title || !description || !category || !location) {
    const error = new Error(
      "Title, description, category, and location are required."
    );
    error.statusCode = 400;
    throw error;
  }

  if (!INCIDENT_CATEGORIES.includes(category)) {
    const error = new Error("Invalid incident category.");
    error.statusCode = 400;
    throw error;
  }

  const incident = {
    id: randomUUID(),
    title,
    description,
    category,
    location,
    reportedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const database = getDatabase();

  await database.collection("incidents").insertOne(incident);

  return incident;
};

const getAllIncidents = async (category = "") => {
  const database = getDatabase();

  const query = {};

  if (category) {
    query.category = category;
  }

  return database
    .collection("incidents")
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
};

const getIncidentById = async (id) => {
  const database = getDatabase();

  return database.collection("incidents").findOne({ id });
};

export {
  createIncident,
  getAllIncidents,
  getIncidentById,
  INCIDENT_CATEGORIES,
};