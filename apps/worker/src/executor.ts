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
import { deliverWebhookWithRetry } from "./webhook-delivery.js";

const dbUrl =
  process.env.DATABASE_URL || "postgres://stepiq:stepiq@localhost:5432/stepiq";
const client = postgres(dbUrl);
const db = drizzle(client);

function isMissingPipelineIdColumnError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  if (message.includes("pipeline_id") && message.includes("does not exist")) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    (err.code === "42703" || message.includes("42703")) &&
    ((err.message?.includes("pipeline_id") ?? false) ||
      (err.message?.includes("user_secrets.pipeline_id") ?? false) ||
      message.includes("pipeline_id"))
  );
}

export async function executePipeline(runId: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);

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

  const runStartedAt = new Date();
  await db
    .update(runs)
    .set({ status: "running", startedAt: runStartedAt })
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
    envSecrets = await resolveUserSecrets(
      run.userId,
      run.pipelineId,
      definition,
      db,
      getOutputSigningSecretNames(definition),
    );
    context = {
      ...context,
      env: envSecrets.values,
    };

    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i];

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
        const stepContext = context.steps as Record<string, { output: unknown }>;
        stepContext[step.id] = { output: parsedOutput };
        if (!(String(i) in stepContext)) stepContext[String(i)] = { output: parsedOutput };
        if (!(String(i + 1) in stepContext)) {
          stepContext[String(i + 1)] = { output: parsedOutput };
        }

        totalTokens += inputTokens + outputTokens;
        totalCostCents += costCents;

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

    const outputStepId =
      definition.output?.from ||
      definition.steps[definition.steps.length - 1].id;
    const outputData = (context.steps as Record<string, { output: unknown }>)[
      outputStepId
    ]?.output;
    const completedAt = new Date();

    await db
      .update(runs)
      .set({
        status: "completed",
        outputData: outputData === undefined ? null : outputData,
        totalTokens,
        totalCostCents,
        completedAt,
      })
      .where(eq(runs.id, runId));

    await deliverOutputWebhooks({
      definition,
      run,
      runId,
      runStartedAt,
      completedAt,
      inputData: (run.inputData || {}) as Record<string, unknown>,
      outputData,
      envValues: envSecrets.values,
    });
    // TODO: Deduct credits from user
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    const error = redactSecrets(rawError, envSecrets.plainValues);
    console.error(`❌ Run ${runId} failed before completion: ${error}`);
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

async function resolveUserSecrets(
  userId: string,
  pipelineId: string,
  definition: PipelineDefinition,
  database: typeof db,
  additionalNames: string[] = [],
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

  const allText = definition.steps
    .map((s) => `${s.prompt || ""} ${s.system_prompt || ""}`)
    .join(" ");
  const refs = allText.match(/\{\{env\.(\w+)\}\}/g);
  const referencedNames = refs
    ? refs.map((r) => r.match(/\{\{env\.(\w+)\}\}/)?.[1]).filter(Boolean)
    : [];
  const names = [
    ...new Set([...providerSecretNames, ...referencedNames, ...additionalNames]),
  ] as string[];
  if (names.length === 0) return { values: {}, plainValues: [] };

  let secrets: Array<{
    name: string;
    pipelineId: string | null;
    encryptedValue: string;
  }> = [];
  try {
    secrets = await database
      .select({
        name: userSecrets.name,
        pipelineId: userSecrets.pipelineId,
        encryptedValue: userSecrets.encryptedValue,
      })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), inArray(userSecrets.name, names)));
  } catch (error) {
    if (!isMissingPipelineIdColumnError(error)) throw error;
    const legacySecrets = await database
      .select({
        name: userSecrets.name,
        encryptedValue: userSecrets.encryptedValue,
      })
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), inArray(userSecrets.name, names)));
    secrets = legacySecrets.map((secret) => ({
      ...secret,
      pipelineId: null,
    }));
  }

  if (secrets.length === 0) return { values: {}, plainValues: [] };

  const scopedSecrets = secrets.filter(
    (secret) => secret.pipelineId === pipelineId || secret.pipelineId == null,
  );
  if (scopedSecrets.length === 0) return { values: {}, plainValues: [] };

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

  const sortedSecrets = [...scopedSecrets].sort((a, b) => {
    const aPipeline = (a as { pipelineId?: string | null }).pipelineId;
    const bPipeline = (b as { pipelineId?: string | null }).pipelineId;
    if (aPipeline && !bPipeline) return 1;
    if (!aPipeline && bPipeline) return -1;
    return 0;
  });

  for (const secret of sortedSecrets) {
    const blob = Buffer.from(secret.encryptedValue, "base64");
    const plaintext = await decryptSecret(userId, blob, masterKey);
    values[secret.name] = plaintext;
    plainValues.push(plaintext);
  }

  return { values, plainValues };
}

function getOutputSigningSecretNames(definition: PipelineDefinition): string[] {
  return (definition.output?.deliver || [])
    .filter((delivery) => delivery.type === "webhook")
    .map((delivery) => {
      const raw = (delivery as Record<string, unknown>).signing_secret_name;
      return typeof raw === "string" ? raw : undefined;
    })
    .filter((name): name is string => Boolean(name));
}

async function deliverOutputWebhooks(params: {
  definition: PipelineDefinition;
  run: {
    pipelineId: string;
    pipelineVersion: number;
    triggerType: string;
  };
  runId: string;
  runStartedAt: Date;
  completedAt: Date;
  inputData: Record<string, unknown>;
  outputData: unknown;
  envValues: Record<string, string>;
}) {
  const targets = (params.definition.output?.deliver || []).filter(
    (delivery) => delivery.type === "webhook" && delivery.url,
  );
  for (const target of targets) {
    const rawSecretName = (target as Record<string, unknown>).signing_secret_name;
    const secretName = typeof rawSecretName === "string" ? rawSecretName : undefined;
    const signingSecret = secretName ? params.envValues[secretName] : undefined;
    if (secretName && !signingSecret) {
      console.warn(
        `⚠️ Run ${params.runId}: webhook ${target.url} signing secret "${secretName}" not found; sending unsigned`,
      );
    }

    const attempts = await deliverWebhookWithRetry({
      url: target.url as string,
      method: target.method,
      signingSecret,
      envelope: {
        event: "pipeline.run.completed",
        pipeline: {
          id: params.run.pipelineId,
          version: params.run.pipelineVersion,
          name: params.definition.name,
        },
        run: {
          id: params.runId,
          status: "completed",
          trigger_type: params.run.triggerType,
          started_at: params.runStartedAt.toISOString(),
          completed_at: params.completedAt.toISOString(),
        },
        input: params.inputData,
        output: params.outputData,
      },
    });

    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.ok) {
      console.log(
        `✅ Run ${params.runId}: delivered webhook ${target.url} in ${attempts.length} attempt(s)`,
      );
    } else {
      console.error(
        `❌ Run ${params.runId}: failed webhook delivery to ${target.url}`,
        attempts,
      );
    }
  }
}
