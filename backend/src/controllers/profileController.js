import { getUserById, updateUserById } from "../models/userModel.js";

const getUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

const updateUserProfile = async (req, res, next) => {
  try {
    const id = req.params.id || req.body.id;
    if (!id) {
      const error = new Error("User id is required to update profile.");
      error.statusCode = 400;
      throw error;
    }

    if (req.file) {
      req.body.profileImage = `/uploads/${req.file.filename}`;
    }
    const user = await updateUserById(id, req.body);
    res.json({ message: "Profile updated successfully.", user });
  } catch (error) {
    next(error);
  }
};

export { getUserProfile, updateUserProfile };