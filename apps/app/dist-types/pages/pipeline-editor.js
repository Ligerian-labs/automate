import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
function newStep(index) {
    return {
        id: `step_${index}`,
        name: `Step ${index}`,
        type: "llm",
        model: "gpt-4o-mini",
        prompt: "",
        outputFormat: "text",
        timeout: 30,
        retries: 2,
    };
}
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
    const [steps, setSteps] = useState([]);
    const [variables, setVariables] = useState([]);
    const [expandedStep, setExpandedStep] = useState(0);
    const [message, setMessage] = useState(null);
    const [jsonMode, setJsonMode] = useState(false);
    const [rawJson, setRawJson] = useState("");
    // Load pipeline data
    useEffect(() => {
        if (!pipelineQ.data)
            return;
        const p = pipelineQ.data;
        setName(p.name);
        setDescription(p.description || "");
        const def = (p.definition ?? {});
        setSteps((def.steps ?? []).map((s, i) => ({
            id: s.id || `step_${i + 1}`,
            name: s.name || `Step ${i + 1}`,
            type: s.type || "llm",
            model: s.model || "gpt-4o-mini",
            prompt: s.prompt || "",
            outputFormat: s.outputFormat || "text",
            timeout: s.timeout ?? 30,
            retries: s.retries ?? 2,
        })));
        const vars = def.variables ?? {};
        setVariables(Object.entries(vars).map(([key, value]) => ({ key, value: String(value) })));
        setRawJson(JSON.stringify(p.definition ?? {}, null, 2));
    }, [pipelineQ.data]);
    // Build definition from structured state
    const buildDefinition = useCallback(() => {
        if (jsonMode) {
            try {
                return JSON.parse(rawJson);
            }
            catch {
                return {};
            }
        }
        const vars = {};
        for (const v of variables) {
            if (v.key)
                vars[v.key] = v.value;
        }
        return {
            name,
            version: pipelineQ.data?.version ?? 1,
            steps: steps.map((s) => ({
                id: s.id,
                name: s.name,
                type: s.type,
                model: s.model,
                prompt: s.prompt,
                outputFormat: s.outputFormat,
                timeout: s.timeout,
                retries: s.retries,
            })),
            variables: Object.keys(vars).length > 0 ? vars : undefined,
        };
    }, [jsonMode, rawJson, name, steps, variables, pipelineQ.data]);
    // Sync rawJson when switching to JSON mode
    useEffect(() => {
        if (jsonMode)
            setRawJson(JSON.stringify(buildDefinition(), null, 2));
    }, [jsonMode]);
    // Step mutations
    const updateStep = (idx, patch) => {
        setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };
    const removeStep = (idx) => {
        setSteps((prev) => prev.filter((_, i) => i !== idx));
        if (expandedStep >= idx && expandedStep > 0)
            setExpandedStep(expandedStep - 1);
    };
    const addStep = () => {
        const next = steps.length + 1;
        setSteps((prev) => [...prev, newStep(next)]);
        setExpandedStep(steps.length);
    };
    const moveStep = (idx, dir) => {
        const target = idx + dir;
        if (target < 0 || target >= steps.length)
            return;
        setSteps((prev) => {
            const copy = [...prev];
            [copy[idx], copy[target]] = [copy[target], copy[idx]];
            return copy;
        });
        setExpandedStep(target);
    };
    // Variable mutations
    const updateVar = (idx, field, val) => {
        setVariables((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));
    };
    const removeVar = (idx) => setVariables((prev) => prev.filter((_, i) => i !== idx));
    const addVar = () => setVariables((prev) => [...prev, { key: "", value: "" }]);
    // Save
    const saveMut = useMutation({
        mutationFn: async () => {
            const definition = buildDefinition();
            return apiFetch(`/api/pipelines/${pipelineId}`, {
                method: "PUT",
                body: JSON.stringify({ name, description, definition }),
            });
        },
        onSuccess: () => setMessage("Pipeline saved ✓"),
        onError: (err) => setMessage(err instanceof Error ? err.message : "Save failed"),
    });
    // Run
    const runMut = useMutation({
        mutationFn: () => apiFetch(`/api/pipelines/${pipelineId}/run`, { method: "POST", body: "{}" }),
        onSuccess: (run) => navigate({ to: "/runs/$runId", params: { runId: run.id } }),
        onError: (err) => setMessage(err instanceof Error ? err.message : "Run failed"),
    });
    const status = pipelineQ.data?.status || "draft";
    const actions = (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(StatusBadge, { status: status }), _jsx("button", { type: "button", className: "rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]", onClick: () => runMut.mutate(), children: "\u25B7 Test Run" }), _jsx("button", { type: "button", className: "rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]", onClick: () => saveMut.mutate(), children: "Save Pipeline" })] }));
    return (_jsxs(AppShell, { title: name || "Pipeline Editor", subtitle: description || "Configure your pipeline steps and variables", actions: actions, children: [pipelineQ.isLoading ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "Loading pipeline..." }) : null, pipelineQ.isError ? (_jsx("p", { className: "text-sm text-red-300", children: pipelineQ.error instanceof Error ? pipelineQ.error.message : "Failed to load" })) : null, message ? (_jsx("p", { className: "mb-2 text-sm text-[var(--text-secondary)]", children: message })) : null, _jsxs("div", { className: "flex gap-6", children: [_jsxs("div", { className: "flex w-[360px] shrink-0 flex-col gap-5", children: [_jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Pipeline Config" }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Name" }), _jsx("input", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Description" }), _jsx("input", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", value: description, onChange: (e) => setDescription(e.target.value) })] })] }), _jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Variables" }), _jsx("button", { type: "button", onClick: addVar, className: "text-xs font-medium text-[var(--accent)]", children: "+ Add" })] }), _jsxs("div", { className: "flex flex-col gap-2", children: [variables.map((v, i) => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: v.key, onChange: (e) => updateVar(i, "key", e.target.value), placeholder: "key" }), _jsx("input", { className: "flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: v.value, onChange: (e) => updateVar(i, "value", e.target.value), placeholder: "value" }), _jsx("button", { type: "button", onClick: () => removeVar(i), className: "shrink-0 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400", title: "Remove variable", children: "\u00D7" })] }, i))), variables.length === 0 ? (_jsx("p", { className: "text-xs text-[var(--text-muted)]", children: "No variables defined." })) : null] })] }), _jsxs("div", { className: "flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] font-semibold", children: "Raw JSON" }), _jsx("button", { type: "button", onClick: () => setJsonMode(!jsonMode), className: `rounded-[6px] px-2.5 py-1 text-[11px] font-semibold ${jsonMode ? "bg-[var(--accent)] text-[var(--bg-primary)]" : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"}`, children: jsonMode ? "Editing JSON" : "View only" })] }), _jsx("textarea", { className: "min-h-[180px] w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: jsonMode ? rawJson : JSON.stringify(buildDefinition(), null, 2), onChange: (e) => jsonMode && setRawJson(e.target.value), readOnly: !jsonMode })] })] }), _jsxs("div", { className: "flex flex-1 flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("h2", { className: "text-[15px] font-semibold", children: ["Steps (", steps.length, ")"] }), _jsx("button", { type: "button", onClick: addStep, className: "flex items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)]", children: "+ Add Step" })] }), steps.map((step, idx) => {
                                const isExpanded = expandedStep === idx;
                                return (_jsxs("div", { className: `rounded-[10px] border bg-[var(--bg-surface)] transition-colors ${isExpanded ? "border-[var(--accent)]" : "border-[var(--divider)]"}`, children: [_jsxs("button", { type: "button", className: "flex w-full items-center justify-between px-5 py-4", onClick: () => setExpandedStep(isExpanded ? -1 : idx), children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: `grid size-6 place-items-center rounded-[6px] text-[11px] font-bold ${isExpanded ? "bg-[var(--accent)] text-[var(--bg-primary)]" : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"}`, style: { fontFamily: "var(--font-mono)" }, children: idx + 1 }), _jsx("span", { className: `text-sm ${isExpanded ? "font-semibold" : "font-medium"}`, children: step.name || `Step ${idx + 1}` })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "rounded-full bg-[var(--bg-inset)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: step.model }), _jsx("span", { className: "text-[var(--text-muted)]", children: isExpanded ? "▲" : "▼" })] })] }), isExpanded ? (_jsx("div", { className: "border-t border-[var(--divider)] px-5 pb-5 pt-4", children: _jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Step Name" }), _jsx("input", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", value: step.name, onChange: (e) => updateStep(idx, { name: e.target.value }) })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Model" }), _jsxs("select", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: step.model, onChange: (e) => updateStep(idx, { model: e.target.value }), children: [_jsx("option", { value: "gpt-4o-mini", children: "gpt-4o-mini" }), _jsx("option", { value: "gpt-4o", children: "gpt-4o" }), _jsx("option", { value: "gpt-4-turbo", children: "gpt-4-turbo" }), _jsx("option", { value: "claude-3-5-sonnet-20241022", children: "claude-3.5-sonnet" }), _jsx("option", { value: "claude-3-haiku-20240307", children: "claude-3-haiku" }), _jsx("option", { value: "mistral-large-latest", children: "mistral-large" })] })] })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Prompt" }), _jsx("textarea", { className: "min-h-[100px] w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] leading-relaxed focus:border-[var(--accent)] focus:outline-none", value: step.prompt, onChange: (e) => updateStep(idx, { prompt: e.target.value }), placeholder: "Enter the prompt for this step..." })] }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Output Format" }), _jsxs("select", { className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: step.outputFormat || "text", onChange: (e) => updateStep(idx, { outputFormat: e.target.value }), children: [_jsx("option", { value: "text", children: "text" }), _jsx("option", { value: "json", children: "json" }), _jsx("option", { value: "markdown", children: "markdown" })] })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Timeout (s)" }), _jsx("input", { type: "number", className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: step.timeout ?? 30, onChange: (e) => updateStep(idx, { timeout: Number(e.target.value) }), min: 1, max: 300 })] }), _jsxs("label", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Retries" }), _jsx("input", { type: "number", className: "w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none", style: { fontFamily: "var(--font-mono)" }, value: step.retries ?? 2, onChange: (e) => updateStep(idx, { retries: Number(e.target.value) }), min: 0, max: 10 })] })] }), _jsxs("div", { className: "flex items-center justify-between border-t border-[var(--divider)] pt-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => moveStep(idx, -1), disabled: idx === 0, className: "rounded-[6px] border border-[var(--divider)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-30", title: "Move up", children: "\u2191" }), _jsx("button", { type: "button", onClick: () => moveStep(idx, 1), disabled: idx === steps.length - 1, className: "rounded-[6px] border border-[var(--divider)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-30", title: "Move down", children: "\u2193" })] }), _jsx("button", { type: "button", onClick: () => removeStep(idx), className: "rounded-[6px] border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10", children: "Remove step" })] })] }) })) : null] }, step.id));
                            }), steps.length === 0 ? (_jsxs("div", { className: "rounded-[10px] border border-dashed border-[var(--divider)] p-8 text-center", children: [_jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "No steps yet." }), _jsx("button", { type: "button", onClick: addStep, className: "mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]", children: "Add your first step" })] })) : null] })] })] }));
}
function StatusBadge({ status }) {
    const isActive = status === "active" || status === "running";
    const bg = isActive ? "#22C55E20" : "#EAB30820";
    const fg = isActive ? "#22C55E" : "#EAB308";
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", style: { background: bg, color: fg, fontFamily: "var(--font-mono)" }, children: [_jsx("span", { className: "inline-block size-1.5 rounded-full", style: { background: fg } }), status.charAt(0).toUpperCase() + status.slice(1)] }));
}
//# sourceMappingURL=pipeline-editor.js.map