import { ForbiddenException, Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { CONFIG, type Config } from "../config";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated requests: a state-changing request must come from our own
 * origin. Webhooks (server-to-server, signature-verified) are exempt.
 */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowed: Set<string>;

  constructor(@Inject(CONFIG) config: Config) {
    this.allowed = new Set([new URL(config.publicBaseUrl).origin]);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE.has(req.method) || req.originalUrl.startsWith("/api/v1/webhooks/")) return next();
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
    if (!origin || !this.allowed.has(origin)) throw new ForbiddenException("Cross-site request blocked");
    next();
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
