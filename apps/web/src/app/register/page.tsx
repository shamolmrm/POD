"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-input";
import { Alert, Button, Field } from "@/components/ui";
import { errorText, post } from "@/lib/api";
import { safeNext } from "@/lib/utils";

function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/account");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/auth/register", { name: f.get("name"), email: f.get("email"), password: f.get("password") });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Save your designs and track your orders."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-accent">
            Sign in
          </Link>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={onSubmit}>
        <Field id="name" name="name" label="Full name" autoComplete="name" required minLength={2} maxLength={80} />
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
        <PasswordField id="password" name="password" label="Password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." />
        <PasswordField id="confirm" name="confirm" label="Confirm password" autoComplete="new-password" required minLength={10} />
        <Button type="submit" variant="accent" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
