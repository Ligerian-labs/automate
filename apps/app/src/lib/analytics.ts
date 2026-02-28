/**
 * PostHog Analytics — centralized tracking for stepIQ app.
 *
 * Events:
 *   Auth:     user_signed_up, user_logged_in, user_logged_out
 *   Pipeline: pipeline_created, pipeline_saved, pipeline_deleted, pipeline_run_triggered
 *   Run:      run_viewed, run_cancelled
 *   Schedule: schedule_created, schedule_deleted
 *   Secret:   secret_created, secret_updated, secret_deleted
 *   Settings: settings_viewed, api_key_created, billing_checkout_started
 *   Nav:      page_viewed (automatic via router)
 */

import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false, // we handle this manually via router
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

/** Identify user after login/register */
export function identifyUser(user: {
  id: string;
  email: string;
  name?: string | null;
  plan?: string;
}) {
  if (!POSTHOG_KEY) return;
  posthog.identify(user.id, {
    email: user.email,
    name: user.name ?? undefined,
    plan: user.plan ?? "free",
  });
}

/** Reset identity on logout */
export function resetAnalytics() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

/** Track page view (called from router) */
export function trackPageView(path: string) {
  if (!POSTHOG_KEY) return;
  posthog.capture("$pageview", { $current_url: window.location.href, path });
}

/** Generic event capture */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

// ── Typed event helpers ──

export function trackSignUp(email: string) {
  track("user_signed_up", { email });
}

export function trackLogin(email: string) {
  track("user_logged_in", { email });
}

export function trackLogout() {
  track("user_logged_out");
  resetAnalytics();
}

export function trackPipelineCreated(pipelineId: string, name: string) {
  track("pipeline_created", { pipeline_id: pipelineId, pipeline_name: name });
}

export function trackPipelineSaved(pipelineId: string, stepCount: number) {
  track("pipeline_saved", { pipeline_id: pipelineId, step_count: stepCount });
}

export function trackPipelineDeleted(pipelineId: string) {
  track("pipeline_deleted", { pipeline_id: pipelineId });
}

export function trackPipelineRunTriggered(pipelineId: string, trigger: string) {
  track("pipeline_run_triggered", {
    pipeline_id: pipelineId,
    trigger_type: trigger,
  });
}

export function trackRunViewed(runId: string, status: string) {
  track("run_viewed", { run_id: runId, run_status: status });
}

export function trackRunCancelled(runId: string) {
  track("run_cancelled", { run_id: runId });
}

export function trackScheduleCreated(pipelineId: string, cron: string) {
  track("schedule_created", {
    pipeline_id: pipelineId,
    cron_expression: cron,
  });
}

export function trackScheduleDeleted(scheduleId: string) {
  track("schedule_deleted", { schedule_id: scheduleId });
}

export function trackSecretCreated(scope: "user" | "pipeline") {
  track("secret_created", { scope });
}

export function trackSecretUpdated(scope: "user" | "pipeline") {
  track("secret_updated", { scope });
}

export function trackSecretDeleted(scope: "user" | "pipeline") {
  track("secret_deleted", { scope });
}

export function trackApiKeyCreated() {
  track("api_key_created");
}

export function trackBillingCheckout(plan: string, interval: string) {
  track("billing_checkout_started", { plan, interval });
}

export function trackSettingsViewed(tab: string) {
  track("settings_viewed", { tab });
}
