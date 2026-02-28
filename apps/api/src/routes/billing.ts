import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "../db/index.js";
import { billingDiscountCodes, stripeEvents, users } from "../db/schema.js";
import { type Env, config } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
import { isAuthorizedAdminUser } from "../services/admin.js";
import {
  billingConfigError,
  getPlanCredits,
  getStripe,
  getStripePriceId,
  resolvePlanAndIntervalFromPriceId,
} from "../services/billing.js";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  interval: z.enum(["month", "year"]),
  discount_code: z.string().trim().min(1).max(64).optional(),
});

const discountCodeUpsertSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    active: z.boolean().default(true),
    kind: z.enum(["percent_off", "free_cycles"]),
    percent_off: z.number().int().min(1).max(100).optional(),
    free_cycles_count: z.number().int().min(1).max(60).optional(),
    free_cycles_interval: z.enum(["month", "year"]).optional(),
    applies_to_plan: z.enum(["starter", "pro"]).optional(),
    applies_to_interval: z.enum(["month", "year"]).optional(),
    allowed_emails: z.array(z.string().email()).optional(),
    max_redemptions: z.number().int().positive().optional(),
    starts_at: z.string().datetime().optional(),
    expires_at: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "percent_off" && !value.percent_off) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "percent_off is required for percent_off codes",
        path: ["percent_off"],
      });
    }
    if (value.kind === "free_cycles") {
      if (!value.free_cycles_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "free_cycles_count is required for free_cycles codes",
          path: ["free_cycles_count"],
        });
      }
      if (!value.free_cycles_interval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "free_cycles_interval is required for free_cycles codes",
          path: ["free_cycles_interval"],
        });
      }
    }
    if (value.starts_at && value.expires_at) {
      const startsAt = new Date(value.starts_at);
      const expiresAt = new Date(value.expires_at);
      if (expiresAt <= startsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expires_at must be after starts_at",
          path: ["expires_at"],
        });
      }
    }
  });

export const billingRoutes = new Hono<{ Variables: Env }>();

