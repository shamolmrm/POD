"use client";

import { useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Same-origin JSON call to /api/v1. Cookies carry the session. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const r = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new ApiError(r.status, typeof msg === "string" ? msg : "Something went wrong. Please try again.");
  }
  return data as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export type User = { id: string; email: string; name: string; role: "CUSTOMER" | "STAFF" | "ADMIN"; emailVerified: boolean };

/** Current user (null = guest, undefined = still loading). */
export function useSession(): { user: User | null | undefined; refresh: () => void } {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<{ user: User | null }>("/auth/me")
      .then((r) => alive && setUser(r.user))
      .catch(() => alive && setUser(null));
    return () => {
      alive = false;
    };
  }, [tick]);
  return { user, refresh: () => setTick((t) => t + 1) };
}

export function errorText(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof ApiError ? err.message : fallback;
}
