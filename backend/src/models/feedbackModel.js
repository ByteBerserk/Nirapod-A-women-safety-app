import { randomUUID } from "crypto";
import { getDatabase } from "../config/database.js";

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const createFeedbackReport = async (payload) => {
    const type = normalizeText(payload.type).toLowerCase();
    const title = normalizeText(payload.title);
    const message = normalizeText(payload.message);

    if (!type || !title || !message) {
        const error = new Error("Type, title, and message are required.");
        error.statusCode = 400;
        throw error;
    }

    const report = {
        id: randomUUID(),
        type,
        title,
        message,
        reporterName: normalizeText(payload.reporterName),
        reporterEmail: normalizeText(payload.reporterEmail),
        reporterPhone: normalizeText(payload.reporterPhone),
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const database = getDatabase();
    await database.collection("feedback_reports").insertOne(report);

    return report;
};

const getFeedbackReports = async () => {
    const database = getDatabase();
    return database.collection("feedback_reports").find({}).sort({ createdAt: -1 }).toArray();
};

export { createFeedbackReport, getFeedbackReports };