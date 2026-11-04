import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pod_session";
export const GUEST_COOKIE = "pod_guest";
export const SESSION_DAYS = 30;

/** 256-bit random token, URL-safe. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
