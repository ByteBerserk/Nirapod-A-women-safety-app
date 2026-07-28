import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);




const fallbackMongoUrl = "mongodb://127.0.0.1:27017/nirapod";
const mongoUrl = process.env.MONGODB_URL?.trim() || fallbackMongoUrl;

let client;
let database;

const connectDB = async () => {
    if (database) {
        return database;
    }

    client = new MongoClient(mongoUrl, {
        serverSelectionTimeoutMS: 5000
    });
    await client.connect();
    database = client.db();
    await database.command({ ping: 1 });

<<<<<<< HEAD
=======
    await mongoose.connect(mongoUrl, {
        autoIndex: true
    });

>>>>>>> promitDev
    console.log(`Connected to MongoDB at ${mongoUrl}`);
    return database;
};

const getDatabase = () => {
    if (!database) {
        throw new Error("MongoDB is not connected. Call connectDB() before using the database.");
    }

    return database;
};

const closeDatabase = async () => {
    if (client) {
        await client.close();
        client = undefined;
        database = undefined;
    }
};

export default connectDB;
export { closeDatabase, getDatabase };