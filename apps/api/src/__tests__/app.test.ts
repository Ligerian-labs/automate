// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";

mock.module("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
        }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  },
}));

mock.module("../lib/env.js", () => ({
  config: {
    databaseUrl: "postgres://test:test@localhost:5432/test",
    redisUrl: "redis://localhost:6379",
    jwtSecret: "test-secret-key-that-is-long-enough-for-testing-purposes",
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    anthropicApiKey: "",
    openaiApiKey: "",
    corsOrigin: "*",
    port: 3001,
  },
}));

const { app } = await import("../app.js");

describe("Health check", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});

describe("Auth routes", () => {
  it("POST /api/auth/register rejects invalid body", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/login rejects invalid body", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Protected routes require auth", () => {
  const protectedPaths = [
    ["GET", "/api/pipelines"],
    ["POST", "/api/pipelines"],
    ["GET", "/api/runs"],
    ["GET", "/api/user/me"],
    ["GET", "/api/user/usage"],
  ];

  for (const [method, path] of protectedPaths) {
    it(`${method} ${path} returns 401 without token`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe("Models route", () => {
  it("GET /api/models returns model list", async () => {
    const res = await app.request("/api/models");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("provider");
    expect(body[0]).toHaveProperty("input_cost_per_million");
  });

  it("models have markup applied", async () => {
    const res = await app.request("/api/models");
    const body = await res.json();
    const mini = body.find((m: { id: string }) => m.id === "gpt-4o-mini");
    expect(mini).toBeDefined();
    expect(mini.input_cost_per_million).toBe(Math.ceil(150 * 1.25));
  });
});

describe("Webhook route", () => {
  it("POST /api/webhooks/:id/:token returns 501 (not implemented)", async () => {
    const res = await app.request("/api/webhooks/pipe123/tok456", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(501);
  });
});
