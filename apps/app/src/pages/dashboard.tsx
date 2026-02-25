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
        { id: "step_1", name: "First step", type: "llm", model: "gpt-4o-mini", prompt: "Hello from stepIQ" },
      ],
    };
    const created = await apiFetch<PipelineRecord>("/api/pipelines", {
      method: "POST",
      body: JSON.stringify({ name: "Untitled pipeline", description: "New pipeline", definition: baseDefinition }),
    });
    navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: created.id } });
  }

  const createMut = useMutation({ mutationFn: createPipeline });
  const pipelinesQ = useQuery({ queryKey: ["pipelines"], queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines") });
  const runsQ = useQuery({ queryKey: ["runs", "dashboard"], queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=20") });

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

  /* Design: buttons padding [10,18], gap 8, cornerRadius 8 */
  const actions = (
    <>
      <button
        type="button"
        onClick={() => createMut.mutate()}
        className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]"
      >
        <span className="text-base leading-none">+</span> New pipeline
      </button>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]"
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

      {/* Stats row — gap 16, cards cornerRadius 10, padding 20, gap 8 */}
      <section className="grid grid-cols-4 gap-4">
        <StatCard label="ACTIVE PIPELINES" value={String(stats.active)} sub={`+${stats.active} this week`} subColor="var(--accent)" />
        <StatCard label="RUNS TODAY" value={String(stats.runsToday)} sub={`${stats.successRate}% success rate`} subColor="#22C55E" />
        <StatCard label="CREDITS REMAINING" value="6,284" sub="of 8,000" subColor="var(--text-tertiary)" />
        <StatCard label="TOTAL TOKENS" value={formatNumber(stats.totalTokens)} sub={`~€${(stats.totalCost / 100).toFixed(2)} this period`} subColor="var(--text-tertiary)" />
      </section>

      {/* Table — cornerRadius 12, clip */}
      <section className="overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        {/* Header — bg-inset, padding [14,20] */}
        <div
          className="grid items-center bg-[var(--bg-inset)] px-5 py-3.5"
          style={{ gridTemplateColumns: "minmax(280px,1fr) 120px 160px 80px 100px", fontFamily: "var(--font-mono)" }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Pipeline</span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Status</span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Last Run</span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Steps</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Cost</span>
        </div>

        {pipelinesQ.isLoading ? <p className="p-5 text-sm text-[var(--text-tertiary)]">Loading pipelines...</p> : null}
        {pipelinesQ.isError ? (
          <p className="p-5 text-sm text-red-300">{pipelinesQ.error instanceof Error ? pipelinesQ.error.message : "Failed to load"}</p>
        ) : null}

        <div className="divide-y divide-[var(--divider)]">
          {(pipelinesQ.data ?? []).map((pipeline) => {
            const updated = pipeline.updatedAt || pipeline.updated_at;
            const status = pipeline.status || "active";
            const stepCount = (() => {
              try { return ((pipeline.definition as { steps?: unknown[] })?.steps?.length ?? 0); } catch { return 0; }
            })();
            return (
              <button
                key={pipeline.id}
                type="button"
                className="grid w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ gridTemplateColumns: "minmax(280px,1fr) 120px 160px 80px 100px" }}
                onClick={() => navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: pipeline.id } })}
              >
                {/* Name col — 300px, gap 2 */}
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{pipeline.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {pipeline.description || "No description"}
                  </p>
                </div>
                {/* Status — badge cornerRadius 100 */}
                <div>
                  <StatusBadge status={status} />
                </div>
                {/* Last run */}
                <div className="text-[13px] text-[var(--text-secondary)]">
                  {updated ? timeAgo(new Date(updated)) : "-"}
                </div>
                {/* Steps */}
                <div className="text-[13px] text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-mono)" }}>
                  {stepCount}
                </div>
                {/* Cost */}
                <div className="text-right text-[13px] text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-mono)" }}>
                  ~14 credits
                </div>
              </button>
            );
          })}
          {(pipelinesQ.data ?? []).length === 0 && !pipelinesQ.isLoading ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">No pipelines yet — create one to get started.</p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

/* Design: stat card — cornerRadius 10, padding 20, gap 8, labels in JetBrains Mono */
function StatCard({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5" style={{ gap: 8 }}>
      <p
        className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1.5px" }}
      >
        {label}
      </p>
      <p className="mt-2 text-[28px] font-bold leading-none" style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
      <p className="mt-2 text-xs font-medium" style={{ fontFamily: "var(--font-mono)", color: subColor }}>
        {sub}
      </p>
    </div>
  );
}

/* Design: badge — cornerRadius 100, padding [4,10], gap 6, dot 6x6 */
function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active" || status === "running" || status === "completed";
  const isDraft = status === "draft";
  const bg = isActive ? "#22C55E20" : isDraft ? "#EAB30820" : "var(--bg-inset)";
  const fg = isActive ? "#22C55E" : isDraft ? "#EAB308" : "var(--text-tertiary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: bg, color: fg, fontFamily: "var(--font-mono)" }}
    >
      <span className="inline-block size-1.5 rounded-full" style={{ background: fg }} />
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
