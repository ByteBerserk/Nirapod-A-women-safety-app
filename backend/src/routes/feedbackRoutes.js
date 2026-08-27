import { Router } from "express";
import { listFeedbackReports, submitFeedback } from "../controllers/feedbackController.js";

const router = Router();

router.post("/", submitFeedback);
router.get("/", listFeedbackReports);

export default router;