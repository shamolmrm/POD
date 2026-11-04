import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small shadcn/ui-style primitives (same API shape), kept local to avoid a generator step.

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-fg text-bg hover:opacity-90",
        accent: "bg-accent text-white hover:opacity-90",
        outline: "border border-line bg-transparent hover:bg-fg/5",
        ghost: "hover:bg-fg/5",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3", lg: "h-12 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium", className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-bg p-6", className)} {...props} />;
}

export function Field({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-line text-muted",
    error: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("mb-4 rounded-lg border px-3 py-2 text-sm", styles)}>
      {children}
    </p>
  );
}
