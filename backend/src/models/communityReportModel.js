import mongoose from "mongoose";

const communityReportSchema = new mongoose.Schema(
    {
        user: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        location: {
            type: String
        },
        reactions: {
            helpful: [{ type: String }],
            important: [{ type: String }],
            support: [{ type: String }]
        },
        flags: [
            {
                reporter: { type: String },
                reason: {
                    type: String,
                    enum: ["fake", "offensive", "spam", "abusive"],
                    required: true
                },
                details: { type: String, default: "" },
                reportedAt: { type: Date, default: Date.now }
            }
        ],
        status: {
            type: String,
            enum: ["active", "under_review", "removed"],
            default: "active"
        }
    },
    { timestamps: true }
);

if (mongoose.models.CommunityReport) {
    delete mongoose.models.CommunityReport;
}
const CommunityReport = mongoose.model("CommunityReport", communityReportSchema);

export default CommunityReport;