import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { schedules, pipelines } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { createScheduleSchema } from "@automate/shared";
import { getNextCronTick } from "../services/cron.js";
import type { Env } from "../lib/env.js";

export const scheduleRoutes = new Hono<{ Variables: Env }>();

scheduleRoutes.use("*", requireAuth);

// List schedules for a pipeline
scheduleRoutes.get("/pipelines/:id/schedules", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const pipelineId = c.req.param("id");
  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.userId, userId)))
    .limit(1);

  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  const result = await db
    .select()
    .from(schedules)
    .where(eq(schedules.pipelineId, pipelineId));
  return c.json(result);
});

// Create schedule
scheduleRoutes.post("/pipelines/:id/schedules", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const pipelineId = c.req.param("id");
  const body = await c.req.json();
  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // Verify pipeline ownership
  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.userId, userId)))
    .limit(1);

  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  let nextRun: Date;
  try {
    nextRun = getNextCronTick(parsed.data.cron_expression, parsed.data.timezone);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Invalid schedule";
    return c.json({ error }, 400);
  }

  const [schedule] = await db
    .insert(schedules)
    .values({
      pipelineId,
      cronExpression: parsed.data.cron_expression,
      timezone: parsed.data.timezone || "UTC",
      inputData: parsed.data.input_data || {},
      enabled: parsed.data.enabled ?? true,
      nextRunAt: nextRun,
    })
    .returning();

  return c.json(schedule, 201);
});

// Enable/disable schedule
scheduleRoutes.post("/:id/enable", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [ownedSchedule] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(pipelines, eq(schedules.pipelineId, pipelines.id))
    .where(and(eq(schedules.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!ownedSchedule) return c.json({ error: "Not found" }, 404);

  const [result] = await db
    .update(schedules)
    .set({ enabled: true })
    .where(eq(schedules.id, id))
    .returning();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

scheduleRoutes.post("/:id/disable", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [ownedSchedule] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(pipelines, eq(schedules.pipelineId, pipelines.id))
    .where(and(eq(schedules.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!ownedSchedule) return c.json({ error: "Not found" }, 404);

  const [result] = await db
    .update(schedules)
    .set({ enabled: false })
    .where(eq(schedules.id, id))
    .returning();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Delete schedule
scheduleRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [ownedSchedule] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(pipelines, eq(schedules.pipelineId, pipelines.id))
    .where(and(eq(schedules.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!ownedSchedule) return c.json({ error: "Not found" }, 404);

  const [result] = await db
    .delete(schedules)
    .where(eq(schedules.id, id))
    .returning({ id: schedules.id });
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true });
});