function addBillingInterval(date: Date, interval: "month" | "year", count = 1) {
  const next = new Date(date);
  if (interval === "year") {
    next.setUTCFullYear(next.getUTCFullYear() + count);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

billingRoutes.post("/checkout", requireAuth, async (c) => {
  const configErr = billingConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);

  const stripe = getStripe();

  let appliedDiscountCode:
    | {
        id: string;
        code: string;
        kind: "percent_off" | "free_cycles";
        percentOff: number | null;
        freeCyclesCount: number | null;
        freeCyclesInterval: "month" | "year" | null;
        stripeCouponId: string | null;
      }
    | null = null;

  if (parsed.data.discount_code) {
    const normalizedCode = parsed.data.discount_code.trim().toUpperCase();
    const now = new Date();

    const [discountCode] = await db
      .select({
        id: billingDiscountCodes.id,
        code: billingDiscountCodes.code,
        active: billingDiscountCodes.active,
        kind: billingDiscountCodes.kind,
        percentOff: billingDiscountCodes.percentOff,
        freeCyclesCount: billingDiscountCodes.freeCyclesCount,
        freeCyclesInterval: billingDiscountCodes.freeCyclesInterval,
        appliesToPlan: billingDiscountCodes.appliesToPlan,
        appliesToInterval: billingDiscountCodes.appliesToInterval,
        allowedEmails: billingDiscountCodes.allowedEmails,
        maxRedemptions: billingDiscountCodes.maxRedemptions,
        redeemedCount: billingDiscountCodes.redeemedCount,
        stripeCouponId: billingDiscountCodes.stripeCouponId,
        startsAt: billingDiscountCodes.startsAt,
        expiresAt: billingDiscountCodes.expiresAt,
      })
      .from(billingDiscountCodes)
      .where(eq(billingDiscountCodes.code, normalizedCode))
      .limit(1);

    if (!discountCode) {
      return c.json({ error: "Invalid discount code" }, 400);
    }
    if (!discountCode.active) {
      return c.json({ error: "Discount code is inactive" }, 400);
    }
    if (discountCode.startsAt && discountCode.startsAt > now) {
      return c.json({ error: "Discount code is not active yet" }, 400);
    }
    if (discountCode.expiresAt && discountCode.expiresAt <= now) {
      return c.json({ error: "Discount code is expired" }, 400);
    }
    if (
      discountCode.appliesToPlan &&
      discountCode.appliesToPlan !== parsed.data.plan
    ) {
      return c.json({ error: "Discount code is not valid for this plan" }, 400);
    }
    if (
      discountCode.appliesToInterval &&
      discountCode.appliesToInterval !== parsed.data.interval
    ) {
      return c.json(
        { error: "Discount code is not valid for this billing interval" },
        400,
      );
    }
    if (
      discountCode.allowedEmails.length > 0 &&
      !discountCode.allowedEmails.includes(user.email)
    ) {
      return c.json({ error: "Discount code is not valid for this user" }, 400);
    }
    if (
      discountCode.maxRedemptions &&
      discountCode.redeemedCount >= discountCode.maxRedemptions
    ) {
      return c.json({ error: "Discount code has reached max redemptions" }, 400);
    }
    if (
      discountCode.kind !== "percent_off" &&
      discountCode.kind !== "free_cycles"
    ) {
      return c.json({ error: "Discount code configuration is invalid" }, 400);
    }

    appliedDiscountCode = {
      id: discountCode.id,
      code: discountCode.code,
      kind: discountCode.kind,
      percentOff: discountCode.percentOff,
      freeCyclesCount: discountCode.freeCyclesCount,
      freeCyclesInterval:
        discountCode.freeCyclesInterval === "month" ||
        discountCode.freeCyclesInterval === "year"
          ? discountCode.freeCyclesInterval
          : null,
      stripeCouponId: discountCode.stripeCouponId,
    };
  }

  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;
    await db
      .update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, user.id));
  }

  const priceId = getStripePriceId(parsed.data.plan, parsed.data.interval);
  const successUrl = `${config.appUrl}/settings?tab=Billing&checkout=success`;
  const cancelUrl = `${config.appUrl}/settings?tab=Billing&checkout=cancel`;

  const sessionData: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      ...(appliedDiscountCode ? { discountCode: appliedDiscountCode.code } : {}),
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        ...(appliedDiscountCode
          ? { discountCode: appliedDiscountCode.code }
          : {}),
      },
    },
  };

  if (appliedDiscountCode?.kind === "percent_off") {
    if (!appliedDiscountCode.percentOff) {
      return c.json({ error: "Discount code configuration is invalid" }, 400);
    }

    let stripeCouponId = appliedDiscountCode.stripeCouponId;
    if (!stripeCouponId) {
      const coupon = await stripe.coupons.create({
        percent_off: appliedDiscountCode.percentOff,
        duration: "forever",
        name: `stepIQ ${appliedDiscountCode.code}`,
        metadata: {
          codeId: appliedDiscountCode.id,
          code: appliedDiscountCode.code,
        },
      });
      stripeCouponId = coupon.id;
      await db
        .update(billingDiscountCodes)
        .set({
          stripeCouponId,
          updatedAt: new Date(),
        })
        .where(eq(billingDiscountCodes.id, appliedDiscountCode.id));
    }

    sessionData.discounts = [{ coupon: stripeCouponId }];
  }

  if (appliedDiscountCode?.kind === "free_cycles") {
    if (
      !appliedDiscountCode.freeCyclesCount ||
      !appliedDiscountCode.freeCyclesInterval
    ) {
      return c.json({ error: "Discount code configuration is invalid" }, 400);
    }

    const trialEnd = addBillingInterval(
      new Date(),
      appliedDiscountCode.freeCyclesInterval,
      appliedDiscountCode.freeCyclesCount,
    );

    sessionData.subscription_data = {
      ...sessionData.subscription_data,
      trial_end: Math.floor(trialEnd.getTime() / 1000),
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionData);

  if (!session.url) {
    return c.json({ error: "Failed to create checkout session" }, 500);
  }

  if (appliedDiscountCode) {
    await db
      .update(billingDiscountCodes)
      .set({
        redeemedCount: sql`${billingDiscountCodes.redeemedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(billingDiscountCodes.id, appliedDiscountCode.id));
  }

  return c.json({ url: session.url });
});

billingRoutes.get("/discount-codes", requireAuth, async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAuthorizedAdminUser(userId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const items = await db
    .select({
      id: billingDiscountCodes.id,
      code: billingDiscountCodes.code,
      active: billingDiscountCodes.active,
      kind: billingDiscountCodes.kind,
      percentOff: billingDiscountCodes.percentOff,
      freeCyclesCount: billingDiscountCodes.freeCyclesCount,
      freeCyclesInterval: billingDiscountCodes.freeCyclesInterval,
      appliesToPlan: billingDiscountCodes.appliesToPlan,
      appliesToInterval: billingDiscountCodes.appliesToInterval,
      allowedEmails: billingDiscountCodes.allowedEmails,
      maxRedemptions: billingDiscountCodes.maxRedemptions,
      redeemedCount: billingDiscountCodes.redeemedCount,
      startsAt: billingDiscountCodes.startsAt,
      expiresAt: billingDiscountCodes.expiresAt,
      createdAt: billingDiscountCodes.createdAt,
      updatedAt: billingDiscountCodes.updatedAt,
    })
    .from(billingDiscountCodes);

  return c.json({ items });
});

billingRoutes.post("/discount-codes", requireAuth, async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAuthorizedAdminUser(userId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const parsed = discountCodeUpsertSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const code = parsed.data.code.trim().toUpperCase();
  const now = new Date();

  const startsAt = parsed.data.starts_at ? new Date(parsed.data.starts_at) : null;
  const expiresAt = parsed.data.expires_at
    ? new Date(parsed.data.expires_at)
    : null;

  const payload = {
    code,
    active: parsed.data.active,
    kind: parsed.data.kind,
    percentOff:
      parsed.data.kind === "percent_off" ? (parsed.data.percent_off ?? null) : null,
    freeCyclesCount:
      parsed.data.kind === "free_cycles"
        ? (parsed.data.free_cycles_count ?? null)
        : null,
    freeCyclesInterval:
      parsed.data.kind === "free_cycles"
        ? (parsed.data.free_cycles_interval ?? null)
        : null,
    appliesToPlan: parsed.data.applies_to_plan ?? null,
    appliesToInterval: parsed.data.applies_to_interval ?? null,
    allowedEmails: parsed.data.allowed_emails ?? [],
    maxRedemptions: parsed.data.max_redemptions ?? null,
    startsAt,
    expiresAt,
    updatedAt: now,
  };

  const [existing] = await db
    .select({ id: billingDiscountCodes.id })
    .from(billingDiscountCodes)
    .where(eq(billingDiscountCodes.code, code))
    .limit(1);

  if (!existing) {
    await db.insert(billingDiscountCodes).values({
      ...payload,
      redeemedCount: 0,
      createdAt: now,
    });
  } else {
    await db
      .update(billingDiscountCodes)
      .set(payload)
      .where(eq(billingDiscountCodes.id, existing.id));
  }

  return c.json({ ok: true, code });
});

billingRoutes.post("/portal", requireAuth, async (c) => {
  const configErr = billingConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeCustomerId) {
    return c.json({ error: "No Stripe customer for user" }, 409);
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${config.appUrl}/settings?tab=Billing`,
  });

  return c.json({ url: portal.url });
});

