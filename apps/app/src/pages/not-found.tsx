import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-6 text-[var(--text-primary)]">
      <div className="w-full max-w-md rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          The page you are looking for does not exist.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            to="/dashboard"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--bg-primary)]"
          >
            Dashboard
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-[var(--divider)] px-3 py-2 text-sm text-[var(--text-secondary)]"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
