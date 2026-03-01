import {
  PLAN_LIMITS,
  type ModelProvider,
  type PipelineDefinition,
  type Plan,
  providerSecretNames,
  providersForPipeline,
} from "@stepiq/core";
import { Queue } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Redis as IORedis } from "ioredis";
import postgres from "postgres";
import { pipelines, runs, schedules, userSecrets, users } from "./db-scheduler.js";

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

  function addBillingInterval(date: Date, interval: string): Date {
    const next = new Date(date);
    if (interval === "year") {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    }
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  function isMissingPipelineIdColumnError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /(?:no such column|column .* does not exist).*pipeline_id/i.test(
      error.message,
    );
  }

  async function missingProviderKeys(
    userId: string,
    pipelineId: string,
    requiredProviders: ModelProvider[],
  ): Promise<ModelProvider[]> {
    if (requiredProviders.length === 0) return [];

    const candidateNames = Array.from(
      new Set(
        requiredProviders.flatMap((provider) => providerSecretNames(provider)),
      ),
    );
    let secrets: Array<{ name: string; pipelineId: string | null }> = [];
    try {
      secrets = await db
        .select({
          name: userSecrets.name,
          pipelineId: userSecrets.pipelineId,
        })
        .from(userSecrets)
        .where(
          and(
            eq(userSecrets.userId, userId),
            inArray(userSecrets.name, candidateNames),
          ),
        );
    } catch (error) {
      if (!isMissingPipelineIdColumnError(error)) throw error;
      const legacySecrets = await db
        .select({ name: userSecrets.name })
        .from(userSecrets)
        .where(
          and(
            eq(userSecrets.userId, userId),
            inArray(userSecrets.name, candidateNames),
          ),
        );
      secrets = legacySecrets.map((item) => ({ ...item, pipelineId: null }));
    }

    return requiredProviders.filter((provider) => {
      const names = providerSecretNames(provider);
      return !secrets.some(
        (secret) =>
          names.includes(secret.name) &&
          (secret.pipelineId === pipelineId || secret.pipelineId == null),
      );
    });
  }

  async function resolveFundingModeForCronRun(
    user: { id: string; plan: string; creditsRemaining: number },
    pipelineId: string,
    definition: PipelineDefinition,
  ): Promise<"legacy" | "app_credits" | "byok_required" | "blocked"> {
    const plan = (user.plan in PLAN_LIMITS ? user.plan : "free") as Plan;
    if (plan === "starter" || plan === "pro") {
      if (user.creditsRemaining > 0) return "app_credits";
      const missing = await missingProviderKeys(
        user.id,
        pipelineId,
        providersForPipeline(definition),
      );
      return missing.length > 0 ? "blocked" : "byok_required";
    }
    if (plan === "free" && user.creditsRemaining <= 0) {
      return "blocked";
    }
    return "legacy";
  }

  async function refreshExpiredPaidCredits(now: Date) {
    const dueUsers = await db
      .select({
        id: users.id,
        plan: users.plan,
        stripeBillingInterval: users.stripeBillingInterval,
        stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
      })
      .from(users)
      .where(
        and(
          inArray(users.plan, ["starter", "pro"]),
          inArray(users.stripeSubscriptionStatus, ["active", "trialing"]),
          lte(users.stripeCurrentPeriodEnd, now),
        ),
      )
      .limit(200);

    for (const user of dueUsers) {
      if (!user.stripeCurrentPeriodEnd) continue;
      if (
        user.stripeBillingInterval !== "month" &&
        user.stripeBillingInterval !== "year"
      ) {
        continue;
      }
      const plan = user.plan === "pro" ? "pro" : "starter";
      let nextPeriodEnd = new Date(user.stripeCurrentPeriodEnd);
      while (nextPeriodEnd <= now) {
        nextPeriodEnd = addBillingInterval(
          nextPeriodEnd,
          user.stripeBillingInterval,
        );
      }

      await db
        .update(users)
        .set({
          creditsRemaining: PLAN_LIMITS[plan].credits,
          stripeCurrentPeriodEnd: nextPeriodEnd,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));
    }
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
      await refreshExpiredPaidCredits(now);
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
          .select({
            id: users.id,
            plan: users.plan,
            creditsRemaining: users.creditsRemaining,
          })
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

        const fundingMode = await resolveFundingModeForCronRun(
          user,
          pipeline.id,
          pipeline.definition as PipelineDefinition,
        );
        if (fundingMode === "blocked") {
          await db
            .update(schedules)
            .set({ nextRunAt: nextRun })
            .where(eq(schedules.id, schedule.id));
          continue;
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
            fundingMode,
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
