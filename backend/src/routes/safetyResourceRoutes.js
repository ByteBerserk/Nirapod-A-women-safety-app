import { Router } from "express";
import { listSafetyResources, listSafetyResourcesByCategory } from "../controllers/safetyResourceController.js";

const router = Router();

router.get("/", listSafetyResources);
router.get("/category/:category", listSafetyResourcesByCategory);

export default router;