import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role, User } from "@prisma/client";
import type { Request } from "express";
import { AuthService } from "./auth.service";

type AuthedRequest = Request & { user?: User | null };

export const ROLES = "roles";
/** Restrict a handler/controller to these roles (implies signed in). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Requires a valid session; with @Roles also checks the role. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user ??= await this.auth.userFromRequest(req);
    if (!req.user) throw new UnauthorizedException("Please sign in.");
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException("Not allowed.");
    return true;
  }
}

/** Loads the user when signed in, never rejects (guest-friendly routes). */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user ??= await this.auth.userFromRequest(req);
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user ?? null,
);
