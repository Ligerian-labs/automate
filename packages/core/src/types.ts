import type { z } from "zod";
import type {
  createPipelineSchema,
  createScheduleSchema,
  pipelineDefinitionSchema,
  pipelineStepSchema,
  runPipelineSchema,
} from "./schemas";
import type {
  OUTPUT_FORMATS,
  PIPELINE_STATUSES,
  PLANS,
  RUN_STATUSES,
  STEP_STATUSES,
  STEP_TYPES,
  TRIGGER_TYPES,
} from "./domain";

// ── Pipeline Types ──

export type StepType = (typeof STEP_TYPES)[number];

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type RunStatus = (typeof RUN_STATUSES)[number];

export type StepStatus = (typeof STEP_STATUSES)[number];

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export type Plan = (typeof PLANS)[number];

// ── Pipeline Definition ──

export interface PipelineVariable {
  type: "string" | "integer" | "boolean" | "number";
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface StepRetry {
  max_attempts: number;
  backoff_ms: number;
}

export interface StepCondition {
  if: string;
  goto: string;
  max_loops?: number;
}

export type PipelineStep = z.infer<typeof pipelineStepSchema>;

export interface DeliveryTarget {
  type: "webhook" | "email" | "file";
  url?: string;
  method?: string;
  to?: string;
  subject?: string;
  path?: string;
}

export interface PipelineSchedule {
  enabled: boolean;
  cron: string;
  timezone: string;
}

export interface PipelineNotification {
  type: "email" | "webhook";
  to?: string;
  url?: string;
  subject?: string;
}

export type PipelineDefinition = z.infer<typeof pipelineDefinitionSchema>;

// ── API Response Types ──

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  credits_remaining: number;
  created_at: string;
}

export interface Pipeline {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  definition: PipelineDefinition;
  version: number;
  is_public: boolean;
  tags: string[];
  status: PipelineStatus;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  pipeline_id: string;
  pipeline_version: number;
  user_id: string;
  trigger_type: TriggerType;
  status: RunStatus;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown> | null;
  error: string | null;
  total_tokens: number;
  total_cost_cents: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface StepExecution {
  id: string;
  run_id: string;
  step_id: string;
  step_index: number;
  model: string | null;
  status: StepStatus;
  prompt_sent: string | null;
  raw_output: string | null;
  parsed_output: unknown;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  duration_ms: number | null;
  error: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface Schedule {
  id: string;
  pipeline_id: string;
  name: string;
  description: string | null;
  cron_expression: string;
  timezone: string;
  input_data: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  max_tokens: number;
  supports_json: boolean;
}

export interface CostEstimate {
  total_credits: number;
  total_cost_cents: number;
  steps: {
    step_id: string;
    model: string;
    estimated_tokens: number;
    estimated_credits: number;
    estimated_cost_cents: number;
  }[];
}

// ── API Payloads ──

export type CreatePipelinePayload = z.infer<typeof createPipelineSchema>;

export type RunPipelinePayload = z.infer<typeof runPipelineSchema>;

export type CreateSchedulePayload = z.infer<typeof createScheduleSchema>;
