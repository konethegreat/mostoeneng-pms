import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import cycleRoutes from "./routes/cycles.js";
import reviewRoutes from "./routes/reviews.js";
import feedbackRoutes from "./routes/feedback.js";
import dashboardRoutes from "./routes/dashboard.js";
import aiRoutes from "./routes/ai.js";
import notificationRoutes from "./routes/notifications.js";
import widgetRoutes from "./routes/widgets.js";
import activityRoutes from "./routes/activity.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "mostoeneng-pms", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cycles", cycleRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/widgets", widgetRoutes);
app.use("/api/activity", activityRoutes);

// Fallthrough error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

// Defence-in-depth: never let a stray async rejection take down the API.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Demo Legal PMS API listening on http://localhost:${PORT}`));
