import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../lib/env.js";

let pipelineQueue: Queue | null = null;

function getPipelineQueue(): Queue {
  if (pipelineQueue) return pipelineQueue;

  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  pipelineQueue = new Queue("pipeline-runs", { connection });
  return pipelineQueue;
}

export async function enqueueRun(runId: string) {
  await getPipelineQueue().add(
    "execute",
    { runId },
    {
      attempts: 1, // retries handled at step level
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );
}
