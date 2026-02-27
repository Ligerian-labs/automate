import { describe, expect, it } from "bun:test";
import type { PipelineDefinition } from "@stepiq/core";
import { validateInputAgainstPipelineSchema } from "../services/input-schema.js";

describe("validateInputAgainstPipelineSchema", () => {
  const definition: PipelineDefinition = {
    name: "Webhook Input Test",
    version: 1,
    input: {
      schema: {
        topic: { type: "string", required: true },
        max_items: { type: "integer", default: 10 },
        premium: { type: "boolean" },
      },
    },
    steps: [{ id: "s1", name: "Step 1" }],
  };

  it("accepts valid payload and applies defaults", () => {
    const result = validateInputAgainstPipelineSchema(definition, {
      topic: "AI",
    });
    expect(result.valid).toBe(true);
    expect(result.data.max_items).toBe(10);
  });

  it("rejects missing required fields", () => {
    const result = validateInputAgainstPipelineSchema(definition, {});
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("topic");
  });

  it("rejects invalid types", () => {
    const result = validateInputAgainstPipelineSchema(definition, {
      topic: "AI",
      max_items: "20",
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("max_items");
  });
});
