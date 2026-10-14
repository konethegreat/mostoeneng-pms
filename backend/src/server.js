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
import widgetRoutes, { externalWidgetsEnabled } from "./routes/widgets.js";
import activityRoutes from "./routes/activity.js";
import { aiEnabled } from "./lib/ai/client.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use(morgan("dev"));

// Reports which outbound integrations are switched on (never keys or models).
app.get("/api/health", (_req, res) => res.json({
  ok: true, service: "mostoeneng-pms", time: new Date().toISOString(),
  aiEnabled: aiEnabled(), externalWidgets: externalWidgetsEnabled(),
}));

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

// Fallthrough error handler (database error text stays out of production responses)
app.use((err, _req, res, _next) => {
  // express.json() reports malformed or oversized bodies as client errors.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.expose ? err.message : "Bad request" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error", ...(process.env.NODE_ENV === "production" ? {} : { detail: err.message }) });
});

// Defence-in-depth: never let a stray async rejection take down the API.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const PORT = process.env.PORT || 4000;
// HOST is optional; the disposable demo binds 127.0.0.1 so the API stays local.
const HOST = process.env.HOST || undefined;
app.listen(...(HOST ? [PORT, HOST] : [PORT]), () =>
  console.log(`Demo Legal PMS API listening on http://${HOST || "localhost"}:${PORT}`));
