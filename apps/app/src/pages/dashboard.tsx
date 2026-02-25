import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch, type PipelineRecord, type RunRecord } from "../lib/api";
import type { PipelineDefinition } from "@stepiq/core";

export function DashboardPage() {
  const navigate = useNavigate();

  async function createPipeline() {
    const baseDefinition: PipelineDefinition = {
      name: "Untitled pipeline",
      version: 1,
      steps: [
        {
          id: "step_1",
          name: "First step",
          type: "llm",
          model: "gpt-4o-mini",
          prompt: "Hello from stepIQ",
        },
      ],
    };

    const created = await apiFetch<PipelineRecord>("/api/pipelines", {
      method: "POST",
      body: JSON.stringify({
        name: "Untitled pipeline",
        description: "New pipeline",
        definition: baseDefinition,
      }),
    });

    navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: created.id } });
  }

  const createMut = useMutation({ mutationFn: createPipeline });
  const pipelinesQ = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });
  const runsQ = useQuery({
    queryKey: ["runs", "dashboard"],
    queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=20"),
  });

  const stats = useMemo(() => {
    const pipelines = pipelinesQ.data ?? [];
    const runs = runsQ.data ?? [];
    const active = pipelines.filter((p) => (p.status || "active") === "active").length;
    const runsToday = runs.length;
    const successRate = runsToday > 0 ? Math.round((runs.filter((r) => r.status === "completed").length / runsToday) * 100) : 0;
    const totalTokens = runs.reduce((sum, r) => sum + (r.totalTokens ?? r.total_tokens ?? 0), 0);
    const totalCost = runs.reduce((sum, r) => sum + (r.totalCostCents ?? r.total_cost_cents ?? 0), 0);
    return { active, runsToday, successRate, totalTokens, totalCost };
  }, [pipelinesQ.data, runsQ.data]);

  const actions = (
    <>
      <button
        type="button"
        onClick={() => createMut.mutate()}
        className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-90"
      >
        <span>+</span> New pipeline
      </button>
      <button
        type="button"
        className="rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]"
      >
        Import YAML
      </button>
    </>
  );

  return (
    <AppShell title="Dashboard" subtitle="Overview of your pipelines and recent activity" actions={actions}>
      {createMut.isError ? (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {createMut.error instanceof Error ? createMut.error.message : "Failed to create pipeline"}
        </p>
      ) : null}

      {/* Stats row — 4 cards */}
      <section className="mb-8 grid grid-cols-4 gap-4">
        <StatCard label="ACTIVE PIPELINES" value={String(stats.active)} sub={`${pipelinesQ.data?.length ?? 0} total`} />
        <StatCard label="RUNS TODAY" value={String(stats.runsToday)} sub={`${stats.successRate}% success rate`} />
        <StatCard label="CREDITS REMAINING" value="—" sub="—" />
        <StatCard label="TOTAL TOKENS" value={formatNumber(stats.totalTokens)} sub={`~€${(stats.totalCost / 100).toFixed(2)} this period`} />
      </section>

      {/* Pipeline table */}
      <section className="overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        {/* Table header */}
        <div className="grid grid-cols-[minmax(280px,1fr)_120px_160px_80px_100px] items-center gap-2 bg-[var(--bg-inset)] px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>Pipeline</span>
          <span>Status</span>
          <span>Last Run</span>
          <span>Steps</span>
          <span className="text-right">Cost</span>
        </div>

        {pipelinesQ.isLoading ? (
          <p className="p-5 text-sm text-[var(--text-tertiary)]">Loading pipelines...</p>
        ) : null}
        {pipelinesQ.isError ? (
          <p className="p-5 text-sm text-red-300">
            {pipelinesQ.error instanceof Error ? pipelinesQ.error.message : "Failed to load pipelines"}
          </p>
        ) : null}

        <div className="divide-y divide-[var(--divider)]">
          {(pipelinesQ.data ?? []).map((pipeline) => {
            const updated = pipeline.updatedAt || pipeline.updated_at;
            const status = pipeline.status || "active";
            const steps = (() => {
              try {
                const def = pipeline.definition as { steps?: unknown[] };
                return def?.steps?.length ?? 0;
              } catch {
                return 0;
              }
            })();
            return (
              <button
                key={pipeline.id}
                type="button"
                className="grid w-full grid-cols-[minmax(280px,1fr)_120px_160px_80px_100px] items-center gap-2 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
                onClick={() => navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: pipeline.id } })}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{pipeline.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{pipeline.description || "No description"}</p>
                </div>
                <div>
                  <StatusBadge status={status} />
                </div>
                <div className="text-[13px] text-[var(--text-secondary)]">
                  {updated ? timeAgo(new Date(updated)) : "-"}
                </div>
                <div className="text-[13px] text-[var(--text-secondary)]">{steps}</div>
                <div className="text-right text-[13px] text-[var(--text-secondary)]">—</div>
              </button>
            );
          })}
          {(pipelinesQ.data ?? []).length === 0 && !pipelinesQ.isLoading ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">
              No pipelines yet — create one to get started.
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none">{value}</p>
      <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active" || status === "running" || status === "completed";
  const isDraft = status === "draft";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        isActive
          ? "bg-[#22C55E20] text-emerald-400"
          : isDraft
            ? "bg-[#EAB30820] text-amber-400"
            : "bg-[var(--bg-inset)] text-[var(--text-tertiary)]"
      }`}
    >
      <span className={`inline-block size-1.5 rounded-full ${isActive ? "bg-emerald-400" : isDraft ? "bg-amber-400" : "bg-[var(--text-muted)]"}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
