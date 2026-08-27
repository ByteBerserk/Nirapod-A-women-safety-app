import { randomUUID } from "crypto";
import { getDatabase } from "../config/database.js";

const createMessage = async (payload) => {
    const { groupId, senderId, message } = payload;

    if (!groupId || !senderId || !message?.trim()) {
        const error = new Error("Group ID, sender ID and message are required.");
        error.statusCode = 400;
        throw error;
    }

    const database = getDatabase();

    const newMessage = {
        id: randomUUID(),
        groupId,
        senderId,
        message: message.trim(),
        createdAt: new Date().toISOString()
    };

    await database.collection("messages").insertOne(newMessage);

    return newMessage;
};

const getMessagesByGroup = async (groupId) => {
    const database = getDatabase();

    return database
        .collection("messages")
        .find({ groupId })
        .sort({ createdAt: 1 })
        .toArray();
};

export {
    createMessage,
    getMessagesByGroup
};