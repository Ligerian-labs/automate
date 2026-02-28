import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { config } from "../lib/env.js";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isAuthorizedAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const allowlist = Array.isArray(config.authorizedAdminEmails)
    ? config.authorizedAdminEmails
    : [];
  return allowlist.includes(normalized);
}

export async function isAuthorizedAdminUser(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return false;
  return isAuthorizedAdminEmail(user.email);
}
