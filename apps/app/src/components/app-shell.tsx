import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@stepiq/ui";
import { clearToken } from "../lib/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "⊞" },
  { to: "/pipelines", label: "Pipelines", icon: "◇" },
  { to: "/runs", label: "Runs", icon: "▷" },
  { to: "/schedules", label: "Schedules", icon: "◷" },
  { to: "/templates", label: "Templates", icon: "▤" },
];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Sidebar — 260px, padding [24,20], gap 32 */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--divider)] bg-[var(--bg-inset)] px-5 py-6" style={{ gap: 32 }}>
        {/* Logo — 28x28, cornerRadius 6, gap 8 */}
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-[6px] bg-[var(--accent)] text-[10px] font-bold text-[var(--bg-primary)]">
            sQ
          </div>
          <span className="font-[var(--font-mono)] text-base font-bold tracking-tight" style={{ fontFamily: "var(--font-mono)" }}>
            stepIQ
          </span>
        </div>

        {/* Main nav — gap 4 */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = item.to && location.pathname.startsWith(item.to);
            const isPlaceholder = item.to !== "/dashboard" && item.to !== "/pipelines" && item.to !== "/runs";
            if (isPlaceholder) {
              return (
                <span
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] opacity-60"
                >
                  <span className="w-[18px] text-center text-[var(--text-tertiary)]">{item.icon}</span>
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]",
                )}
              >
                <span className={cn("w-[18px] text-center", active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings — gap 4 */}
        <nav className="flex flex-col gap-1">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              location.pathname.startsWith("/settings")
                ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]",
            )}
          >
            <span className={cn("w-[18px] text-center", location.pathname.startsWith("/settings") ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>
              ⚙
            </span>
            Settings
          </Link>
        </nav>

        {/* Divider */}
        <div className="-mx-5 h-px bg-[var(--divider)]" />

        {/* User row — gap 12 */}
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-mono)" }}>
            VD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">Valentin D.</p>
            <p className="truncate text-[11px] text-[var(--text-tertiary)]" style={{ fontFamily: "var(--font-mono)" }}>Pro plan</p>
          </div>
          <button
            type="button"
            title="Log out"
            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
            onClick={() => {
              clearToken();
              navigate({ to: "/login" });
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Log out">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content — padding [32,40], gap 32 */}
      <main className="flex flex-1 flex-col overflow-auto px-10 py-8" style={{ gap: 32 }}>
        {/* Top bar */}
        <header className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle ? (
              <p className="text-sm text-[var(--text-tertiary)]">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
