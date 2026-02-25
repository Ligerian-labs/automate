// @ts-nocheck
import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose";

mock.module("../lib/env.js", () => ({
  config: {
    jwtSecret: "test-secret-key-that-is-long-enough-for-testing-purposes",
    databaseUrl: "",
    redisUrl: "",
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    anthropicApiKey: "",
    openaiApiKey: "",
    corsOrigin: "*",
    port: 3001,
  },
}));

const { requireAuth } = await import("../middleware/auth.js");

const secret = new TextEncoder().encode(
  "test-secret-key-that-is-long-enough-for-testing-purposes"
);

async function makeToken(
  payload: Record<string, unknown>,
  exp = "7d"
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(secret);
}

function createTestApp() {
  const app = new Hono();
  app.use("*", requireAuth);
  app.get("/test", (c) => {
    return c.json({
      userId: c.get("userId"),
      userPlan: c.get("userPlan"),
    });
  });
  return app;
}

describe("requireAuth middleware", () => {
  const app = createTestApp();

  it("rejects request without Authorization header", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects request with non-Bearer token", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid JWT", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("rejects expired JWT", async () => {
    const token = await new SignJWT({ sub: "user-1", plan: "pro" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("-1h")
      .sign(secret);

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid JWT and sets context", async () => {
    const token = await makeToken({ sub: "user-123", plan: "pro" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-123");
    expect(body.userPlan).toBe("pro");
  });

  it("rejects JWT signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(wrongSecret);

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
