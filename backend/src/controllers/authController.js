import { createUser, findUserByCredentials } from "../models/userModel.js";

const registerUser = async (req, res, next) => {
  try {
    req.body = req.body || {};
    if (req.file) req.body.profileImage = `/uploads/${req.file.filename}`;
    const user = await createUser(req.body);
    res.status(201).json({
      message: "Account created successfully.",
      user,
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const user = await findUserByCredentials(req.body);

    if (!user) {
      const error = new Error("Invalid username/email or password.");
      error.statusCode = 401;
      throw error;
    }

    res.json({
      message: "Login successful.",
      user,
    });
  } catch (error) {
    next(error);
  }
};

export { loginUser, registerUser };
