/**
 * Server-side PostHog analytics for stepIQ worker.
 *
 * Tracks pipeline execution outcomes.
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
  ph.capture({ distinctId: userId, event, properties });
}
