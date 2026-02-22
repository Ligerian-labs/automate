import { Worker } from "bullmq";
import IORedis from "ioredis";
import { executePipeline } from "./executor.js";
import { startScheduler } from "./scheduler.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

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

// Start cron scheduler
startScheduler(connection);

console.log("🏭 Automate Worker started");
