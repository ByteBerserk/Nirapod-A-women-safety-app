import CommunityReport from "../models/communityReportModel.js";

export const getReports = async (req, res) => {
    try {
        const reports = await CommunityReport.find({ status: { $ne: 'removed' } })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reports });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createReport = async (req, res) => {
    try {
        const { title, description, location } = req.body;
        const userId = req.user?.id || req.user?._id || req.body.userId;

        const report = await CommunityReport.create({
            user: userId,
            title,
            description,
            location
        });
        res.status(201).json({ success: true, data: report });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const reactToReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { type } = req.body; // 'helpful' | 'important' | 'support'
        const userId = req.user?.id || req.user?._id || req.body.userId;

        if (!['helpful', 'important', 'support'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid reaction type.' });
        }

        const report = await CommunityReport.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }

        const reactionArray = report.reactions[type];
        const index = reactionArray.indexOf(userId);

        if (index > -1) {
            reactionArray.splice(index, 1);
        } else {
            reactionArray.push(userId);
        }

        await report.save();
        res.status(200).json({
            success: true,
            reactions: {
                helpful: report.reactions.helpful.length,
                important: report.reactions.important.length,
                support: report.reactions.support.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const flagReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { reason, details } = req.body;
        const reporterId = req.user?._id;

        if (!['fake', 'offensive', 'spam', 'abusive'].includes(reason)) {
            return res.status(400).json({ success: false, message: 'Invalid report reason.' });
        }

        const report = await CommunityReport.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }

        const alreadyFlagged = report.flags.some(
            (flag) => String(flag.reporter) === String(reporterId)
        );

        if (alreadyFlagged) {
            return res.status(400).json({ success: false, message: 'You have already reported this content.' });
        }

        report.flags.push({ reporter: reporterId, reason, details });

        if (report.flags.length >= 3) {
            report.status = 'under_review';
        }

        await report.save();
        res.status(200).json({
            success: true,
            message: 'Content reported successfully. Sent to moderators for review.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};