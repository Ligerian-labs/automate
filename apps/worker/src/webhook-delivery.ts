import { createHmac } from "node:crypto";

export interface WebhookEnvelope {
  event: "pipeline.run.completed";
  pipeline: {
    id: string;
    version: number;
    name: string;
  };
  run: {
    id: string;
    status: string;
    trigger_type: string;
    started_at: string | null;
    completed_at: string | null;
  };
  input: Record<string, unknown>;
  output: unknown;
  meta: {
    sent_at: string;
    attempt: number;
  };
}

export interface DeliveryAttemptResult {
  ok: boolean;
  attempt: number;
  statusCode?: number;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildWebhookSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
): string {
  const payload = `${timestamp}.${body}`;
  const digest = createHmac("sha256", signingSecret)
    .update(payload, "utf8")
    .digest("hex");
  return `v1=${digest}`;
}

export async function deliverWebhookWithRetry(params: {
  url: string;
  method?: "POST" | "PUT" | "GET";
  signingSecret?: string;
  envelope: Omit<WebhookEnvelope, "meta">;
  maxAttempts?: number;
  timeoutMs?: number;
}): Promise<DeliveryAttemptResult[]> {
  const maxAttempts = params.maxAttempts ?? 4;
  const timeoutMs = params.timeoutMs ?? 10_000;
  const method = params.method ?? "POST";
  const results: DeliveryAttemptResult[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const envelope: WebhookEnvelope = {
      ...params.envelope,
      meta: {
        sent_at: new Date().toISOString(),
        attempt,
      },
    };
    const body = JSON.stringify(envelope);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = params.signingSecret
      ? buildWebhookSignature(params.signingSecret, timestamp, body)
      : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-StepIQ-Event": envelope.event,
      "X-StepIQ-Timestamp": timestamp,
    };
    if (signature) {
      headers["X-StepIQ-Signature"] = signature;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(params.url, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
        signal: controller.signal,
      });

      const result: DeliveryAttemptResult = {
        ok: response.ok,
        attempt,
        statusCode: response.status,
      };
      results.push(result);

      if (response.ok) return results;
      if (response.status >= 400 && response.status < 500) return results;
    } catch (error) {
      results.push({
        ok: false,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      const backoff = 1000 * 2 ** (attempt - 1);
      await sleep(backoff);
    }
  }

  return results;
}
