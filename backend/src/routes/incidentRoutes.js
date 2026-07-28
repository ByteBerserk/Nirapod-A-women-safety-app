import express from "express";
import {
  reportIncident,
  listIncidents,
  viewIncident,
} from "../controllers/incidentController.js";

const router = express.Router();

// POST /api/incidents
// Report a new safety incident
router.post("/", reportIncident);
router.get("/", listIncidents);
router.get("/:id", viewIncident);

export default router;