import type { PipelineDefinition } from "@stepiq/core";

interface ValidationIssue {
  field: string;
  message: string;
}

export interface InputSchemaValidationResult {
  valid: boolean;
  data: Record<string, unknown>;
  issues: ValidationIssue[];
}

function isInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

function matchesType(expected: string, value: unknown): boolean {
  if (value == null) return false;
  if (expected === "string") return typeof value === "string";
  if (expected === "boolean") return typeof value === "boolean";
  if (expected === "number") return typeof value === "number";
  if (expected === "integer") return isInteger(value);
  return false;
}

export function validateInputAgainstPipelineSchema(
  definition: PipelineDefinition,
  rawInput: Record<string, unknown>,
): InputSchemaValidationResult {
  const schema = definition.input?.schema || {};
  const data = { ...rawInput };
  const issues: ValidationIssue[] = [];

  for (const [name, variable] of Object.entries(schema)) {
    const hasValue = Object.prototype.hasOwnProperty.call(data, name);
    const value = data[name];

    if (!hasValue || value === undefined || value === null) {
      if (variable.default !== undefined) {
        data[name] = variable.default;
        continue;
      }
      if (variable.required) {
        issues.push({
          field: name,
          message: `Field "${name}" is required`,
        });
      }
      continue;
    }

    if (!matchesType(variable.type, value)) {
      issues.push({
        field: name,
        message: `Field "${name}" must be of type ${variable.type}`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    data,
    issues,
  };
}
