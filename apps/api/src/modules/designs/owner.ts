import { Inject, Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { Request, Response } from "express";
import { CONFIG, type Config } from "../../config";
import { GUEST_COOKIE, newToken, sha256 } from "../auth/tokens";

/** Who owns designs/carts on this request: a signed-in user, or a guest identified by a cookie. */
export type Owner = { userId: string; guestToken: null } | { userId: null; guestToken: string };

@Injectable()
export class OwnerService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  /** Resolve the owner; for guests, creates the guest cookie on first use. */
  resolve(user: User | null, req: Request, res: Response): Owner {
    if (user) return { userId: user.id, guestToken: null };
    let token = req.cookies?.[GUEST_COOKIE];
    if (typeof token !== "string" || token.length < 30) {
      token = newToken();
      res.cookie(GUEST_COOKIE, token, {
        httpOnly: true,
        secure: this.config.env === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 86400_000,
      });
    }
    return { userId: null, guestToken: sha256(token) };
  }

  /** Existing guest token hash (no cookie creation), used to claim guest data at sign-in. */
  static guestHash(req: Request): string | null {
    const token = req.cookies?.[GUEST_COOKIE];
    return typeof token === "string" && token.length >= 30 ? sha256(token) : null;
  }
}

export function ownerWhere(o: Owner) {
  return o.userId ? { ownerId: o.userId } : { guestToken: o.guestToken };
}
