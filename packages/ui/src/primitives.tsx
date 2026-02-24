import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export function SurfaceCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]", className)} {...props} />;
}

export function UiButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        "rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60",
        "bg-[var(--accent)] text-[var(--bg-primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
