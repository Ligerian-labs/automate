import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { pipelines, pipelineVersions } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { createPipelineSchema, updatePipelineSchema } from "@automate/shared";
import type { Env } from "../lib/env.js";

export const pipelineRoutes = new Hono<{ Variables: Env }>();

pipelineRoutes.use("*", requireAuth);

// List pipelines
pipelineRoutes.get("/", async (c) => {
  const userId = c.get("userId")!;
  const result = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.userId, userId), eq(pipelines.status, "active")))
    .orderBy(pipelines.updatedAt);
  return c.json(result);
});

// Create pipeline
pipelineRoutes.post("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json();
  const parsed = createPipelineSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { name, description, definition, tags } = parsed.data;

  const [pipeline] = await db
    .insert(pipelines)
    .values({
      userId,
      name,
      description,
      definition,
      tags: tags || [],
      status: "active",
    })
    .returning();

  // Create initial version
  await db.insert(pipelineVersions).values({
    pipelineId: pipeline.id,
    version: 1,
    definition,
  });

  return c.json(pipeline, 201);
});

// Get pipeline
pipelineRoutes.get("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");

  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!pipeline) return c.json({ error: "Not found" }, 404);
  return c.json(pipeline);
});

// Update pipeline
pipelineRoutes.put("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updatePipelineSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [existing] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: "Not found" }, 404);

  const newVersion = existing.version + 1;
  const updates: Record<string, unknown> = {
    ...parsed.data,
    version: newVersion,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(pipelines)
    .set(updates)
    .where(eq(pipelines.id, id))
    .returning();

  // Save version snapshot
  if (parsed.data.definition) {
    await db.insert(pipelineVersions).values({
      pipelineId: id,
      version: newVersion,
      definition: parsed.data.definition,
    });
  }

  return c.json(updated);
});

// Delete (archive) pipeline
pipelineRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");

  const [result] = await db
    .update(pipelines)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(pipelines.id, id), eq(pipelines.userId, userId)))
    .returning({ id: pipelines.id });

  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json({ deleted: true });
});

// Validate pipeline definition
pipelineRoutes.post("/validate", async (c) => {
  const body = await c.req.json();
  const parsed = createPipelineSchema.safeParse(body);
  if (!parsed.success) return c.json({ valid: false, errors: parsed.error.flatten() });
  return c.json({ valid: true });
});
