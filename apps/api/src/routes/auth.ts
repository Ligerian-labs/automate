import { Hono } from "hono";
import { SignJWT } from "jose";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { config } from "../lib/env.js";
import { registerSchema, loginSchema } from "@automate/core";

const secret = new TextEncoder().encode(config.jwtSecret);

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { email, password, name } = parsed.data;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return c.json({ error: "Email already registered" }, 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .returning({ id: users.id, email: users.email, plan: users.plan });

  const token = await new SignJWT({ sub: user.id, plan: user.plan })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);

  return c.json({ user, token }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);

  const token = await new SignJWT({ sub: user.id, plan: user.plan })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    token,
  });
});
