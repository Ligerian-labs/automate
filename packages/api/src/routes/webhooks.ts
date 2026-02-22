import { Hono } from "hono";

export const webhookRoutes = new Hono();

// Inbound webhook trigger for pipelines
webhookRoutes.post("/:pipelineId/:token", async (c) => {
  const pipelineId = c.req.param("pipelineId");
  const token = c.req.param("token");

  // TODO: Validate webhook token, trigger pipeline run
  return c.json({ error: "Not implemented" }, 501);
});
