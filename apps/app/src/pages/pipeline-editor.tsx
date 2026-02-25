import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import YAML from "yaml";
import { AppShell } from "../components/app-shell";
import { type PipelineRecord, type RunRecord, apiFetch } from "../lib/api";

interface StepDef {
  id: string;
  name: string;
  type: string;
  model: string;
  prompt: string;
  outputFormat?: string;
  timeout?: number;
  retries?: number;
}

function newStep(index: number): StepDef {
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
  const { pipelineId } = useParams({ strict: false }) as { pipelineId: string };
  const navigate = useNavigate();

  const pipelineQ = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDef[]>([]);
  const [variables, setVariables] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [expandedStep, setExpandedStep] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [yamlMode, setYamlMode] = useState(false);
  const [rawYaml, setRawYaml] = useState("");

  // Load pipeline data
  useEffect(() => {
    if (!pipelineQ.data) return;
    const p = pipelineQ.data;
    setName(p.name);
    setDescription(p.description || "");
    const def = (p.definition ?? {}) as {
      steps?: StepDef[];
      variables?: Record<string, string>;
    };
    setSteps(
      (def.steps ?? []).map((s, i) => ({
        id: s.id || `step_${i + 1}`,
        name: s.name || `Step ${i + 1}`,
        type: s.type || "llm",
        model: s.model || "gpt-4o-mini",
        prompt: s.prompt || "",
        outputFormat: s.outputFormat || "text",
        timeout: s.timeout ?? 30,
        retries: s.retries ?? 2,
      })),
    );
    const vars = def.variables ?? {};
    setVariables(
      Object.entries(vars).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    );
    setRawYaml(YAML.stringify(p.definition ?? {}));
  }, [pipelineQ.data]);

  // Build definition from structured state
  const buildDefinition = useCallback(() => {
    if (yamlMode) {
      try {
        return YAML.parse(rawYaml);
      } catch {
        return {};
      }
    }
    const vars: Record<string, string> = {};
    for (const v of variables) {
      if (v.key) vars[v.key] = v.value;
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
  }, [yamlMode, rawYaml, name, steps, variables, pipelineQ.data]);

  // Sync rawYaml when switching to YAML mode
  useEffect(() => {
    if (yamlMode) setRawYaml(YAML.stringify(buildDefinition()));
    // eslint-disable-next-line
  }, [yamlMode, buildDefinition]);

  // Step mutations
  const updateStep = (idx: number, patch: Partial<StepDef>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    if (expandedStep >= idx && expandedStep > 0)
      setExpandedStep(expandedStep - 1);
  };

  const addStep = () => {
    const next = steps.length + 1;
    setSteps((prev) => [...prev, newStep(next)]);
    setExpandedStep(steps.length);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
    setExpandedStep(target);
  };

  // Variable mutations
  const updateVar = (idx: number, field: "key" | "value", val: string) => {
    setVariables((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [field]: val } : v)),
    );
  };
  const removeVar = (idx: number) =>
    setVariables((prev) => prev.filter((_, i) => i !== idx));
  const addVar = () =>
    setVariables((prev) => [...prev, { key: "", value: "" }]);

  // Save
  const saveMut = useMutation({
    mutationFn: async () => {
      const definition = buildDefinition();
      return apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, definition }),
      });
    },
    onSuccess: () => setMessage("Pipeline saved ✓"),
    onError: (err) =>
      setMessage(err instanceof Error ? err.message : "Save failed"),
  });

  // Run
  const runMut = useMutation({
    mutationFn: () =>
      apiFetch<RunRecord>(`/api/pipelines/${pipelineId}/run`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (run) =>
      navigate({ to: "/runs/$runId", params: { runId: run.id } }),
    onError: (err) =>
      setMessage(err instanceof Error ? err.message : "Run failed"),
  });

  const status = pipelineQ.data?.status || "draft";

  const actions = (
    <div className="flex items-center gap-3">
      <StatusBadge status={status} />
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
    </div>
  );

  return (
    <AppShell
      title={name || "Pipeline Editor"}
      subtitle={description || "Configure your pipeline steps and variables"}
      actions={actions}
    >
      {pipelineQ.isLoading ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          Loading pipeline...
        </p>
      ) : null}
      {pipelineQ.isError ? (
        <p className="text-sm text-red-300">
          {pipelineQ.error instanceof Error
            ? pipelineQ.error.message
            : "Failed to load"}
        </p>
      ) : null}
      {message ? (
        <p className="mb-2 text-sm text-[var(--text-secondary)]">{message}</p>
      ) : null}

      <div className="flex gap-6">
        {/* Left panel — 360px */}
        <div className="flex w-[360px] shrink-0 flex-col gap-5">
          {/* Config card */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <h2 className="text-[15px] font-semibold">Pipeline Config</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Name
              </span>
              <input
                className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Description
              </span>
              <input
                className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          {/* Variables card */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Variables</h2>
              <button
                type="button"
                onClick={addVar}
                className="text-xs font-medium text-[var(--accent)]"
              >
                + Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {variables.map((v, i) => (
                <div
                  key={`var-${v.key || i}`}
                  className="flex items-center gap-2"
                >
                  <input
                    className="flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                    style={{ fontFamily: "var(--font-mono)" }}
                    value={v.key}
                    onChange={(e) => updateVar(i, "key", e.target.value)}
                    placeholder="key"
                  />
                  <input
                    className="flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                    style={{ fontFamily: "var(--font-mono)" }}
                    value={v.value}
                    onChange={(e) => updateVar(i, "value", e.target.value)}
                    placeholder="value"
                  />
                  <button
                    type="button"
                    onClick={() => removeVar(i)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                    title="Remove variable"
                  >
                    ×
                  </button>
                </div>
              ))}
              {variables.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No variables defined.
                </p>
              ) : null}
            </div>
          </div>

          {/* YAML editor */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">YAML</h2>
              <button
                type="button"
                onClick={() => setYamlMode(!yamlMode)}
                className={`rounded-[6px] px-2.5 py-1 text-[11px] font-semibold ${
                  yamlMode
                    ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                    : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                }`}
              >
                {yamlMode ? "Editing YAML" : "View only"}
              </button>
            </div>
            <textarea
              className="min-h-[180px] w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              style={{ fontFamily: "var(--font-mono)" }}
              value={yamlMode ? rawYaml : YAML.stringify(buildDefinition())}
              onChange={(e) => yamlMode && setRawYaml(e.target.value)}
              readOnly={!yamlMode}
            />
          </div>
        </div>

        {/* Right panel — Steps */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              Steps ({steps.length})
            </h2>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)]"
            >
              + Add Step
            </button>
          </div>

          {steps.map((step, idx) => {
            const isExpanded = expandedStep === idx;
            return (
              <div
                key={step.id}
                className={`rounded-[10px] border bg-[var(--bg-surface)] transition-colors ${
                  isExpanded
                    ? "border-[var(--accent)]"
                    : "border-[var(--divider)]"
                }`}
              >
                {/* Step header — always visible */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4"
                  onClick={() => setExpandedStep(isExpanded ? -1 : idx)}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`grid size-6 place-items-center rounded-[6px] text-[11px] font-bold ${
                        isExpanded
                          ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                          : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
                      }`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={`text-sm ${isExpanded ? "font-semibold" : "font-medium"}`}
                    >
                      {step.name || `Step ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full bg-[var(--bg-inset)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {step.model}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {/* Expanded edit form */}
                {isExpanded ? (
                  <div className="border-t border-[var(--divider)] px-5 pb-5 pt-4">
                    <div className="flex flex-col gap-4">
                      {/* Name + Model row */}
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            Step Name
                          </span>
                          <input
                            className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                            value={step.name}
                            onChange={(e) =>
                              updateStep(idx, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            Model
                          </span>
                          <select
                            className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                            style={{ fontFamily: "var(--font-mono)" }}
                            value={step.model}
                            onChange={(e) =>
                              updateStep(idx, { model: e.target.value })
                            }
                          >
                            <option value="gpt-4o-mini">gpt-4o-mini</option>
                            <option value="gpt-4o">gpt-4o</option>
                            <option value="gpt-4-turbo">gpt-4-turbo</option>
                            <option value="claude-3-5-sonnet-20241022">
                              claude-3.5-sonnet
                            </option>
                            <option value="claude-3-haiku-20240307">
                              claude-3-haiku
                            </option>
                            <option value="mistral-large-latest">
                              mistral-large
                            </option>
                          </select>
                        </label>
                      </div>

                      {/* Prompt */}
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          Prompt
                        </span>
                        <textarea
                          className="min-h-[100px] w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                          value={step.prompt}
                          onChange={(e) =>
                            updateStep(idx, { prompt: e.target.value })
                          }
                          placeholder="Enter the prompt for this step..."
                        />
                      </label>

                      {/* Config row — Output Format, Timeout, Retries */}
                      <div className="grid grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            Output Format
                          </span>
                          <select
                            className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                            style={{ fontFamily: "var(--font-mono)" }}
                            value={step.outputFormat || "text"}
                            onChange={(e) =>
                              updateStep(idx, { outputFormat: e.target.value })
                            }
                          >
                            <option value="text">text</option>
                            <option value="json">json</option>
                            <option value="markdown">markdown</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            Timeout (s)
                          </span>
                          <input
                            type="number"
                            className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                            style={{ fontFamily: "var(--font-mono)" }}
                            value={step.timeout ?? 30}
                            onChange={(e) =>
                              updateStep(idx, {
                                timeout: Number(e.target.value),
                              })
                            }
                            min={1}
                            max={300}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            Retries
                          </span>
                          <input
                            type="number"
                            className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                            style={{ fontFamily: "var(--font-mono)" }}
                            value={step.retries ?? 2}
                            onChange={(e) =>
                              updateStep(idx, {
                                retries: Number(e.target.value),
                              })
                            }
                            min={0}
                            max={10}
                          />
                        </label>
                      </div>

                      {/* Step actions */}
                      <div className="flex items-center justify-between border-t border-[var(--divider)] pt-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="rounded-[6px] border border-[var(--divider)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-30"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            className="rounded-[6px] border border-[var(--divider)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-30"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStep(idx)}
                          className="rounded-[6px] border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
                        >
                          Remove step
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {steps.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[var(--divider)] p-8 text-center">
              <p className="text-sm text-[var(--text-tertiary)]">
                No steps yet.
              </p>
              <button
                type="button"
                onClick={addStep}
                className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
              >
                Add your first step
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active" || status === "running";
  const bg = isActive ? "#22C55E20" : "#EAB30820";
  const fg = isActive ? "#22C55E" : "#EAB308";
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
