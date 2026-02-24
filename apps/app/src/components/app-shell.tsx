import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@automate/ui";
import { clearToken } from "../lib/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "▣" },
  { to: "", label: "Pipelines", icon: "◇" },
  { to: "", label: "Runs", icon: "▷" },
  { to: "", label: "Schedules", icon: "◷" },
  { to: "", label: "Templates", icon: "▤" },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] lg:flex">
      <aside className="border-b border-[var(--divider)] bg-[var(--bg-inset)] p-4 lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-[var(--accent)] text-[var(--bg-primary)] font-bold">A</div>
          <div className="font-semibold tracking-tight">Automate</div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = item.to && location.pathname.startsWith(item.to);
            if (!item.to) {
              return (
                <span key={item.label} className="block rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] opacity-90">
                  <span className="mr-2 inline-block w-4 text-center text-xs">{item.icon}</span>
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm",
                  active
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]",
                )}
              >
                <span className="mr-2 inline-block w-4 text-center text-xs">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 rounded-md bg-[var(--bg-surface)] px-2 py-2 text-sm">
          <Link
            to="/settings"
            className={cn(
              "block rounded-md px-2 py-1 text-[var(--text-secondary)]",
              location.pathname.startsWith("/settings") ? "bg-[var(--bg-inset)] text-[var(--text-primary)]" : "",
            )}
          >
            ⚙ Settings
          </Link>
        </div>

        <div className="mt-4 border-t border-[var(--divider)] pt-3 lg:mt-auto">
          <button
            type="button"
            className="w-full rounded-md border border-[var(--divider)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
            onClick={() => {
              clearToken();
              navigate({ to: "/login" });
            }}
          >
            Log out
          </button>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--divider)] p-2">
            <div className="grid size-7 place-items-center rounded-full bg-[var(--bg-surface)] text-xs font-semibold">VD</div>
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--text-primary)]">Valentin D.</p>
              <p className="truncate text-[10px] text-[var(--text-tertiary)]">Pro plan</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-10">
        <header className="mb-6 border-b border-[var(--divider)] pb-4">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--text-tertiary)]">{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
