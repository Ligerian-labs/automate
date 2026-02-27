import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import YAML from "yaml";
import { AppShell } from "../components/app-shell";
import {
  ApiError,
  type PipelineRecord,
  type RunRecord,
  type SecretRecord,
  apiFetch,
} from "../lib/api";

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

interface DefinitionStep {
  id?: string;
  name?: string;
  type?: string;
  model?: string;
  prompt?: string;
  outputFormat?: string;
  output_format?: string;
  timeout?: number;
  timeout_seconds?: number;
  retries?: number;
  retry?: {
    max_attempts?: number;
    backoff_ms?: number;
  };
}

interface ModelOption {
  id: string;
  name: string;
}

function getPromptTemplateWarning(
  prompt: string,
  stepIds: string[],
): string | null {
  const openCount = (prompt.match(/\{\{/g) || []).length;
  const closeCount = (prompt.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    return "Unbalanced Handlebars braces. Check {{ and }}.";
  }

  const refs = [
    ...prompt.matchAll(/\{\{\s*steps\.([a-zA-Z0-9_]+)\.output\s*\}\}/g),
  ];
  for (const ref of refs) {
    const key = ref[1] || "";
    if (!key) continue;
    const isNumeric = /^\d+$/.test(key);
    if (!isNumeric && !stepIds.includes(key)) {
      return `Unknown step reference "${key}". Use an existing step id or a numeric alias.`;
    }
  }

  return null;
}

function newStep(index: number): StepDef {
  return {
    id: `step_${index}`,
    name: `Step ${index}`,
    type: "llm",
    model: "gpt-5.2",
    prompt: "",
    outputFormat: "text",
    timeout: 30,
    retries: 2,
  };
}

export function PipelineEditorPage() {
  const { pipelineId } = useParams({ strict: false }) as { pipelineId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const pipelineQ = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => apiFetch<PipelineRecord>(`/api/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const modelsQ = useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<ModelOption[]>("/api/models", undefined, false),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDef[]>([]);
  const [variables, setVariables] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [expandedStep, setExpandedStep] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pipelineSecretName, setPipelineSecretName] = useState("");
  const [pipelineSecretValue, setPipelineSecretValue] = useState("");
  const [pipelineSecretUpdateName, setPipelineSecretUpdateName] = useState<
    string | null
  >(null);
  const [pipelineSecretUpdateValue, setPipelineSecretUpdateValue] =
    useState("");
  const [pipelineSecretError, setPipelineSecretError] = useState<string | null>(
    null,
  );
  const [pipelineSecretSuccess, setPipelineSecretSuccess] = useState<
    string | null
  >(null);
  const [yamlMode, setYamlMode] = useState(false);
  const [rawYaml, setRawYaml] = useState("");
  const [selectedPrevStepToken, setSelectedPrevStepToken] = useState<
    Record<number, string>
  >({});
  const promptRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  const modelOptions = (() => {
    const fromApi = (modelsQ.data ?? []).map((model) => ({
      id: model.id,
      label: `${model.name} (${model.id})`,
    }));
    const fromSteps = steps
      .map((step) => step.model)
      .filter(Boolean)
      .map((id) => ({ id, label: id }));
    const merged = [...fromApi, ...fromSteps];
    return merged.filter(
      (item, index) => merged.findIndex((x) => x.id === item.id) === index,
    );
  })();

  const pipelineSecretsQ = useQuery({
    queryKey: ["pipeline-secrets", pipelineId],
    queryFn: () =>
      apiFetch<SecretRecord[]>(`/api/pipelines/${pipelineId}/secrets`),
    enabled: Boolean(pipelineId),
  });

  // Load pipeline data
  useEffect(() => {
    if (!pipelineQ.data) return;
    const p = pipelineQ.data;
    setName(p.name);
    setDescription(p.description || "");
    const def = (p.definition ?? {}) as {
      steps?: DefinitionStep[];
      variables?: Record<string, string>;
    };
    setSteps(
      (def.steps ?? []).map((s, i) => ({
        id: s.id || `step_${i + 1}`,
        name: s.name || `Step ${i + 1}`,
        type: s.type || "llm",
        model: s.model || "gpt-5.2",
        prompt: s.prompt || "",
        outputFormat: s.output_format || s.outputFormat || "text",
        timeout: s.timeout_seconds ?? s.timeout ?? 30,
        retries: s.retry?.max_attempts ?? s.retries ?? 2,
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
        output_format: s.outputFormat,
        timeout_seconds: s.timeout,
        retry: {
          max_attempts: s.retries ?? 1,
          backoff_ms: 1000,
        },
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

  const insertPromptToken = (idx: number, token: string) => {
    const target = promptRefs.current[idx];
    if (!target) {
      const current = steps[idx]?.prompt || "";
      updateStep(idx, { prompt: `${current}${current ? " " : ""}${token}` });
      return;
    }
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const next = target.value.slice(0, start) + token + target.value.slice(end);
    updateStep(idx, { prompt: next });

    requestAnimationFrame(() => {
      const node = promptRefs.current[idx];
      if (!node) return;
      const pos = start + token.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
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

  const createPipelineSecretMut = useMutation({
    mutationFn: (payload: { name: string; value: string }) =>
      apiFetch<SecretRecord>(`/api/pipelines/${pipelineId}/secrets`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setPipelineSecretName("");
      setPipelineSecretValue("");
      setPipelineSecretError(null);
      setPipelineSecretSuccess("Pipeline secret saved");
      queryClient.invalidateQueries({
        queryKey: ["pipeline-secrets", pipelineId],
      });
    },
    onError: (err) => {
      setPipelineSecretSuccess(null);
      setPipelineSecretError(
        err instanceof ApiError ? err.message : "Failed to create secret",
      );
    },
  });

  const updatePipelineSecretMut = useMutation({
    mutationFn: (payload: { name: string; value: string }) =>
      apiFetch<SecretRecord>(
        `/api/pipelines/${pipelineId}/secrets/${encodeURIComponent(payload.name)}`,
        {
          method: "PUT",
          body: JSON.stringify({ value: payload.value }),
        },
      ),
    onSuccess: (_, payload) => {
      setPipelineSecretUpdateName(null);
      setPipelineSecretUpdateValue("");
      setPipelineSecretError(null);
      setPipelineSecretSuccess(`Secret "${payload.name}" updated`);
      queryClient.invalidateQueries({
        queryKey: ["pipeline-secrets", pipelineId],
      });
    },
    onError: (err) => {
      setPipelineSecretSuccess(null);
      setPipelineSecretError(
        err instanceof ApiError ? err.message : "Failed to update secret",
      );
    },
  });

  const deletePipelineSecretMut = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ deleted: boolean }>(
        `/api/pipelines/${pipelineId}/secrets/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setPipelineSecretError(null);
      setPipelineSecretSuccess("Secret removed");
      queryClient.invalidateQueries({
        queryKey: ["pipeline-secrets", pipelineId],
      });
    },
    onError: (err) => {
      setPipelineSecretSuccess(null);
      setPipelineSecretError(
        err instanceof ApiError ? err.message : "Failed to delete secret",
      );
    },
  });

  const submitPipelineSecret = () => {
    setPipelineSecretSuccess(null);
    const normalizedName = pipelineSecretName.trim().toUpperCase();
    if (!normalizedName || !pipelineSecretValue.trim()) {
      setPipelineSecretError("Name and value are required");
      return;
    }
    createPipelineSecretMut.mutate({
      name: normalizedName,
      value: pipelineSecretValue,
    });
  };

  const submitPipelineSecretUpdate = () => {
    if (!pipelineSecretUpdateName || !pipelineSecretUpdateValue.trim()) {
      setPipelineSecretError("New secret value is required");
      return;
    }
    setPipelineSecretSuccess(null);
    updatePipelineSecretMut.mutate({
      name: pipelineSecretUpdateName,
      value: pipelineSecretUpdateValue,
    });
  };

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

          {/* Pipeline secrets card */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Pipeline Secrets</h2>
              <button
                type="button"
                onClick={submitPipelineSecret}
                disabled={createPipelineSecretMut.isPending}
                className="text-xs font-medium text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createPipelineSecretMut.isPending ? "Saving..." : "+ Add"}
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Secrets apply only to this pipeline and override global secrets
              with the same name.
            </p>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs uppercase focus:border-[var(--accent)] focus:outline-none"
                style={{ fontFamily: "var(--font-mono)" }}
                value={pipelineSecretName}
                onChange={(e) => setPipelineSecretName(e.target.value)}
                placeholder="name"
              />
              <input
                type="password"
                className="flex-1 rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                style={{ fontFamily: "var(--font-mono)" }}
                value={pipelineSecretValue}
                onChange={(e) => setPipelineSecretValue(e.target.value)}
                placeholder="value"
              />
              <button
                type="button"
                onClick={submitPipelineSecret}
                disabled={createPipelineSecretMut.isPending}
                className="shrink-0 rounded-md px-2 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createPipelineSecretMut.isPending ? "..." : "+"}
              </button>
            </div>
            {pipelineSecretError ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {pipelineSecretError}
              </p>
            ) : null}
            {pipelineSecretSuccess ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {pipelineSecretSuccess}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              {pipelineSecretsQ.isLoading ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Loading pipeline secrets...
                </p>
              ) : null}
              {pipelineSecretsQ.data?.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No pipeline secrets yet.
                </p>
              ) : null}
              {pipelineSecretsQ.data?.map((secret) => (
                <div
                  key={secret.id}
                  className="flex items-center justify-between rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2"
                >
                  <div>
                    <p
                      className="text-xs font-medium uppercase"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {secret.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPipelineSecretError(null);
                        setPipelineSecretSuccess(null);
                        setPipelineSecretUpdateValue("");
                        setPipelineSecretUpdateName(secret.name);
                      }}
                      className="cursor-pointer rounded border border-[var(--divider)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                    >
                      Rotate
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deletePipelineSecretMut.mutate(secret.name)
                      }
                      disabled={deletePipelineSecretMut.isPending}
                      className="cursor-pointer rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {pipelineSecretUpdateName ? (
              <div className="rounded-[8px] border border-[var(--divider)] bg-[var(--bg-inset)] p-3">
                <p
                  className="mb-2 text-xs text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Rotate {pipelineSecretUpdateName}
                </p>
                <input
                  type="password"
                  className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-surface)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                  style={{ fontFamily: "var(--font-mono)" }}
                  value={pipelineSecretUpdateValue}
                  onChange={(e) => setPipelineSecretUpdateValue(e.target.value)}
                  placeholder="New value"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submitPipelineSecretUpdate}
                    disabled={updatePipelineSecretMut.isPending}
                    className="cursor-pointer rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updatePipelineSecretMut.isPending
                      ? "Updating..."
                      : "Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPipelineSecretUpdateName(null);
                      setPipelineSecretUpdateValue("");
                    }}
                    className="cursor-pointer rounded border border-[var(--divider)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
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
            const previousSteps = steps.slice(0, idx);
            const promptTemplateWarning = getPromptTemplateWarning(
              step.prompt,
              steps.map((s) => s.id),
            );
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
                            {modelOptions.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.label}
                              </option>
                            ))}
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
                          ref={(el) => {
                            promptRefs.current[idx] = el;
                          }}
                          onChange={(e) =>
                            updateStep(idx, { prompt: e.target.value })
                          }
                          placeholder="Enter the prompt for this step..."
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              insertPromptToken(idx, "{{input.topic}}")
                            }
                            className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                          >
                            + input.topic
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertPromptToken(idx, "{{vars.language}}")
                            }
                            className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                          >
                            + vars.language
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertPromptToken(idx, "{{env.OPENAI_API_KEY}}")
                            }
                            className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                          >
                            + env.OPENAI_API_KEY
                          </button>
                          {previousSteps.length > 0 && previousSteps.length <= 4
                            ? previousSteps.map((prevStep, prevIdx) => (
                                <button
                                  key={`${prevStep.id}-token`}
                                  type="button"
                                  onClick={() =>
                                    insertPromptToken(
                                      idx,
                                      `{{steps.${prevStep.id}.output}}`,
                                    )
                                  }
                                  className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                                  title={`Also available: {{steps.${prevIdx + 1}.output}}`}
                                >
                                  + steps.{prevStep.id}.output
                                </button>
                              ))
                            : null}
                          {previousSteps.length > 4 ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                                style={{ fontFamily: "var(--font-mono)" }}
                                value={selectedPrevStepToken[idx] || ""}
                                onChange={(e) =>
                                  setSelectedPrevStepToken((prev) => ({
                                    ...prev,
                                    [idx]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Select step output...</option>
                                {previousSteps.map((prevStep, prevIdx) => (
                                  <option
                                    key={`${prevStep.id}-token-option`}
                                    value={`{{steps.${prevStep.id}.output}}`}
                                  >
                                    {`${prevIdx + 1}. ${prevStep.name || prevStep.id} (${prevStep.id})`}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!selectedPrevStepToken[idx]}
                                onClick={() =>
                                  selectedPrevStepToken[idx] &&
                                  insertPromptToken(
                                    idx,
                                    selectedPrevStepToken[idx],
                                  )
                                }
                                className="rounded border border-[var(--divider)] bg-[var(--bg-inset)] px-2 py-1 text-[11px] text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                + Insert step output
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Supports: <code>{"{{input.field}}"}</code>,{" "}
                          <code>{"{{vars.name}}"}</code>,{" "}
                          <code>{"{{steps.step_1.output}}"}</code>,{" "}
                          <code>{"{{steps.1.output}}"}</code>,{" "}
                          <code>{"{{env.OPENAI_API_KEY}}"}</code>.
                        </p>
                        {promptTemplateWarning ? (
                          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                            {promptTemplateWarning}
                          </p>
                        ) : null}
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
