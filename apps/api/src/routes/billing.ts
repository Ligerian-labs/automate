import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type Stripe from "stripe";
import { db } from "../db/index.js";
import { stripeEvents, users } from "../db/schema.js";
import { config, type Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";
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
});

export const billingRoutes = new Hono<{ Variables: Env }>();

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
      },
    },
  });

  if (!session.url) {
    return c.json({ error: "Failed to create checkout session" }, 500);
  }

  return c.json({ url: session.url });
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
