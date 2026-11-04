"use client";

import { Eye, EyeOff } from "lucide-react";
import { type InputHTMLAttributes, useState } from "react";
import { Input, Label } from "@/components/ui";

export function PasswordField({ label, id, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} {...props} type={show ? "text" : "password"} className="pr-10" />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-fg"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
