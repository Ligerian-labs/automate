import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function RunDetailPage() {
    const { runId } = useParams({ strict: false });
    const [sseState, setSseState] = useState("disconnected");
    const runQ = useQuery({
        queryKey: ["run", runId],
        queryFn: () => apiFetch(`/api/runs/${runId}`),
        enabled: Boolean(runId),
        refetchInterval: 4000,
    });
    const cancelMut = useMutation({
        mutationFn: () => apiFetch(`/api/runs/${runId}/cancel`, { method: "POST", body: "{}" }),
        onSuccess: () => runQ.refetch(),
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
    const run = runQ.data;
    const stats = useMemo(() => {
        if (!run)
            return { duration: "-", tokens: "-", cost: "-", steps: "-" };
        const duration = run.completedAt && run.startedAt
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
    const actions = (_jsxs(_Fragment, { children: [_jsx(StatusBadge, { status: status }), _jsx("button", { type: "button", onClick: () => cancelMut.mutate(), className: "rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]", children: "Retry" })] }));
    return (_jsxs(AppShell, { title: `Run ${runId?.slice(0, 8)}...`, subtitle: `Pipeline run · SSE: ${sseState}`, actions: actions, children: [runQ.isLoading ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "Loading run..." }) : null, runQ.isError ? _jsx("p", { className: "text-sm text-red-300", children: "Failed to load run" }) : null, _jsxs("section", { className: "mb-8 grid grid-cols-4 gap-4", children: [_jsx(StatCard, { label: "Duration", value: stats.duration }), _jsx(StatCard, { label: "Tokens", value: stats.tokens }), _jsx(StatCard, { label: "Cost", value: stats.cost }), _jsx(StatCard, { label: "Steps", value: stats.steps })] }), _jsxs("section", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Step Execution" }), status === "running" ? (_jsx("button", { type: "button", onClick: () => cancelMut.mutate(), className: "rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300", children: "Cancel run" })) : null] }), (run?.steps ?? []).map((step) => (_jsx(StepCard, { step: step }, step.id))), (run?.steps ?? []).length === 0 ? (_jsx("div", { className: "rounded-xl border border-dashed border-[var(--divider)] p-8 text-center text-sm text-[var(--text-tertiary)]", children: "No steps executed yet" })) : null] })] }));
}
function StatCard({ label, value }) {
    return (_jsxs("div", { className: "rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]", children: label }), _jsx("p", { className: "mt-2 text-[28px] font-bold leading-none", children: value })] }));
}
function StatusBadge({ status }) {
    const isSuccess = status === "completed";
    const isRunning = status === "running";
    const isFailed = status === "failed";
    let classes = "bg-[var(--bg-inset)] text-[var(--text-tertiary)]";
    let dotClass = "bg-[var(--text-muted)]";
    if (isSuccess) {
        classes = "bg-[#22C55E20] text-emerald-400";
        dotClass = "bg-emerald-400";
    }
    if (isRunning) {
        classes = "bg-[#22D3EE20] text-cyan-400";
        dotClass = "bg-cyan-400";
    }
    if (isFailed) {
        classes = "bg-[#EF444420] text-red-400";
        dotClass = "bg-red-400";
    }
    return (_jsxs("span", { className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`, children: [_jsx("span", { className: `inline-block size-1.5 rounded-full ${dotClass}` }), status.charAt(0).toUpperCase() + status.slice(1)] }));
}
function StepCard({ step }) {
    const status = step.status;
    const isSuccess = status === "completed";
    const isFailed = status === "failed";
    return (_jsxs("div", { className: `rounded-xl border bg-[var(--bg-surface)] p-5 ${isFailed ? "border-red-500/30" : isSuccess ? "border-emerald-500/20" : "border-[var(--divider)]"}`, children: [_jsxs("div", { className: "flex items-start gap-5", children: [_jsxs("div", { className: "w-[200px] shrink-0", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsx(StatusBadge, { status: status }) }), _jsx("p", { className: "mt-2 text-sm font-medium", children: step.stepId || step.step_id || "step" }), _jsxs("p", { className: "text-xs text-[var(--text-tertiary)]", children: ["model: ", step.model || "n/a"] })] }), _jsxs("div", { className: "flex flex-1 items-center gap-6", children: [_jsx(MetricPill, { label: "Duration", value: `${step.durationMs || step.duration_ms || 0}ms` }), _jsx(MetricPill, { label: "Tokens", value: String((step.inputTokens ?? step.input_tokens ?? 0) + (step.outputTokens ?? step.output_tokens ?? 0)) }), _jsx(MetricPill, { label: "Cost", value: `€${((step.costCents || step.cost_cents || 0) / 100).toFixed(2)}` }), step.rawOutput || step.raw_output ? (_jsx(MetricPill, { label: "Output", value: "\u2713" })) : null] })] }), step.error ? (_jsx("p", { className: "mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300", children: step.error })) : null, step.rawOutput || step.raw_output ? (_jsx("pre", { className: "mt-3 max-h-[200px] overflow-auto rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed text-[var(--text-tertiary)]", children: step.rawOutput || step.raw_output })) : null] }));
}
function MetricPill({ label, value }) {
    return (_jsxs("div", { children: [_jsx("p", { className: "text-[10px] uppercase tracking-wider text-[var(--text-muted)]", children: label }), _jsx("p", { className: "text-sm font-medium text-[var(--text-secondary)]", children: value })] }));
}
//# sourceMappingURL=run-detail.js.map