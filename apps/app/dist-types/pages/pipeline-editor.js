import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function PipelineEditorPage() {
    const { pipelineId } = useParams({ strict: false });
    const navigate = useNavigate();
    const pipelineQ = useQuery({
        queryKey: ["pipeline", pipelineId],
        queryFn: () => apiFetch(`/api/pipelines/${pipelineId}`),
        enabled: Boolean(pipelineId),
    });
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [definitionText, setDefinitionText] = useState("{}");
    const [message, setMessage] = useState(null);
    const [expandedStep, setExpandedStep] = useState(0);
    const steps = (() => {
        try {
            return JSON.parse(definitionText).steps ?? [];
        }
        catch {
            return [];
        }
    })();
    useEffect(() => {
        if (pipelineQ.data) {
            setName(pipelineQ.data.name);
            setDescription(pipelineQ.data.description || "");
            setDefinitionText(JSON.stringify(pipelineQ.data.definition ?? {}, null, 2));
        }
    }, [pipelineQ.data]);
    const saveMut = useMutation({
        mutationFn: async () => {
            const parsed = JSON.parse(definitionText);
            return apiFetch(`/api/pipelines/${pipelineId}`, {
                method: "PUT",
                body: JSON.stringify({ name, description, definition: parsed }),
            });
        },
        onSuccess: () => setMessage("Pipeline saved"),
        onError: (err) => setMessage(err instanceof Error ? err.message : "Save failed"),
    });
    const runMut = useMutation({
        mutationFn: () => apiFetch(`/api/pipelines/${pipelineId}/run`, { method: "POST", body: "{}" }),
        onSuccess: (run) => navigate({ to: "/runs/$runId", params: { runId: run.id } }),
        onError: (err) => setMessage(err instanceof Error ? err.message : "Run failed"),
    });
    const status = pipelineQ.data?.status || "draft";
    const actions = (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(StatusBadge, { status: status }), _jsx("button", { type: "button", className: "rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]", onClick: () => runMut.mutate(), children: "\u25B7 Test Run" }), _jsx("button", { type: "button", className: "rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]", onClick: () => saveMut.mutate(), children: "Save Pipeline" })] }));
    return (_jsxs(AppShell, { title: name || "Pipeline Editor", subtitle: description || "Configure your pipeline steps and variables", actions: actions, children: [pipelineQ.isLoading ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "Loading pipeline..." }) : null, pipelineQ.isError ? (_jsx("p", { className: "text-sm text-red-300", children: pipelineQ.error instanceof Error ? pipelineQ.error.message : "Failed to load" })) : null, message ? _jsx("p", { className: "mb-2 text-sm text-[var(--text-secondary)]", children: message }) : null, _jsxs("div", { className: "flex gap-6", children: [_jsxs("div", { className: "flex w-[360px] shrink-0 flex-col gap-5", children: [_jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Pipeline Config" }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Name" }), _jsx("input", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Description" }), _jsx("input", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", value: description, onChange: (e) => setDescription(e.target.value) })] })] }), _jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Variables" }), _jsx("button", { type: "button", className: "text-xs font-medium text-[var(--accent)]", children: "+ Add" })] }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("div", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]", style: { fontFamily: "var(--font-mono)" }, children: "api_key" }), _jsx("div", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]", style: { fontFamily: "var(--font-mono)" }, children: "sk-***" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("div", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]", style: { fontFamily: "var(--font-mono)" }, children: "language" }), _jsx("div", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]", style: { fontFamily: "var(--font-mono)" }, children: "fr" })] })] })] }), _jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Definition (JSON)" }), _jsx("textarea", { className: "min-h-[200px] w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: definitionText, onChange: (e) => setDefinitionText(e.target.value) })] })] }), _jsxs("div", { className: "flex flex-1 flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("h2", { className: "text-[15px] font-semibold", children: ["Steps (", steps.length, ")"] }), _jsx("button", { type: "button", className: "flex items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)]", children: "+ Add Step" })] }), steps.map((step, idx) => {
                                const isExpanded = expandedStep === idx;
                                return (_jsxs("div", { className: `rounded-[10px] border bg-[var(--bg-surface)] p-5 transition-colors ${isExpanded ? "border-[var(--accent)]" : "border-[var(--divider)]"}`, children: [_jsxs("button", { type: "button", className: "flex w-full items-center justify-between", onClick: () => setExpandedStep(isExpanded ? -1 : idx), children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: `grid size-6 place-items-center rounded-[6px] text-[11px] font-bold ${isExpanded ? "bg-[var(--accent)] text-[var(--bg-primary)]" : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"}`, style: { fontFamily: "var(--font-mono)" }, children: idx + 1 }), _jsx("span", { className: `text-sm ${isExpanded ? "font-semibold" : "font-medium"}`, children: step.name || step.id || `Step ${idx + 1}` })] }), _jsx("span", { className: "rounded-full bg-[var(--bg-inset)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: step.model || "gpt-4o-mini" })] }), isExpanded ? (_jsxs("div", { className: "mt-4 flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Prompt" }), _jsx("div", { className: "rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: step.prompt || "No prompt defined" })] }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Output Format" }), _jsx("div", { className: "rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: step.outputFormat || "text" })] }), _jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Timeout" }), _jsxs("div", { className: "rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: [step.timeout ?? 30, "s"] })] }), _jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Retries" }), _jsx("div", { className: "rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: step.retries ?? 2 })] })] })] })) : null] }, step.id || idx));
                            }), steps.length === 0 ? (_jsx("div", { className: "rounded-[10px] border border-dashed border-[var(--divider)] p-8 text-center text-sm text-[var(--text-tertiary)]", children: "No steps yet. Add steps to your pipeline definition." })) : null] })] })] }));
}
function StatusBadge({ status }) {
    const isActive = status === "active" || status === "running";
    const bg = isActive ? "#22C55E20" : "#EAB30820";
    const fg = isActive ? "#22C55E" : "#EAB308";
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", style: { background: bg, color: fg, fontFamily: "var(--font-mono)" }, children: [_jsx("span", { className: "inline-block size-1.5 rounded-full", style: { background: fg } }), status.charAt(0).toUpperCase() + status.slice(1)] }));
}
//# sourceMappingURL=pipeline-editor.js.map