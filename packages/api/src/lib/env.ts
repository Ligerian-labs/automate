export interface Env {
  userId?: string;
  userPlan?: string;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL || "postgres://automate:automate@localhost:5432/automate",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4321",
  port: Number(process.env.PORT) || 3001,
} as const;
