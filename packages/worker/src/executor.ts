import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Handlebars from "handlebars";
import { runs, stepExecutions, pipelines, pipelineVersions, users } from "./db-schema.js";
import { callModel } from "./model-router.js";
import type { PipelineDefinition, PipelineStep } from "@automate/shared";

const dbUrl = process.env.DATABASE_URL || "postgres://automate:automate@localhost:5432/automate";
const client = postgres(dbUrl);
const db = drizzle(client);

export async function executePipeline(runId: string) {
  // Load run
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);

  // Load pipeline definition
  const [version] = await db
    .select()
    .from(pipelineVersions)
    .where(eq(pipelineVersions.pipelineId, run.pipelineId))
    .orderBy(pipelineVersions.version)
    .limit(1);

  const definition = version?.definition as unknown as PipelineDefinition;
  if (!definition) throw new Error("Pipeline definition not found");

  // Mark as running
  await db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, runId));

  const context: Record<string, unknown> = {
    input: run.inputData,
    vars: definition.variables || {},
    steps: {} as Record<string, { output: unknown }>,
  };

  let totalTokens = 0;
  let totalCostCents = 0;

  try {
    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i];

      // Create step execution record
      const [stepExec] = await db
        .insert(stepExecutions)
        .values({
          runId,
          stepId: step.id,
          stepIndex: i,
          model: step.model || null,
          status: "running",
          startedAt: new Date(),
        })
        .returning();

      try {
        // Interpolate prompt
        const prompt = step.prompt ? interpolate(step.prompt, context) : "";

        // Call model
        const startTime = Date.now();
        const result = await callModel({
          model: step.model || "gpt-4o-mini",
          prompt,
          system: step.system_prompt ? interpolate(step.system_prompt, context) : undefined,
          temperature: step.temperature,
          max_tokens: step.max_tokens,
          output_format: step.output_format,
        });
        const durationMs = Date.now() - startTime;

        // Parse output
        let parsedOutput: unknown = result.output;
        if (step.output_format === "json") {
          try {
            parsedOutput = JSON.parse(result.output);
          } catch {
            // Keep as string if JSON parse fails
          }
        }

        // Store step result in context
        (context.steps as Record<string, { output: unknown }>)[step.id] = {
          output: parsedOutput,
        };

        totalTokens += result.input_tokens + result.output_tokens;
        totalCostCents += result.cost_cents;

        // Update step execution
        await db
          .update(stepExecutions)
          .set({
            status: "completed",
            promptSent: prompt,
            rawOutput: result.output,
            parsedOutput,
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens,
            costCents: result.cost_cents,
            durationMs,
            completedAt: new Date(),
          })
          .where(eq(stepExecutions.id, stepExec.id));

        // TODO: Handle on_condition branching
      } catch (stepErr) {
        const error = stepErr instanceof Error ? stepErr.message : String(stepErr);

        await db
          .update(stepExecutions)
          .set({ status: "failed", error, completedAt: new Date() })
          .where(eq(stepExecutions.id, stepExec.id));

        throw new Error(`Step "${step.id}" failed: ${error}`);
      }
    }

    // Get final output
    const outputStepId = definition.output?.from || definition.steps[definition.steps.length - 1].id;
    const outputData = (context.steps as Record<string, { output: unknown }>)[outputStepId]?.output;

    // Mark run as completed
    await db
      .update(runs)
      .set({
        status: "completed",
        outputData: outputData as Record<string, unknown>,
        totalTokens,
        totalCostCents,
        completedAt: new Date(),
      })
      .where(eq(runs.id, runId));

    // TODO: Deliver output (webhook, email, etc.)
    // TODO: Deduct credits from user
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(runs)
      .set({ status: "failed", error, completedAt: new Date(), totalTokens, totalCostCents })
      .where(eq(runs.id, runId));
  }
}

function interpolate(template: string, context: Record<string, unknown>): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(context);
}
