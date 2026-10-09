// Regenerates a figma-components-push-plan.json without re-scaffolding, so a
// change to figma-components-plan.ts can be diffed against a saved baseline.
//
// Usage (from Tool/cli):
//   node scripts/regen-components-plan.ts --out <path>
//   node scripts/regen-components-plan.ts [--code-dir <dir>] [--ui-dir <dir>] [--out <path>]
// Defaults point at the Demo project (paths are relative to the repo root).
// With no --out, the JSON is printed to stdout.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildFigmaComponentsPushPlan } from "../src/scaffold/figma-components-plan.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const codeDir = resolve(repoRoot, flag("--code-dir") ?? "Demo/out/Code tokens (consumables)/sdsgt-demo");
const uiDir = resolve(repoRoot, flag("--ui-dir") ?? "Demo/sdsgt-demo-app/src/components/ui");
const out = flag("--out");

const plan = buildFigmaComponentsPushPlan(codeDir, uiDir);
const json = `${JSON.stringify(plan, null, 2)}\n`;

if (out) {
  writeFileSync(resolve(process.cwd(), out), json, "utf-8");
  console.error(`Wrote ${resolve(process.cwd(), out)}`);
} else {
  process.stdout.write(json);
}
