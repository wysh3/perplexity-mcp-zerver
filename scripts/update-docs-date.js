import { execSync } from "node:child_process";
// scripts/update-docs-date.js
import fs from "node:fs";
import path from "node:path";

const files = [
  path.join(path.dirname(new URL(import.meta.url).pathname), "../docs/best-practices.md"),
  path.join(path.dirname(new URL(import.meta.url).pathname), "../docs/dependencies.md"),
  path.join(path.dirname(new URL(import.meta.url).pathname), "../docs/refactor-guide-phase-1.md"),
];

// Security: Use full path to avoid PATH injection attacks
const date = execSync("/bin/date").toString().trim();
const lastUpdatedLine = `_Last updated: ${date}_`;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/_Last updated:.*_/, lastUpdatedLine);
  fs.writeFileSync(file, content, "utf8");
  console.log(`Updated: ${file}`);
}
