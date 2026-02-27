import type { PipelineDefinition } from "@stepiq/core";
import { getToken } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface ApiErrorShape {
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  auth = true,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await toJson(res);

  if (!res.ok) {
    const message =
      (data as ApiErrorShape | null)?.error ||
      (data as ApiErrorShape | null)?.message ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export interface PipelineRecord {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  updatedAt?: string;
  updated_at?: string;
  definition?: PipelineDefinition;
}

export interface RunRecord {
  id: string;
  pipelineId?: string;
  pipeline_id?: string;
  status: string;
  error?: string | null;
  triggerType?: string;
  trigger_type?: string;
  totalTokens?: number;
  total_tokens?: number;
  totalCostCents?: number;
  total_cost_cents?: number;
  createdAt?: string;
  created_at?: string;
  startedAt?: string | null;
  started_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  steps?: StepExecutionRecord[];
}

export interface StepExecutionRecord {
  id: string;
  stepId?: string;
  step_id?: string;
  stepIndex?: number;
  step_index?: number;
  status: string;
  model?: string | null;
  promptSent?: string | null;
  prompt_sent?: string | null;
  durationMs?: number | null;
  duration_ms?: number | null;
  inputTokens?: number;
  input_tokens?: number;
  outputTokens?: number;
  output_tokens?: number;
  costCents?: number;
  cost_cents?: number;
  rawOutput?: string | null;
  raw_output?: string | null;
  parsedOutput?: unknown;
  parsed_output?: unknown;
  error?: string | null;
  retryCount?: number;
  retry_count?: number;
  startedAt?: string | null;
  started_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
}

export interface UserMe {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  creditsRemaining?: number;
  credits_remaining?: number;
}

export interface UsageRecord {
  credits_used: number;
  credits_remaining: number;
  runs_today: number;
  total_cost_cents: number;
}

export interface SecretRecord {
  id: string;
  name: string;
  pipelineId?: string | null;
  pipeline_id?: string | null;
  keyVersion?: number;
  key_version?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface BillingCheckoutRequest {
  plan: "starter" | "pro";
  interval: "month" | "year";
}

export interface BillingCheckoutResponse {
  url: string;
}

export interface BillingPortalResponse {
  url: string;
}
