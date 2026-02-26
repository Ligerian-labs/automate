import {
  createKmsProvider,
  decryptSecret,
  redactSecrets,
  type PipelineDefinition,
} from "./core-adapter.js";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import Handlebars from "handlebars";
import postgres from "postgres";
import {
  pipelineVersions,
  runs,
  stepExecutions,
  userSecrets,
} from "./db-executor.js";
import { callModel } from "./model-router.js";

const dbUrl =
  process.env.DATABASE_URL || "postgres://stepiq:stepiq@localhost:5432/stepiq";
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
    .where(
      and(
        eq(pipelineVersions.pipelineId, run.pipelineId),
        eq(pipelineVersions.version, run.pipelineVersion),
      ),
    )
    .limit(1);

  const definition = version?.definition as unknown as PipelineDefinition;
  if (!definition) throw new Error("Pipeline definition not found");

  // Mark as running
  await db
    .update(runs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(runs.id, runId));

  let envSecrets: { values: Record<string, string>; plainValues: string[] } = {
    values: {},
    plainValues: [],
  };
  let context: Record<string, unknown> = {
    input: run.inputData,
    vars: definition.variables || {},
    env: {},
    steps: {} as Record<string, { output: unknown }>,
  };

  let totalTokens = 0;
  let totalCostCents = 0;

  try {
    // Resolve user secrets for {{env.xxx}} interpolation
    envSecrets = await resolveUserSecrets(run.userId, definition, db);
    context = {
      ...context,
      env: envSecrets.values,
    };

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
        const stepType = step.type || "llm";
        const startTime = Date.now();

        let rawOutput = "";
        let parsedOutput: unknown;
        let inputTokens = 0;
        let outputTokens = 0;
        let costCents = 0;

        if (stepType === "llm") {
          const result = await callModel({
            model: step.model || "gpt-5.2",
            prompt,
            system: step.system_prompt
              ? interpolate(step.system_prompt, context)
              : undefined,
            temperature: step.temperature,
            max_tokens: step.max_tokens,
            output_format: step.output_format,
            api_keys: {
              openai:
                envSecrets.values.OPENAI_API_KEY ||
                envSecrets.values.openai_api_key,
              anthropic:
                envSecrets.values.ANTHROPIC_API_KEY ||
                envSecrets.values.anthropic_api_key,
              gemini:
                envSecrets.values.GEMINI_API_KEY ||
                envSecrets.values.GOOGLE_API_KEY ||
                envSecrets.values.gemini_api_key ||
                envSecrets.values.google_api_key,
              mistral:
                envSecrets.values.MISTRAL_API_KEY ||
                envSecrets.values.mistral_api_key,
            },
          });

          rawOutput = result.output;
          parsedOutput = result.output;
          inputTokens = result.input_tokens;
          outputTokens = result.output_tokens;
          costCents = result.cost_cents;

          if (step.output_format === "json") {
            try {
              parsedOutput = JSON.parse(result.output);
            } catch {
              parsedOutput = result.output;
            }
          }
        } else if (stepType === "transform") {
          rawOutput = prompt;
          parsedOutput = prompt;
        } else {
          throw new Error(`Step type "${stepType}" is not implemented`);
        }

        const durationMs = Date.now() - startTime;

        // Store step result in context
        (context.steps as Record<string, { output: unknown }>)[step.id] = {
          output: parsedOutput,
        };

        totalTokens += inputTokens + outputTokens;
        totalCostCents += costCents;

        // Update step execution (redact secrets from stored prompt)
        await db
          .update(stepExecutions)
          .set({
            status: "completed",
            promptSent: redactSecrets(prompt, envSecrets.plainValues),
            rawOutput,
            parsedOutput,
            inputTokens,
            outputTokens,
            costCents,
            durationMs,
            completedAt: new Date(),
          })
          .where(eq(stepExecutions.id, stepExec.id));

        // TODO: Handle on_condition branching
      } catch (stepErr) {
        const rawError =
          stepErr instanceof Error ? stepErr.message : String(stepErr);
        const error = redactSecrets(rawError, envSecrets.plainValues);

        await db
          .update(stepExecutions)
          .set({ status: "failed", error, completedAt: new Date() })
          .where(eq(stepExecutions.id, stepExec.id));

        throw new Error(`Step "${step.id}" failed: ${error}`);
      }
    }

    // Get final output
    const outputStepId =
      definition.output?.from ||
      definition.steps[definition.steps.length - 1].id;
    const outputData = (context.steps as Record<string, { output: unknown }>)[
      outputStepId
    ]?.output;

    // Mark run as completed
    await db
      .update(runs)
      .set({
        status: "completed",
        outputData: outputData === undefined ? null : outputData,
        totalTokens,
        totalCostCents,
        completedAt: new Date(),
      })
      .where(eq(runs.id, runId));

    // TODO: Deliver output (webhook, email, etc.)
    // TODO: Deduct credits from user
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    const error = redactSecrets(rawError, envSecrets.plainValues);
    await db
      .update(runs)
      .set({
        status: "failed",
        error,
        completedAt: new Date(),
        totalTokens,
        totalCostCents,
      })
      .where(eq(runs.id, runId));
  }
}

function interpolate(
  template: string,
  context: Record<string, unknown>,
): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(context);
}

/**
 * Resolve user secrets referenced via {{env.xxx}} in prompts.
 * Decryption ONLY happens in the worker per ENCRYPTION.md §8.
 */
async function resolveUserSecrets(
  userId: string,
  definition: PipelineDefinition,
  database: typeof db,
): Promise<{ values: Record<string, string>; plainValues: string[] }> {
  const providerSecretNames = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "MISTRAL_API_KEY",
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "google_api_key",
    "mistral_api_key",
  ];

  // Find all {{env.xxx}} references across all step prompts
  const allText = definition.steps
    .map((s) => `${s.prompt || ""} ${s.system_prompt || ""}`)
    .join(" ");
  const refs = allText.match(/\{\{env\.(\w+)\}\}/g);
  const referencedNames = refs
    ? refs.map((r) => r.match(/\{\{env\.(\w+)\}\}/)?.[1]).filter(Boolean)
    : [];
  const names = [...new Set([...providerSecretNames, ...referencedNames])] as string[];
  if (names.length === 0) return { values: {}, plainValues: [] };

  // Fetch encrypted secrets from DB
  const secrets = await database
    .select({
      name: userSecrets.name,
      encryptedValue: userSecrets.encryptedValue,
    })
    .from(userSecrets)
    .where(
      and(eq(userSecrets.userId, userId), inArray(userSecrets.name, names)),
    );

  if (secrets.length === 0) return { values: {}, plainValues: [] };

  // Decrypt — lazily init KMS
  let masterKey: Buffer;
  try {
    masterKey = await createKmsProvider().getMasterKey();
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? ` (${error.message})` : "";
    throw new Error(
      `Worker cannot decrypt secrets: configure STEPIQ_MASTER_KEY or Vault KMS${reason}`,
    );
  }

  const values: Record<string, string> = {};
  const plainValues: string[] = [];

  for (const secret of secrets) {
    const blob = Buffer.from(secret.encryptedValue, "base64");
    const plaintext = await decryptSecret(userId, blob, masterKey);
    values[secret.name] = plaintext;
    plainValues.push(plaintext);
  }

  return { values, plainValues };
}
