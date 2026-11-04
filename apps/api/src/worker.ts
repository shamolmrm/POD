import { Logger } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { loadConfig } from "./config";
import { QUEUES, redisConnection } from "./queues";

/** Background worker: same image as the API, started with `node dist/worker.js`. */
async function main(): Promise<void> {
  const log = new Logger("Worker");
  const connection = redisConnection(loadConfig().redisUrl);

  const worker = new Worker(
    QUEUES.system,
    async (job) => {
      if (job.name === "heartbeat") return { at: new Date().toISOString() };
      throw new Error(`Unknown job ${job.name}`);
    },
    { connection, concurrency: 2 },
  );
  worker.on("failed", (job, err) => log.error(`${job?.name} failed: ${err.message}`));

  // a heartbeat every 5 minutes proves the worker is alive
  const queue = new Queue(QUEUES.system, { connection });
  await queue.upsertJobScheduler("heartbeat", { every: 5 * 60 * 1000 }, { name: "heartbeat" });
  log.log("Worker started");

  const stop = async () => {
    log.log("Worker stopping");
    await worker.close();
    await queue.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main();
