import type { PipelineDefinition } from "@stepiq/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/app-shell";
import { ImportYamlModal } from "../components/import-yaml-modal";
import { trackPipelineCreated, trackPipelineDeleted } from "../lib/analytics";
import { ApiError, type PipelineRecord, type UserMe, apiFetch } from "../lib/api";

function canImportYaml(plan: string | undefined): boolean {
  const normalized = (plan || "").toLowerCase();
  return normalized === "pro" || normalized === "enterprise";
}

export function PipelinesListPage() {
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
  const deleteMut = useMutation({
    mutationFn: (pipelineId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/pipelines/${pipelineId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, pipelineId) => {
      trackPipelineDeleted(pipelineId);
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
  const pipelinesQ = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/user/me"),
  });
  const importEnabled = canImportYaml(meQ.data?.plan);

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
      title="Pipelines"
      subtitle="Manage and create AI pipelines"
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
      {deleteMut.isError ? (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {deleteMut.error instanceof ApiError
            ? deleteMut.error.message
            : "Failed to delete pipeline"}
        </p>
      ) : null}

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

        {/* Desktop table */}
        <div className="hidden md:block">
          <div
            className="grid items-center bg-[var(--bg-inset)] px-5 py-3.5"
            style={{
              gridTemplateColumns:
                "minmax(280px,1fr) 120px 160px 80px 100px 120px",
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
            <span className="text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Actions
            </span>
          </div>
          <div className="divide-y divide-[var(--divider)]">
            {(pipelinesQ.data ?? []).map((pipeline) => {
              const updated = pipeline.updatedAt || pipeline.updated_at;
              const status = pipeline.status || "active";
              const stepCount = getStepCount(pipeline);
              return (
                <div
                  key={pipeline.id}
                  className="grid items-center px-5 py-4 transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    gridTemplateColumns:
                      "minmax(280px,1fr) 120px 160px 80px 100px 120px",
                  }}
                >
                  <button
                    type="button"
                    className="flex flex-col gap-0.5 text-left"
                    onClick={() =>
                      navigate({
                        to: "/pipelines/$pipelineId/edit",
                        params: { pipelineId: pipeline.id },
                      })
                    }
                  >
                    <p className="text-sm font-medium">{pipeline.name}</p>
                    <p
                      className="text-[11px] text-[var(--text-tertiary)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {pipeline.description || "No description"}
                    </p>
                  </button>
                  <div>
                    <StatusBadge status={status} />
                  </div>
                  <div className="text-[13px] text-[var(--text-secondary)]">
                    {updated ? timeAgo(new Date(updated)) : "-"}
                  </div>
                  <div
                    className="text-[13px] text-[var(--text-secondary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {stepCount}
                  </div>
                  <div
                    className="text-right text-[13px] text-[var(--text-secondary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    —
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(pipeline.id)}
                      disabled={deleteMut.isPending}
                      className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile card list */}
        <div className="divide-y divide-[var(--divider)] md:hidden">
          {(pipelinesQ.data ?? []).map((pipeline) => {
            const updated = pipeline.updatedAt || pipeline.updated_at;
            const status = pipeline.status || "active";
            const stepCount = getStepCount(pipeline);
            return (
              <div key={pipeline.id} className="px-4 py-4">
                <button
                  type="button"
                  className="flex w-full flex-col gap-2.5 text-left"
                  onClick={() =>
                    navigate({
                      to: "/pipelines/$pipelineId/edit",
                      params: { pipelineId: pipeline.id },
                    })
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {pipeline.name}
                      </p>
                      <p
                        className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {pipeline.description || "No description"}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <div
                    className="flex items-center gap-3 text-[12px] text-[var(--text-secondary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    <span>{stepCount} steps</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{updated ? timeAgo(new Date(updated)) : "-"}</span>
                  </div>
                </button>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(pipeline.id)}
                    disabled={deleteMut.isPending}
                    className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {(pipelinesQ.data ?? []).length === 0 && !pipelinesQ.isLoading ? (
          <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">
            No pipelines yet — create one to get started.
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}

function getStepCount(pipeline: PipelineRecord): number {
  try {
    return (pipeline.definition as { steps?: unknown[] })?.steps?.length ?? 0;
  } catch {
    return 0;
  }
}

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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
