import { useClerk } from "@clerk/clerk-react";
import { cn } from "@stepiq/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { trackLogout } from "../lib/analytics";
import { type UserMe, apiFetch } from "../lib/api";
import { clearToken } from "../lib/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/pipelines", label: "Pipelines", icon: "workflow" },
  { to: "/runs", label: "Runs", icon: "play" },
  { to: "/schedules", label: "Schedules", icon: "timer" },
  { to: "/templates", label: "Templates", icon: "layout-template" },
];

function NavIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  if (name === "dashboard") {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.2" />
        <rect x="14" y="3" width="7" height="7" rx="1.2" />
        <rect x="3" y="14" width="7" height="7" rx="1.2" />
        <rect x="14" y="14" width="7" height="7" rx="1.2" />
      </svg>
    );
  }
  if (name === "workflow") {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M8 6h8M7.5 7.5l3.5 8M16.5 7.5l-3.5 8" />
      </svg>
    );
  }
  if (name === "play") {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="8 6 18 12 8 18 8 6" />
      </svg>
    );
  }
  if (name === "timer") {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l3 2M9 3h6" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="8" height="7" rx="1.2" />
      <rect x="13" y="4" width="8" height="7" rx="1.2" />
      <rect x="3" y="13" width="8" height="7" rx="1.2" />
      <rect x="13" y="13" width="8" height="7" rx="1.2" />
    </svg>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const clerk = useClerk();
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/user/me"),
  });

  const displayName = meQ.data?.name?.trim() || meQ.data?.email || "User";
  const planName = `${(meQ.data?.plan || "free").toString()} plan`;
  const initials = getInitials(displayName);

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Sidebar — 260px, padding [24,20], gap 32 */}
      <aside
        className="flex w-[260px] shrink-0 flex-col border-r border-[var(--divider)] bg-[var(--bg-inset)] px-5 py-6"
        style={{ gap: 32 }}
      >
        {/* Logo — 28x28, cornerRadius 6, gap 8 */}
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-[6px] bg-[var(--accent)] text-[var(--bg-primary)]">
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <path d="M7 10v4a3 3 0 0 0 3 3h4" />
              <circle cx="17.5" cy="6.5" r="3.5" />
            </svg>
          </div>
          <span
            className="font-[var(--font-mono)] text-base font-bold"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            stepIQ
          </span>
        </div>

        {/* Main nav — gap 4 */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = item.to && location.pathname.startsWith(item.to);
            const isPlaceholder =
              item.to !== "/dashboard" &&
              item.to !== "/pipelines" &&
              item.to !== "/runs" &&
              item.to !== "/schedules";
            if (isPlaceholder) {
              return (
                <span
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)]"
                >
                  <NavIcon
                    name={item.icon}
                    className="w-[18px] text-[var(--text-tertiary)]"
                  />
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
                <NavIcon
                  name={item.icon}
                  className={cn(
                    "w-[18px]",
                    active
                      ? "text-[var(--accent)]"
                      : "text-[var(--text-tertiary)]",
                  )}
                />
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
            <svg
              aria-hidden="true"
              focusable="false"
              className={cn(
                "w-[18px]",
                location.pathname.startsWith("/settings")
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)]",
              )}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.7 1.7 0 0 0-1.82-.33 1.7 1.7 0 0 0-1 1.54V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.82 1.7 1.7 0 0 0-1.54-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.7 1.7 0 0 0 1.82.33h.01a1.7 1.7 0 0 0 1-1.54V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.82v.01a1.7 1.7 0 0 0 1.54 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.54 1Z" />
            </svg>
            Settings
          </Link>
        </nav>

        {/* Divider */}
        <div className="-mx-5 h-px bg-[var(--divider)]" />

        {/* User row — gap 12 */}
        <div className="flex items-center gap-3">
          <div
            className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--text-secondary)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{displayName}</p>
            <p
              className="truncate text-[11px] text-[var(--text-tertiary)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {planName}
            </p>
          </div>
          <button
            type="button"
            title="Log out"
            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
            onClick={() => {
              trackLogout();
              clearToken();
              void clerk.signOut();
              navigate({ to: "/login" });
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Log out"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content — padding [32,40], gap 32 */}
      <main
        className="flex flex-1 flex-col overflow-auto px-10 py-8"
        style={{ gap: 32 }}
      >
        {/* Top bar */}
        {title || subtitle || actions ? (
          <header className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              {title ? <h1 className="text-2xl font-bold">{title}</h1> : null}
              {subtitle ? (
                <p className="text-sm text-[var(--text-tertiary)]">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex items-center gap-3">{actions}</div>
            ) : null}
          </header>
        ) : null}
        {children}
      </main>
    </div>
  );
}

function getInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}
