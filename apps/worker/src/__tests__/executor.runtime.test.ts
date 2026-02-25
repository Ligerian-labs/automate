import { beforeEach, describe, expect, it, mock } from "bun:test";

const tables = {
  users: { __name: "users", id: "users.id" },
  pipelines: { __name: "pipelines", id: "pipelines.id" },
  schedules: { __name: "schedules", id: "schedules.id" },
  runs: { __name: "runs", id: "runs.id" },
  pipelineVersions: {
    __name: "pipelineVersions",
    pipelineId: "pipelineVersions.pipelineId",
    version: "pipelineVersions.version",
  },
  stepExecutions: { __name: "stepExecutions", id: "stepExecutions.id" },
  userSecrets: {
    __name: "userSecrets",
    userId: "userSecrets.userId",
    name: "userSecrets.name",
    encryptedValue: "userSecrets.encryptedValue",
  },
};

type StepExecRow = {
  id: string;
  runId: string;
  stepId: string;
  status: string;
  promptSent?: string;
  error?: string;
};

type TestState = {
  run: Record<string, unknown> | null;
  definition: Record<string, unknown> | null;
  userSecrets: Array<{ name: string; encryptedValue: string }>;
  stepExecutions: StepExecRow[];
  callModelImpl: () => Promise<{
    output: string;
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
  }>;
};

let state: TestState;

function getEqValue(
  cond: unknown,
  left: string,
): string | undefined {
  if (!cond || typeof cond !== "object") return undefined;
  const c = cond as Record<string, unknown>;
  if (c.type === "eq" && c.left === left && typeof c.right === "string") {
    return c.right;
  }
  if (c.type === "and" && Array.isArray(c.conds)) {
    for (const sub of c.conds) {
      const value = getEqValue(sub, left);
      if (value) return value;
    }
  }
  return undefined;
}

function createDbMock() {
  return {
    select: () => ({
      from: (table: { __name: string }) => ({
        where: (_cond: unknown) => {
          if (table.__name === "userSecrets") {
            return Promise.resolve(state.userSecrets);
          }
          return {
            limit: async (_n: number) => {
              if (table.__name === "runs") return state.run ? [state.run] : [];
              if (table.__name === "pipelineVersions") {
                return state.definition
                  ? [{ definition: state.definition }]
                  : [];
              }
              return [];
            },
          };
        },
      }),
    }),
    insert: (table: { __name: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table.__name !== "stepExecutions") return [];
          const row: StepExecRow = {
            id: `se-${state.stepExecutions.length + 1}`,
            runId: String(values.runId),
            stepId: String(values.stepId),
            status: String(values.status),
          };
          state.stepExecutions.push(row);
          return [row];
        },
      }),
    }),
    update: (table: { __name: string; id?: string }) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: async (cond: unknown) => {
          if (table.__name === "runs" && state.run) {
            state.run = { ...state.run, ...setValues };
            return [state.run];
          }
          if (table.__name === "stepExecutions") {
            const id = getEqValue(cond, tables.stepExecutions.id);
            if (!id) return [];
            const index = state.stepExecutions.findIndex((row) => row.id === id);
            if (index < 0) return [];
            state.stepExecutions[index] = {
              ...state.stepExecutions[index],
              ...setValues,
            };
            return [state.stepExecutions[index]];
          }
          return [];
        },
      }),
    }),
  };
}

mock.module("../db-executor.js", () => tables);
mock.module("postgres", () => ({ default: () => ({}) }));
mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: () => createDbMock(),
}));
mock.module("drizzle-orm", () => ({
  and: (...conds: unknown[]) => ({ type: "and", conds }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  inArray: (left: unknown, right: unknown[]) => ({ type: "inArray", left, right }),
}));
mock.module("../model-router.js", () => ({
  callModel: () => state.callModelImpl(),
}));
mock.module("../core-adapter.js", () => ({
  createKmsProvider: () => ({ getMasterKey: async () => Buffer.alloc(32, 1) }),
  decryptSecret: async () => "super-secret-value",
  redactSecrets: (text: string, secrets: string[]) =>
    secrets.reduce((acc, secret) => acc.split(secret).join("[REDACTED]"), text),
}));

const { executePipeline } = await import("../executor.js");

describe("executePipeline runtime behavior", () => {
  beforeEach(() => {
    state = {
      run: {
        id: "run-1",
        userId: "user-1",
        pipelineId: "pipe-1",
        pipelineVersion: 1,
        inputData: { topic: "AI" },
        status: "pending",
      },
      definition: {
        name: "Test pipeline",
        version: 1,
        steps: [
          {
            id: "s1",
            type: "llm",
            model: "gpt-4o-mini",
            prompt: "Secret {{env.API_KEY}}",
          },
          {
            id: "s2",
            type: "transform",
            prompt: "Second {{steps.s1.output}}",
          },
        ],
        output: { from: "s2" },
      },
      userSecrets: [
        {
          name: "API_KEY",
          encryptedValue: Buffer.from("encrypted").toString("base64"),
        },
      ],
      stepExecutions: [],
      callModelImpl: async () => ({
        output: "model-output",
        input_tokens: 100,
        output_tokens: 40,
        cost_cents: 3,
      }),
    };
  });

  it("completes a run and persists step execution details", async () => {
    await executePipeline("run-1");

    expect(state.run?.status).toBe("completed");
    expect(state.run?.totalTokens).toBe(140);
    expect(state.run?.totalCostCents).toBe(3);
    expect(state.run?.outputData).toBe("Second model-output");

    expect(state.stepExecutions).toHaveLength(2);
    expect(state.stepExecutions[0]?.status).toBe("completed");
    expect(state.stepExecutions[1]?.status).toBe("completed");
    expect(state.stepExecutions[0]?.promptSent).not.toContain("super-secret-value");
    expect(state.stepExecutions[0]?.promptSent).toContain("[REDACTED]");
  });

  it("fails run and marks step failed when model call throws", async () => {
    state.callModelImpl = async () => {
      throw new Error("provider error with super-secret-value");
    };
    state.definition = {
      name: "Failure pipeline",
      version: 1,
      steps: [
        {
          id: "s1",
          type: "llm",
          model: "gpt-4o-mini",
          prompt: "Use {{env.API_KEY}}",
        },
      ],
    };

    await executePipeline("run-1");

    expect(state.run?.status).toBe("failed");
    expect(String(state.run?.error || "")).toContain('Step "s1" failed');
    expect(String(state.run?.error || "")).not.toContain("super-secret-value");
    expect(state.stepExecutions).toHaveLength(1);
    expect(state.stepExecutions[0]?.status).toBe("failed");
    expect(String(state.stepExecutions[0]?.error || "")).toContain("[REDACTED]");
  });

  it("throws when run is missing", async () => {
    state.run = null;
    await expect(executePipeline("missing-run")).rejects.toThrow(
      "Run missing-run not found",
    );
  });
});
