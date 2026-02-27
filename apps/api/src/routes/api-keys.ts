import { createApiKeySchema, uuidParam } from "@stepiq/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
import {
  assertCanUseApi,
  isPlanValidationError,
} from "../services/plan-validator.js";
import { generateApiKey } from "../services/api-keys.js";

export const apiKeyRoutes = new Hono<{ Variables: Env }>();

apiKeyRoutes.use("*", requireAuth);

apiKeyRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  try {
    await assertCanUseApi(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return c.json(keys);
});

apiKeyRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  try {
    await assertCanUseApi(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { key, keyHash, keyPrefix } = generateApiKey();
  const scopes = parsed.data.scopes || [
    "pipelines:read",
    "pipelines:execute",
    "webhooks:trigger",
  ];

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId,
      keyHash,
      keyPrefix,
      name: parsed.data.name || null,
      scopes,
      expiresAt: parsed.data.expires_at
        ? new Date(parsed.data.expires_at)
        : null,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });

  return c.json({ ...created, key }, 201);
});

apiKeyRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  try {
    await assertCanUseApi(userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const idParsed = uuidParam.safeParse(c.req.param("id"));
  if (!idParsed.success) return c.json({ error: "Invalid key ID format" }, 400);

  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, idParsed.data), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  if (!deleted) return c.json({ error: "API key not found" }, 404);
  return c.json({ deleted: true });
});
