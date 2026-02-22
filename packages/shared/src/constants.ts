import type { ModelInfo, Plan } from "./types.js";

export const SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    input_cost_per_million: 3_000, // $3.00
    output_cost_per_million: 15_000, // $15.00
    max_tokens: 8192,
    supports_json: true,
  },
  {
    id: "claude-haiku-3.5",
    name: "Claude Haiku 3.5",
    provider: "anthropic",
    input_cost_per_million: 250, // $0.25
    output_cost_per_million: 1_250, // $1.25
    max_tokens: 8192,
    supports_json: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    input_cost_per_million: 2_500, // $2.50
    output_cost_per_million: 10_000, // $10.00
    max_tokens: 16384,
    supports_json: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    input_cost_per_million: 150, // $0.15
    output_cost_per_million: 600, // $0.60
    max_tokens: 16384,
    supports_json: true,
  },
];

export const MARKUP_PERCENTAGE = 25; // 25% markup on model costs

export const PLAN_LIMITS: Record<Plan, {
  credits: number;
  max_runs_per_day: number;
  max_pipelines: number;
  max_steps_per_pipeline: number;
  cron_enabled: boolean;
  webhooks_enabled: boolean;
  api_enabled: boolean;
  price_cents: number; // monthly price in cents
  overage_per_credit_cents: number;
}> = {
  free: {
    credits: 100,
    max_runs_per_day: 10,
    max_pipelines: 3,
    max_steps_per_pipeline: 5,
    cron_enabled: false,
    webhooks_enabled: false,
    api_enabled: false,
    price_cents: 0,
    overage_per_credit_cents: 0, // no overage, hard limit
  },
  starter: {
    credits: 2_000,
    max_runs_per_day: 100,
    max_pipelines: 10,
    max_steps_per_pipeline: 10,
    cron_enabled: true,
    webhooks_enabled: false,
    api_enabled: true,
    price_cents: 1_900, // €19
    overage_per_credit_cents: 1, // €0.01/credit
  },
  pro: {
    credits: 8_000,
    max_runs_per_day: 500,
    max_pipelines: -1, // unlimited
    max_steps_per_pipeline: 20,
    cron_enabled: true,
    webhooks_enabled: true,
    api_enabled: true,
    price_cents: 4_900, // €49
    overage_per_credit_cents: 0.8, // €0.008/credit
  },
  enterprise: {
    credits: -1, // custom
    max_runs_per_day: -1,
    max_pipelines: -1,
    max_steps_per_pipeline: 50,
    cron_enabled: true,
    webhooks_enabled: true,
    api_enabled: true,
    price_cents: 0, // custom
    overage_per_credit_cents: 0,
  },
};

// 1 credit ≈ 1,000 tokens
export const TOKENS_PER_CREDIT = 1_000;
