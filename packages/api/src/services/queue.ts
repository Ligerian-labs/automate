import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../lib/env.js";

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const pipelineQueue = new Queue("pipeline-runs", { connection });

export async function enqueueRun(runId: string) {
  await pipelineQueue.add(
    "execute",
    { runId },
    {
      attempts: 1, // retries handled at step level
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );
}
