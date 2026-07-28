import { getSafetyResources, getSafetyResourcesByCategory } from "../models/safetyResourceModel.js";

const listSafetyResources = async (req, res, next) => {
    try {
        const resources = await getSafetyResources();
        res.json({
            message: "Safety resources retrieved successfully.",
            data: resources
        });
    } catch (error) {
        next(error);
    }
};

const listSafetyResourcesByCategory = async (req, res, next) => {
    try {
        const resources = await getSafetyResourcesByCategory(req.params.category);

        res.json({
            message: "Safety resources retrieved successfully.",
            data: resources
        });
    } catch (error) {
        next(error);
    }
};

export { listSafetyResources, listSafetyResourcesByCategory };