import {
    shareLocation,
    getGroupLocations
}
from "../models/locationModel.js";

const saveLocation =
async (req, res, next) => {

    try {

        const location =
        await shareLocation(req.body);

        res.status(201).json({
            message:
            "Location shared successfully",
            data: location
        });

    } catch (error) {
        next(error);
    }
};

const listLocations =
async (req, res, next) => {

    try {

        const locations =
        await getGroupLocations(
            req.params.groupId
        );

        res.json({
            data: locations
        });

    } catch (error) {
        next(error);
    }
};

export {
    saveLocation,
    listLocations
};