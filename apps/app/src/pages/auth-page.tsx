import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { apiFetch } from "../lib/api";
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
      const body = mode === "login" ? { email, password } : { email, password, name };
      const response = await apiFetch<{ token: string }>(
        path,
        { method: "POST", body: JSON.stringify(body) },
        false,
      );
      setToken(response.token);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-bold">A</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            {mode === "login" ? "Sign in to continue" : "Start building AI pipelines"}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Name</span>
              <input
                className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Valentin"
                required
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Email</span>
            <input
              className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Password</span>
            <input
              className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={mode === "register" ? 8 : 1}
              required
            />
          </label>

          {error ? <p className="rounded-md bg-red-500/10 p-2 text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--bg-primary)] disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--divider)]" />
          <span className="text-xs text-[var(--text-muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--divider)]" />
        </div>

        <button
          type="button"
          className="w-full rounded-md border border-[var(--text-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
        >
          Continue with GitHub
        </button>

        <p className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <a className="font-semibold text-[var(--accent)]" href={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </a>
        </p>
      </div>
    </div>
  );
}
