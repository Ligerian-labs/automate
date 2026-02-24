import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

async function main() {
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
