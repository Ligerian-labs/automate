import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  type PipelineRecord,
  apiFetch,
} from "../lib/api";
import {
  extractPipelineMeta,
  formatValidationErrors,
  parsePipelineText,
  withPipelineMeta,
} from "../lib/pipeline-import";

type ValidateResponse = {
  valid: boolean;
  errors?: unknown;
  code?: string;
  details?: unknown;
};

export function ImportYamlModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (created: PipelineRecord) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<"file" | "paste">("file");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [definition, setDefinition] = useState<Record<string, unknown> | null>(
    null,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);

  const validateMut = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      definition: Record<string, unknown>;
    }) =>
      apiFetch<ValidateResponse>("/api/pipelines/validate", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });

  const createMut = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      definition: Record<string, unknown>;
    }) =>
      apiFetch<PipelineRecord>("/api/pipelines", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (created) => {
      onImported(created);
      handleClose();
    },
    onError: (error) => {
      setCreateError(
        error instanceof ApiError
          ? error.message
          : "Failed to create imported pipeline.",
      );
    },
  });

  useEffect(() => {
    if (open) return;
    setSource("file");
    setRawText("");
    setFileName(null);
    setDefinition(null);
    setName("");
    setDescription("");
    setParseError(null);
    setValidationErrors([]);
    setCreateError(null);
    setValidated(false);
  }, [open]);

  if (!open) return null;

  const stepCount = Array.isArray(definition?.steps) ? definition.steps.length : 0;

  async function runValidation(parsedDefinition: Record<string, unknown>) {
    const payload = {
      name: name.trim() || "Imported pipeline",
      description: description.trim() || undefined,
      definition: withPipelineMeta(
        parsedDefinition,
        name.trim() || "Imported pipeline",
        description,
      ),
    };
    const result = await validateMut.mutateAsync(payload);
    if (result.valid) {
      setValidated(true);
      setValidationErrors([]);
      return true;
    }
    setValidated(false);
    setValidationErrors(
      formatValidationErrors(result.errors, result.code, result.details),
    );
    return false;
  }

  async function previewAndValidate() {
    setCreateError(null);
    const parsed = parsePipelineText(rawText);
    if (parsed.error || !parsed.definition) {
      setParseError(parsed.error || "Invalid YAML/JSON content.");
      setDefinition(null);
      setValidationErrors([]);
      setValidated(false);
      return;
    }

    setParseError(null);
    setDefinition(parsed.definition);
    const meta = extractPipelineMeta(parsed.definition);
    setName(meta.name);
    setDescription(meta.description);

    const payload = {
      name: meta.name,
      description: meta.description || undefined,
      definition: withPipelineMeta(parsed.definition, meta.name, meta.description),
    };
    const result = await validateMut.mutateAsync(payload);
    if (result.valid) {
      setValidated(true);
      setValidationErrors([]);
      return;
    }
    setValidated(false);
    setValidationErrors(
      formatValidationErrors(result.errors, result.code, result.details),
    );
  }

  function handleClose() {
    onClose();
  }

  async function handleFilePick(file: File | null) {
    if (!file) return;
    const content = await file.text();
    setFileName(file.name);
    setRawText(content);
    setParseError(null);
    setCreateError(null);
    setValidationErrors([]);
    setValidated(false);
    setDefinition(null);
  }

  async function confirmImport() {
    if (!definition) return;
    const isValid = await runValidation(definition);
    if (!isValid) return;

    createMut.mutate({
      name: name.trim() || "Imported pipeline",
      description: description.trim() || undefined,
      definition: withPipelineMeta(
        definition,
        name.trim() || "Imported pipeline",
        description,
      ),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import YAML</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-inset)]"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setSource("file")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              source === "file"
                ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
            }`}
          >
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setSource("paste")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              source === "paste"
                ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                : "bg-[var(--bg-inset)] text-[var(--text-secondary)]"
            }`}
          >
            Paste text
          </button>
        </div>

        {source === "file" ? (
          <div className="mb-4 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".yaml,.yml,.json,text/yaml,application/x-yaml,application/json,text/plain"
              onChange={(event) =>
                handleFilePick(event.target.files?.[0] || null)
              }
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-[var(--text-muted)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                Choose file
              </button>
              <span className="text-xs text-[var(--text-tertiary)]">
                {fileName || "No file selected"}
              </span>
            </div>
          </div>
        ) : null}

        {source === "paste" ? (
          <textarea
            value={rawText}
            onChange={(event) => {
              setRawText(event.target.value);
              setParseError(null);
              setValidationErrors([]);
              setValidated(false);
              setDefinition(null);
            }}
            placeholder="Paste pipeline YAML or JSON here..."
            className="mb-4 min-h-[180px] w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3 text-xs focus:border-[var(--accent)] focus:outline-none"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        ) : null}

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={previewAndValidate}
            disabled={!rawText.trim() || validateMut.isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {validateMut.isPending ? "Validating..." : "Preview"}
          </button>
        </div>

        {parseError ? (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {parseError}
          </p>
        ) : null}

        {definition ? (
          <div className="mb-4 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-4">
            <p className="mb-3 text-xs text-[var(--text-tertiary)]">
              Preview: {stepCount} step{stepCount === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--text-secondary)]">Name</span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setValidated(false);
                  }}
                  className="rounded-md border border-[var(--divider)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--text-secondary)]">
                  Description
                </span>
                <input
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setValidated(false);
                  }}
                  className="rounded-md border border-[var(--divider)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => definition && runValidation(definition)}
                disabled={validateMut.isPending}
                className="rounded-md border border-[var(--text-muted)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {validateMut.isPending ? "Validating..." : "Revalidate"}
              </button>
            </div>
          </div>
        ) : null}

        {validationErrors.length > 0 ? (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {validationErrors.map((error) => (
              <p key={error}>• {error}</p>
            ))}
          </div>
        ) : null}

        {createError ? (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {createError}
          </p>
        ) : null}

        {validated && validationErrors.length === 0 ? (
          <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            YAML is valid and ready to import.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-[var(--text-muted)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmImport}
            disabled={!definition || !validated || createMut.isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMut.isPending ? "Importing..." : "Import pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
