import { Hono } from "hono";
import { SUPPORTED_MODELS, MARKUP_PERCENTAGE } from "@automate/core";

export const modelRoutes = new Hono();

// List available models with pricing (including our markup)
modelRoutes.get("/", (c) => {
  const models = SUPPORTED_MODELS.map((m: (typeof SUPPORTED_MODELS)[number]) => ({
    ...m,
    input_cost_per_million: Math.ceil(m.input_cost_per_million * (1 + MARKUP_PERCENTAGE / 100)),
    output_cost_per_million: Math.ceil(m.output_cost_per_million * (1 + MARKUP_PERCENTAGE / 100)),
  }));
  return c.json(models);
});
