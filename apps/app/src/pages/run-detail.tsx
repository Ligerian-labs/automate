import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch, type RunRecord, type StepExecutionRecord } from "../lib/api";

export function RunDetailPage() {
  const { runId } = useParams({ strict: false }) as { runId: string };
  const [sseState, setSseState] = useState("disconnected");

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => apiFetch<RunRecord>(`/api/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: 4000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch<{ cancelled: boolean }>(`/api/runs/${runId}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => runQuery.refetch(),
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

  const stats = useMemo(() => {
    const run = runQuery.data;
    if (!run) return { duration: "-", tokens: "-", cost: "-", steps: "-" };
    const duration = run.completedAt && run.startedAt ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null;
    return {
      duration: duration ? `${duration}s` : "running",
      tokens: String(run.totalTokens ?? run.total_tokens ?? 0),
      cost: `${((run.totalCostCents ?? run.total_cost_cents ?? 0) / 100).toFixed(2)}€`,
      steps: String((run.steps ?? []).length),
    };
  }, [runQuery.data]);

  return (
    <AppShell title={`Run ${runId}`} subtitle={`SSE: ${sseState}`}>
      {runQuery.isLoading ? <p className="text-sm text-[var(--text-tertiary)]">Loading run...</p> : null}
      {runQuery.isError ? <p className="text-sm text-red-300">Failed to load run</p> : null}

      <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="text-xs text-[var(--text-tertiary)]">Run status: <span className="text-[var(--text-secondary)]">{runQuery.data?.status || "unknown"}</span></div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-300">
            {runQuery.data?.status || "pending"}
          </span>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            className="rounded-md border border-[var(--divider)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            Retry
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat title="Duration" value={stats.duration} />
        <Stat title="Tokens" value={stats.tokens} />
        <Stat title="Cost" value={stats.cost} />
        <Stat title="Steps" value={stats.steps} />
      </section>

      <section className="mt-5 rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Step execution</h2>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            className="rounded-md border border-[var(--divider)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            Cancel run
          </button>
        </div>

        <div className="space-y-3">
          {(runQuery.data?.steps ?? []).map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
          {(runQuery.data?.steps ?? []).length === 0 ? <p className="text-sm text-[var(--text-tertiary)]">No steps yet</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
      <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{title}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </article>
  );
}

function StepCard({ step }: { step: StepExecutionRecord }) {
  const status = step.status;
  return (
    <article className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3">
      <div className="grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-center">
        <div>
          <p className="font-medium">{step.stepId || step.step_id || "step"}</p>
          <p className="text-xs text-[var(--text-tertiary)]">model: {step.model || "n/a"}</p>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {step.durationMs || step.duration_ms || 0}ms · {((step.costCents || step.cost_cents || 0) / 100).toFixed(2)}€
        </p>
        <span className="w-fit rounded-full bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-secondary)]">{status}</span>
      </div>
      {step.error ? <p className="mt-2 text-sm text-red-300">{step.error}</p> : null}
      {step.rawOutput || step.raw_output ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--text-tertiary)]">{step.rawOutput || step.raw_output}</pre>
      ) : null}
    </article>
  );
}
