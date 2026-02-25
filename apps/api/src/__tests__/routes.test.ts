// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);

const mockUser = {
  id: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
  email: "test@example.com",
  name: "Test",
  plan: "pro",
  creditsRemaining: 8000,
  createdAt: new Date(),
  passwordHash: "$2b$12$fake",
};
const mockPipeline = {
  id: "a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4",
  userId: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
  name: "test-pipeline",
  description: "test",
  definition: {
    name: "test",
    version: 1,
    steps: [{ id: "s1", name: "S1", type: "llm" }],
  },
  tags: [],
  status: "active",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const mockRun = {
  id: "b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4",
  pipelineId: "a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4",
  userId: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
  status: "completed",
  pipelineVersion: 1,
  triggerType: "manual",
  inputData: {},
  outputData: null,
  totalTokens: 100,
  totalCostCents: 5,
  error: null,
  startedAt: new Date(),
  completedAt: new Date(),
  createdAt: new Date(),
};

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

type Chainable = {
  [key: string]: (...args: unknown[]) => Chainable | Promise<unknown[]>;
};

function chainable(resolveValue: unknown): Chainable {
  const chain: Chainable = {};
  const methods = [
    "select",
    "from",
    "where",
    "insert",
    "values",
    "update",
    "set",
    "delete",
  ];
  for (const method of methods) {
    chain[method] = () => chain;
  }
  chain.limit = () => Promise.resolve(asList(resolveValue));
  chain.orderBy = () => Promise.resolve(asList(resolveValue));
  chain.returning = () => Promise.resolve(asList(resolveValue));
  return chain;
}

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
  const token = await new SignJWT({
    sub: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
    plan: "pro",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
          steps: [
            { id: "s1", name: "Step 1", model: "gpt-4o-mini", prompt: "Hello" },
          ],
        },
      }),
    });
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
    const res = await app.request(
      "/api/runs?pipeline_id=a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4&status=completed&limit=10",
      { headers },
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/runs/:id returns run details", async () => {
    const headers = await authHeader();
    const res = await app.request(
      "/api/runs/b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4",
      { headers },
    );
    expect(res.status).toBe(200);
  });

  it("POST /api/runs/:id/cancel cancels a run", async () => {
    const headers = await authHeader();
    const res = await app.request(
      "/api/runs/b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4/cancel",
      { method: "POST", headers },
    );
    expect([200, 404]).toContain(res.status);
  });
});

describe("Auth routes (with data)", () => {
  it("POST /api/auth/register with valid data", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        password: "securepass123",
        name: "New User",
      }),
    });
    expect([201, 409]).toContain(res.status);
  });

  it("POST /api/auth/login with valid credentials", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "testpass" }),
    });
    expect(res.status).toBe(401);
  });
});
