import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch, type RunRecord, type StepExecutionRecord } from "../lib/api";

export function RunDetailPage() {
  const { runId } = useParams({ strict: false }) as { runId: string };
  const [sseState, setSseState] = useState("disconnected");

  const runQ = useQuery({
    queryKey: ["run", runId],
    queryFn: () => apiFetch<RunRecord>(`/api/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: 4000,
  });

  const cancelMut = useMutation({
    mutationFn: () => apiFetch<{ cancelled: boolean }>(`/api/runs/${runId}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => runQ.refetch(),
  });

  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/runs/${runId}/stream`);
    es.onopen = () => setSseState("connected");
    es.onerror = () => {
      setSseState("fallback polling");
      es.close();
    };
    return () => es.close();
  }, [runId]);

  const run = runQ.data;
  const stats = useMemo(() => {
    if (!run) return { duration: "-", tokens: "-", cost: "-", steps: "-" };
    const duration =
      run.completedAt && run.startedAt
        ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
        : null;
    return {
      duration: duration ? `${duration}s` : "running",
      tokens: String(run.totalTokens ?? run.total_tokens ?? 0),
      cost: `€${((run.totalCostCents ?? run.total_cost_cents ?? 0) / 100).toFixed(2)}`,
      steps: String((run.steps ?? []).length),
    };
  }, [run]);

  const status = run?.status || "pending";

  const actions = (
    <>
      <StatusBadge status={status} />
      <button
        type="button"
        onClick={() => cancelMut.mutate()}
        className="rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]"
      >
        Retry
      </button>
    </>
  );

  return (
    <AppShell
      title={`Run ${runId?.slice(0, 8)}...`}
      subtitle={`Pipeline run · SSE: ${sseState}`}
      actions={actions}
    >
      {runQ.isLoading ? <p className="text-sm text-[var(--text-tertiary)]">Loading run...</p> : null}
      {runQ.isError ? <p className="text-sm text-red-300">Failed to load run</p> : null}

      {/* Stats row — 4 cards */}
      <section className="mb-8 grid grid-cols-4 gap-4">
        <StatCard label="Duration" value={stats.duration} />
        <StatCard label="Tokens" value={stats.tokens} />
        <StatCard label="Cost" value={stats.cost} />
        <StatCard label="Steps" value={stats.steps} />
      </section>

      {/* Step execution list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Step Execution</h2>
          {status === "running" ? (
            <button
              type="button"
              onClick={() => cancelMut.mutate()}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300"
            >
              Cancel run
            </button>
          ) : null}
        </div>

        {(run?.steps ?? []).map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
        {(run?.steps ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--divider)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            No steps executed yet
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status === "completed";
  const isRunning = status === "running";
  const isFailed = status === "failed";
  let classes = "bg-[var(--bg-inset)] text-[var(--text-tertiary)]";
  let dotClass = "bg-[var(--text-muted)]";
  if (isSuccess) { classes = "bg-[#22C55E20] text-emerald-400"; dotClass = "bg-emerald-400"; }
  if (isRunning) { classes = "bg-[#22D3EE20] text-cyan-400"; dotClass = "bg-cyan-400"; }
  if (isFailed) { classes = "bg-[#EF444420] text-red-400"; dotClass = "bg-red-400"; }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      <span className={`inline-block size-1.5 rounded-full ${dotClass}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StepCard({ step }: { step: StepExecutionRecord }) {
  const status = step.status;
  const isSuccess = status === "completed";
  const isFailed = status === "failed";
  return (
    <div className={`rounded-xl border bg-[var(--bg-surface)] p-5 ${
      isFailed ? "border-red-500/30" : isSuccess ? "border-emerald-500/20" : "border-[var(--divider)]"
    }`}>
      <div className="flex items-start gap-5">
        {/* Left: step info */}
        <div className="w-[200px] shrink-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 text-sm font-medium">{step.stepId || step.step_id || "step"}</p>
          <p className="text-xs text-[var(--text-tertiary)]">model: {step.model || "n/a"}</p>
        </div>

        {/* Right: metrics */}
        <div className="flex flex-1 items-center gap-6">
          <MetricPill label="Duration" value={`${step.durationMs || step.duration_ms || 0}ms`} />
          <MetricPill label="Tokens" value={String((step.inputTokens ?? step.input_tokens ?? 0) + (step.outputTokens ?? step.output_tokens ?? 0))} />
          <MetricPill label="Cost" value={`€${((step.costCents || step.cost_cents || 0) / 100).toFixed(2)}`} />
          {step.rawOutput || step.raw_output ? (
            <MetricPill label="Output" value="✓" />
          ) : null}
        </div>
      </div>

      {step.error ? (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{step.error}</p>
      ) : null}
      {step.rawOutput || step.raw_output ? (
        <pre className="mt-3 max-h-[200px] overflow-auto rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed text-[var(--text-tertiary)]">
          {step.rawOutput || step.raw_output}
        </pre>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}
