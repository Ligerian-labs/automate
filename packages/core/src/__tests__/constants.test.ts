import { describe, expect, it } from "bun:test";
import {
  MARKUP_PERCENTAGE,
  PLAN_LIMITS,
  SUPPORTED_MODELS,
  TOKENS_PER_CREDIT,
} from "../constants.js";

describe("SUPPORTED_MODELS", () => {
  it("contains at least one model", () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
  });

  it("each model has required fields", () => {
    for (const m of SUPPORTED_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.provider).toBeTruthy();
      expect(m.input_cost_per_million).toBeGreaterThan(0);
      expect(m.output_cost_per_million).toBeGreaterThan(0);
      expect(m.max_tokens).toBeGreaterThan(0);
    }
  });

  it("includes anthropic and openai providers", () => {
    const providers = new Set(SUPPORTED_MODELS.map((m) => m.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
  });

  it("has unique model IDs", () => {
    const ids = SUPPORTED_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses provider-specific model id prefixes", () => {
    for (const model of SUPPORTED_MODELS) {
      if (model.provider === "anthropic") {
        expect(model.id.startsWith("claude-")).toBe(true);
      }
      if (model.provider === "openai") {
        expect(model.id.startsWith("gpt-")).toBe(true);
      }
    }
  });
});

describe("PLAN_LIMITS", () => {
  it("has all plans defined", () => {
    expect(PLAN_LIMITS.free).toBeDefined();
    expect(PLAN_LIMITS.starter).toBeDefined();
    expect(PLAN_LIMITS.pro).toBeDefined();
    expect(PLAN_LIMITS.enterprise).toBeDefined();
  });

  it("free plan has correct limits", () => {
    const free = PLAN_LIMITS.free;
    expect(free.credits).toBe(100);
    expect(free.max_runs_per_day).toBe(10);
    expect(free.max_pipelines).toBe(3);
    expect(free.cron_enabled).toBe(false);
    expect(free.price_cents).toBe(0);
  });

  it("pro plan costs €49", () => {
    expect(PLAN_LIMITS.pro.price_cents).toBe(4900);
    expect(PLAN_LIMITS.pro.credits).toBe(8000);
  });

  it("enterprise has unlimited pipelines", () => {
    expect(PLAN_LIMITS.enterprise.max_pipelines).toBe(-1);
  });
});

describe("constants", () => {
  it("MARKUP_PERCENTAGE is 25%", () => {
    expect(MARKUP_PERCENTAGE).toBe(25);
  });

  it("TOKENS_PER_CREDIT is 1000", () => {
    expect(TOKENS_PER_CREDIT).toBe(1000);
  });
});
