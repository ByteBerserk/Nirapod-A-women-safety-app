import express from "express";
import cors from "cors";
import path from "path";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import safetyResourceRoutes from "./routes/safetyResourceRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
import communityReportRoutes from "./routes/communityReportRoutes.js";
>>>>>>> promitDev

=======
import messageRoutes from "./routes/messageRoutes.js";
>>>>>>> feature/group-messaging-location
=======
import incidentRoutes from "./routes/incidentRoutes.js";

>>>>>>> SamiDev
const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));
<<<<<<< HEAD
<<<<<<< HEAD
=======
app.use("/api/messages", messageRoutes);
>>>>>>> feature/group-messaging-location
=======
>>>>>>> SamiDev
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Serve frontend static files from the sibling `frontend` folder so the app
// can be opened from the backend server (no separate static server needed).
const frontendDir = path.join(process.cwd(), "..", "frontend");
app.use(express.static(frontendDir));
app.get(["/", "/index.html"], (req, res) => {
	res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/dashboard.html", (req, res) => {
	res.sendFile(path.join(frontendDir, "dashboard.html"));
});

app.get(["/dashboard", "/dashboard/dashboard.html"], (req, res) => {
	res.redirect(301, "/dashboard.html");
});

app.get("/health", (req, res) => {
	res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/safety-resources", safetyResourceRoutes);
app.use("/api/emergency", emergencyRoutes);
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

=======
app.use('/api/community-reports', communityReportRoutes);
>>>>>>> promitDev
=======

>>>>>>> feature/group-messaging-location
=======
app.use("/api/incidents", incidentRoutes);

>>>>>>> SamiDev
app.use((error, req, res, next) => {
	if (error.type === "entity.too.large" || error.status === 413) {
		return res.status(413).json({
			message: "Payload too large. Please upload a smaller profile picture."
		});
	}

	const statusCode = error.statusCode || 500;
	const message = error.message || "Internal Server Error";

	res.status(statusCode).json({
		message
	});
});

export default app;
