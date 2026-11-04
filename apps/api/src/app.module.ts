import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuditService } from "./common/audit.service";
import { OriginMiddleware } from "./common/origin.middleware";
import { RateLimitService } from "./common/rate-limit.service";
import { CONFIG, loadConfig } from "./config";
import { HealthController } from "./health.controller";
import { AccountController } from "./modules/account/account.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { AdminCatalogController, CatalogController } from "./modules/catalog/catalog.controller";
import { CatalogService } from "./modules/catalog/catalog.service";
import { CartController } from "./modules/cart/cart.controller";
import { CartService } from "./modules/cart/cart.service";
import { CouponsController } from "./modules/cart/coupons.controller";
import { MailerService } from "./modules/notifications/mailer.service";
import { FulfillmentService } from "./modules/orders/fulfillment.service";
import { AdminOrdersController, OrdersController, ReviewsController } from "./modules/orders/orders.controller";
import { OrdersService } from "./modules/orders/orders.service";
import { WebhooksController } from "./modules/orders/webhooks.controller";
import { PAYMENT_PROVIDER } from "./modules/payments/provider";
import { SslcommerzProvider } from "./modules/payments/sslcommerz.provider";
import { DesignsController } from "./modules/designs/designs.controller";
import { OwnerService } from "./modules/designs/owner";
import { FilesController } from "./modules/files/files.controller";
import { StorageService } from "./modules/files/storage.service";
import { PrintifyClient } from "./modules/printify/printify.client";
import { AuthService } from "./modules/auth/auth.service";
import { AuthGuard, OptionalAuthGuard } from "./modules/auth/guards";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";

@Module({
  controllers: [HealthController, AuthController, AccountController, CatalogController, AdminCatalogController, DesignsController, FilesController, CartController, CouponsController, OrdersController, AdminOrdersController, ReviewsController, WebhooksController],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    PrismaService,
    RedisService,
    RateLimitService,
    AuditService,
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    PrintifyClient,
    CatalogService,
    StorageService,
    OwnerService,
    CartService,
    MailerService,
    OrdersService,
    FulfillmentService,
    { provide: PAYMENT_PROVIDER, useClass: SslcommerzProvider },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginMiddleware).forRoutes("*");
  }
}
