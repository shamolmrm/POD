import { hash, verify } from "@node-rs/argon2";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Role, User } from "@prisma/client";
import type { Request, Response } from "express";
import { AuditService } from "../../common/audit.service";
import { clientIp, TooManyRequests } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit.service";
import { CONFIG, type Config } from "../../config";
import { PrismaService } from "../../prisma.service";
import { GUEST_COOKIE, newToken, SESSION_COOKIE, SESSION_DAYS, sha256 } from "./tokens";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_SECONDS = 15 * 60;
const BAD_LOGIN = "Email or password is incorrect.";

export type PublicUser = { id: string; email: string; name: string; role: Role; emailVerified: boolean };

export function toPublic(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.emailVerifiedAt };
}

// argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1)
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
// verifying against this keeps unknown-email logins as slow as real ones
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON);
  }

  async register(input: { email: string; password: string; name: string }, req: Request, res: Response) {
    await this.throttle(req);
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException("An account with this email already exists. Try signing in.");
    }
    const user = await this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash: await this.hashPassword(input.password), lastLoginAt: new Date() },
    });
    await this.startSession(user, req, res);
    await this.audit.record("user.register", { actorId: user.id, ip: clientIp(req) });
    return toPublic(user);
  }

  async login(input: { email: string; password: string }, req: Request, res: Response) {
    await this.throttle(req);
    const lockKey = `login-fail:${input.email}`;
    if ((await this.limits.count(lockKey)) >= MAX_FAILED_LOGINS) {
      throw new TooManyRequests("Too many failed sign-in attempts. Try again in 15 minutes.");
    }
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    dummyHash ??= this.hashPassword("not-a-real-password-0000");
    const ok = await verify(user?.passwordHash ?? (await dummyHash), input.password).catch(() => false);
    if (!user || !ok) {
      await this.limits.hit(lockKey, MAX_FAILED_LOGINS, LOCK_SECONDS);
      await this.audit.record("user.login_failed", { ip: clientIp(req), detail: { email: input.email } });
      throw new UnauthorizedException(BAD_LOGIN);
    }
    await this.limits.reset(lockKey);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.startSession(user, req, res);
    await this.audit.record("user.login", { actorId: user.id, ip: clientIp(req) });
    return toPublic(user);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  /** The signed-in user for a request, or null. Expired sessions are removed. */
  async userFromRequest(req: Request): Promise<User | null> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length < 20) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return session.user;
  }

  async changePassword(user: User, current: string, next: string, req: Request, res: Response) {
    if (!(await verify(user.passwordHash, current).catch(() => false))) {
      throw new UnauthorizedException("Current password is incorrect.");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await this.hashPassword(next) } });
    await this.prisma.session.deleteMany({ where: { userId: user.id } }); // sign out everywhere
    await this.startSession(user, req, res);
    await this.audit.record("user.password_changed", { actorId: user.id, ip: clientIp(req) });
  }

  private async throttle(req: Request): Promise<void> {
    if (await this.limits.hit(`auth:${clientIp(req)}`, 10, 60)) throw new TooManyRequests();
  }

  private async startSession(user: User, req: Request, res: Response): Promise<void> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await this.prisma.session.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt,
        ip: clientIp(req),
        userAgent: req.headers["user-agent"]?.slice(0, 300),
      },
    });
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
    await this.claimGuestData(user, req);
  }

  /** Designs and uploads made as a guest on this browser move to the account at sign-in. */
  private async claimGuestData(user: User, req: Request): Promise<void> {
    const raw = req.cookies?.[GUEST_COOKIE];
    if (typeof raw !== "string" || raw.length < 30) return;
    const guestToken = sha256(raw);
    await this.prisma.design.updateMany({ where: { guestToken }, data: { ownerId: user.id, guestToken: null } });
    await this.prisma.asset.updateMany({ where: { guestToken }, data: { ownerId: user.id, guestToken: null } });
  }

  private cookieOptions() {
    return { httpOnly: true, secure: this.config.env === "production", sameSite: "lax" as const, path: "/" };
  }
}
