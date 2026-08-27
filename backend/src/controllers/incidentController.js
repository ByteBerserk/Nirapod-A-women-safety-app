import {
  createIncident,
  getAllIncidents,
  getIncidentById,
} from "../models/incidentModel.js";

const listIncidents = async (req, res, next) => {
  try {
    const { category } = req.query;

    const incidents = await getAllIncidents(category);

    res.json({
      incidents,
    });
  } catch (err) {
    next(err);
  }
};

const viewIncident = async (req, res, next) => {
  try {
    const { id } = req.params;

    const incident = await getIncidentById(id);

    if (!incident) {
      const error = new Error("Incident not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({
      incident,
    });
  } catch (err) {
    next(err);
  }
};

const reportIncident = async (req, res, next) => {
  try {
    const { title, description, category, location, reportedBy } = req.body;

    const incident = await createIncident({
      title,
      description,
      category,
      location,
      reportedBy,
    });

    res.status(201).json({
      message: "Incident reported successfully.",
      incident,
    });
  } catch (err) {
    next(err);
  }
};

export {
  reportIncident,
  listIncidents,
  viewIncident,
};