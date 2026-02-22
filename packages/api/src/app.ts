import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { runRoutes } from "./routes/runs.js";
import { scheduleRoutes } from "./routes/schedules.js";
import { modelRoutes } from "./routes/models.js";
import { userRoutes } from "./routes/user.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { Env } from "./lib/env.js";

export const app = new Hono<{ Variables: Env }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:4321",
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

// Routes
app.route("/api/auth", authRoutes);
app.route("/api/pipelines", pipelineRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/schedules", scheduleRoutes);
app.route("/api/models", modelRoutes);
app.route("/api/user", userRoutes);
app.route("/api/webhooks", webhookRoutes);

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});
