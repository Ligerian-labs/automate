import { loginSchema, registerSchema } from "@stepiq/core";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { serverIdentify, serverTrack } from "../lib/analytics.js";
import { config } from "../lib/env.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export const authRoutes = new Hono();

type OAuthState = {
  mode: "login" | "register";
  plan?: "starter" | "pro";
  interval?: "month" | "year";
};

type GithubAccessTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GithubUserResponse = {
  id: number;
  email: string | null;
  name: string | null;
  login: string;
};

type GithubEmailResponse = Array<{
  email: string;
  primary: boolean;
  verified: boolean;
}>;

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  sub?: string;
};

type ClerkUserResponse = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification?: { status?: string | null } | null;
  }>;
};

function githubConfigError(): string | null {
  if (!config.githubClientId) return "GitHub OAuth is not configured: GITHUB_CLIENT_ID is missing";
  if (!config.githubClientSecret)
    return "GitHub OAuth is not configured: GITHUB_CLIENT_SECRET is missing";
  return null;
}

function getGithubRedirectUri(): string {
  return config.githubRedirectUri || `${config.apiUrl}/api/auth/github/callback`;
}

function googleConfigError(): string | null {
  if (!config.googleClientId) return "Google OAuth is not configured: GOOGLE_CLIENT_ID is missing";
  if (!config.googleClientSecret)
    return "Google OAuth is not configured: GOOGLE_CLIENT_SECRET is missing";
  return null;
}

function getGoogleRedirectUri(): string {
  return config.googleRedirectUri || `${config.apiUrl}/api/auth/google/callback`;
}

function clerkConfigError(): string | null {
  if (!config.clerkSecretKey)
    return "Clerk is not configured: CLERK_SECRET_KEY is missing";
  if (!config.clerkJwksUrl)
    return "Clerk is not configured: CLERK_JWKS_URL is missing";
  return null;
}

let clerkJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getClerkJwks() {
  if (!clerkJwks) clerkJwks = createRemoteJWKSet(new URL(config.clerkJwksUrl));
  return clerkJwks;
}

async function createAuthToken(userId: string, plan: string) {
  return new SignJWT({ sub: userId, plan })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

function buildAppAuthRedirect(
  token: string,
  state: OAuthState,
  provider: "github" | "google",
  error?: string,
): string {
  const base = `${config.appUrl}/${state.mode === "register" ? "register" : "login"}`;
  const params = new URLSearchParams();
  if (error) {
    params.set("oauth_error", error);
  } else {
    params.set("oauth", provider);
    params.set("token", token);
    if (state.plan) params.set("plan", state.plan);
    if (state.interval) params.set("interval", state.interval);
  }
  return `${base}?${params.toString()}`;
}

async function fetchGithubPrimaryEmail(accessToken: string): Promise<string | null> {
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "stepiq-auth",
    },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as GithubUserResponse;
  if (user.email) return user.email;

  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "stepiq-auth",
    },
  });
  if (!emailsRes.ok) return null;
  const emails = (await emailsRes.json()) as GithubEmailResponse;
  const primaryVerified = emails.find((entry) => entry.primary && entry.verified);
  if (primaryVerified) return primaryVerified.email;
  const anyVerified = emails.find((entry) => entry.verified);
  return anyVerified?.email || null;
}

async function findOrCreateOAuthUser(input: {
  email: string;
  name?: string | null;
  provider: "github" | "google" | "clerk";
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing) return existing;

  const randomPassword = `${randomUUID()}-${Date.now()}`;
  const passwordHash = await bcrypt.hash(randomPassword, 12);
  const [created] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      name: input.name || input.email.split("@")[0] || "OAuth User",
    })
    .returning();
  serverIdentify(created.id, { email: created.email, plan: created.plan });
  serverTrack(created.id, "user_registered", {
    email: created.email,
    provider: input.provider,
  });
  return created;
}

