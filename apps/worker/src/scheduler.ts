import { Queue } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { PLAN_LIMITS, type Plan } from "@stepiq/core";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Redis as IORedis } from "ioredis";
import postgres from "postgres";
import { pipelines, runs, schedules, users } from "./db-scheduler.js";

const dbUrl =
  process.env.DATABASE_URL || "postgres://stepiq:stepiq@localhost:5432/stepiq";
const client = postgres(dbUrl);
const db = drizzle(client);

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const LOCK_KEY = "stepiq:cron-scheduler-lock";
const LOCK_TTL_MS = 25_000;

export function startScheduler(connection: IORedis) {
  const queue = new Queue("pipeline-runs", { connection });

  function getUtcDayWindow(date = new Date()): { start: Date; end: Date } {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  function getPlanLimits(planRaw: string | null | undefined) {
    const plan = (planRaw && planRaw in PLAN_LIMITS ? planRaw : "free") as Plan;
    return PLAN_LIMITS[plan];
  }

  async function tick() {
    const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    // Acquire distributed lock
    const acquired = await connection.set(
      LOCK_KEY,
      lockToken,
      "PX",
      LOCK_TTL_MS,
      "NX",
    );
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

        const [user] = await db
          .select({ id: users.id, plan: users.plan })
          .from(users)
          .where(eq(users.id, pipeline.userId))
          .limit(1);
        if (!user) continue;

        const limits = getPlanLimits(user.plan);
        const nextRun = CronExpressionParser.parse(schedule.cronExpression, {
          tz: schedule.timezone,
        })
          .next()
          .toDate();

        if (!limits.cron_enabled) {
          await db
            .update(schedules)
            .set({ nextRunAt: nextRun })
            .where(eq(schedules.id, schedule.id));
          continue;
        }

        if (limits.max_runs_per_day >= 0) {
          const { start, end } = getUtcDayWindow(now);
          const runsToday = await db
            .select({ id: runs.id })
            .from(runs)
            .where(
              and(
                eq(runs.userId, pipeline.userId),
                gte(runs.createdAt, start),
                lte(runs.createdAt, end),
              ),
            );

          if (runsToday.length >= limits.max_runs_per_day) {
            await db
              .update(schedules)
              .set({ nextRunAt: nextRun })
              .where(eq(schedules.id, schedule.id));
            continue;
          }
        }

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
        await queue.add(
          "execute",
          { runId: run.id },
          {
            attempts: 1,
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );

        // Update next run time
        await db
          .update(schedules)
          .set({ nextRunAt: nextRun, lastRunAt: now })
          .where(eq(schedules.id, schedule.id));

        console.log(
          `⏰ Scheduled run for pipeline ${schedule.pipelineId}, next: ${nextRun.toISOString()}`,
        );
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    } finally {
      await connection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        LOCK_KEY,
        lockToken,
      );
    }
  }

  // Run on interval
  setInterval(tick, POLL_INTERVAL_MS);
  tick(); // Run immediately on start

  console.log("⏰ Cron scheduler started (polling every 30s)");
}
