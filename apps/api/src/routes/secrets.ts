import {
  createKmsProvider,
  createSecretSchema,
  encryptSecret,
  secretNameParam,
  updateSecretSchema,
  uuidParam,
} from "@stepiq/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { userSecrets } from "../db/schema.js";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";

export const secretRoutes = new Hono<{ Variables: Env }>();

secretRoutes.use("*", requireAuth);

// Lazy-init KMS to avoid crash if not configured
let kmsProvider: ReturnType<typeof createKmsProvider> | null = null;
function getKms() {
  if (!kmsProvider) kmsProvider = createKmsProvider();
  return kmsProvider;
}

// ── List secrets (names only, NEVER values) ──
secretRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const secrets = await db
    .select({
      id: userSecrets.id,
      name: userSecrets.name,
      keyVersion: userSecrets.keyVersion,
      createdAt: userSecrets.createdAt,
      updatedAt: userSecrets.updatedAt,
    })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .orderBy(userSecrets.name);

  return c.json(secrets);
});

// ── Create secret ──
secretRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const parsed = createSecretSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { name, value } = parsed.data;

  // Check for duplicate
  const [existing] = await db
    .select({ id: userSecrets.id })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.name, name)))
    .limit(1);
  if (existing)
    return c.json(
      { error: `Secret "${name}" already exists. Use PUT to update.` },
      409,
    );

  // Encrypt — API server can encrypt, never decrypt
  const masterKey = await getKms().getMasterKey();
  const encryptedBlob = await encryptSecret(userId, value, masterKey);
  const encryptedValue = encryptedBlob.toString("base64");

  const [secret] = await db
    .insert(userSecrets)
    .values({ userId, name, encryptedValue, keyVersion: 1 })
    .returning({
      id: userSecrets.id,
      name: userSecrets.name,
      createdAt: userSecrets.createdAt,
    });

  return c.json(secret, 201);
});

// ── Update secret ──
secretRoutes.put("/:name", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const nameParsed = secretNameParam.safeParse(c.req.param("name"));
  if (!nameParsed.success) return c.json({ error: "Invalid secret name" }, 400);

  const body = await c.req.json();
  const parsed = updateSecretSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const masterKey = await getKms().getMasterKey();
  const encryptedBlob = await encryptSecret(
    userId,
    parsed.data.value,
    masterKey,
  );
  const encryptedValue = encryptedBlob.toString("base64");

  const [updated] = await db
    .update(userSecrets)
    .set({ encryptedValue, updatedAt: new Date() })
    .where(
      and(
        eq(userSecrets.userId, userId),
        eq(userSecrets.name, nameParsed.data),
      ),
    )
    .returning({
      id: userSecrets.id,
      name: userSecrets.name,
      updatedAt: userSecrets.updatedAt,
    });

  if (!updated) return c.json({ error: "Secret not found" }, 404);
  return c.json(updated);
});

// ── Delete secret ──
secretRoutes.delete("/:name", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const nameParsed = secretNameParam.safeParse(c.req.param("name"));
  if (!nameParsed.success) return c.json({ error: "Invalid secret name" }, 400);

  const [deleted] = await db
    .delete(userSecrets)
    .where(
      and(
        eq(userSecrets.userId, userId),
        eq(userSecrets.name, nameParsed.data),
      ),
    )
    .returning({ id: userSecrets.id });

  if (!deleted) return c.json({ error: "Secret not found" }, 404);
  return c.json({ deleted: true });
});
