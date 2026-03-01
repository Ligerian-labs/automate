import type { PipelineDefinition } from "@stepiq/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "../components/app-shell";
import { ImportYamlModal } from "../components/import-yaml-modal";
import { trackPipelineCreated } from "../lib/analytics";
import {
  type PipelineRecord,
  type RunRecord,
  type UsageRecord,
  type UserMe,
  apiFetch,
} from "../lib/api";

function canImportYaml(plan: string | undefined): boolean {
  const normalized = (plan || "").toLowerCase();
  return normalized === "pro" || normalized === "enterprise";
}

type DashboardRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  lastRun: string;
  steps: string;
  cost: string;
  pipelineId?: string;
};

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

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
          output_format: "text",
          timeout_seconds: 60,
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
    trackPipelineCreated(created.id, "Untitled pipeline");
    navigate({
      to: "/pipelines/$pipelineId/edit",
      params: { pipelineId: created.id },
    });
  }

  const createMut = useMutation({ mutationFn: createPipeline });
  const pipelinesQ = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });
  const runsQ = useQuery({
    queryKey: ["runs", "dashboard"],
    queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=100"),
  });
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/user/me"),
  });
  const usageQ = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageRecord>("/api/user/usage"),
  });
  const importEnabled = canImportYaml(meQ.data?.plan);

  const stats = useMemo(() => {
    const pipelines = pipelinesQ.data ?? [];
    const runs = runsQ.data ?? [];
    const usage = usageQ.data;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const active = pipelines.filter(
      (p) => (p.status || "active") === "active",
    ).length;
    const activeThisWeek = pipelines.filter((p) => {
      if ((p.status || "active") !== "active") return false;
      const updated = p.updatedAt || p.updated_at;
      if (!updated) return false;
      const updatedAt = new Date(updated);
      return !Number.isNaN(updatedAt.getTime()) && updatedAt >= weekAgo;
    }).length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const recentRunsToday = runs.filter((r) => {
      const created = r.createdAt || r.created_at;
      if (!created) return false;
      const createdAt = new Date(created);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= todayStart;
    });
    const runsToday = usage?.runs_today ?? 0;
    const successRate =
      recentRunsToday.length > 0
        ? Math.round(
            (recentRunsToday.filter((r) => r.status === "completed").length /
              recentRunsToday.length) *
              100,
          )
        : 0;
    const totalTokens = runs.reduce(
      (sum, r) => sum + (r.totalTokens ?? r.total_tokens ?? 0),
      0,
    );
    const creditsRemaining = usage?.credits_remaining ?? 0;
    const creditsUsed = usage?.credits_used ?? 0;
    const creditsCap =
      creditsRemaining + creditsUsed > 0 ? creditsRemaining + creditsUsed : 0;
    const costPeriod = usage?.total_cost_cents ?? 0;

    return {
      active,
      activeThisWeek,
      runsToday,
      successRate,
      creditsRemaining:
        creditsRemaining < 0 ? "∞" : formatInteger(creditsRemaining),
      creditsCap: creditsCap > 0 ? formatInteger(creditsCap) : "∞",
      totalTokens: formatNumber(totalTokens),
      totalCostPeriod: `€${(costPeriod / 100).toFixed(2)} this period`,
      successRateWindow:
        recentRunsToday.length > 0
          ? `from ${recentRunsToday.length} recent run${recentRunsToday.length === 1 ? "" : "s"}`
          : "No runs recorded today",
    };
  }, [pipelinesQ.data, runsQ.data, usageQ.data]);

  const tableRows = useMemo<DashboardRow[]>(() => {
    const rows: DashboardRow[] = (pipelinesQ.data ?? []).map((pipeline) => {
      const updated = pipeline.updatedAt || pipeline.updated_at;
      const status = String(pipeline.status || "active");
      const stepCount = (() => {
        try {
          return (
            (pipeline.definition as { steps?: unknown[] })?.steps?.length ?? 0
          );
        } catch {
          return 0;
        }
      })();
      return {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description || "No description",
        status,
        lastRun: updated ? timeAgo(new Date(updated)) : "-",
        steps: String(stepCount),
        cost: "—",
        pipelineId: pipeline.id,
      };
    });
    return rows;
  }, [pipelinesQ.data]);

  /* Design: buttons padding [10,18], gap 8, cornerRadius 8 */
  const actions = (
    <>
      <button
        type="button"
        onClick={() => createMut.mutate()}
        className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]"
      >
        <span className="text-base leading-none">+</span>
        <span className="hidden sm:inline">New pipeline</span>
        <span className="sm:hidden">New</span>
      </button>
      {importEnabled ? (
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)] sm:flex"
        >
          Import YAML
        </button>
      ) : null}
    </>
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview of your pipelines and recent activity"
      actions={actions}
    >
      {importEnabled ? (
        <ImportYamlModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={(created) => {
            trackPipelineCreated(created.id, created.name);
            queryClient.invalidateQueries({ queryKey: ["pipelines"] });
            navigate({
              to: "/pipelines/$pipelineId/edit",
              params: { pipelineId: created.id },
            });
          }}
        />
      ) : null}
      {createMut.isError ? (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {createMut.error instanceof Error
            ? createMut.error.message
            : "Failed to create pipeline"}
        </p>
      ) : null}

      {/* Stats row — gap 16, cards cornerRadius 10, padding 20, gap 8 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          label="ACTIVE PIPELINES"
          value={String(stats.active)}
          sub={`+${stats.activeThisWeek} this week`}
          subColor="var(--accent)"
        />
        <StatCard
          label="RUNS TODAY"
          value={String(stats.runsToday)}
          sub={
            stats.successRate > 0
              ? `${stats.successRate}% success rate (${stats.successRateWindow})`
              : stats.successRateWindow
          }
          subColor="#22C55E"
        />
        <StatCard
          label="CREDITS REMAINING"
          value={stats.creditsRemaining}
          sub={`of ${stats.creditsCap}`}
          subColor="var(--text-tertiary)"
        />
        <StatCard
          label="TOTAL TOKENS"
          value={stats.totalTokens}
          sub={stats.totalCostPeriod}
          subColor="var(--text-tertiary)"
        />
      </section>

      {/* Table — desktop: grid table, mobile: card list */}
      <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        {pipelinesQ.isLoading ? (
          <p className="p-5 text-sm text-[var(--text-tertiary)]">
            Loading pipelines...
          </p>
        ) : null}
        {pipelinesQ.isError ? (
          <p className="p-5 text-sm text-red-300">
            {pipelinesQ.error instanceof Error
              ? pipelinesQ.error.message
              : "Failed to load"}
          </p>
        ) : null}
        {!pipelinesQ.isLoading && tableRows.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-tertiary)]">
            No pipelines yet. Create one to see dashboard activity.
          </p>
        ) : null}

        {/* Desktop table — hidden on mobile */}
        <div className="hidden md:block">
          <div
            className="grid items-center bg-[var(--bg-inset)] px-5 py-3.5"
            style={{
              gridTemplateColumns: "minmax(280px,1fr) 120px 160px 80px 100px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Pipeline
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Status
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Last Run
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Steps
            </span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Cost
            </span>
          </div>
          <div className="divide-y divide-[var(--divider)]">
            {tableRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="grid w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  gridTemplateColumns:
                    "minmax(280px,1fr) 120px 160px 80px 100px",
                }}
                onClick={() => {
                  if (row.pipelineId) {
                    navigate({
                      to: "/pipelines/$pipelineId/edit",
                      params: { pipelineId: row.pipelineId },
                    });
                  }
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p
                    className="text-[11px] text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {row.description}
                  </p>
                </div>
                <div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="text-[13px] text-[var(--text-secondary)]">
                  {row.lastRun}
                </div>
                <div
                  className="text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {row.steps}
                </div>
                <div
                  className="text-right text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {row.cost}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile card list */}
        <div className="divide-y divide-[var(--divider)] md:hidden">
          {tableRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
              onClick={() => {
                if (row.pipelineId) {
                  navigate({
                    to: "/pipelines/$pipelineId/edit",
                    params: { pipelineId: row.pipelineId },
                  });
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {row.description}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div
                className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <span>{row.steps} steps</span>
                <span className="text-[var(--divider)]">·</span>
                <span>{row.lastRun}</span>
                <span className="text-[var(--divider)]">·</span>
                <span>{row.cost}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

/* Design: stat card — cornerRadius 10, padding 20, gap 8, labels in JetBrains Mono */
function StatCard({
  label,
  value,
  sub,
  subColor,
}: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <div
      className="rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5"
      style={{ gap: 8 }}
    >
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
      <p
        className="mt-2 text-xs font-medium"
        style={{ fontFamily: "var(--font-mono)", color: subColor }}
      >
        {sub}
      </p>
    </div>
  );
}

/* Design: badge — cornerRadius 100, padding [4,10], gap 6, dot 6x6 */
function StatusBadge({ status }: { status: string }) {
  const isActive =
    status === "active" || status === "running" || status === "completed";
  const isDraft = status === "draft";
  const bg = isActive ? "#22C55E20" : isDraft ? "#EAB30820" : "var(--bg-inset)";
  const fg = isActive
    ? "#22C55E"
    : isDraft
      ? "#EAB308"
      : "var(--text-tertiary)";
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatInteger(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
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
