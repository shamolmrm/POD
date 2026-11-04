import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  type PipeTransform,
} from "@nestjs/common";
import type { Request } from "express";
import { z, type ZodType } from "zod";

/** Validate a body/query with a zod schema; the first problem is returned as a readable message. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.join(".");
      throw new BadRequestException(where ? `${where}: ${issue.message}` : issue?.message);
    }
    return result.data;
  }
}

export const zodBody = <T>(schema: ZodType<T>) => new ZodPipe(schema);

export class TooManyRequests extends HttpException {
  constructor(message = "Too many attempts. Please wait a minute and try again.") {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export const Ip = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  clientIp(ctx.switchToHttp().getRequest<Request>()),
);

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address");

export const password = z.string().min(10, "Use at least 10 characters").max(200);
