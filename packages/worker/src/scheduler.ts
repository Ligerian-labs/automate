import type IORedis from "ioredis";
import { Queue } from "bullmq";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { lte, eq, and } from "drizzle-orm";
import { parseExpression } from "cron-parser";
import { schedules, runs, pipelines } from "./db-schema.js";

const dbUrl = process.env.DATABASE_URL || "postgres://automate:automate@localhost:5432/automate";
const client = postgres(dbUrl);
const db = drizzle(client);

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const LOCK_KEY = "automate:cron-scheduler-lock";
const LOCK_TTL_MS = 25_000;

export function startScheduler(connection: IORedis) {
  const queue = new Queue("pipeline-runs", { connection });

  async function tick() {
    // Acquire distributed lock
    const acquired = await connection.set(LOCK_KEY, "1", "PX", LOCK_TTL_MS, "NX");
    if (!acquired) return; // another instance has the lock

    try {
      const now = new Date();
      const dueSchedules = await db
        .select()
        .from(schedules)
        .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)))
        .limit(50);

      for (const schedule of dueSchedules) {
        // Get pipeline owner
        const [pipeline] = await db
          .select()
          .from(pipelines)
          .where(eq(pipelines.id, schedule.pipelineId))
          .limit(1);

        if (!pipeline) continue;

        // Create run
        const [run] = await db
          .insert(runs)
          .values({
            pipelineId: schedule.pipelineId,
            pipelineVersion: pipeline.version,
            userId: pipeline.userId,
            triggerType: "cron",
            status: "pending",
            inputData: schedule.inputData as Record<string, unknown>,
          })
          .returning();

        // Enqueue
        await queue.add("execute", { runId: run.id }, {
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        });

        // Update next run time
        const nextRun = parseExpression(schedule.cronExpression, {
          tz: schedule.timezone,
        }).next().toDate();

        await db
          .update(schedules)
          .set({ nextRunAt: nextRun, lastRunAt: now })
          .where(eq(schedules.id, schedule.id));

        console.log(`⏰ Scheduled run for pipeline ${schedule.pipelineId}, next: ${nextRun.toISOString()}`);
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    } finally {
      await connection.del(LOCK_KEY);
    }
  }

  // Run on interval
  setInterval(tick, POLL_INTERVAL_MS);
  tick(); // Run immediately on start

  console.log("⏰ Cron scheduler started (polling every 30s)");
}
