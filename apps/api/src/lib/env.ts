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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4321",
  port: Number(process.env.PORT) || 3001,
} as const;
