import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuditService } from "../src/common/audit.service";
import { email, password, ZodPipe } from "../src/common/http";
import { OriginMiddleware } from "../src/common/origin.middleware";
import type { RateLimitService } from "../src/common/rate-limit.service";
import type { Config } from "../src/config";
import type { PrismaService } from "../src/prisma.service";
import { AuthService, MAX_FAILED_LOGINS } from "../src/modules/auth/auth.service";
import { AuthGuard } from "../src/modules/auth/guards";
import { safeEqual, sha256 } from "../src/modules/auth/tokens";

const config: Config = {
  env: "test",
  port: 0,
  databaseUrl: "x",
  redisUrl: "redis://x",
  publicBaseUrl: "https://pod.example.com",
};

/** Minimal in-memory stand-ins for Prisma and Redis-backed limits. */
function fakes() {
  const users: Array<Record<string, unknown>> = [];
  const sessions: Array<Record<string, unknown>> = [];
  const counters = new Map<string, number>();
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const u = { id: `u${users.length + 1}`, role: "CUSTOMER", emailVerifiedAt: null, ...data };
        users.push(u);
        return u;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(users.find((u) => u.id === where.id)!, data),
    },
    session: {
      create: async ({ data }: { data: Record<string, unknown> }) => sessions.push(data),
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const s = sessions.find((x) => x.tokenHash === where.tokenHash);
        return s ? { ...s, id: "s", user: users.find((u) => u.id === s.userId) } : null;
      },
      deleteMany: async () => ({ count: 0 }),
      delete: async () => undefined,
    },
  };
  const limits = {
    hit: async (key: string, limit: number) => {
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n > limit;
    },
    count: async (key: string) => counters.get(key) ?? 0,
    reset: async (key: string) => void counters.delete(key),
  };
  const audit = { record: async () => undefined };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    limits as unknown as RateLimitService,
    audit as unknown as AuditService,
    config,
  );
  return { service, sessions, counters };
}

function http(cookies: Record<string, string> = {}) {
  const req = { ip: "1.2.3.4", headers: {}, cookies, socket: {} } as unknown as Request;
  const set: Record<string, string> = {};
  const res = { cookie: (k: string, v: string) => (set[k] = v), clearCookie: () => undefined } as unknown as Response;
  return { req, res, set };
}

describe("AuthService", () => {
  jest.setTimeout(30_000);

  it("registers, sets a session cookie, and finds the user from it", async () => {
    const { service, sessions } = fakes();
    const { req, res, set } = http();
    const user = await service.register({ email: "a@b.co", password: "long-enough-pw", name: "Ann" }, req, res);
    expect(user).toMatchObject({ email: "a@b.co", role: "CUSTOMER" });
    expect(set.pod_session).toBeDefined();
    expect(sessions[0].tokenHash).toBe(sha256(set.pod_session)); // only the hash is stored
    const again = http({ pod_session: set.pod_session });
    expect((await service.userFromRequest(again.req))?.email).toBe("a@b.co");
  });

  it("rejects a duplicate email", async () => {
    const { service } = fakes();
    const { req, res } = http();
    await service.register({ email: "a@b.co", password: "long-enough-pw", name: "Ann" }, req, res);
    await expect(service.register({ email: "a@b.co", password: "long-enough-pw", name: "Ann" }, req, res)).rejects.toThrow(
      /already exists/,
    );
  });

  it("locks the email after repeated wrong passwords, even for the right one", async () => {
    const { service, counters } = fakes();
    const { req, res } = http();
    await service.register({ email: "a@b.co", password: "long-enough-pw", name: "Ann" }, req, res);
    counters.clear(); // reset the per-IP throttle counter from registration
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(service.login({ email: "a@b.co", password: "wrong" }, req, res)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    await expect(service.login({ email: "a@b.co", password: "long-enough-pw" }, req, res)).rejects.toThrow(/15 minutes/);
  });

  it("gives the same error for unknown emails", async () => {
    const { service } = fakes();
    const { req, res } = http();
    await expect(service.login({ email: "x@y.co", password: "whatever" }, req, res)).rejects.toThrow(
      "Email or password is incorrect.",
    );
  });
});

describe("OriginMiddleware", () => {
  const mw = new OriginMiddleware(config);
  const call = (method: string, url: string, origin?: string) =>
    new Promise<void>((resolve, reject) => {
      try {
        mw.use({ method, originalUrl: url, headers: origin ? { origin } : {} } as Request, {} as Response, () => resolve());
      } catch (err) {
        reject(err);
      }
    });

  it("allows reads and same-origin writes", async () => {
    await call("GET", "/api/v1/auth/me");
    await call("POST", "/api/v1/auth/login", "https://pod.example.com");
  });

  it("blocks cross-site and origin-less writes", async () => {
    await expect(call("POST", "/api/v1/auth/login", "https://evil.example")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(call("POST", "/api/v1/auth/login")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets signed webhooks through", async () => {
    await call("POST", "/api/v1/webhooks/printify");
  });
});

describe("AuthGuard roles", () => {
  const ctx = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as never;
  const guard = (roles?: string[]) =>
    new AuthGuard({ userFromRequest: async () => null } as never, { getAllAndOverride: () => roles } as unknown as Reflector);

  it("rejects guests and wrong roles", async () => {
    await expect(guard().canActivate(ctx(null))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(["ADMIN"]).canActivate(ctx({ role: "CUSTOMER" }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard(["ADMIN"]).canActivate(ctx({ role: "ADMIN" }))).resolves.toBe(true);
  });
});

describe("validation helpers", () => {
  const pipe = new ZodPipe(z.object({ email, password }));

  it("normalises email and enforces password length", () => {
    expect(pipe.transform({ email: " A@B.Co ", password: "0123456789" })).toEqual({ email: "a@b.co", password: "0123456789" });
    expect(() => pipe.transform({ email: "a@b.co", password: "short" })).toThrow(/password/);
  });

  it("compares secrets in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
