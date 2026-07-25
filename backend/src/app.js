import express from "express";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import safetyResourceRoutes from "./routes/safetyResourceRoutes.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
	res.json({ status: "ok" });
});

app.use("/api/feedback", feedbackRoutes);
app.use("/api/safety-resources", safetyResourceRoutes);

app.use((error, req, res, next) => {
	const statusCode = error.statusCode || 500;
	const message = error.message || "Internal Server Error";

	res.status(statusCode).json({
		message
	});
});

export default app;
