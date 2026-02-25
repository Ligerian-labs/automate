import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function RunsListPage() {
    const navigate = useNavigate();
    const runsQ = useQuery({ queryKey: ["runs"], queryFn: () => apiFetch("/api/runs?limit=50") });
    return (_jsx(AppShell, { title: "Runs", subtitle: "View all pipeline execution history", children: _jsxs("section", { className: "overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]", children: [_jsxs("div", { className: "grid items-center bg-[var(--bg-inset)] px-5 py-3.5", style: { gridTemplateColumns: "minmax(200px,1fr) 120px 120px 100px 100px 120px", fontFamily: "var(--font-mono)" }, children: [_jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Run ID" }), _jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Status" }), _jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Trigger" }), _jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Steps" }), _jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Tokens" }), _jsx("span", { className: "text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]", children: "Cost" })] }), runsQ.isLoading ? _jsx("p", { className: "p-5 text-sm text-[var(--text-tertiary)]", children: "Loading runs..." }) : null, runsQ.isError ? (_jsx("p", { className: "p-5 text-sm text-red-300", children: runsQ.error instanceof Error ? runsQ.error.message : "Failed to load" })) : null, _jsxs("div", { className: "divide-y divide-[var(--divider)]", children: [(runsQ.data ?? []).map((run) => {
                            const status = run.status || "pending";
                            return (_jsxs("button", { type: "button", className: "grid w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]", style: { gridTemplateColumns: "minmax(200px,1fr) 120px 120px 100px 100px 120px" }, onClick: () => navigate({ to: "/runs/$runId", params: { runId: run.id } }), children: [_jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsxs("p", { className: "text-sm font-medium", style: { fontFamily: "var(--font-mono)" }, children: [run.id.slice(0, 8), "..."] }), _jsx("p", { className: "text-[11px] text-[var(--text-tertiary)]", children: run.createdAt || run.created_at ? timeAgo(new Date(run.createdAt || run.created_at || "")) : "-" })] }), _jsx("div", { children: _jsx(RunStatusBadge, { status: status }) }), _jsx("div", { className: "text-[13px] text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: run.triggerType || run.trigger_type || "manual" }), _jsx("div", { className: "text-[13px] text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: (run.steps ?? []).length }), _jsx("div", { className: "text-[13px] text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: run.totalTokens ?? run.total_tokens ?? 0 }), _jsxs("div", { className: "text-right text-[13px] text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: ["\u20AC", ((run.totalCostCents ?? run.total_cost_cents ?? 0) / 100).toFixed(2)] })] }, run.id));
                        }), (runsQ.data ?? []).length === 0 && !runsQ.isLoading ? (_jsx("p", { className: "p-8 text-center text-sm text-[var(--text-tertiary)]", children: "No runs yet \u2014 execute a pipeline to see results here." })) : null] })] }) }));
}
function RunStatusBadge({ status }) {
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
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", style: { background: bg, color: fg, fontFamily: "var(--font-mono)" }, children: [_jsx("span", { className: "inline-block size-1.5 rounded-full", style: { background: fg } }), status.charAt(0).toUpperCase() + status.slice(1)] }));
}
function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60)
        return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
}
//# sourceMappingURL=runs-list.js.map