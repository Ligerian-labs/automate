import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { runs, stepExecutions, pipelines } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { runPipelineSchema } from "@automate/shared";
import { enqueueRun } from "../services/queue.js";
import type { Env } from "../lib/env.js";

export const runRoutes = new Hono<{ Variables: Env }>();

runRoutes.use("*", requireAuth);

// Trigger a pipeline run
runRoutes.post("/pipelines/:id/run", async (c) => {
  const userId = c.get("userId")!;
  const pipelineId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = runPipelineSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.userId, userId)))
    .limit(1);

  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  const [run] = await db
    .insert(runs)
    .values({
      pipelineId,
      pipelineVersion: pipeline.version,
      userId,
      triggerType: "manual",
      status: "pending",
      inputData: parsed.data.input_data || {},
    })
    .returning();

  // Enqueue for worker processing
  await enqueueRun(run.id);

  return c.json(run, 202);
});

// List runs
runRoutes.get("/", async (c) => {
  const userId = c.get("userId")!;
  const pipelineId = c.req.query("pipeline_id");
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);

  let query = db.select().from(runs).where(eq(runs.userId, userId)).limit(limit);
  // Additional filters would go here
  const result = await query;
  return c.json(result);
});

// Get run details
runRoutes.get("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");

  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.userId, userId)))
    .limit(1);

  if (!run) return c.json({ error: "Not found" }, 404);

  const steps = await db
    .select()
    .from(stepExecutions)
    .where(eq(stepExecutions.runId, id))
    .orderBy(stepExecutions.stepIndex);

  return c.json({ ...run, steps });
});

// Cancel a run
runRoutes.post("/:id/cancel", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");

  const [result] = await db
    .update(runs)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.userId, userId), eq(runs.status, "running")))
    .returning({ id: runs.id });

  if (!result) return c.json({ error: "Run not found or not cancellable" }, 404);
  return c.json({ cancelled: true });
});

// SSE stream for real-time updates
runRoutes.get("/:id/stream", async (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    // TODO: Subscribe to Redis pub/sub for run updates
    await stream.writeSSE({ data: JSON.stringify({ type: "connected", run_id: id }), event: "connected" });
  });
});
