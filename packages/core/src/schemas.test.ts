import assert from "node:assert/strict";
import test from "node:test";
import {
  createPipelineSchema,
  createScheduleSchema,
  runPipelineSchema,
} from "./schemas.js";

test("createPipelineSchema accepts a minimal valid pipeline", () => {
  const parsed = createPipelineSchema.safeParse({
    name: "Example",
    definition: {
      name: "Example",
      version: 1,
      steps: [{ id: "step_1", name: "Step 1" }],
    },
  });

  assert.equal(parsed.success, true);
});

test("createScheduleSchema requires a cron expression", () => {
  const parsed = createScheduleSchema.safeParse({});
  assert.equal(parsed.success, false);
});

test("runPipelineSchema allows optional input_data object", () => {
  const parsed = runPipelineSchema.safeParse({
    input_data: { topic: "ai" },
  });

  assert.equal(parsed.success, true);
});
