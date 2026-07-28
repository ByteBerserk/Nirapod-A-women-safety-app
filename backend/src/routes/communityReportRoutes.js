import { Router } from "express";
import {
    getReports,
    createReport,
    reactToReport,
    flagReport
} from "../controllers/communityReportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.get('/', getReports);
router.post('/', protect, createReport);
router.post('/:reportId/react', protect, reactToReport);
router.post('/:reportId/flag', protect, flagReport);

export default router;