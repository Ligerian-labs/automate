import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

export interface GeneratedApiKey {
  key: string;
  keyPrefix: string;
  keyHash: string;
}

export interface AuthenticatedApiKey {
  id: string;
  userId: string;
  scopes: string[] | null;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const raw = randomBytes(24).toString("base64url");
  const key = `sk_live_${raw}`;
  return {
    key,
    keyPrefix: key.slice(0, 16),
    keyHash: hashApiKey(key),
  };
}

export function extractApiKey(c: Context): string | null {
  const xApiKey = c.req.header("X-API-Key");
  if (xApiKey) return xApiKey;

  const authorization = c.req.header("Authorization");
  if (authorization?.startsWith("Bearer sk_")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}

export async function authenticateApiKey(
  rawKey: string,
  requiredScope?: string,
): Promise<AuthenticatedApiKey | null> {
  const keyHash = hashApiKey(rawKey);

  const [record] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      ),
    )
    .limit(1);

  if (!record) return null;

  if (requiredScope) {
    const scopes = record.scopes || [];
    if (!scopes.includes(requiredScope)) return null;
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id));

  return record;
}
