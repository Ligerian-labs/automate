import { createScheduleSchema, uuidParam } from "@stepiq/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { pipelines, schedules } from "../db/schema.js";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
import {
  assertCanUseCron,
  isPlanValidationError,
} from "../services/plan-validator.js";
import { createScheduleForPipeline } from "../services/schedule-create.js";

export const scheduleRoutes = new Hono<{ Variables: Env }>();

scheduleRoutes.use("*", requireAuth);

// List schedules for a pipeline
scheduleRoutes.get("/pipelines/:id/schedules", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const _pidRaw = c.req.param("id");
  const _pidParsed = uuidParam.safeParse(_pidRaw);
  if (!_pidParsed.success)
    return c.json({ error: "Invalid pipeline ID format" }, 400);
  const pipelineId = _pidParsed.data;
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

  const _pidRaw = c.req.param("id");
  const _pidParsed = uuidParam.safeParse(_pidRaw);
  if (!_pidParsed.success)
    return c.json({ error: "Invalid pipeline ID format" }, 400);
  const pipelineId = _pidParsed.data;
  const body = await c.req.json();
  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    await assertCanUseCron(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const result = await createScheduleForPipeline(
    userId,
    pipelineId,
    parsed.data,
  );
  if (result.error) {
    if (result.error === "Pipeline not found")
      return c.json({ error: result.error }, 404);
    return c.json({ error: result.error }, 400);
  }

  return c.json(result.schedule, 201);
});

// Enable/disable schedule
scheduleRoutes.post("/:id/enable", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const _idRaw = c.req.param("id");
  const _idParsed = uuidParam.safeParse(_idRaw);
  if (!_idParsed.success) return c.json({ error: "Invalid ID format" }, 400);
  const id = _idParsed.data;
  const [ownedSchedule] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(pipelines, eq(schedules.pipelineId, pipelines.id))
    .where(and(eq(schedules.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!ownedSchedule) return c.json({ error: "Not found" }, 404);

  try {
    await assertCanUseCron(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

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

  const _idRaw = c.req.param("id");
  const _idParsed = uuidParam.safeParse(_idRaw);
  if (!_idParsed.success) return c.json({ error: "Invalid ID format" }, 400);
  const id = _idParsed.data;
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

  const _idRaw = c.req.param("id");
  const _idParsed = uuidParam.safeParse(_idRaw);
  if (!_idParsed.success) return c.json({ error: "Invalid ID format" }, 400);
  const id = _idParsed.data;
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
