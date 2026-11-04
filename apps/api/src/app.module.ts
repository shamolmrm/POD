import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuditService } from "./common/audit.service";
import { OriginMiddleware } from "./common/origin.middleware";
import { RateLimitService } from "./common/rate-limit.service";
import { CONFIG, loadConfig } from "./config";
import { HealthController } from "./health.controller";
import { AccountController } from "./modules/account/account.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { AuthGuard, OptionalAuthGuard } from "./modules/auth/guards";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";

@Module({
  controllers: [HealthController, AuthController, AccountController],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    PrismaService,
    RedisService,
    RateLimitService,
    AuditService,
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginMiddleware).forRoutes("*");
  }
}
