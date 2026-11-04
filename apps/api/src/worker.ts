import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Queue, Worker } from "bullmq";
import { AppModule } from "./app.module";
import { CONFIG, type Config } from "./config";
import { FulfillmentService } from "./modules/orders/fulfillment.service";
import { QUEUES, redisConnection } from "./queues";

/** Background worker: same image as the API, started with `node dist/worker.js`. */
async function main(): Promise<void> {
  const log = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const connection = redisConnection(app.get<Config>(CONFIG).redisUrl);
  const fulfillment = app.get(FulfillmentService);

  const system = new Worker(
    QUEUES.system,
    async (job) => {
      if (job.name === "heartbeat") return { at: new Date().toISOString() };
      throw new Error(`Unknown job ${job.name}`);
    },
    { connection, concurrency: 1 },
  );

  // one order at a time keeps us well inside Printify's rate limits
  const orders = new Worker(
    QUEUES.fulfillment,
    async (job) => {
      if (job.name !== "submit") throw new Error(`Unknown job ${job.name}`);
      await fulfillment.submit(job.data.orderId as string);
    },
    { connection, concurrency: 1 },
  );
  orders.on("failed", async (job, err) => {
    log.error(`${job?.name} ${job?.data?.orderId} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    const final = job && (err.name === "UnrecoverableError" || job.attemptsMade >= (job.opts.attempts ?? 1));
    if (final) await fulfillment.giveUp(job.data.orderId as string, err.message).catch(() => undefined);
  });

  const queue = new Queue(QUEUES.system, { connection });
  await queue.upsertJobScheduler("heartbeat", { every: 5 * 60 * 1000 }, { name: "heartbeat" });
  log.log("Worker started");

  const stop = async () => {
    log.log("Worker stopping");
    await Promise.all([system.close(), orders.close(), queue.close()]);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main();
