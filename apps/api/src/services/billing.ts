import { PLAN_LIMITS, type Plan } from "@stepiq/core";
import Stripe from "stripe";
import { config } from "../lib/env.js";

export type PaidPlan = Extract<Plan, "starter" | "pro">;
export type BillingInterval = "month" | "year";

function getStripePriceIds(): Record<
  PaidPlan,
  Record<BillingInterval, string>
> {
  return {
    starter: {
      month: config.stripePriceStarterMonthly,
      year: config.stripePriceStarterYearly,
    },
    pro: {
      month: config.stripePriceProMonthly,
      year: config.stripePriceProYearly,
    },
  };
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripeSecretKey);
  }
  return stripeClient;
}

export function isPaidPlan(value: string): value is PaidPlan {
  return value === "starter" || value === "pro";
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "month" || value === "year";
}

export function getStripePriceId(
  plan: PaidPlan,
  interval: BillingInterval,
): string {
  const stripePriceIds = getStripePriceIds();
  const priceId = stripePriceIds[plan][interval];
  if (!priceId) {
    throw new Error(
      `Missing Stripe price id for ${plan}/${interval}. Check STRIPE_PRICE_* env vars.`,
    );
  }
  return priceId;
}

export function resolvePlanAndIntervalFromPriceId(
  priceId: string | null | undefined,
): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  const stripePriceIds = getStripePriceIds();
  for (const plan of Object.keys(stripePriceIds) as PaidPlan[]) {
    for (const interval of ["month", "year"] as BillingInterval[]) {
      if (stripePriceIds[plan][interval] === priceId) {
        return { plan, interval };
      }
    }
  }
  return null;
}

export function billingConfigError(): string | null {
  if (!config.stripeSecretKey) {
    return "Stripe is not configured: STRIPE_SECRET_KEY is missing";
  }
  if (!config.stripeWebhookSecret) {
    return "Stripe is not configured: STRIPE_WEBHOOK_SECRET is missing";
  }
  const missing: string[] = [];
  if (!config.stripePriceStarterMonthly)
    missing.push("STRIPE_PRICE_STARTER_MONTHLY_EUR");
  if (!config.stripePriceStarterYearly)
    missing.push("STRIPE_PRICE_STARTER_YEARLY_EUR");
  if (!config.stripePriceProMonthly)
    missing.push("STRIPE_PRICE_PRO_MONTHLY_EUR");
  if (!config.stripePriceProYearly) missing.push("STRIPE_PRICE_PRO_YEARLY_EUR");
  if (missing.length > 0) {
    return `Stripe is not configured: missing ${missing.join(", ")}`;
  }
  return null;
}

export function getPlanCredits(plan: PaidPlan): number {
  return PLAN_LIMITS[plan].credits;
}
