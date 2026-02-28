import { PLAN_LIMITS, type Plan } from "@stepiq/core";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

function addBillingInterval(date: Date, interval: string): Date {
  const next = new Date(date);
  if (interval === "year") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function rollUserBillingCycleIfNeeded(userId: string): Promise<void> {
  const [user] = await db
    .select({
      id: users.id,
      plan: users.plan,
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripeBillingInterval: users.stripeBillingInterval,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;
  if (user.plan !== "starter" && user.plan !== "pro") return;
  if (
    user.stripeSubscriptionStatus !== "active" &&
    user.stripeSubscriptionStatus !== "trialing"
  ) {
    return;
  }
  if (
    user.stripeBillingInterval !== "month" &&
    user.stripeBillingInterval !== "year"
  ) {
    return;
  }
  if (!user.stripeCurrentPeriodEnd) return;

  const now = new Date();
  if (user.stripeCurrentPeriodEnd > now) return;

  let nextPeriodEnd = new Date(user.stripeCurrentPeriodEnd);
  while (nextPeriodEnd <= now) {
    nextPeriodEnd = addBillingInterval(nextPeriodEnd, user.stripeBillingInterval);
  }

  await db
    .update(users)
    .set({
      creditsRemaining: PLAN_LIMITS[user.plan as Plan].credits,
      stripeCurrentPeriodEnd: nextPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
