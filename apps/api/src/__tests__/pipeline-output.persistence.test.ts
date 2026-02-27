// @ts-nocheck
import { describe, expect, it, mock } from "bun:test";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing-purposes";
const secret = new TextEncoder().encode(TEST_SECRET);
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

type PipelineRow = {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: string;
  version: number;
  definition: Record<string, unknown>;
};

const state: {
  user: { id: string; plan: string };
  pipeline: PipelineRow;
  versions: Array<{ pipelineId: string; version: number; definition: unknown }>;
} = {
  user: {
    id: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
    plan: "pro",
  },
  pipeline: {
    id: "a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4",
    userId: "c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4",
    name: "test-pipeline",
    description: "test",
    status: "active",
    version: 1,
    definition: {
      name: "test-pipeline",
      version: 1,
      steps: [{ id: "step_1", name: "S1", type: "llm", model: "gpt-4o-mini" }],
    },
  },
  versions: [],
};

function queryResult(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: () => Promise<unknown[]>;
    orderBy: () => Promise<unknown[]>;
  };
  promise.limit = async () => rows;
  promise.orderBy = async () => rows;
  return promise;
}

mock.module("../db/index.js", () => ({
  db: {
    select: () => ({
      from: (table: Record<PropertyKey, unknown>) => ({
        where: () => {
          const tableName = table[DRIZZLE_NAME];
          if (tableName === "users") {
            return queryResult([state.user]);
          }
          if (tableName === "pipelines") {
            return queryResult([state.pipeline]);
          }
          return queryResult([]);
        },
        orderBy: async () => [],
      }),
    }),
    update: (table: Record<PropertyKey, unknown>) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table[DRIZZLE_NAME] === "pipelines") {
              state.pipeline = { ...state.pipeline, ...values } as PipelineRow;
              return [state.pipeline];
            }
            return [];
          },
        }),
      }),
    }),
    insert: (table: Record<PropertyKey, unknown>) => ({
      values: (values: Record<string, unknown>) => {
        if (table[DRIZZLE_NAME] === "pipeline_versions") {
          state.versions.push({
            pipelineId: String(values.pipelineId),
            version: Number(values.version),
            definition: values.definition,
          });
        }
        return {
          returning: async () => [values],
        };
      },
    }),
    delete: () => ({
      where: () => ({
        returning: async () => [],
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

mock.module("../services/queue.js", () => ({
  enqueueRun: () => Promise.resolve(),
}));

const { app } = await import("../app.js");

async function authHeader(): Promise<Record<string, string>> {
  const token = await new SignJWT({
    sub: state.user.id,
    plan: state.user.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe("pipeline output webhook persistence", () => {
  it("persists output.deliver webhook fields on update", async () => {
    const headers = await authHeader();
    const definition = {
      name: "test-pipeline",
      version: 1,
      steps: [{ id: "step_1", name: "S1", type: "llm", model: "gpt-4o-mini" }],
      output: {
        from: "step_1",
        deliver: [
          {
            type: "webhook",
            url: "http://localhost:3001/api/webhooks/dev/outbound",
            method: "POST",
            signing_secret_name: "WEBHOOK_SIGNING_SECRET",
          },
        ],
      },
    };

    const res = await app.request(`/api/pipelines/${state.pipeline.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ definition }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.definition.output.deliver[0].type).toBe("webhook");
    expect(body.definition.output.deliver[0].url).toBe(
      "http://localhost:3001/api/webhooks/dev/outbound",
    );
    expect(body.definition.output.deliver[0].signing_secret_name).toBe(
      "WEBHOOK_SIGNING_SECRET",
    );

    expect(state.pipeline.definition.output.deliver[0].url).toBe(
      "http://localhost:3001/api/webhooks/dev/outbound",
    );
    expect(state.versions.length).toBeGreaterThan(0);
    expect(state.versions.at(-1)?.definition.output.deliver[0].type).toBe(
      "webhook",
    );
  });
});
