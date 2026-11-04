"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PasswordField } from "@/components/password-input";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Alert, Button, Card, Field } from "@/components/ui";
import { api, errorText, post, useSession, type User } from "@/lib/api";

type Address = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

type Msg = { tone: "success" | "error"; text: string } | null;

function Profile({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [msg, setMsg] = useState<Msg>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api("/account/profile", { method: "PATCH", body: JSON.stringify({ name: new FormData(e.currentTarget).get("name") }) });
      setMsg({ tone: "success", text: "Saved." });
      onSaved();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    }
  }
  return (
    <Card>
      <h2 className="mb-4 font-semibold">Profile</h2>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form onSubmit={onSubmit}>
        <Field id="name" name="name" label="Full name" defaultValue={user.name} required minLength={2} maxLength={80} />
        <Field id="email" label="Email" value={user.email} disabled readOnly />
        <Button type="submit">Save</Button>
      </form>
    </Card>
  );
}

function ChangePassword() {
  const [msg, setMsg] = useState<Msg>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("next") !== f.get("confirm")) return setMsg({ tone: "error", text: "New passwords do not match." });
    try {
      await post("/auth/password", { current: f.get("current"), next: f.get("next") });
      form.reset();
      setMsg({ tone: "success", text: "Password changed. Other devices were signed out." });
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    }
  }
  return (
    <Card>
      <h2 className="mb-4 font-semibold">Change password</h2>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form onSubmit={onSubmit}>
        <PasswordField id="current" name="current" label="Current password" autoComplete="current-password" required />
        <PasswordField id="next" name="next" label="New password" autoComplete="new-password" required minLength={10} />
        <PasswordField id="confirm" name="confirm" label="Confirm new password" autoComplete="new-password" required minLength={10} />
        <Button type="submit">Change password</Button>
      </form>
    </Card>
  );
}

function AddressForm({ initial, onDone }: { initial?: Address; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = { ...f, isDefault: f.isDefault === "on" };
    try {
      await api(initial ? `/account/addresses/${initial.id}` : "/account/addresses", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  }
  const v = (k: keyof Address) => (initial?.[k] as string | null) ?? "";
  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-xl border border-line p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field id="firstName" name="firstName" label="First name" defaultValue={v("firstName")} required autoComplete="given-name" />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={v("lastName")} required autoComplete="family-name" />
        <Field id="line1" name="line1" label="Address line 1" defaultValue={v("line1")} required autoComplete="address-line1" />
        <Field id="line2" name="line2" label="Address line 2" defaultValue={v("line2")} autoComplete="address-line2" />
        <Field id="city" name="city" label="City" defaultValue={v("city")} required autoComplete="address-level2" />
        <Field id="region" name="region" label="State / region" defaultValue={v("region")} autoComplete="address-level1" />
        <Field id="postalCode" name="postalCode" label="Postal code" defaultValue={v("postalCode")} required autoComplete="postal-code" />
        <Field
          id="country"
          name="country"
          label="Country code"
          defaultValue={v("country")}
          required
          maxLength={2}
          placeholder="US"
          hint="2 letters, e.g. US, GB, CA, AU"
          autoComplete="country"
        />
        <Field id="phone" name="phone" type="tel" label="Phone" defaultValue={v("phone")} autoComplete="tel" />
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault} /> Default address
      </label>
      <div className="flex gap-2">
        <Button type="submit">Save address</Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Addresses() {
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const load = useCallback(() => api<Address[]>("/account/addresses").then(setList), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(a: Address) {
    if (!window.confirm("Delete this address?")) return;
    await api(`/account/addresses/${a.id}`, { method: "DELETE" });
    void load();
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Addresses</h2>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            Add address
          </Button>
        )}
      </div>
      {list && list.length === 0 && !editing && <p className="mt-3 text-sm text-muted">No saved addresses yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {list?.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
            <div>
              <div className="font-medium">
                {a.firstName} {a.lastName} {a.isDefault && <span className="ml-1 rounded bg-fg/5 px-1.5 py-0.5 text-xs">Default</span>}
              </div>
              <div className="text-muted">
                {[a.line1, a.line2, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(", ")}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(a)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <AddressForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? undefined : editing}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, refresh } = useSession();

  useEffect(() => {
    if (user === null) router.replace("/login?next=/account");
  }, [user, router]);

  async function logout() {
    await post("/auth/logout");
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My account</h1>
          {user && (
            <Button variant="outline" size="sm" onClick={logout}>
              Sign out
            </Button>
          )}
        </div>
        {!user ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-wrap gap-2 text-sm">
              <a href="/account/orders" className="rounded-lg border border-line px-3 py-1.5 hover:bg-fg/5">
                My orders
              </a>
              <a href="/account/designs" className="rounded-lg border border-line px-3 py-1.5 hover:bg-fg/5">
                My designs
              </a>
            </div>
            <Profile user={user} onSaved={refresh} />
            <Addresses />
            <ChangePassword />
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
