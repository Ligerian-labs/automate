// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);

const state = {
  user: {
    id: "user-1",
    email: "billing@example.com",
    name: "Billing User",
    plan: "free",
    creditsRemaining: 100,
    stripeCustomerId: null as string | null,
    stripeSubscriptionId: null as string | null,
    stripePriceId: null as string | null,
    stripeSubscriptionStatus: null as string | null,
    stripeBillingInterval: null as string | null,
    stripeCurrentPeriodEnd: null as Date | null,
  },
  stripeEvents: new Set<string>(),
};

const stripeStub = {
  customers: {
    create: async () => ({ id: "cus_test_1" }),
  },
  checkout: {
    sessions: {
      create: async () => ({ url: "https://checkout.stripe.test/session" }),
    },
  },
  billingPortal: {
    sessions: {
      create: async () => ({ url: "https://billing.stripe.test/portal" }),
    },
  },
  subscriptions: {
    retrieve: async () => ({
      id: "sub_test_1",
      customer: "cus_test_1",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      items: {
        data: [{ price: { id: "price_starter_month" } }],
      },
    }),
  },
  webhooks: {
    constructEvent: (payload: string, signature: string) => {
      if (signature !== "valid-signature") {
        throw new Error("invalid signature");
      }
      return JSON.parse(payload);
    },
  },
};

mock.module("stripe", () => ({
  default: class Stripe {
    customers = stripeStub.customers;
    checkout = stripeStub.checkout;
    billingPortal = stripeStub.billingPortal;
    subscriptions = stripeStub.subscriptions;
    webhooks = stripeStub.webhooks;
  },
}));

function pickFields(
  source: Record<string, unknown>,
  fields: Record<string, unknown>,
) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields || {})) {
    out[key] = source[key];
  }
  return out;
}

mock.module("../db/index.js", () => ({
  db: {
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            fields
              ? pickFields(
                  state.user as unknown as Record<string, unknown>,
                  fields,
                )
              : state.user,
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.user = { ...state.user, ...values };
          return [state.user];
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (values.eventId) {
              const already = state.stripeEvents.has(values.eventId);
              if (already) return [];
              state.stripeEvents.add(values.eventId);
              return [{ eventId: values.eventId }];
            }
            return [values];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => [],
    }),
  },
}));

mock.module("../lib/env.js", () => ({
  config: {
    databaseUrl: "postgres://test:test@localhost:5432/test",
    redisUrl: "redis://localhost:6379",
    jwtSecret: TEST_SECRET,
    stripeSecretKey: "sk_test_123",
    stripeWebhookSecret: "whsec_123",
    stripePriceStarterMonthly: "price_starter_month",
    stripePriceStarterYearly: "price_starter_year",
    stripePriceProMonthly: "price_pro_month",
    stripePriceProYearly: "price_pro_year",
    appUrl: "http://localhost:5173",
    anthropicApiKey: "",
    openaiApiKey: "",
    corsOrigin: "*",
    port: 3001,
  },
}));

mock.module("../services/queue.js", () => ({
  enqueueRun: () => Promise.resolve(),
}));

mock.module("../services/cron.js", () => ({
  getNextCronTick: () => new Date(Date.now() + 86400000),
}));

const { app } = await import("../app.js");

async function authHeaders() {
  const token = await new SignJWT({ sub: "user-1", plan: state.user.plan })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe("billing routes", () => {
  it("creates checkout session for starter yearly", async () => {
    const headers = await authHeaders();
    const res = await app.request("/api/billing/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ plan: "starter", interval: "year" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("checkout.stripe.test");
    expect(state.user.stripeCustomerId).toBe("cus_test_1");
  });

  it("creates billing portal session", async () => {
    state.user.stripeCustomerId = "cus_test_1";
    const headers = await authHeaders();
    const res = await app.request("/api/billing/portal", {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("billing.stripe.test");
  });

  it("applies subscription update from webhook and deduplicates events", async () => {
    const event = {
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_2",
          customer: "cus_test_1",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 7200,
          items: {
            data: [{ price: { id: "price_pro_year" } }],
          },
        },
      },
    };

    const res = await app.request("/api/billing/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "valid-signature",
      },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(200);
    expect(state.user.plan).toBe("pro");
    expect(state.user.stripeBillingInterval).toBe("year");
    expect(state.user.creditsRemaining).toBe(8000);

    const duplicate = await app.request("/api/billing/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "valid-signature",
      },
      body: JSON.stringify(event),
    });
    expect(duplicate.status).toBe(200);
    const body = await duplicate.json();
    expect(body.duplicate).toBe(true);
  });

  it("handles any customer.subscription.* event (paused -> free plan)", async () => {
    const event = {
      id: "evt_2",
      type: "customer.subscription.paused",
      data: {
        object: {
          id: "sub_test_3",
          customer: "cus_test_1",
          status: "paused",
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
          items: {
            data: [{ price: { id: "price_pro_month" } }],
          },
        },
      },
    };

    const res = await app.request("/api/billing/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "valid-signature",
      },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(200);
    expect(state.user.plan).toBe("free");
    expect(state.user.stripeSubscriptionStatus).toBe("paused");
  });
});
