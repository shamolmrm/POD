import { Module } from "@nestjs/common";
import { CONFIG, loadConfig } from "./config";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";

@Module({
  controllers: [HealthController],
  providers: [{ provide: CONFIG, useFactory: loadConfig }, PrismaService, RedisService],
})
export class AppModule {}
