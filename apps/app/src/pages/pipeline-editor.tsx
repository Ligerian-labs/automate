import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { apiFetch, type PipelineRecord, type RunRecord } from "../lib/api";

interface StepDef {
  id?: string;
  name?: string;
  model?: string;
  prompt?: string;
  outputFormat?: string;
  timeout?: number;
  retries?: number;
}

export function PipelineEditorPage() {
  const { pipelineId } = useParams({ strict: false }) as { pipelineId: string };
  const navigate = useNavigate();

  const pipelineQ = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definitionText, setDefinitionText] = useState("{}");
  const [message, setMessage] = useState<string | null>(null);

  const steps: StepDef[] = (() => {
    try {
      const parsed = JSON.parse(definitionText) as { steps?: StepDef[] };
      return parsed.steps ?? [];
    } catch {
      return [];
    }
  })();

  const [expandedStep, setExpandedStep] = useState<number>(0);

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
      return apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, definition: parsed }),
      });
    },
    onSuccess: () => setMessage("Pipeline saved"),
    onError: (err) => setMessage(err instanceof Error ? err.message : "Save failed"),
  });

  const runMut = useMutation({
    mutationFn: () => apiFetch<RunRecord>(`/api/pipelines/${pipelineId}/run`, { method: "POST", body: "{}" }),
    onSuccess: (run) => navigate({ to: "/runs/$runId", params: { runId: run.id } }),
    onError: (err) => setMessage(err instanceof Error ? err.message : "Run failed"),
  });

  const status = pipelineQ.data?.status || "draft";

  const actions = (
    <>
      <button
        type="button"
        className="rounded-lg border border-[var(--text-muted)] px-[18px] py-2.5 text-sm font-medium text-[var(--text-secondary)]"
        onClick={() => runMut.mutate()}
      >
        ▷ Test Run
      </button>
      <button
        type="button"
        className="rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]"
        onClick={() => saveMut.mutate()}
      >
        Save Pipeline
      </button>
    </>
  );

  return (
    <AppShell
      title={name || "Pipeline Editor"}
      subtitle={description || "Configure your pipeline steps and variables"}
      actions={
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {actions}
        </div>
      }
    >
      {pipelineQ.isLoading ? <p className="text-sm text-[var(--text-tertiary)]">Loading pipeline...</p> : null}
      {pipelineQ.isError ? (
        <p className="text-sm text-red-300">{pipelineQ.error instanceof Error ? pipelineQ.error.message : "Failed to load"}</p>
      ) : null}
      {message ? <p className="mb-4 text-sm text-[var(--text-secondary)]">{message}</p> : null}

      <div className="flex gap-6">
        {/* Left panel — 360px per design */}
        <div className="flex w-[360px] shrink-0 flex-col gap-5">
          {/* Config card */}
          <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Pipeline Config</h2>
            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Name</label>
              <input
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
              <input
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Variables card */}
          <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Variables</h2>
              <button type="button" className="text-xs text-[var(--accent)]">+ Add</button>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                  api_key
                </div>
                <div className="flex-1 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                  sk-***
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                  language
                </div>
                <div className="flex-1 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                  fr
                </div>
              </div>
            </div>
          </div>

          {/* Raw JSON editor */}
          <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Definition (JSON)</h2>
            <textarea
              className="min-h-[200px] w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3 font-mono text-xs leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              value={definitionText}
              onChange={(e) => setDefinitionText(e.target.value)}
            />
          </div>
        </div>

        {/* Right panel — Steps */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Steps ({steps.length})</h2>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)]"
            >
              + Add Step
            </button>
          </div>

          {steps.map((step, idx) => {
            const isExpanded = expandedStep === idx;
            return (
              <div
                key={step.id || idx}
                className={`rounded-xl border bg-[var(--bg-surface)] p-5 transition-colors ${
                  isExpanded ? "border-[var(--accent)]" : "border-[var(--divider)]"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between"
                  onClick={() => setExpandedStep(isExpanded ? -1 : idx)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`grid size-6 place-items-center rounded-md text-[11px] font-bold ${
                      isExpanded ? "bg-[var(--accent)] text-[var(--bg-primary)]" : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                    }`}>
                      {idx + 1}
                    </div>
                    <span className={`text-sm ${isExpanded ? "font-semibold" : "font-medium"}`}>
                      {step.name || step.id || `Step ${idx + 1}`}
                    </span>
                  </div>
                  <span className="rounded-md bg-[var(--bg-inset)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                    {step.model || "gpt-4o-mini"}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="mt-4 space-y-4">
                    {/* Prompt */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">Prompt</label>
                      <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {step.prompt || "No prompt defined"}
                      </div>
                    </div>

                    {/* Config row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-secondary)]">Output Format</label>
                        <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                          {step.outputFormat || "text"}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-secondary)]">Timeout</label>
                        <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                          {step.timeout ?? 30}s
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-[var(--text-secondary)]">Retries</label>
                        <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                          {step.retries ?? 2}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {steps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--divider)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              No steps yet. Add steps to your pipeline definition.
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active" || status === "running";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      isActive ? "bg-[#22C55E20] text-emerald-400" : "bg-[#EAB30820] text-amber-400"
    }`}>
      <span className={`inline-block size-1.5 rounded-full ${isActive ? "bg-emerald-400" : "bg-amber-400"}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
