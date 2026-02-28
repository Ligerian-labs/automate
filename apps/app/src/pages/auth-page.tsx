import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { identifyUser, trackLogin, trackSignUp } from "../lib/analytics";
import { type UserMe, apiFetch } from "../lib/api";
import { setToken } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login" ? { email, password } : { email, password, name };
      const response = await apiFetch<{ token: string }>(
        path,
        { method: "POST", body: JSON.stringify(body) },
        false,
      );
      setToken(response.token);

      // Identify user for analytics
      try {
        const me = await apiFetch<UserMe>("/api/user/me");
        identifyUser(me);
      } catch {
        /* non-critical */
      }
      if (mode === "register") trackSignUp(email);
      else trackLogin(email);

      const params = new URLSearchParams(window.location.search);
      const plan = params.get("plan");
      const interval = params.get("interval");
      if (
        (plan === "starter" || plan === "pro") &&
        (interval === "month" || interval === "year")
      ) {
        window.location.href = `/settings?tab=Billing&plan=${plan}&interval=${interval}`;
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4">
      {/* Auth card — 420px, cornerRadius 16, padding 40, gap 32 */}
      <div
        className="flex w-full max-w-[420px] flex-col rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-10 shadow-2xl"
        style={{ gap: 32 }}
      >
        {/* Logo — icon 36x36 cornerRadius 8, gap 10, font JetBrains Mono 20/700 */}
        <div className="flex flex-col items-center" style={{ gap: 10 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <div className="grid size-9 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--bg-primary)]">
              sQ
            </div>
            <span
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              stepIQ
            </span>
          </div>
          {/* Header — gap 8 */}
          <div className="mt-2 flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-sm text-[var(--text-tertiary)]">
              {mode === "login"
                ? "Sign in to continue to stepIQ"
                : "Start building AI pipelines"}
            </p>
          </div>
        </div>

        {/* Form — gap 16 */}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                Name
              </span>
              <input
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Valentin"
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
              Email
            </span>
            <input
              className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                Password
              </span>
              {mode === "login" ? (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--accent)]"
                >
                  Forgot?
                </button>
              ) : null}
            </div>
            <input
              className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              minLength={mode === "register" ? 8 : 1}
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {/* Submit — cornerRadius 8, padding [14,0], font 15/600 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] py-3.5 text-[15px] font-semibold text-[var(--bg-primary)] transition-opacity disabled:opacity-60 hover:opacity-90"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {/* Divider — gap 16 */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-[var(--divider)]" />
          <span className="text-xs text-[var(--text-muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--divider)]" />
        </div>

        {/* GitHub — cornerRadius 8, padding [12,0], gap 10 */}
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--text-muted)] py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="GitHub"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>

        {/* Sign up link — gap 6, font 13 */}
        <p className="text-center text-[13px] text-[var(--text-tertiary)]">
          {mode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}{" "}
          <a
            className="font-semibold text-[var(--accent)] hover:underline"
            href={mode === "login" ? "/register" : "/login"}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </a>
        </p>
      </div>
    </div>
  );
}
