// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);

mock.module("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
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

const { app } = await import("../app.js");
const { __resetKmsProviderForTests } = await import("../routes/secrets.js");

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

describe("Secrets config errors", () => {
  it("returns 503 when KMS is not configured", async () => {
    process.env.STEPIQ_MASTER_KEY = undefined;
    process.env.VAULT_ADDR = undefined;
    process.env.VAULT_TOKEN = undefined;
    __resetKmsProviderForTests();

    const res = await app.request("/api/user/secrets", {
      method: "POST",
      headers: await authHeader(),
      body: JSON.stringify({
        name: "OPENAI_API_KEY",
        value: "sk-test-123",
      }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Secrets encryption is not configured");
  });
});
