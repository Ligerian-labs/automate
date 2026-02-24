import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SurfaceCard, UiButton } from "@automate/ui";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function DashboardPage() {
    const navigate = useNavigate();
    async function createPipeline() {
        const baseDefinition = {
            name: "Untitled pipeline",
            version: 1,
            steps: [
                {
                    id: "step_1",
                    name: "First step",
                    type: "llm",
                    model: "gpt-4o-mini",
                    prompt: "Hello from Automate",
                },
            ],
        };
        const created = await apiFetch("/api/pipelines", {
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
        queryFn: () => apiFetch("/api/pipelines"),
    });
    const runsQuery = useQuery({
        queryKey: ["runs", "dashboard"],
        queryFn: () => apiFetch("/api/runs?limit=20"),
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
    return (_jsxs(AppShell, { title: "Dashboard", subtitle: "Overview of your pipelines and recent activity", children: [_jsxs("section", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4", children: [_jsx(Stat, { title: "Active pipelines", value: String(stats.pipelines) }), _jsx(Stat, { title: "Recent runs", value: String(stats.runsToday) }), _jsx(Stat, { title: "Running now", value: String(stats.activeRuns) }), _jsx(Stat, { title: "Failed", value: String(stats.failedRuns) })] }), _jsxs("section", { className: "mt-6 overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[var(--divider)] px-4 py-3", children: [_jsx("h2", { className: "font-semibold", children: "Pipelines" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "rounded-md border border-[var(--divider)] px-3 py-1.5 text-xs text-[var(--text-secondary)]", children: "Import YAML" }), _jsx(UiButton, { type: "button", onClick: () => createPipelineMutation.mutate(), children: "New pipeline" })] })] }), pipelinesQuery.isLoading ? _jsx("p", { className: "p-4 text-sm text-[var(--text-tertiary)]", children: "Loading pipelines..." }) : null, pipelinesQuery.isError ? (_jsx("p", { className: "p-4 text-sm text-red-300", children: pipelinesQuery.error instanceof Error ? pipelinesQuery.error.message : "Failed to load pipelines" })) : null, createPipelineMutation.isError ? (_jsx("p", { className: "p-4 text-sm text-red-300", children: createPipelineMutation.error instanceof Error ? createPipelineMutation.error.message : "Failed to create pipeline" })) : null, _jsxs("div", { className: "grid grid-cols-[minmax(220px,1fr)_120px_180px] gap-2 border-b border-[var(--divider)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]", children: [_jsx("span", { children: "Pipeline" }), _jsx("span", { children: "Status" }), _jsx("span", { className: "text-right", children: "Updated" })] }), _jsxs("div", { className: "divide-y divide-[var(--divider)]", children: [(pipelinesQuery.data ?? []).map((pipeline) => {
                                const updated = pipeline.updatedAt || pipeline.updated_at;
                                return (_jsxs("button", { type: "button", className: "grid w-full grid-cols-[minmax(220px,1fr)_120px_180px] items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-surface-hover)]", onClick: () => navigate({ to: "/pipelines/$pipelineId/edit", params: { pipelineId: pipeline.id } }), children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: pipeline.name }), _jsx("p", { className: "text-xs text-[var(--text-tertiary)]", children: pipeline.description || "No description" })] }), _jsx("div", { className: "text-xs", children: _jsx("span", { className: "rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300", children: pipeline.status || "active" }) }), _jsx("div", { className: "text-right text-xs text-[var(--text-tertiary)]", children: _jsxs("div", { children: ["v", pipeline.version, " \u00B7 ", updated ? new Date(updated).toLocaleDateString() : "-"] }) })] }, pipeline.id));
                            }), (pipelinesQuery.data ?? []).length === 0 && !pipelinesQuery.isLoading ? (_jsx("p", { className: "p-8 text-center text-sm text-[var(--text-tertiary)]", children: "No pipelines yet" })) : null] })] })] }));
}
function Stat({ title, value }) {
    return (_jsxs(SurfaceCard, { className: "p-4", children: [_jsx("p", { className: "text-xs uppercase tracking-wider text-[var(--text-tertiary)]", children: title }), _jsx("p", { className: "mt-2 text-2xl font-semibold", children: value })] }));
}
//# sourceMappingURL=dashboard.js.map