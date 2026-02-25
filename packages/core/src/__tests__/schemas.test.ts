import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  createPipelineSchema,
  runPipelineSchema,
  createScheduleSchema,
  pipelineStepSchema,
  pipelineDefinitionSchema,
} from "../schemas.js";

describe("registerSchema", () => {
  it("accepts valid registration", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "securepass123",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "securepass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("allows optional name", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "securepass123",
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("pipelineStepSchema", () => {
  it("accepts valid step", () => {
    const result = pipelineStepSchema.safeParse({
      id: "research",
      name: "Research trends",
      model: "gpt-4o",
      prompt: "Find trends about {{vars.topic}}",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid step ID (uppercase)", () => {
    const result = pipelineStepSchema.safeParse({
      id: "Research",
      name: "Research trends",
    });
    expect(result.success).toBe(false);
  });

  it("defaults type to llm", () => {
    const result = pipelineStepSchema.safeParse({
      id: "step1",
      name: "Step 1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("llm");
    }
  });

  it("accepts all valid step types", () => {
    const types = ["llm", "transform", "condition", "parallel", "webhook", "human_review", "code"];
    for (const type of types) {
      const result = pipelineStepSchema.safeParse({ id: "s1", name: "S", type });
      expect(result.success).toBe(true);
    }
  });

  it("accepts retry config", () => {
    const result = pipelineStepSchema.safeParse({
      id: "s1",
      name: "S",
      retry: { max_attempts: 3, backoff_ms: 2000 },
    });
    expect(result.success).toBe(true);
  });
});

describe("pipelineDefinitionSchema", () => {
  it("accepts valid definition", () => {
    const result = pipelineDefinitionSchema.safeParse({
      name: "Test Pipeline",
      version: 1,
      steps: [{ id: "step1", name: "Step 1", model: "gpt-4o-mini", prompt: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty steps", () => {
    const result = pipelineDefinitionSchema.safeParse({
      name: "Test",
      version: 1,
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts variables and input schema", () => {
    const result = pipelineDefinitionSchema.safeParse({
      name: "Test",
      version: 1,
      variables: { lang: "fr", tone: "direct" },
      input: {
        schema: {
          topic: { type: "string", required: true },
        },
      },
      steps: [{ id: "s1", name: "S1", prompt: "{{vars.lang}}" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts output delivery config", () => {
    const result = pipelineDefinitionSchema.safeParse({
      name: "Test",
      version: 1,
      steps: [{ id: "s1", name: "S1" }],
      output: {
        from: "s1",
        deliver: [{ type: "webhook", url: "https://hook.example.com" }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("createPipelineSchema", () => {
  it("accepts valid payload", () => {
    const result = createPipelineSchema.safeParse({
      name: "My Pipeline",
      definition: {
        name: "My Pipeline",
        version: 1,
        steps: [{ id: "s1", name: "Step 1", prompt: "Hello" }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional tags", () => {
    const result = createPipelineSchema.safeParse({
      name: "My Pipeline",
      definition: {
        name: "My Pipeline",
        version: 1,
        steps: [{ id: "s1", name: "Step 1" }],
      },
      tags: ["ai", "blog"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects too many tags", () => {
    const result = createPipelineSchema.safeParse({
      name: "My Pipeline",
      definition: {
        name: "My Pipeline",
        version: 1,
        steps: [{ id: "s1", name: "Step 1" }],
      },
      tags: Array(11).fill("tag"),
    });
    expect(result.success).toBe(false);
  });
});

describe("runPipelineSchema", () => {
  it("accepts empty input", () => {
    const result = runPipelineSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts input data", () => {
    const result = runPipelineSchema.safeParse({
      input_data: { topic: "AI trends" },
    });
    expect(result.success).toBe(true);
  });
});

describe("createScheduleSchema", () => {
  it("accepts valid schedule", () => {
    const result = createScheduleSchema.safeParse({
      cron_expression: "0 9 * * 1",
      timezone: "Europe/Paris",
    });
    expect(result.success).toBe(true);
  });

  it("defaults timezone to UTC", () => {
    const result = createScheduleSchema.safeParse({
      cron_expression: "0 9 * * *",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("UTC");
    }
  });
});
