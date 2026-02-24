import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch, type PipelineRecord, type RunRecord } from "../lib/api";

export function PipelineEditorPage() {
  const { pipelineId } = useParams({ strict: false }) as { pipelineId: string };
  const navigate = useNavigate();

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definitionText, setDefinitionText] = useState("{}");
  const [message, setMessage] = useState<string | null>(null);
  const steps = (() => {
    try {
      const parsed = JSON.parse(definitionText) as { steps?: Array<{ id?: string; name?: string; model?: string; prompt?: string }> };
      return parsed.steps ?? [];
    } catch {
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
      return apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`, {
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
      return apiFetch<{ valid: boolean; errors?: unknown }>("/api/pipelines/validate", {
        method: "POST",
        body: JSON.stringify({ name, description, definition: parsed }),
      });
    },
    onSuccess: (res) => setMessage(res.valid ? "Definition is valid" : "Definition has validation errors"),
    onError: (err) => setMessage(err instanceof Error ? err.message : "Validation failed"),
  });

  const runMutation = useMutation({
    mutationFn: () => apiFetch<RunRecord>(`/api/pipelines/${pipelineId}/run`, { method: "POST", body: "{}" }),
    onSuccess: (run) => {
      navigate({ to: "/runs/$runId", params: { runId: run.id } });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Run failed"),
  });

  return (
    <AppShell title={name || "Pipeline Editor"} subtitle={description || "Update your pipeline definition, validate, and run"}>
      {pipelineQuery.isLoading ? <p className="text-sm text-[var(--text-tertiary)]">Loading pipeline...</p> : null}
      {pipelineQuery.isError ? (
        <p className="text-sm text-red-300">{pipelineQuery.error instanceof Error ? pipelineQuery.error.message : "Failed to load pipeline"}</p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <article className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Pipeline Config</h2>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Name</span>
              <input className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Description</span>
              <input className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </article>

          <article className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Variables</h2>
            <p className="rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              Keep global variables in your definition JSON under `variables`.
            </p>
          </article>
        </div>

        <article className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300">v{pipelineQuery.data?.version ?? 1}</span>
              <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-300">active</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-md border border-[var(--divider)] px-3 py-2 text-sm" onClick={() => validateMutation.mutate()}>
                Validate
              </button>
              <button type="button" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--bg-primary)]" onClick={() => saveMutation.mutate()}>
                Save
              </button>
              <button type="button" className="rounded-md border border-[var(--divider)] px-3 py-2 text-sm" onClick={() => runMutation.mutate()}>
                Run now
              </button>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">Steps</p>
            <div className="space-y-2">
              {steps.slice(0, 4).map((step, idx) => (
                <div key={`${step.id || idx}`} className="flex items-center justify-between rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{step.name || step.id || `Step ${idx + 1}`}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{step.prompt?.slice(0, 80) || "No prompt"}</p>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">{step.model || "model n/a"}</span>
                </div>
              ))}
              {steps.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">No steps parsed from JSON.</p> : null}
            </div>
          </div>

          <label className="text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Definition (JSON)</span>
            <textarea
              className="min-h-[260px] w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] p-3 font-mono text-xs"
              value={definitionText}
              onChange={(e) => setDefinitionText(e.target.value)}
            />
          </label>

          {message ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{message}</p> : null}
        </article>
      </section>
    </AppShell>
  );
}