async function fetchClerkUser(userId: string): Promise<ClerkUserResponse | null> {
  const res = await fetch(`${config.clerkApiUrl}/v1/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${config.clerkSecretKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as ClerkUserResponse;
}

function getPrimaryClerkEmail(user: ClerkUserResponse): string | null {
  const primary = user.email_addresses.find(
    (item) => item.id === user.primary_email_address_id,
  );
  if (primary?.email_address) return primary.email_address;
  const verified = user.email_addresses.find(
    (item) => item.verification?.status === "verified",
  );
  return verified?.email_address || user.email_addresses[0]?.email_address || null;
}

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { email, password, name } = parsed.data;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0)
    return c.json({ error: "Email already registered" }, 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .returning({ id: users.id, email: users.email, plan: users.plan });

  const token = await createAuthToken(user.id, user.plan);

  serverIdentify(user.id, { email: user.email, plan: user.plan });
  serverTrack(user.id, "user_registered", { email: user.email });

  return c.json({ user, token }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);

  const token = await createAuthToken(user.id, user.plan);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    token,
  });
});

authRoutes.post("/clerk/exchange", async (c) => {
  const configErr = clerkConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const header = c.req.header("Authorization");
  const clerkToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!clerkToken) return c.json({ error: "Missing Clerk bearer token" }, 401);

  let clerkUserId: string | null = null;
  try {
    const { payload } = await jwtVerify(clerkToken, getClerkJwks());
    clerkUserId = typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return c.json({ error: "Invalid Clerk token" }, 401);
  }

  if (!clerkUserId) return c.json({ error: "Invalid Clerk token subject" }, 401);

  const clerkUser = await fetchClerkUser(clerkUserId);
  if (!clerkUser) return c.json({ error: "Unable to fetch Clerk user" }, 401);

  const email = getPrimaryClerkEmail(clerkUser);
  if (!email) return c.json({ error: "Clerk user has no email address" }, 422);

  const name =
    [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    email.split("@")[0] ||
    "Clerk User";

  const user = await findOrCreateOAuthUser({
    email,
    name,
    provider: "clerk",
  });

  const token = await createAuthToken(user.id, user.plan);
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  });
});

authRoutes.get("/github/start", async (c) => {
  const configErr = githubConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const modeRaw = c.req.query("mode");
  const mode = modeRaw === "register" ? "register" : "login";
  const planRaw = c.req.query("plan");
  const intervalRaw = c.req.query("interval");
  const plan = planRaw === "starter" || planRaw === "pro" ? planRaw : undefined;
  const interval =
    intervalRaw === "month" || intervalRaw === "year" ? intervalRaw : undefined;

  const statePayload: OAuthState = { mode, plan, interval };
  const state = await new SignJWT(statePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret);

  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: getGithubRedirectUri(),
    scope: "read:user user:email",
    state,
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

authRoutes.get("/github/callback", async (c) => {
  const configErr = githubConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const code = c.req.query("code");
  const stateRaw = c.req.query("state");
  if (!code || !stateRaw) {
    return c.redirect(
      buildAppAuthRedirect(
        "",
        { mode: "login" },
        "github",
        "Missing OAuth callback parameters",
      ),
    );
  }

  let state: OAuthState;
  try {
    const verified = await jwtVerify(stateRaw, secret);
    const payload = verified.payload as OAuthState;
    state = {
      mode: payload.mode === "register" ? "register" : "login",
      plan: payload.plan,
      interval: payload.interval,
    };
  } catch {
    return c.redirect(
      buildAppAuthRedirect("", { mode: "login" }, "github", "Invalid OAuth state"),
    );
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "stepiq-auth",
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: getGithubRedirectUri(),
      state: stateRaw,
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect(
      buildAppAuthRedirect("", state, "github", "GitHub token exchange failed"),
    );
  }
  const tokenBody = (await tokenRes.json()) as GithubAccessTokenResponse;
  if (!tokenBody.access_token) {
    return c.redirect(
      buildAppAuthRedirect(
        "",
        state,
        "github",
        tokenBody.error_description || "GitHub OAuth denied",
      ),
    );
  }

  const email = await fetchGithubPrimaryEmail(tokenBody.access_token);
  if (!email) {
    return c.redirect(
      buildAppAuthRedirect("", state, "github", "Unable to read GitHub email"),
    );
  }

  const user = await findOrCreateOAuthUser({
    email,
    provider: "github",
    name: email.split("@")[0] || "GitHub User",
  });
  const token = await createAuthToken(user.id, user.plan);
  return c.redirect(buildAppAuthRedirect(token, state, "github"));
});

authRoutes.get("/google/start", async (c) => {
  const configErr = googleConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const modeRaw = c.req.query("mode");
  const mode = modeRaw === "register" ? "register" : "login";
  const planRaw = c.req.query("plan");
  const intervalRaw = c.req.query("interval");
  const plan = planRaw === "starter" || planRaw === "pro" ? planRaw : undefined;
  const interval =
    intervalRaw === "month" || intervalRaw === "year" ? intervalRaw : undefined;

  const statePayload: OAuthState = { mode, plan, interval };
  const state = await new SignJWT(statePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret);

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
});

authRoutes.get("/google/callback", async (c) => {
  const configErr = googleConfigError();
  if (configErr) return c.json({ error: configErr }, 503);

  const error = c.req.query("error");
  if (error) {
    return c.redirect(
      buildAppAuthRedirect(
        "",
        { mode: "login" },
        "google",
        `Google OAuth failed: ${error}`,
      ),
    );
  }

  const code = c.req.query("code");
  const stateRaw = c.req.query("state");
  if (!code || !stateRaw) {
    return c.redirect(
      buildAppAuthRedirect(
        "",
        { mode: "login" },
        "google",
        "Missing OAuth callback parameters",
      ),
    );
  }

  let state: OAuthState;
  try {
    const verified = await jwtVerify(stateRaw, secret);
    const payload = verified.payload as OAuthState;
    state = {
      mode: payload.mode === "register" ? "register" : "login",
      plan: payload.plan,
      interval: payload.interval,
    };
  } catch {
    return c.redirect(
      buildAppAuthRedirect("", { mode: "login" }, "google", "Invalid OAuth state"),
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect(
      buildAppAuthRedirect("", state, "google", "Google token exchange failed"),
    );
  }
  const tokenBody = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenBody.access_token) {
    return c.redirect(
      buildAppAuthRedirect(
        "",
        state,
        "google",
        tokenBody.error_description || "Google OAuth denied",
      ),
    );
  }

  const userInfoRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        Accept: "application/json",
      },
    },
  );
  if (!userInfoRes.ok) {
    return c.redirect(
      buildAppAuthRedirect("", state, "google", "Unable to read Google profile"),
    );
  }

  const userInfo = (await userInfoRes.json()) as GoogleUserInfoResponse;
  if (!userInfo.email) {
    return c.redirect(
      buildAppAuthRedirect("", state, "google", "Unable to read Google email"),
    );
  }

  const user = await findOrCreateOAuthUser({
    email: userInfo.email,
    provider: "google",
    name: userInfo.name || userInfo.email.split("@")[0] || "Google User",
  });
  const token = await createAuthToken(user.id, user.plan);
  return c.redirect(buildAppAuthRedirect(token, state, "google"));
});
