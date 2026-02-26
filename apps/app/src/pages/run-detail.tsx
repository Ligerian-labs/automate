import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/app-shell";
import { type RunRecord, type StepExecutionRecord, apiFetch } from "../lib/api";

export function RunDetailPage() {
  const { runId } = useParams({ strict: false }) as { runId: string };
  const navigate = useNavigate();
  const [sseState, setSseState] = useState("disconnected");
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const runQ = useQuery({
    queryKey: ["run", runId],
    queryFn: () => apiFetch<RunRecord>(`/api/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: 4000,
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      apiFetch<{ cancelled: boolean }>(`/api/runs/${runId}/cancel`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => runQ.refetch(),
  });

  const retryMut = useMutation({
    mutationFn: () =>
      apiFetch<RunRecord>(`/api/runs/${runId}/retry`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (newRun) => {
      navigate({ to: "/runs/$runId", params: { runId: newRun.id } });
    },
  });

  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(
      `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/runs/${runId}/stream`,
    );
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
    const dur =
      run.completedAt && run.startedAt
        ? Math.round(
            (new Date(run.completedAt).getTime() -
              new Date(run.startedAt).getTime()) /
              1000,
          )
        : null;
    return {
      duration: dur ? `${dur}s` : "running",
      tokens: String(run.totalTokens ?? run.total_tokens ?? 0),
      cost: `€${((run.totalCostCents ?? run.total_cost_cents ?? 0) / 100).toFixed(2)}`,
      steps: String((run.steps ?? []).length),
    };
  }, [run]);

  const status = run?.status || "pending";

  const actions = (
    <>
      <RunStatusBadge status={status} />
      <button
        type="button"
        onClick={() => retryMut.mutate()}
        disabled={retryMut.isPending}
        className="cursor-pointer rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {retryMut.isPending ? "Retrying..." : "Retry"}
      </button>
    </>
  );

  return (
    <AppShell
      title={`Run ${runId?.slice(0, 8)}...`}
      subtitle={`Pipeline run · SSE: ${sseState}`}
      actions={actions}
    >
      {runQ.isLoading ? (
        <p className="text-sm text-[var(--text-tertiary)]">Loading run...</p>
      ) : null}
      {runQ.isError ? (
        <p className="text-sm text-red-300">Failed to load run</p>
      ) : null}

      {/* Stats — cornerRadius 10, padding 20 */}
      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Duration" value={stats.duration} />
        <StatCard label="Tokens" value={stats.tokens} />
        <StatCard label="Cost" value={stats.cost} />
        <StatCard label="Steps" value={stats.steps} />
      </section>

      {/* Steps list — cornerRadius 10 */}
      <section className="flex flex-col gap-3">
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
          <StepCard
            key={step.id}
            step={step}
            expanded={expandedStepId === step.id}
            onToggle={() =>
              setExpandedStepId((prev) => (prev === step.id ? null : step.id))
            }
          />
        ))}
        {(run?.steps ?? []).length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[var(--divider)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            No steps executed yet
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
      <p
        className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1.5px" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-[28px] font-bold leading-none"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const isSuccess = status === "completed";
  const isRunning = status === "running";
  const isFailed = status === "failed";
  let bg = "var(--bg-inset)";
  let fg = "var(--text-tertiary)";
  if (isSuccess) {
    bg = "#22C55E20";
    fg = "#22C55E";
  }
  if (isRunning) {
    bg = "#22D3EE20";
    fg = "#22D3EE";
  }
  if (isFailed) {
    bg = "#EF444420";
    fg = "#EF4444";
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: bg, color: fg, fontFamily: "var(--font-mono)" }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ background: fg }}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StepCard({
  step,
  expanded,
  onToggle,
}: {
  step: StepExecutionRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = step.status;
  const isSuccess = status === "completed";
  const isFailed = status === "failed";
  const rawOutput = step.rawOutput || step.raw_output;
  const parsedOutput = step.parsedOutput ?? step.parsed_output;
  const promptSent = step.promptSent || step.prompt_sent;

  const prettyParsedOutput = (() => {
    if (parsedOutput === undefined || parsedOutput === null) return null;
    if (typeof parsedOutput === "string") {
      try {
        return JSON.stringify(JSON.parse(parsedOutput), null, 2);
      } catch {
        return parsedOutput;
      }
    }
    try {
      return JSON.stringify(parsedOutput, null, 2);
    } catch {
      return String(parsedOutput);
    }
  })();

  return (
    <div
      className={`rounded-[10px] border bg-[var(--bg-surface)] p-5 ${
        isFailed
          ? "border-red-500/30"
          : isSuccess
            ? "border-emerald-500/20"
            : "border-[var(--divider)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-5 text-left"
      >
        {/* Left: 200px */}
        <div className="w-[200px] shrink-0">
          <RunStatusBadge status={status} />
          <p className="mt-2 text-sm font-medium">
            {step.stepId || step.step_id || "step"}
          </p>
          <p
            className="text-xs text-[var(--text-tertiary)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            model: {step.model || "n/a"}
          </p>
        </div>
        {/* Right: metrics */}
        <div className="flex flex-1 items-center gap-6">
          <Metric
            label="Duration"
            value={`${step.durationMs || step.duration_ms || 0}ms`}
          />
          <Metric
            label="Tokens"
            value={String(
              (step.inputTokens ?? step.input_tokens ?? 0) +
                (step.outputTokens ?? step.output_tokens ?? 0),
            )}
          />
          <Metric
            label="Cost"
            value={`€${((step.costCents || step.cost_cents || 0) / 100).toFixed(2)}`}
          />
          {rawOutput ? (
            <Metric label="Output" value="✓" />
          ) : null}
        </div>
        <div className="ml-auto pt-1 text-xs text-[var(--text-muted)]">
          {expanded ? "▲" : "▼"}
        </div>
      </button>
      {step.error ? (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {step.error}
        </p>
      ) : null}
      {rawOutput ? (
        <pre
          className="mt-3 max-h-[200px] overflow-auto rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed text-[var(--text-tertiary)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {rawOutput}
        </pre>
      ) : null}
      {expanded ? (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <DebugField label="Step ID" value={step.stepId || step.step_id || "-"} />
            <DebugField
              label="Step Index"
              value={String(step.stepIndex ?? step.step_index ?? "-")}
            />
            <DebugField
              label="Input Tokens"
              value={String(step.inputTokens ?? step.input_tokens ?? 0)}
            />
            <DebugField
              label="Output Tokens"
              value={String(step.outputTokens ?? step.output_tokens ?? 0)}
            />
            <DebugField
              label="Retry Count"
              value={String(step.retryCount ?? step.retry_count ?? 0)}
            />
            <DebugField
              label="Started At"
              value={step.startedAt || step.started_at || "-"}
            />
            <DebugField
              label="Completed At"
              value={step.completedAt || step.completed_at || "-"}
            />
          </div>
          {promptSent ? (
            <DebugBlock label="Prompt Sent" value={promptSent} />
          ) : null}
          {prettyParsedOutput ? (
            <DebugBlock label="Parsed Output" value={prettyParsedOutput} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase text-[var(--text-muted)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1px" }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium text-[var(--text-secondary)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
    </div>
  );
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2">
      <p
        className="text-[10px] uppercase text-[var(--text-muted)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1px" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-xs text-[var(--text-secondary)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
    </div>
  );
}

function DebugBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="mb-1 text-[10px] uppercase text-[var(--text-muted)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1px" }}
      >
        {label}
      </p>
      <pre
        className="max-h-[220px] overflow-auto rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed text-[var(--text-tertiary)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </pre>
    </div>
  );
}
