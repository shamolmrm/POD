"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-input";
import { Alert, Button, Field } from "@/components/ui";
import { errorText, post } from "@/lib/api";
import { safeNext } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/account");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await post("/auth/login", { email: f.get("email"), password: f.get("password") });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your designs and orders."
      footer={
        <>
          New here?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-accent">
            Create an account
          </Link>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={onSubmit}>
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
        <PasswordField id="password" name="password" label="Password" autoComplete="current-password" required />
        <Button type="submit" variant="accent" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
