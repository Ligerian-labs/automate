import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { identifyUser, trackLogin, trackSignUp } from "../lib/analytics";
import { type UserMe, apiFetch } from "../lib/api";
import { clearToken, setToken } from "../lib/auth";

type ClerkExchangeResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    plan: string;
  };
};

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      exchangedRef.current = false;
      clearToken();
      return;
    }
    if (exchangedRef.current) return;

    exchangedRef.current = true;
    void (async () => {
      setError(null);
      const clerkToken = await getToken();
      if (!clerkToken) throw new Error("Failed to get Clerk token");

      const response = await apiFetch<ClerkExchangeResponse>(
        "/api/auth/clerk/exchange",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${clerkToken}` },
        },
        false,
      );
      setToken(response.token);

      try {
        const me = await apiFetch<UserMe>("/api/user/me");
        identifyUser(me);
      } catch {
        // non-critical
      }

      if (mode === "register") trackSignUp(response.user.email);
      else trackLogin(response.user.email);

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
    })().catch((err) => {
      clearToken();
      exchangedRef.current = false;
      setError(err instanceof Error ? err.message : "Authentication failed");
    });
  }, [getToken, isLoaded, isSignedIn, mode, navigate]);

  const forceRedirectUrl = `${window.location.pathname}${window.location.search}`;

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4">
      <div className="flex w-full max-w-[460px] flex-col gap-3 rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {mode === "login" ? (
          <SignIn
            path="/login"
            routing="path"
            signUpUrl="/register"
            forceRedirectUrl={forceRedirectUrl}
          />
        ) : (
          <SignUp
            path="/register"
            routing="path"
            signInUrl="/login"
            forceRedirectUrl={forceRedirectUrl}
          />
        )}
      </div>
    </div>
  );
}
