import { Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { serve } from "bun";
import { executePipeline } from "./executor.js";
import { startScheduler } from "./scheduler.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

console.log("🔌 Connecting to Redis...");
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

connection.on("connect", () => console.log("✅ Redis connected"));
connection.on("error", (err) => console.error("❌ Redis error:", err.message));

// Pipeline execution worker
const worker = new Worker(
  "pipeline-runs",
  async (job) => {
    const { runId } = job.data;
    console.log(`⚡ Executing run ${runId}`);
    await executePipeline(runId);
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Run ${job.data.runId} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Run ${job?.data.runId} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("❌ Worker error:", err.message);
});

// Start cron scheduler
startScheduler(connection);

// Health check server
const healthPort = Number(process.env.HEALTH_PORT) || 3002;
serve({
  port: healthPort,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      const status = worker.isRunning() ? "ok" : "not_running";
      const redisStatus = connection.status;
      return new Response(
        JSON.stringify({ status, redis: redisStatus, queue: "pipeline-runs" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`🏭 Stepiq Worker started (health: http://0.0.0.0:${healthPort}/health)`);
