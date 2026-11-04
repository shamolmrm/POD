import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  live() {
    return { status: "ok" };
  }

  /** Readiness: database and Redis answer. 503 otherwise. */
  @Get("ready")
  async ready() {
    const [database, redis] = await Promise.all([this.prisma.ping(), this.redis.ping()]);
    const body = { status: database && redis ? "ok" : "degraded", checks: { database, redis } };
    if (body.status !== "ok") throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
