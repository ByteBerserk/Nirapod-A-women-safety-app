import { Router } from "express";
import multer from "multer";
import { getUserProfile, updateUserProfile } from "../controllers/profileController.js";

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, "uploads"),
	filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

const router = Router();

router.get("/:id", getUserProfile);
// Support both PUT /api/profile/:id and PUT /api/profile with id in JSON body
router.put("/:id", upload.single("profileImage"), updateUserProfile);
router.put("/", upload.single("profileImage"), updateUserProfile);

export default router;
