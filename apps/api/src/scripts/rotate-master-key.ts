import { reWrapSecret } from "@stepiq/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { userSecrets } from "../db/schema.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseHexKey(name: string): Buffer {
  const hex = requireEnv(name);
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL || "postgres://stepiq:stepiq@localhost:5432/stepiq";
  const oldMasterKey = parseHexKey("ROTATE_OLD_MASTER_KEY");
  const newMasterKey = parseHexKey("ROTATE_NEW_MASTER_KEY");
  const newKeyVersionRaw = requireEnv("ROTATE_NEW_KEY_VERSION");
  const newKeyVersion = Number(newKeyVersionRaw);
  const dryRun = process.env.ROTATE_DRY_RUN === "true";

  if (!Number.isInteger(newKeyVersion) || newKeyVersion < 1) {
    throw new Error("ROTATE_NEW_KEY_VERSION must be a positive integer");
  }
  if (oldMasterKey.equals(newMasterKey)) {
    throw new Error("Old and new master keys must be different");
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    const startedAt = Date.now();
    const secrets = await db
      .select({
        id: userSecrets.id,
        userId: userSecrets.userId,
        name: userSecrets.name,
        encryptedValue: userSecrets.encryptedValue,
        keyVersion: userSecrets.keyVersion,
      })
      .from(userSecrets);

    console.log(
      `Found ${secrets.length} secret(s). Target key_version=${newKeyVersion}. dry_run=${dryRun}`,
    );

    if (secrets.length === 0) {
      console.log("No secrets found. Nothing to rotate.");
      return;
    }

    await db.transaction(async (tx) => {
      for (const secret of secrets) {
        const blob = Buffer.from(secret.encryptedValue, "base64");
        const rotated = await reWrapSecret(
          secret.userId,
          blob,
          oldMasterKey,
          newMasterKey,
        );

        if (!dryRun) {
          await tx
            .update(userSecrets)
            .set({
              encryptedValue: rotated.toString("base64"),
              keyVersion: newKeyVersion,
              updatedAt: new Date(),
            })
            .where(eq(userSecrets.id, secret.id));
        }
      }
    });

    const durationMs = Date.now() - startedAt;
    if (dryRun) {
      console.log(
        `Dry run successful. ${secrets.length} secret(s) validated for rotation in ${durationMs}ms.`,
      );
    } else {
      console.log(
        `Rotation successful. ${secrets.length} secret(s) updated to key_version=${newKeyVersion} in ${durationMs}ms.`,
      );
    }
  } finally {
    await client.end();
    oldMasterKey.fill(0);
    newMasterKey.fill(0);
  }
}

main().catch((error) => {
  console.error("Master key rotation failed:", error);
  process.exit(1);
});
