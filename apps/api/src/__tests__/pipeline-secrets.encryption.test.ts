// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);
const TEST_MASTER_KEY = randomBytes(32).toString("hex");
const PIPELINE_ID = "11111111-1111-4111-8111-111111111111";

let capturedInsert: Record<string, unknown> | null = null;
let selectLimitCalls = 0;

mock.module("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectLimitCalls += 1;
            if (selectLimitCalls === 1) {
              return Promise.resolve([{ id: PIPELINE_ID }]);
            }
            return Promise.resolve([]);
          },
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        capturedInsert = values;
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "sec-1",
                name: "OPENAI_API_KEY",
                keyVersion: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
        };
      },
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

describe("Pipeline secrets encryption", () => {
  it("POST /api/pipelines/:id/secrets stores encrypted pipeline-scoped value", async () => {
    process.env.STEPIQ_MASTER_KEY = TEST_MASTER_KEY;
    capturedInsert = null;
    selectLimitCalls = 0;

    const plainValue = "pipeline-secret-123";
    const res = await app.request(`/api/pipelines/${PIPELINE_ID}/secrets`, {
      method: "POST",
      headers: await authHeader(),
      body: JSON.stringify({
        name: "OPENAI_API_KEY",
        value: plainValue,
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert?.pipelineId).toBe(PIPELINE_ID);
    expect(capturedInsert?.encryptedValue).toBeDefined();
    expect(capturedInsert?.encryptedValue).not.toBe(plainValue);
  });
});
