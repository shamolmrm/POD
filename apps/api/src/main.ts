import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { CONFIG, type Config } from "./config";

async function bootstrap(): Promise<void> {
  // rawBody: webhook signatures are computed over the exact bytes received
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.set("trust proxy", 1); // behind Nginx: req.ip comes from X-Forwarded-For
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "2mb" });
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  await app.listen(config.port, "0.0.0.0");
  Logger.log(`API listening on :${config.port} (${config.env})`, "Bootstrap");
}

void bootstrap();
