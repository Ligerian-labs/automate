import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function RunDetailPage() {
    const { runId } = useParams({ strict: false });
    const [sseState, setSseState] = useState("disconnected");
    const runQuery = useQuery({
        queryKey: ["run", runId],
        queryFn: () => apiFetch(`/api/runs/${runId}`),
        enabled: Boolean(runId),
        refetchInterval: 4000,
    });
    const cancelMutation = useMutation({
        mutationFn: () => apiFetch(`/api/runs/${runId}/cancel`, { method: "POST", body: "{}" }),
        onSuccess: () => runQuery.refetch(),
    });
    useEffect(() => {
        if (!runId)
            return;
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
        if (!run)
            return { duration: "-", tokens: "-", cost: "-", steps: "-" };
        const duration = run.completedAt && run.startedAt ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null;
        return {
            duration: duration ? `${duration}s` : "running",
            tokens: String(run.totalTokens ?? run.total_tokens ?? 0),
            cost: `${((run.totalCostCents ?? run.total_cost_cents ?? 0) / 100).toFixed(2)}€`,
            steps: String((run.steps ?? []).length),
        };
    }, [runQuery.data]);
    return (_jsxs(AppShell, { title: `Run ${runId}`, subtitle: `SSE: ${sseState}`, children: [runQuery.isLoading ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "Loading run..." }) : null, runQuery.isError ? _jsx("p", { className: "text-sm text-red-300", children: "Failed to load run" }) : null, _jsxs("section", { className: "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] px-4 py-3", children: [_jsxs("div", { className: "text-xs text-[var(--text-tertiary)]", children: ["Run status: ", _jsx("span", { className: "text-[var(--text-secondary)]", children: runQuery.data?.status || "unknown" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-300", children: runQuery.data?.status || "pending" }), _jsx("button", { type: "button", onClick: () => cancelMutation.mutate(), className: "rounded-md border border-[var(--divider)] px-3 py-1.5 text-sm text-[var(--text-secondary)]", children: "Retry" })] })] }), _jsxs("section", { className: "grid grid-cols-2 gap-3 md:grid-cols-4", children: [_jsx(Stat, { title: "Duration", value: stats.duration }), _jsx(Stat, { title: "Tokens", value: stats.tokens }), _jsx(Stat, { title: "Cost", value: stats.cost }), _jsx(Stat, { title: "Steps", value: stats.steps })] }), _jsxs("section", { className: "mt-5 rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "font-semibold", children: "Step execution" }), _jsx("button", { type: "button", onClick: () => cancelMutation.mutate(), className: "rounded-md border border-[var(--divider)] px-3 py-1.5 text-sm text-[var(--text-secondary)]", children: "Cancel run" })] }), _jsxs("div", { className: "space-y-3", children: [(runQuery.data?.steps ?? []).map((step) => (_jsx(StepCard, { step: step }, step.id))), (runQuery.data?.steps ?? []).length === 0 ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "No steps yet" }) : null] })] })] }));
}
function Stat({ title, value }) {
    return (_jsxs("article", { className: "rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4", children: [_jsx("p", { className: "text-xs uppercase tracking-wider text-[var(--text-tertiary)]", children: title }), _jsx("p", { className: "mt-2 text-xl font-semibold", children: value })] }));
}
function StepCard({ step }) {
    const status = step.status;
    return (_jsxs("article", { className: "rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3", children: [_jsxs("div", { className: "grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-center", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: step.stepId || step.step_id || "step" }), _jsxs("p", { className: "text-xs text-[var(--text-tertiary)]", children: ["model: ", step.model || "n/a"] })] }), _jsxs("p", { className: "text-xs text-[var(--text-tertiary)]", children: [step.durationMs || step.duration_ms || 0, "ms \u00B7 ", ((step.costCents || step.cost_cents || 0) / 100).toFixed(2), "\u20AC"] }), _jsx("span", { className: "w-fit rounded-full bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-secondary)]", children: status })] }), step.error ? _jsx("p", { className: "mt-2 text-sm text-red-300", children: step.error }) : null, step.rawOutput || step.raw_output ? (_jsx("pre", { className: "mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--text-tertiary)]", children: step.rawOutput || step.raw_output })) : null] }));
}
//# sourceMappingURL=run-detail.js.map