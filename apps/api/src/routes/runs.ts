import { listRunsQuery, uuidParam } from "@stepiq/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index.js";
import { pipelines, runs, stepExecutions } from "../db/schema.js";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
import {
  assertCanTriggerRun,
  isPlanValidationError,
} from "../services/plan-validator.js";
import { enqueueRun } from "../services/queue.js";

export const runRoutes = new Hono<{ Variables: Env }>();

runRoutes.use("*", requireAuth);

// List runs
runRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const queryParsed = listRunsQuery.safeParse({
    pipeline_id: c.req.query("pipeline_id"),
    status: c.req.query("status"),
    limit: c.req.query("limit"),
  });
  if (!queryParsed.success)
    return c.json({ error: queryParsed.error.flatten() }, 400);

  const { pipeline_id, status, limit } = queryParsed.data;

  const whereClauses = [eq(runs.userId, userId)];
  if (pipeline_id) whereClauses.push(eq(runs.pipelineId, pipeline_id));
  if (status) whereClauses.push(eq(runs.status, status));

  const where =
    whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses);
  const result = await db.select().from(runs).where(where).limit(limit);
  return c.json(result);
});

// Get run details
runRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const idParsed = uuidParam.safeParse(c.req.param("id"));
  if (!idParsed.success) return c.json({ error: "Invalid run ID" }, 400);

  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, idParsed.data), eq(runs.userId, userId)))
    .limit(1);

  if (!run) return c.json({ error: "Not found" }, 404);

  const steps = await db
    .select()
    .from(stepExecutions)
    .where(eq(stepExecutions.runId, idParsed.data))
    .orderBy(stepExecutions.stepIndex);

  return c.json({ ...run, steps });
});

// Cancel a run
runRoutes.post("/:id/cancel", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const idParsed = uuidParam.safeParse(c.req.param("id"));
  if (!idParsed.success) return c.json({ error: "Invalid run ID" }, 400);

  const [result] = await db
    .update(runs)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(runs.id, idParsed.data),
        eq(runs.userId, userId),
        eq(runs.status, "running"),
      ),
    )
    .returning({ id: runs.id });

  if (!result)
    return c.json({ error: "Run not found or not cancellable" }, 404);
  return c.json({ cancelled: true });
});

// Retry a run by creating and enqueuing a new run
runRoutes.post("/:id/retry", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const idParsed = uuidParam.safeParse(c.req.param("id"));
  if (!idParsed.success) return c.json({ error: "Invalid run ID" }, 400);

  const [sourceRun] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, idParsed.data), eq(runs.userId, userId)))
    .limit(1);
  if (!sourceRun) return c.json({ error: "Run not found" }, 404);

  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(
      and(
        eq(pipelines.id, sourceRun.pipelineId),
        eq(pipelines.userId, userId),
        eq(pipelines.status, "active"),
      ),
    )
    .limit(1);
  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  try {
    await assertCanTriggerRun(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const [newRun] = await db
    .insert(runs)
    .values({
      pipelineId: sourceRun.pipelineId,
      pipelineVersion: sourceRun.pipelineVersion,
      userId,
      triggerType: "retry",
      status: "pending",
      inputData: sourceRun.inputData ?? {},
    })
    .returning();

  await enqueueRun(newRun.id);
  return c.json(newRun, 202);
});

// SSE stream for real-time updates
runRoutes.get("/:id/stream", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const idParsed = uuidParam.safeParse(c.req.param("id"));
  if (!idParsed.success) return c.json({ error: "Invalid run ID" }, 400);

  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.id, idParsed.data), eq(runs.userId, userId)))
    .limit(1);

  if (!run) return c.json({ error: "Not found" }, 404);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ type: "connected", run_id: idParsed.data }),
      event: "connected",
    });
  });
});
