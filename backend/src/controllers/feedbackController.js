import { createFeedbackReport, getFeedbackReports } from "../models/feedbackModel.js";

const submitFeedback = async (req, res, next) => {
    try {
        const report = await createFeedbackReport(req.body);
        res.status(201).json({
            message: "Feedback submitted successfully.",
            data: report
        });
    } catch (error) {
        next(error);
    }
};

const listFeedbackReports = async (req, res, next) => {
    try {
        const reports = await getFeedbackReports();
        res.json({
            message: "Feedback reports retrieved successfully.",
            data: reports
        });
    } catch (error) {
        next(error);
    }
};

export { listFeedbackReports, submitFeedback };