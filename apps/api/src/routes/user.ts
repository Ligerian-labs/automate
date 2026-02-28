import { PLAN_LIMITS, type Plan } from "@stepiq/core";
import { and, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { runs, users } from "../db/schema.js";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
import { rollUserBillingCycleIfNeeded } from "../services/billing-cycle.js";

export const userRoutes = new Hono<{ Variables: Env }>();

userRoutes.use("*", requireAuth);

function utcDayWindow(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function billingWindowStart(
  periodEnd: Date | null,
  interval: string | null,
  now: Date,
): Date {
  if (!periodEnd || (interval !== "month" && interval !== "year")) {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  const start = new Date(periodEnd);
  if (interval === "year") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  if (start > now) return now;
  return start;
}

// Get current user
userRoutes.get("/me", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  await rollUserBillingCycleIfNeeded(userId);

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

  await rollUserBillingCycleIfNeeded(userId);

  const [user] = await db
    .select({
      plan: users.plan,
      creditsRemaining: users.creditsRemaining,
      stripeBillingInterval: users.stripeBillingInterval,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not found" }, 404);

  const now = new Date();
  const { start: todayStart, end: todayEnd } = utcDayWindow(now);
  const runsToday = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        gte(runs.createdAt, todayStart),
        lte(runs.createdAt, todayEnd),
      ),
    )
    .limit(100_000);

  const billingStart = billingWindowStart(
    user.stripeCurrentPeriodEnd,
    user.stripeBillingInterval,
    now,
  );
  const billingRuns = await db
    .select({ totalCostCents: runs.totalCostCents })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        gte(runs.createdAt, billingStart),
        lte(runs.createdAt, now),
      ),
    )
    .limit(100_000);
  const totalCostCents = billingRuns.reduce(
    (sum, r) => sum + (r.totalCostCents || 0),
    0,
  );

  const plan = (user.plan in PLAN_LIMITS ? user.plan : "free") as Plan;
  const creditsTotal = PLAN_LIMITS[plan].credits;
  const creditsUsed =
    creditsTotal >= 0 ? Math.max(0, creditsTotal - user.creditsRemaining) : 0;

  return c.json({
    credits_used: creditsUsed,
    credits_remaining: user.creditsRemaining,
    runs_today: runsToday.length,
    total_cost_cents: totalCostCents,
  });
});
