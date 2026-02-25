import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgres://stepiq:stepiq@localhost:5432/stepiq",
  },
});
//# sourceMappingURL=drizzle.config.js.map
