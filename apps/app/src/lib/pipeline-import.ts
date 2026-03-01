import YAML from "yaml";

export function parsePipelineText(raw: string): {
  definition?: Record<string, unknown>;
  error?: string;
} {
  if (!raw.trim()) return { error: "Provide YAML or JSON content." };

  try {
    const parsed = YAML.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Pipeline definition must be an object at the top level." };
    }
    return { definition: parsed as Record<string, unknown> };
  } catch {
    return { error: "Invalid YAML/JSON format." };
  }
}

export function extractPipelineMeta(definition: Record<string, unknown>): {
  name: string;
  description: string;
} {
  const name =
    typeof definition.name === "string" && definition.name.trim().length > 0
      ? definition.name.trim()
      : "Imported pipeline";
  const description =
    typeof definition.description === "string" ? definition.description : "";
  return { name, description };
}

export function withPipelineMeta(
  definition: Record<string, unknown>,
  name: string,
  description: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...definition, name };
  if (description.trim()) {
    next.description = description;
  } else {
    next.description = undefined;
  }
  return next;
}

export function formatValidationErrors(
  errors: unknown,
  code?: string,
  details?: unknown,
): string[] {
  const out: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) out.push(value.trim());
  };

  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        walk(nested);
      }
    }
  };

  walk(errors);
  if (code) push(`Validation code: ${code}`);
  if (details && typeof details === "object") {
    const missingProviders = (details as { missing_providers?: unknown })
      .missing_providers;
    if (Array.isArray(missingProviders) && missingProviders.length > 0) {
      push(`Missing provider keys: ${missingProviders.join(", ")}`);
    }
  }

  return out.length > 0 ? out : ["Pipeline definition is invalid."];
}
