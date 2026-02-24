import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SurfaceCard, UiButton } from "@stepiq/ui";
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
          prompt: "Hello from Stepiq",
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

  const createPipelineMutation = useMutation({
    mutationFn: createPipeline,
  });
  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });
  const runsQuery = useQuery({
    queryKey: ["runs", "dashboard"],
    queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=20"),
  });

  const stats = useMemo(() => {
    const pipelines = pipelinesQuery.data ?? [];
    const runs = runsQuery.data ?? [];
    const activeRuns = runs.filter((run) => run.status === "running").length;
    const failedRuns = runs.filter((run) => run.status === "failed").length;
    return {
      pipelines: pipelines.length,
      runsToday: runs.length,
      activeRuns,
      failedRuns,
    };
  }, [pipelinesQuery.data, runsQuery.data]);

  return (
    <AppShell title="Dashboard" subtitle="Overview of your pipelines and recent activity">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat title="Active pipelines" value={String(stats.pipelines)} />
        <Stat title="Recent runs" value={String(stats.runsToday)} />
        <Stat title="Running now" value={String(stats.activeRuns)} />
        <Stat title="Failed" value={String(stats.failedRuns)} />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--divider)] px-4 py-3">
          <h2 className="font-semibold">Pipelines</h2>
          <div className="flex gap-2">
            <button type="button" className="rounded-md border border-[var(--divider)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
              Import YAML
            </button>
            <UiButton type="button" onClick={() => createPipelineMutation.mutate()}>
              New pipeline
            </UiButton>
          </div>
        </div>

        {pipelinesQuery.isLoading ? <p className="p-4 text-sm text-[var(--text-tertiary)]">Loading pipelines...</p> : null}
        {pipelinesQuery.isError ? (
          <p className="p-4 text-sm text-red-300">{pipelinesQuery.error instanceof Error ? pipelinesQuery.error.message : "Failed to load pipelines"}</p>
        ) : null}
        {createPipelineMutation.isError ? (
          <p className="p-4 text-sm text-red-300">
            {createPipelineMutation.error instanceof Error ? createPipelineMutation.error.message : "Failed to create pipeline"}
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(220px,1fr)_120px_180px] gap-2 border-b border-[var(--divider)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>Pipeline</span>
          <span>Status</span>
          <span className="text-right">Updated</span>
        </div>

        <div className="divide-y divide-[var(--divider)]">
          {(pipelinesQuery.data ?? []).map((pipeline) => {
            const updated = pipeline.updatedAt || pipeline.updated_at;
            return (
              <button
                key={pipeline.id}
                type="button"
                className="grid w-full grid-cols-[minmax(220px,1fr)_120px_180px] items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-surface-hover)]"
                onClick={() => navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: pipeline.id } })}
              >
                <div>
                  <p className="font-medium">{pipeline.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{pipeline.description || "No description"}</p>
                </div>
                <div className="text-xs">
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                    {pipeline.status || "active"}
                  </span>
                </div>
                <div className="text-right text-xs text-[var(--text-tertiary)]">
                  <div>v{pipeline.version} · {updated ? new Date(updated).toLocaleDateString() : "-"}</div>
                </div>
              </button>
            );
          })}
          {(pipelinesQuery.data ?? []).length === 0 && !pipelinesQuery.isLoading ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">No pipelines yet</p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <SurfaceCard className="p-4">
      <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </SurfaceCard>
  );
}
