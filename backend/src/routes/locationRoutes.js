import { Router } from "express";

import {
    saveLocation,
    listLocations
}
from "../controllers/locationController.js";

const router = Router();

router.post("/", saveLocation);

router.get("/:groupId", listLocations);

export default router;