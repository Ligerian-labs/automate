import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch } from "../lib/api";
export function PipelineEditorPage() {
    const { pipelineId } = useParams({ strict: false });
    const navigate = useNavigate();
    const pipelineQuery = useQuery({
        queryKey: ["pipeline", pipelineId],
        queryFn: () => apiFetch(`/api/pipelines/${pipelineId}`),
        enabled: Boolean(pipelineId),
    });
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [definitionText, setDefinitionText] = useState("{}");
    const [message, setMessage] = useState(null);
    const steps = (() => {
        try {
            const parsed = JSON.parse(definitionText);
            return parsed.steps ?? [];
        }
        catch {
            return [];
        }
    })();
    useEffect(() => {
        if (pipelineQuery.data) {
            setName(pipelineQuery.data.name);
            setDescription(pipelineQuery.data.description || "");
            setDefinitionText(JSON.stringify(pipelineQuery.data.definition ?? {}, null, 2));
        }
    }, [pipelineQuery.data]);
    const saveMutation = useMutation({
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
    const validateMutation = useMutation({
        mutationFn: async () => {
            const parsed = JSON.parse(definitionText);
            return apiFetch("/api/pipelines/validate", {
                method: "POST",
                body: JSON.stringify({ name, description, definition: parsed }),
            });
        },
        onSuccess: (res) => setMessage(res.valid ? "Definition is valid" : "Definition has validation errors"),
        onError: (err) => setMessage(err instanceof Error ? err.message : "Validation failed"),
    });
    const runMutation = useMutation({
        mutationFn: () => apiFetch(`/api/pipelines/${pipelineId}/run`, { method: "POST", body: "{}" }),
        onSuccess: (run) => {
            navigate({ to: "/runs/$runId", params: { runId: run.id } });
        },
        onError: (err) => setMessage(err instanceof Error ? err.message : "Run failed"),
    });
    return (_jsxs(AppShell, { title: name || "Pipeline Editor", subtitle: description || "Update your pipeline definition, validate, and run", children: [pipelineQuery.isLoading ? _jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: "Loading pipeline..." }) : null, pipelineQuery.isError ? (_jsx("p", { className: "text-sm text-red-300", children: pipelineQuery.error instanceof Error ? pipelineQuery.error.message : "Failed to load pipeline" })) : null, _jsxs("section", { className: "grid gap-4 lg:grid-cols-[320px_1fr]", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("article", { className: "rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4", children: [_jsx("h2", { className: "mb-3 text-sm font-semibold", children: "Pipeline Config" }), _jsxs("label", { className: "mb-3 block text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Name" }), _jsx("input", { className: "w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2", value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Description" }), _jsx("input", { className: "w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2", value: description, onChange: (e) => setDescription(e.target.value) })] })] }), _jsxs("article", { className: "rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4", children: [_jsx("h2", { className: "mb-3 text-sm font-semibold", children: "Variables" }), _jsx("p", { className: "rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]", children: "Keep global variables in your definition JSON under `variables`." })] })] }), _jsxs("article", { className: "rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("span", { className: "rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300", children: ["v", pipelineQuery.data?.version ?? 1] }), _jsx("span", { className: "rounded-full bg-cyan-500/20 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-300", children: "active" })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: "rounded-md border border-[var(--divider)] px-3 py-2 text-sm", onClick: () => validateMutation.mutate(), children: "Validate" }), _jsx("button", { type: "button", className: "rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--bg-primary)]", onClick: () => saveMutation.mutate(), children: "Save" }), _jsx("button", { type: "button", className: "rounded-md border border-[var(--divider)] px-3 py-2 text-sm", onClick: () => runMutation.mutate(), children: "Run now" })] })] }), _jsxs("div", { className: "mb-4 space-y-2", children: [_jsx("p", { className: "text-xs uppercase tracking-wider text-[var(--text-tertiary)]", children: "Steps" }), _jsxs("div", { className: "space-y-2", children: [steps.slice(0, 4).map((step, idx) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: step.name || step.id || `Step ${idx + 1}` }), _jsx("p", { className: "text-xs text-[var(--text-tertiary)]", children: step.prompt?.slice(0, 80) || "No prompt" })] }), _jsx("span", { className: "text-xs text-[var(--text-secondary)]", children: step.model || "model n/a" })] }, `${step.id || idx}`))), steps.length === 0 ? _jsx("p", { className: "text-xs text-[var(--text-tertiary)]", children: "No steps parsed from JSON." }) : null] })] }), _jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Definition (JSON)" }), _jsx("textarea", { className: "min-h-[260px] w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] p-3 font-mono text-xs", value: definitionText, onChange: (e) => setDefinitionText(e.target.value) })] }), message ? _jsx("p", { className: "mt-3 text-sm text-[var(--text-secondary)]", children: message }) : null] })] })] }));
}
//# sourceMappingURL=pipeline-editor.js.map