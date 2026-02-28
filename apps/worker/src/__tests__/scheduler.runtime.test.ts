import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const tables = {
  schedules: {
    __name: "schedules",
    id: "schedules.id",
    enabled: "schedules.enabled",
    nextRunAt: "schedules.nextRunAt",
    pipelineId: "schedules.pipelineId",
  },
  pipelines: {
    __name: "pipelines",
    id: "pipelines.id",
  },
  runs: {
    __name: "runs",
    id: "runs.id",
    userId: "runs.userId",
    createdAt: "runs.createdAt",
  },
  users: {
    __name: "users",
    id: "users.id",
    plan: "users.plan",
  },
  pipelineVersions: { __name: "pipelineVersions", id: "pipelineVersions.id" },
  stepExecutions: { __name: "stepExecutions", id: "stepExecutions.id" },
  userSecrets: { __name: "userSecrets", id: "userSecrets.id" },
};

type SchedulerState = {
  schedules: Array<{
    id: string;
    pipelineId: string;
    cronExpression: string;
    timezone: string;
    enabled: boolean;
    nextRunAt: Date;
    inputData: Record<string, unknown>;
  }>;
  pipelines: Array<{
    id: string;
    userId: string;
    version: number;
  }>;
  users: Array<{ id: string; plan: string }>;
  existingRunsToday: Array<{ id: string; userId: string; createdAt: Date }>;
  insertedRuns: Array<Record<string, unknown>>;
  updatedSchedules: Array<{ id: string; set: Record<string, unknown> }>;
  queueAdds: Array<{ name: string; data: Record<string, unknown> }>;
};

let state: SchedulerState;
let intervalHandler: (() => Promise<void>) | null = null;
const originalSetInterval = globalThis.setInterval;

function getEqValue(cond: unknown, left: string): string | undefined {
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
          if (table.__name === "schedules") {
            return {
              limit: async () =>
                state.schedules.filter((schedule) => schedule.enabled),
            };
          }
          if (table.__name === "pipelines") {
            return {
              limit: async () => {
                const pipelineId = getEqValue(_cond, tables.pipelines.id);
                const row = state.pipelines.find(
                  (pipeline) => pipeline.id === pipelineId,
                );
                return row ? [row] : [];
              },
            };
          }
          if (table.__name === "users") {
            return {
              limit: async () => {
                const userId = getEqValue(_cond, tables.users.id);
                const row = state.users.find((user) => user.id === userId);
                return row ? [row] : [];
              },
            };
          }
          if (table.__name === "runs") {
            return Promise.resolve(state.existingRunsToday);
          }
          return { limit: async () => [] };
        },
      }),
    }),
    insert: (table: { __name: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table.__name !== "runs") return [];
          const run = {
            ...values,
            id: `run-${state.insertedRuns.length + 1}`,
          };
          state.insertedRuns.push(run);
          return [run];
        },
      }),
    }),
    update: (table: { __name: string }) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: async (cond: unknown) => {
          if (table.__name !== "schedules") return [];
          const id = getEqValue(cond, tables.schedules.id);
          if (!id) return [];
          state.updatedSchedules.push({ id, set: setValues });
          return [];
        },
      }),
    }),
  };
}

class QueueMock {
  add(name: string, data: Record<string, unknown>) {
    state.queueAdds.push({ name, data });
    return Promise.resolve();
  }
}

mock.module("../db-scheduler.js", () => tables);
mock.module("postgres", () => ({ default: () => ({}) }));
mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: () => createDbMock(),
}));
mock.module("drizzle-orm", () => ({
  and: (...conds: unknown[]) => ({ type: "and", conds }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  gte: (left: unknown, right: unknown) => ({ type: "gte", left, right }),
  lte: (left: unknown, right: unknown) => ({ type: "lte", left, right }),
  inArray: (left: unknown, right: unknown[]) => ({
    type: "inArray",
    left,
    right,
  }),
}));
mock.module("bullmq", () => ({ Queue: QueueMock }));

const { startScheduler } = await import("../scheduler.js");

describe("scheduler runtime behavior", () => {
  beforeEach(() => {
    state = {
      schedules: [
        {
          id: "sch-1",
          pipelineId: "pipe-1",
          cronExpression: "0 9 * * MON",
          timezone: "UTC",
          enabled: true,
          nextRunAt: new Date(Date.now() - 60_000),
          inputData: { topic: "AI" },
        },
      ],
      pipelines: [{ id: "pipe-1", userId: "user-1", version: 3 }],
      users: [{ id: "user-1", plan: "pro" }],
      existingRunsToday: [],
      insertedRuns: [],
      updatedSchedules: [],
      queueAdds: [],
    };

    intervalHandler = null;
    globalThis.setInterval = ((handler: TimerHandler) => {
      intervalHandler = handler as () => Promise<void>;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval;
  });

  afterEach(() => {
    globalThis.setInterval = originalSetInterval;
  });

  it("creates and enqueues runs for due schedules when lock is acquired", async () => {
    const connection = {
      set: async () => "OK",
      eval: async () => 1,
    };

    startScheduler(connection as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.insertedRuns).toHaveLength(1);
    expect(state.insertedRuns[0]?.triggerType).toBe("cron");
    expect(state.queueAdds).toHaveLength(1);
    expect(state.queueAdds[0]?.name).toBe("execute");
    expect(state.updatedSchedules).toHaveLength(1);
    expect(state.updatedSchedules[0]?.id).toBe("sch-1");
    expect(intervalHandler).not.toBeNull();
  });

  it("does nothing when lock is not acquired", async () => {
    const connection = {
      set: async () => null,
      eval: async () => 1,
    };

    startScheduler(connection as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.insertedRuns).toHaveLength(0);
    expect(state.queueAdds).toHaveLength(0);
    expect(state.updatedSchedules).toHaveLength(0);
  });

  it("skips run creation when cron is disabled for plan", async () => {
    state.users = [{ id: "user-1", plan: "free" }];

    const connection = {
      set: async () => "OK",
      eval: async () => 1,
    };

    startScheduler(connection as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.insertedRuns).toHaveLength(0);
    expect(state.queueAdds).toHaveLength(0);
    expect(state.updatedSchedules).toHaveLength(1);
  });

  it("skips run creation when daily run cap is reached", async () => {
    state.users = [{ id: "user-1", plan: "free" }];
    state.existingRunsToday = Array.from({ length: 10 }).map((_, idx) => ({
      id: `existing-${idx + 1}`,
      userId: "user-1",
      createdAt: new Date(),
    }));

    const connection = {
      set: async () => "OK",
      eval: async () => 1,
    };

    startScheduler(connection as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.insertedRuns).toHaveLength(0);
    expect(state.queueAdds).toHaveLength(0);
    expect(state.updatedSchedules).toHaveLength(1);
  });
});
