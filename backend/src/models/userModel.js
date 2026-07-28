import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");
const PHONE_REGEX = /^01\d{9}$/;
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

const createUser = async (payload) => {
  const fullName = normalizeText(payload.fullName);
  const email = normalizeText(payload.email).toLowerCase();
  const username = normalizeText(payload.username).toLowerCase();
  const password = normalizeText(payload.password);
  const phone = normalizeText(payload.phone);
  const bloodGroup = normalizeText(payload.bloodGroup);
  const gender = normalizeText(payload.gender);
  const job = normalizeText(payload.job);
  const medicalInfo = normalizeText(payload.medicalInfo);
  const address = normalizeText(payload.address);
  const profileImage = normalizeText(payload.profileImage);

  if (!fullName || !email || !username || !password || !phone || !bloodGroup || !gender || !job || !address || !profileImage) {
    const error = new Error("Please complete all required fields.");
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long.");
    error.statusCode = 400;
    throw error;
  }

  if (!GMAIL_REGEX.test(email)) {
    const error = new Error("Email must be a valid Gmail address ending with @gmail.com.");
    error.statusCode = 400;
    throw error;
  }

  if (!PHONE_REGEX.test(phone)) {
    const error = new Error("Phone number must be 11 digits and start with 01.");
    error.statusCode = 400;
    throw error;
  }

  const database = getDatabase();
  const existingUser = await database.collection("users").findOne({
    $or: [{ email }, { username }],
  });

  if (existingUser) {
    const error = new Error(
      existingUser.email === email
        ? "Email already exists."
        : "Username already exists."
    );
    error.statusCode = 409;
    throw error;
  }

  const user = {
    id: randomUUID(),
    fullName,
    email,
    username,
    password,
    phone,
    bloodGroup,
    gender,
    job,
    medicalInfo,
    address,
    profileImage,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await database.collection("users").insertOne(user);
  return user;
};

const findUserByCredentials = async (payload) => {
  const identifier = normalizeText(payload.identifier).toLowerCase();
  const password = normalizeText(payload.password);

  if (!identifier || !password) {
    const error = new Error("Identifier and password are required.");
    error.statusCode = 400;
    throw error;
  }

  const database = getDatabase();
  return database.collection("users").findOne({
    $or: [{ email: identifier }, { username: identifier }],
    password,
  });
};

const buildUserIdQuery = (id) => {
  const query = [{ id }];
  if (ObjectId.isValid(id)) {
    query.push({ _id: new ObjectId(id) });
  }
  return { $or: query };
};

const getUserById = async (id) => {
  const database = getDatabase();
  return database.collection("users").findOne(buildUserIdQuery(id));
};

const updateUserById = async (id, payload) => {
  const database = getDatabase();
  console.log("[DEBUG] updateUserById called", {
    id,
    typeofId: typeof id,
    isValidObjectId: ObjectId.isValid(id),
    query: buildUserIdQuery(id),
    payload,
  });
  const user = await database.collection("users").findOne(buildUserIdQuery(id));

  if (!user) {
    console.log("[DEBUG] updateUserById - no user found for query", buildUserIdQuery(id), { payload });
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const fullName = normalizeText(payload.fullName ?? user.fullName);
  const email = normalizeText(payload.email ?? user.email).toLowerCase();
  const username = normalizeText(payload.username ?? user.username).toLowerCase();
  const password = payload.password !== undefined ? normalizeText(payload.password) : user.password;
  const phone = normalizeText(payload.phone ?? user.phone);
  const bloodGroup = normalizeText(payload.bloodGroup ?? user.bloodGroup);
  const gender = normalizeText(payload.gender ?? user.gender);
  const job = normalizeText(payload.job ?? user.job);
  const medicalInfo = normalizeText(payload.medicalInfo ?? user.medicalInfo);
  const address = normalizeText(payload.address ?? user.address);
  const profileImage = payload.profileImage !== undefined ? normalizeText(payload.profileImage) : user.profileImage;

  if (!fullName || !email || !username || !phone || !bloodGroup || !gender || !job || !address) {
    const error = new Error("Please complete all required fields.");
    error.statusCode = 400;
    throw error;
  }

  if (payload.password !== undefined && password.length > 0 && password.length < 6) {
    const error = new Error("Password must be at least 6 characters long.");
    error.statusCode = 400;
    throw error;
  }

  if (!email.match(/^[^@\s]+@gmail\.com$/i)) {
    const error = new Error("Email must be a valid Gmail address.");
    error.statusCode = 400;
    throw error;
  }

  if (!phone.match(/^01\d{9}$/)) {
    const error = new Error("Phone number must be an 11-digit Bangladeshi number starting with 01.");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await database.collection("users").findOne({ $or: [{ email }, { username }] });

  if (existingUser) {
    const existingIsSame = (existingUser.id && existingUser.id === id) || (existingUser._id && String(existingUser._id) === String(id));
    if (!existingIsSame) {
      const error = new Error(
        existingUser.email === email
          ? "Email already exists."
          : "Username already exists."
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const updatedFields = {
    fullName,
    email,
    username,
    phone,
    bloodGroup,
    gender,
    job,
    medicalInfo,
    address,
    profileImage,
    updatedAt: new Date().toISOString(),
  };

  if (payload.password !== undefined && password.length > 0) {
    updatedFields.password = password;
  }

  const result = await database.collection("users").findOneAndUpdate(
    buildUserIdQuery(id),
    { $set: updatedFields },
    {
      returnDocument: "after",
    }
  );

  if (!result.value) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return result.value;
};

export { createUser, findUserByCredentials, getUserById, updateUserById };
