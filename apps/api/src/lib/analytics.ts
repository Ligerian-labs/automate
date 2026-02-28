/**
 * Server-side PostHog analytics for stepIQ API.
 *
 * Tracks backend events that the frontend can't capture:
 * - pipeline_run_completed / pipeline_run_failed (worker-triggered)
 * - webhook_triggered (external)
 * - user_registered (server confirmation)
 */

import { PostHog } from "posthog-node";

const POSTHOG_KEY = process.env.POSTHOG_API_KEY || "";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!POSTHOG_KEY) return null;
  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: "https://us.i.posthog.com",
      flushAt: 10,
      flushInterval: 5000,
    });
  }
  return client;
}

export function serverTrack(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  const ph = getClient();
  if (!ph) return;
  ph.capture({
    distinctId: userId,
    event,
    properties,
  });
}

export function serverIdentify(
  userId: string,
  properties: Record<string, unknown>,
) {
  const ph = getClient();
  if (!ph) return;
  ph.identify({
    distinctId: userId,
    properties,
  });
}

export async function shutdownAnalytics() {
  if (client) await client.shutdown();
}
