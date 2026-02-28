import {
  createKmsProvider,
  createSecretSchema,
  encryptSecret,
  secretNameParam,
  updateSecretSchema,
  uuidParam,
} from "@stepiq/core";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
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

export function __resetKmsProviderForTests() {
  kmsProvider = null;
}

function kmsConfigError(c: Context<{ Variables: Env }>) {
  return c.json(
    {
      error:
        "Secrets encryption is not configured. Set STEPIQ_MASTER_KEY (64 hex chars) or VAULT_ADDR + VAULT_TOKEN.",
    },
    503,
  );
}

function isMissingPipelineIdColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /(?:no such column|column .* does not exist).*pipeline_id/i.test(
    error.message,
  );
}

// ── List secrets (names only, NEVER values) ──
secretRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  let secrets: {
    id: string;
    name: string;
    keyVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  try {
    secrets = await db
      .select({
        id: userSecrets.id,
        name: userSecrets.name,
        keyVersion: userSecrets.keyVersion,
        createdAt: userSecrets.createdAt,
        updatedAt: userSecrets.updatedAt,
      })
      .from(userSecrets)
      .where(
        and(eq(userSecrets.userId, userId), isNull(userSecrets.pipelineId)),
      )
      .orderBy(userSecrets.name);
  } catch (error) {
    if (!isMissingPipelineIdColumnError(error)) throw error;
    secrets = await db
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
  }

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
  let existing: { id: string } | undefined;
  try {
    [existing] = await db
      .select({ id: userSecrets.id })
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          isNull(userSecrets.pipelineId),
          eq(userSecrets.name, name),
        ),
      )
      .limit(1);
  } catch (error) {
    if (!isMissingPipelineIdColumnError(error)) throw error;
    [existing] = await db
      .select({ id: userSecrets.id })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.name, name)))
      .limit(1);
  }
  if (existing)
    return c.json(
      { error: `Secret "${name}" already exists. Use PUT to update.` },
      409,
    );

  // Encrypt — API server can encrypt, never decrypt
  let masterKey: Buffer;
  try {
    masterKey = await getKms().getMasterKey();
  } catch (error) {
    console.error(
      "Secrets KMS init failure:",
      error instanceof Error ? error.message : String(error),
    );
    return kmsConfigError(c);
  }
  const encryptedBlob = await encryptSecret(userId, value, masterKey);
  const encryptedValue = encryptedBlob.toString("base64");

  const [secret] = await db
    .insert(userSecrets)
    .values({ userId, pipelineId: null, name, encryptedValue, keyVersion: 1 })
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

  let masterKey: Buffer;
  try {
    masterKey = await getKms().getMasterKey();
  } catch (error) {
    console.error(
      "Secrets KMS init failure:",
      error instanceof Error ? error.message : String(error),
    );
    return kmsConfigError(c);
  }
  const encryptedBlob = await encryptSecret(
    userId,
    parsed.data.value,
    masterKey,
  );
  const encryptedValue = encryptedBlob.toString("base64");

  let updated:
    | {
        id: string;
        name: string;
        updatedAt: Date;
      }
    | undefined;
  try {
    [updated] = await db
      .update(userSecrets)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(
        and(
          eq(userSecrets.userId, userId),
          isNull(userSecrets.pipelineId),
          eq(userSecrets.name, nameParsed.data),
        ),
      )
      .returning({
        id: userSecrets.id,
        name: userSecrets.name,
        updatedAt: userSecrets.updatedAt,
      });
  } catch (error) {
    if (!isMissingPipelineIdColumnError(error)) throw error;
    [updated] = await db
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
  }

  if (!updated) return c.json({ error: "Secret not found" }, 404);
  return c.json(updated);
});

// ── Delete secret ──
secretRoutes.delete("/:name", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const nameParsed = secretNameParam.safeParse(c.req.param("name"));
  if (!nameParsed.success) return c.json({ error: "Invalid secret name" }, 400);

  let deleted: { id: string } | undefined;
  try {
    [deleted] = await db
      .delete(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          isNull(userSecrets.pipelineId),
          eq(userSecrets.name, nameParsed.data),
        ),
      )
      .returning({ id: userSecrets.id });
  } catch (error) {
    if (!isMissingPipelineIdColumnError(error)) throw error;
    [deleted] = await db
      .delete(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          eq(userSecrets.name, nameParsed.data),
        ),
      )
      .returning({ id: userSecrets.id });
  }

  if (!deleted) return c.json({ error: "Secret not found" }, 404);
  return c.json({ deleted: true });
});
