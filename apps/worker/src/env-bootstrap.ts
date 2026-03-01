import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let bootstrapped = false;

function stripInlineComment(value: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "#" && !inSingle && !inDouble) return value.slice(0, i).trim();
  }
  return value.trim();
}

function normalizeEnvValue(raw: string): string {
  const value = stripInlineComment(raw.trim());
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function bootstrapWorkerEnv() {
  if (bootstrapped) return;
  bootstrapped = true;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env"),
    resolve(here, "../../.env"),
    resolve(here, "../../../.env"),
    resolve(here, "../../../../.env"),
  ];

  const file = candidates.find((path) => existsSync(path));
  if (!file) return;

  const content = readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const exportLine = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
    const eq = exportLine.indexOf("=");
    if (eq <= 0) continue;

    const key = exportLine.slice(0, eq).trim();
    if (!key) continue;
    const current = process.env[key];
    if (current !== undefined && current.trim().length > 0) continue;

    const value = normalizeEnvValue(exportLine.slice(eq + 1));
    process.env[key] = value;
  }
  if (process.env.NODE_ENV !== "test") {
    console.log(`🔐 Loaded worker env from ${file}`);
  }
}
