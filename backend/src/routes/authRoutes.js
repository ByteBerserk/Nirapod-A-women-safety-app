import { Router } from "express";
import multer from "multer";
import { loginUser, registerUser } from "../controllers/authController.js";

// store uploads in the backend/uploads folder (already served by app)
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, "uploads"),
	filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

const router = Router();

router.post("/signup", upload.single("profileImage"), registerUser);
router.post("/login", loginUser);

export default router;
