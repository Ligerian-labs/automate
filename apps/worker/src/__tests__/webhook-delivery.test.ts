import { describe, expect, it, mock } from "bun:test";
import {
  buildWebhookSignature,
  deliverWebhookWithRetry,
} from "../webhook-delivery.js";

describe("buildWebhookSignature", () => {
  it("creates deterministic signatures", () => {
    const sig = buildWebhookSignature("secret", "1700000000", '{"ok":true}');
    expect(sig).toBe(
      "v1=c1afc7c2df3db0690d7d75954610ed1a1d959ce96355ccb8c0a8bc09fd0cfc27",
    );
  });
});

describe("deliverWebhookWithRetry", () => {
  it("retries on 5xx and succeeds", async () => {
    const fetchMock = mock(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("fail", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    try {
      const attempts = await deliverWebhookWithRetry({
        url: "https://example.com/hook",
        signingSecret: "abc",
        envelope: {
          event: "pipeline.run.completed",
          pipeline: { id: "p1", version: 1, name: "P1" },
          run: {
            id: "r1",
            status: "completed",
            trigger_type: "webhook",
            started_at: "2026-01-01T00:00:00.000Z",
            completed_at: "2026-01-01T00:00:01.000Z",
          },
          input: {},
          output: { ok: true },
        },
      });

      expect(attempts.length).toBe(2);
      expect(attempts[0]?.ok).toBe(false);
      expect(attempts[1]?.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends webhook without signature header when signing secret is omitted", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-StepIQ-Event")).toBe("pipeline.run.completed");
      expect(headers.get("X-StepIQ-Timestamp")).toBeTruthy();
      expect(headers.get("X-StepIQ-Signature")).toBeNull();
      return new Response("ok", { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    try {
      const attempts = await deliverWebhookWithRetry({
        url: "https://example.com/hook",
        envelope: {
          event: "pipeline.run.completed",
          pipeline: { id: "p1", version: 1, name: "P1" },
          run: {
            id: "r1",
            status: "completed",
            trigger_type: "webhook",
            started_at: "2026-01-01T00:00:00.000Z",
            completed_at: "2026-01-01T00:00:01.000Z",
          },
          input: {},
          output: { ok: true },
        },
      });

      expect(attempts.length).toBe(1);
      expect(attempts[0]?.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
