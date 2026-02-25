import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Standalone migration script — does NOT import env.ts to avoid
// requiring JWT_SECRET and other API-only env vars.
const databaseUrl = process.env.DATABASE_URL || "postgres://stepiq:stepiq@localhost:5432/stepiq";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

async function main() {
  console.log(`Running migrations from ${migrationsFolder}...`);
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await client.end();
  console.log("Migrations complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
