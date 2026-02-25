// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);
const TEST_MASTER_KEY = randomBytes(32).toString("hex");

let capturedSet: Record<string, unknown> | null = null;

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
      set: (values: Record<string, unknown>) => {
        capturedSet = values;
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "sec-1",
                  name: "OPENAI_API_KEY",
                  updatedAt: new Date(),
                },
              ]),
          }),
        };
      },
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

describe("Secrets encryption on update", () => {
  it("PUT /api/user/secrets/:name stores encrypted value", async () => {
    process.env.STEPIQ_MASTER_KEY = TEST_MASTER_KEY;
    capturedSet = null;

    const headers = await authHeader();
    const plainValue = "super-secret-123";
    const res = await app.request("/api/user/secrets/OPENAI_API_KEY", {
      method: "PUT",
      headers,
      body: JSON.stringify({ value: plainValue }),
    });

    expect(res.status).toBe(200);
    expect(capturedSet).not.toBeNull();
    expect(capturedSet?.encryptedValue).toBeDefined();
    expect(capturedSet?.encryptedValue).not.toBe(plainValue);

    const encryptedValue = String(capturedSet?.encryptedValue ?? "");
    expect(encryptedValue.length).toBeGreaterThan(20);
    expect(encryptedValue.includes(plainValue)).toBe(false);
  });
});
