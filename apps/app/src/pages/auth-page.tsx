import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { identifyUser, trackLogin, trackSignUp } from "../lib/analytics";
import { type UserMe, apiFetch } from "../lib/api";
import { setToken } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const finalizeAuth = useCallback(
    async (token: string) => {
      setToken(token);

      let trackedEmail = email;
      try {
        const me = await apiFetch<UserMe>("/api/user/me");
        identifyUser(me);
        trackedEmail = me.email || trackedEmail;
      } catch {
        // non-critical
      }

      if (trackedEmail) {
        if (mode === "register") trackSignUp(trackedEmail);
        else trackLogin(trackedEmail);
      }

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
    },
    [email, mode, navigate],
  );

  function continueWithGithub() {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    const interval = params.get("interval");
    const query = new URLSearchParams({ mode });
    if (plan === "starter" || plan === "pro") query.set("plan", plan);
    if (interval === "month" || interval === "year")
      query.set("interval", interval);
    window.location.href = `${apiUrl}/api/auth/github/start?${query.toString()}`;
  }

  function continueWithGoogle() {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    const interval = params.get("interval");
    const query = new URLSearchParams({ mode });
    if (plan === "starter" || plan === "pro") query.set("plan", plan);
    if (interval === "month" || interval === "year")
      query.set("interval", interval);
    window.location.href = `${apiUrl}/api/auth/google/start?${query.toString()}`;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    const oauthToken = params.get("token");
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!oauthToken) return;
    void finalizeAuth(oauthToken).catch((err) => {
      setError(err instanceof Error ? err.message : "Authentication failed");
    });
  }, [finalizeAuth]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, name, verification_code: verificationCode };
      const response = await apiFetch<{ token: string }>(
        path,
        { method: "POST", body: JSON.stringify(body) },
        false,
      );
      await finalizeAuth(response.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendVerificationCode() {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email first");
      return;
    }
    setSendingCode(true);
    try {
      const response = await apiFetch<{ dev_code?: string }>(
        "/api/auth/register/request-code",
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        },
        false,
      );
      setCodeSent(true);
      if (response.dev_code) {
        setVerificationCode(response.dev_code);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send verification code",
      );
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4">
      <div
        className="flex w-full max-w-[420px] flex-col rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-10 shadow-2xl"
        style={{ gap: 32 }}
      >
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

          {mode === "register" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  Verification code
                </span>
                <button
                  type="button"
                  onClick={sendVerificationCode}
                  disabled={sendingCode}
                  className="text-xs font-medium text-[var(--accent)] disabled:opacity-50"
                >
                  {sendingCode
                    ? "Sending..."
                    : codeSent
                      ? "Resend code"
                      : "Send code"}
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                required
              />
            </div>
          ) : null}

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

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-[var(--divider)]" />
          <span className="text-xs text-[var(--text-muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--divider)]" />
        </div>

        <button
          type="button"
          onClick={continueWithGithub}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--text-muted)] py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          Continue with GitHub
        </button>
        <button
          type="button"
          onClick={continueWithGoogle}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--text-muted)] py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          Continue with Google
        </button>

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
