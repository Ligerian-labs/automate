import {
  type PipelineDefinition,
  uuidParam,
  webhookTriggerSchema,
} from "@stepiq/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { pipelines, runs } from "../db/schema.js";
import { authenticateApiKey, extractApiKey } from "../services/api-keys.js";
import { validateInputAgainstPipelineSchema } from "../services/input-schema.js";
import {
  assertCanUseApi,
  isPlanValidationError,
  resolveRunFundingModeForPipeline,
} from "../services/plan-validator.js";
import { enqueueRun } from "../services/queue.js";

export const webhookRoutes = new Hono();

type DevWebhookCapture = {
  id: string;
  receivedAt: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};

const MAX_DEV_EVENTS = 100;
const devOutboundEvents: DevWebhookCapture[] = [];

function canUseDevWebhookEndpoint() {
  return (
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
  );
}

function pushDevEvent(event: DevWebhookCapture) {
  devOutboundEvents.unshift(event);
  if (devOutboundEvents.length > MAX_DEV_EVENTS) {
    devOutboundEvents.length = MAX_DEV_EVENTS;
  }
}

// Local debugging sink for outbound delivery
webhookRoutes.post("/dev/outbound", async (c) => {
  if (!canUseDevWebhookEndpoint()) return c.json({ error: "Not found" }, 404);

  const textBody = await c.req.text();
  let body: unknown = textBody;
  if (textBody.trim().length > 0) {
    try {
      body = JSON.parse(textBody);
    } catch {
      body = textBody;
    }
  } else {
    body = {};
  }

  const headers = Object.fromEntries(
    Array.from(c.req.raw.headers.entries()).map(([k, v]) => [k, v]),
  );

  const capture: DevWebhookCapture = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    headers,
    body,
  };
  pushDevEvent(capture);

  return c.json(
    {
      ok: true,
      message: "Captured outbound webhook event",
      event: capture,
    },
    200,
  );
});

webhookRoutes.get("/dev/outbound/events", (c) => {
  if (!canUseDevWebhookEndpoint()) return c.json({ error: "Not found" }, 404);
  return c.json({
    count: devOutboundEvents.length,
    events: devOutboundEvents,
  });
});

webhookRoutes.delete("/dev/outbound/events", (c) => {
  if (!canUseDevWebhookEndpoint()) return c.json({ error: "Not found" }, 404);
  devOutboundEvents.length = 0;
  return c.json({ cleared: true });
});

// Inbound webhook trigger for pipelines
webhookRoutes.post("/:pipelineId", async (c) => {
  const pipelineIdParsed = uuidParam.safeParse(c.req.param("pipelineId"));
  if (!pipelineIdParsed.success) {
    return c.json({ error: "Invalid pipeline ID format" }, 400);
  }
  const pipelineId = pipelineIdParsed.data;

  const rawKey = extractApiKey(c);
  if (!rawKey) return c.json({ error: "Unauthorized" }, 401);

  const auth = await authenticateApiKey(rawKey, "webhooks:trigger");
  if (!auth) return c.json({ error: "Invalid API key" }, 401);

  try {
    await assertCanUseApi(auth.userId);
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const [pipeline] = await db
    .select({
      id: pipelines.id,
      userId: pipelines.userId,
      version: pipelines.version,
      definition: pipelines.definition,
    })
    .from(pipelines)
    .where(
      and(
        eq(pipelines.id, pipelineId),
        eq(pipelines.userId, auth.userId),
        eq(pipelines.status, "active"),
      ),
    )
    .limit(1);
  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  let fundingMode: "legacy" | "app_credits" | "byok_required";
  try {
    const resolved = await resolveRunFundingModeForPipeline(
      auth.userId,
      pipeline.id,
      pipeline.definition as PipelineDefinition,
    );
    fundingMode = resolved.fundingMode;
  } catch (err) {
    if (isPlanValidationError(err)) {
      return c.json(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    throw err;
  }

  const body = await c.req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsedBody = webhookTriggerSchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json({ error: parsedBody.error.flatten() }, 400);
  }

  const inputData =
    parsedBody.data.input_data &&
    typeof parsedBody.data.input_data === "object" &&
    !Array.isArray(parsedBody.data.input_data)
      ? parsedBody.data.input_data
      : parsedBody.data;

  const validation = validateInputAgainstPipelineSchema(
    pipeline.definition as PipelineDefinition,
    inputData as Record<string, unknown>,
  );
  if (!validation.valid) {
    return c.json(
      {
        error: "Input validation failed",
        issues: validation.issues,
      },
      422,
    );
  }

  const [run] = await db
    .insert(runs)
    .values({
      pipelineId: pipeline.id,
      pipelineVersion: pipeline.version,
      userId: pipeline.userId,
      triggerType: "webhook",
      status: "pending",
      inputData: validation.data,
      fundingMode,
    })
    .returning({ id: runs.id, status: runs.status });

  await enqueueRun(run.id);
  return c.json(
    {
      accepted: true,
      run_id: run.id,
      status: run.status,
      pipeline_id: pipeline.id,
    },
    202,
  );
});
