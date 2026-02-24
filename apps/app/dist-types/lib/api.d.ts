import type { PipelineDefinition } from "@automate/core";
export interface ApiErrorShape {
    error?: string;
    message?: string;
}
export declare class ApiError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function apiFetch<T>(path: string, init?: RequestInit, auth?: boolean): Promise<T>;
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
    durationMs?: number | null;
    duration_ms?: number | null;
    costCents?: number;
    cost_cents?: number;
    rawOutput?: string | null;
    raw_output?: string | null;
    error?: string | null;
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
//# sourceMappingURL=api.d.ts.map