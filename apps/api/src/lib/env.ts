export interface Env {
  userId?: string;
  userPlan?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const jwtSecret = requireEnv("JWT_SECRET");
if (jwtSecret === "change-me-in-production") {
  throw new Error("JWT_SECRET must not use the default placeholder value");
}

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://stepiq:stepiq@localhost:5432/stepiq",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  jwtSecret,
  apiUrl: process.env.API_URL || "http://localhost:3001",
  githubClientId: process.env.GITHUB_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  githubRedirectUri: process.env.GITHUB_REDIRECT_URI || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkJwksUrl: process.env.CLERK_JWKS_URL || "",
  clerkApiUrl: process.env.CLERK_API_URL || "https://api.clerk.com",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceStarterMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY_EUR || "",
  stripePriceStarterYearly: process.env.STRIPE_PRICE_STARTER_YEARLY_EUR || "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY_EUR || "",
  stripePriceProYearly: process.env.STRIPE_PRICE_PRO_YEARLY_EUR || "",
  authorizedAdminEmails: (process.env.AUTHORIZED_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  appUrl: process.env.APP_URL || "http://localhost:5173",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4321",
  port: Number(process.env.PORT) || 3001,
} as const;
