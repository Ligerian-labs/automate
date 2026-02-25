import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { pipelines, schedules } from "../db/schema.js";
import { getNextCronTick } from "./cron.js";

type CreateScheduleInput = {
  name: string;
  description?: string;
  cron_expression: string;
  timezone: string;
  input_data?: Record<string, unknown>;
  enabled?: boolean;
};

type CreateScheduleResult =
  | { schedule: typeof schedules.$inferSelect; error?: never }
  | { schedule?: never; error: string };

export async function createScheduleForPipeline(
  userId: string,
  pipelineId: string,
  input: CreateScheduleInput,
): Promise<CreateScheduleResult> {
  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.userId, userId)))
    .limit(1);

  if (!pipeline) return { error: "Pipeline not found" };

  let nextRun: Date;
  try {
    nextRun = getNextCronTick(input.cron_expression, input.timezone);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Invalid schedule";
    return { error };
  }

  const [schedule] = await db
    .insert(schedules)
    .values({
      pipelineId,
      name: input.name,
      description: input.description ?? null,
      cronExpression: input.cron_expression,
      timezone: input.timezone || "UTC",
      inputData: input.input_data || {},
      enabled: input.enabled ?? true,
      nextRunAt: nextRun,
    })
    .returning();

  return { schedule };
}
