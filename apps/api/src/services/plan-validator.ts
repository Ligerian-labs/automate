import { PLAN_LIMITS, type PipelineDefinition, type Plan } from "@stepiq/core";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { pipelines, runs, users } from "../db/schema.js";
import { rollUserBillingCycleIfNeeded } from "./billing-cycle.js";

type PlanLimitCode =
  | "PLAN_USER_NOT_FOUND"
  | "PLAN_MAX_PIPELINES"
  | "PLAN_MAX_STEPS"
  | "PLAN_MAX_RUNS_PER_DAY"
  | "PLAN_CREDITS_EXHAUSTED"
  | "PLAN_CRON_DISABLED"
  | "PLAN_WEBHOOKS_DISABLED"
  | "PLAN_API_DISABLED";

export class PlanValidationError extends Error {
  status: 403 | 404;
  code: PlanLimitCode;
  details?: Record<string, unknown>;

  constructor(
    code: PlanLimitCode,
    message: string,
    details?: Record<string, unknown>,
    status: 403 | 404 = 403,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isPlanValidationError(
  err: unknown,
): err is PlanValidationError {
  return err instanceof PlanValidationError;
}

async function getUserPlanState(userId: string): Promise<{
  plan: Plan;
  limits: (typeof PLAN_LIMITS)[Plan];
  creditsRemaining: number;
}> {
  await rollUserBillingCycleIfNeeded(userId);

  const [user] = await db
    .select({ plan: users.plan, creditsRemaining: users.creditsRemaining })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new PlanValidationError(
      "PLAN_USER_NOT_FOUND",
      "User not found",
      { userId },
      404,
    );
  }

  const plan = (user.plan in PLAN_LIMITS ? user.plan : "free") as Plan;
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    creditsRemaining: user.creditsRemaining,
  };
}

function utcDayWindow(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function assertCanCreatePipeline(userId: string): Promise<void> {
  const { plan, limits } = await getUserPlanState(userId);
  if (limits.max_pipelines < 0) return;

  const activePipelines = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.userId, userId), eq(pipelines.status, "active")));

  if (activePipelines.length >= limits.max_pipelines) {
    throw new PlanValidationError(
      "PLAN_MAX_PIPELINES",
      "Pipeline limit reached for current plan",
      {
        plan,
        limit: limits.max_pipelines,
        current: activePipelines.length,
      },
    );
  }
}

export async function assertPipelineDefinitionWithinPlan(
  userId: string,
  definition: PipelineDefinition,
): Promise<void> {
  const { plan, limits } = await getUserPlanState(userId);

  if (limits.max_steps_per_pipeline >= 0) {
    const stepCount = definition.steps?.length || 0;
    if (stepCount > limits.max_steps_per_pipeline) {
      throw new PlanValidationError(
        "PLAN_MAX_STEPS",
        "Step limit reached for current plan",
        {
          plan,
          limit: limits.max_steps_per_pipeline,
          current: stepCount,
        },
      );
    }
  }

  const hasWebhookDelivery = Boolean(
    definition.output?.deliver?.some((d) => d.type === "webhook"),
  );
  if (hasWebhookDelivery && !limits.webhooks_enabled) {
    throw new PlanValidationError(
      "PLAN_WEBHOOKS_DISABLED",
      "Webhook delivery is not enabled for current plan",
      { plan },
    );
  }
}

export async function assertCanTriggerRun(userId: string): Promise<void> {
  const { plan, limits, creditsRemaining } = await getUserPlanState(userId);
  if (limits.credits >= 0 && creditsRemaining <= 0) {
    throw new PlanValidationError(
      "PLAN_CREDITS_EXHAUSTED",
      "Credits exhausted for current plan",
      { plan, remaining: creditsRemaining },
    );
  }
  if (limits.max_runs_per_day < 0) return;

  const { start, end } = utcDayWindow();
  const runsToday = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        gte(runs.createdAt, start),
        lte(runs.createdAt, end),
      ),
    );

  if (runsToday.length >= limits.max_runs_per_day) {
    throw new PlanValidationError(
      "PLAN_MAX_RUNS_PER_DAY",
      "Daily run limit reached for current plan",
      {
        plan,
        limit: limits.max_runs_per_day,
        current: runsToday.length,
      },
    );
  }
}

export async function assertCanUseCron(userId: string): Promise<void> {
  const { plan, limits } = await getUserPlanState(userId);
  if (limits.cron_enabled) return;

  throw new PlanValidationError(
    "PLAN_CRON_DISABLED",
    "Cron scheduling is not enabled for current plan",
    { plan },
  );
}

export async function assertCanUseApi(userId: string): Promise<void> {
  const { plan, limits } = await getUserPlanState(userId);
  if (limits.api_enabled) return;

  throw new PlanValidationError(
    "PLAN_API_DISABLED",
    "API access is not enabled for current plan",
    { plan },
  );
}
