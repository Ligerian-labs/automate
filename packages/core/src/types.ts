// ── Pipeline Types ──

export type StepType =
  | "llm"
  | "transform"
  | "condition"
  | "parallel"
  | "webhook"
  | "human_review"
  | "code";

export type OutputFormat = "text" | "json" | "markdown";

export type TriggerType = "manual" | "api" | "cron" | "webhook";

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type PipelineStatus = "draft" | "active" | "archived";

export type Plan = "free" | "starter" | "pro" | "enterprise";

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

export interface PipelineStep {
  id: string;
  name: string;
  type?: StepType;
  model?: string;
  prompt?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  output_format?: OutputFormat;
  timeout_seconds?: number;
  retry?: StepRetry;
  on_condition?: StepCondition[];
}

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

export interface PipelineDefinition {
  name: string;
  description?: string;
  version: number;
  variables?: Record<string, string | number | boolean>;
  input?: {
    schema: Record<string, PipelineVariable>;
  };
  steps: PipelineStep[];
  output?: {
    from: string;
    deliver?: DeliveryTarget[];
  };
  schedule?: PipelineSchedule;
  notifications?: {
    on_success?: PipelineNotification[];
    on_failure?: PipelineNotification[];
  };
}

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

export interface CreatePipelinePayload {
  name: string;
  description?: string;
  definition: PipelineDefinition;
  tags?: string[];
}

export interface RunPipelinePayload {
  input_data?: Record<string, unknown>;
}

export interface CreateSchedulePayload {
  name: string;
  description?: string;
  cron_expression: string;
  timezone?: string;
  input_data?: Record<string, unknown>;
  enabled?: boolean;
}
