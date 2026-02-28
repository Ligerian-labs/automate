import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/pages/docs");
const files = readdirSync(root).filter((f) => f.endsWith(".astro"));

const routeToFile = new Map();
const idsByRoute = new Map();

for (const file of files) {
  const route =
    file === "index.astro" ? "/docs" : `/docs/${file.replace(/\.astro$/, "")}`;
  const fullPath = join(root, file);
  const content = readFileSync(fullPath, "utf8");

  routeToFile.set(route, file);

  const ids = new Set();
  for (const match of content.matchAll(/\sid="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  idsByRoute.set(route, ids);
}

const issues = [];
const hrefPattern = /href="([^"]+)"/g;

for (const [route, file] of routeToFile.entries()) {
  const fullPath = join(root, file);
  const content = readFileSync(fullPath, "utf8");

  for (const match of content.matchAll(hrefPattern)) {
    const href = match[1];

    if (!href.startsWith("/docs")) {
      continue;
    }

    const [targetRoute, hash] = href.split("#");
    if (!routeToFile.has(targetRoute)) {
      issues.push(`${file}: unknown docs route '${href}'`);
      continue;
    }

    if (hash) {
      const targetIds = idsByRoute.get(targetRoute);
      if (!targetIds?.has(hash)) {
        issues.push(`${file}: unknown anchor '${href}'`);
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Docs link check failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Docs link check passed for ${files.length} files.`);