billingRoutes.post("/stripe/webhook", async (c) => {
  const configErr = billingConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing stripe-signature" }, 400);

  const stripe = getStripe();
  const payload = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripeWebhookSecret,
    );
  } catch {
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  const inserted = await db
    .insert(stripeEvents)
    .values({
      eventId: event.id,
      eventType: event.type,
    })
    .onConflictDoNothing()
    .returning({ eventId: stripeEvents.eventId });

  if (inserted.length === 0) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(sub);
      }
    }
  } catch (err) {
    console.error("Stripe webhook sync failed:", err);
    return c.json({ error: "Webhook processing failed" }, 500);
  }

  return c.json({ received: true });
});

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) return;

  const priceId = subscription.items.data[0]?.price?.id || null;
  const resolved = resolvePlanAndIntervalFromPriceId(priceId);
  const status = subscription.status;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const [user] = await db
    .select({
      id: users.id,
      creditsRemaining: users.creditsRemaining,
    })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) return;

  const isActive = status === "active" || status === "trialing";
  const plan = isActive && resolved ? resolved.plan : "free";

  await db
    .update(users)
    .set({
      plan,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeSubscriptionStatus: status,
      stripeBillingInterval: resolved?.interval || null,
      stripeCurrentPeriodEnd: periodEnd,
      ...(plan !== "free" ? { creditsRemaining: getPlanCredits(plan) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, user.id), eq(users.stripeCustomerId, customerId)));
}
