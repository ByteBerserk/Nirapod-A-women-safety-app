import { randomUUID } from "crypto";
import { getDatabase } from "../config/database.js";

const shareLocation = async (payload) => {

    const database = getDatabase();

    const location = {
        id: randomUUID(),
        userId: payload.userId,
        groupId: payload.groupId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        createdAt: new Date().toISOString()
    };

    await database
        .collection("locations")
        .insertOne(location);

    return location;
};

const getGroupLocations = async (groupId) => {

    const database = getDatabase();

    return database
        .collection("locations")
        .find({ groupId })
        .sort({ createdAt: -1 })
        .toArray();
};

export {
    shareLocation,
    getGroupLocations
};