import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { config } from "../lib/env.js";
import type { Env } from "../lib/env.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export const requireAuth = createMiddleware<{ Variables: Env }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    const headerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const queryToken = c.req.query("token");
    const token = headerToken || queryToken;
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      c.set("userId", payload.sub as string);
      c.set("userPlan", payload.plan as string);
      await next();
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  },
);
