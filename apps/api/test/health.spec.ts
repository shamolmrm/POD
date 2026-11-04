import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { HealthController } from "../src/health.controller";
import { PrismaService } from "../src/prisma.service";
import { redisConnection } from "../src/queues";
import { RedisService } from "../src/redis.service";

async function appWith(db: boolean, redis: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: { ping: async () => db } },
      { provide: RedisService, useValue: { ping: async () => redis } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

describe("health", () => {
  it("live is always ok", async () => {
    const app = await appWith(false, false);
    await request(app.getHttpServer()).get("/api/v1/health").expect(200, { status: "ok" });
    await app.close();
  });

  it("ready is ok when database and redis answer", async () => {
    const app = await appWith(true, true);
    const res = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(200);
    expect(res.body.checks).toEqual({ database: true, redis: true });
    await app.close();
  });

  it("ready is 503 when a dependency is down", async () => {
    const app = await appWith(true, false);
    const res = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(503);
    expect(res.body.status).toBe("degraded");
    await app.close();
  });
});

describe("redisConnection", () => {
  it("parses password and db from the URL", () => {
    expect(redisConnection("redis://:p%40ss@pod-redis:6379/2")).toMatchObject({
      host: "pod-redis",
      port: 6379,
      password: "p@ss",
      db: 2,
    });
  });
});
