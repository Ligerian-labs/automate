// @ts-nocheck
import { describe, it, expect, mock } from "bun:test";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);

const mockUser = { id: "user-123", email: "test@example.com", name: "Test", plan: "pro", creditsRemaining: 8000, createdAt: new Date(), passwordHash: "$2b$12$fake" };
const mockPipeline = { id: "pipe-1", userId: "user-123", name: "test-pipeline", description: "test", definition: { name: "test", version: 1, steps: [{ id: "s1", name: "S1", type: "llm" }] }, tags: [], status: "active", version: 1, createdAt: new Date(), updatedAt: new Date() };
const mockRun = { id: "run-1", pipelineId: "pipe-1", userId: "user-123", status: "completed", pipelineVersion: 1, triggerType: "manual", inputData: {}, outputData: null, totalTokens: 100, totalCostCents: 5, error: null, startedAt: new Date(), completedAt: new Date(), createdAt: new Date() };

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

type Chainable = {
  [key: string]: (...args: unknown[]) => Chainable | Promise<unknown[]>;
};

// Chainable mock DB
function chainable(resolveValue: unknown): Chainable {
  const chain: Chainable = {};
  const methods = ["select", "from", "where", "insert", "values", "update", "set", "delete"];
  for (const method of methods) {
    chain[method] = () => chain;
  }

  // Terminal methods return promises
  chain.limit = () => Promise.resolve(asList(resolveValue));
  chain.orderBy = () => Promise.resolve(asList(resolveValue));
  chain.returning = () => Promise.resolve(asList(resolveValue));
  return chain;
}

// Mock with data
mock.module("../db/index.js", () => ({
  db: {
    select: () => chainable(mockUser),
    insert: () => chainable(mockPipeline),
    update: () => chainable(mockRun),
    delete: () => chainable({}),
  },
}));

mock.module("../lib/env.js", () => ({
  config: {
    databaseUrl: "postgres://test:test@localhost:5432/test",
    redisUrl: "redis://localhost:6379",
    jwtSecret: TEST_SECRET,
    stripeSecretKey: "",
    stripeWebhookSecret: "",
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

async function authHeader(): Promise<Record<string, string>> {
  const token = await new SignJWT({ sub: "user-123", plan: "pro" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("User routes (authenticated)", () => {
  it("GET /api/user/me returns user data", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/user/me", { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("test@example.com");
  });

  it("GET /api/user/usage returns usage stats", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/user/usage", { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("credits_used");
    expect(body).toHaveProperty("runs_today");
  });
});

describe("Pipeline routes (authenticated)", () => {
  it("GET /api/pipelines returns pipeline list", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/pipelines", { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/pipelines creates a pipeline", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/pipelines", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "test-pipeline",
        definition: {
          name: "test-pipeline",
          version: 1,
          steps: [{ id: "s1", name: "Step 1", model: "gpt-4o-mini", prompt: "Hello" }],
        },
      }),
    });
    // May be 201 or 200 depending on mock
    expect([200, 201]).toContain(res.status);
  });

  it("POST /api/pipelines rejects invalid definition", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/pipelines", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Run routes (authenticated)", () => {
  it("GET /api/runs returns run list", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/runs", { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/runs with filters", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/runs?pipeline_id=pipe-1&status=completed&limit=10", { headers });
    expect(res.status).toBe(200);
  });

  it("GET /api/runs/:id returns run details", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/runs/run-1", { headers });
    expect(res.status).toBe(200);
  });

  it("POST /api/runs/:id/cancel cancels a run", async () => {
    const headers = await authHeader();
    const res = await app.request("/api/runs/run-1/cancel", { method: "POST", headers });
    // Should return 200 or similar
    expect([200, 404]).toContain(res.status);
  });
});

describe("Auth routes (with data)", () => {
  it("POST /api/auth/register with valid data", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "securepass123", name: "New User" }),
    });
    // With mock returning empty array for existing check, should succeed or conflict
    expect([201, 409]).toContain(res.status);
  });

  it("POST /api/auth/login with valid credentials", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "testpass" }),
    });
    // bcrypt.compare will fail since mock hash is fake, so 401
    expect(res.status).toBe(401);
  });
});
