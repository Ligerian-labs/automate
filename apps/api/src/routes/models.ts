import { MARKUP_PERCENTAGE, SUPPORTED_MODELS } from "@stepiq/core";
import { Hono } from "hono";

export const modelRoutes = new Hono();

// List available models with pricing (including our markup)
modelRoutes.get("/", (c) => {
  const models = SUPPORTED_MODELS.map(
    (m: (typeof SUPPORTED_MODELS)[number]) => ({
      ...m,
      input_cost_per_million: Math.ceil(
        m.input_cost_per_million * (1 + MARKUP_PERCENTAGE / 100),
      ),
      output_cost_per_million: Math.ceil(
        m.output_cost_per_million * (1 + MARKUP_PERCENTAGE / 100),
      ),
    }),
  );
  return c.json(models);
});
