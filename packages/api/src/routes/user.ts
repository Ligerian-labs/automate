import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { Env } from "../lib/env.js";

export const userRoutes = new Hono<{ Variables: Env }>();

userRoutes.use("*", requireAuth);

// Get current user
userRoutes.get("/me", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      plan: users.plan,
      creditsRemaining: users.creditsRemaining,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(user);
});

// Get usage stats
userRoutes.get("/usage", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  // TODO: Aggregate runs for current billing period
  return c.json({
    credits_used: 0,
    credits_remaining: 0,
    runs_today: 0,
    total_cost_cents: 0,
  });
});
