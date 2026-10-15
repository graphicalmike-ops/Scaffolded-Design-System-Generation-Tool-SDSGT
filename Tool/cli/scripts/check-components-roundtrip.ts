// Component pull, step 1b check (2026-10-15): proves that the push plan READS every recorded
// class from the code, so a pull that edits a class is picked up by the next push instead of
// being silently undone (pipeline-plan.md, component pull step 1b).
//
// For every distinct class origin in figma-components-sources (file + location + class), it
// swaps that class for a different class of the same kind (px-2 -> px-4, text-sm -> text-lg,
// rounded-lg -> rounded-sm, bg-muted -> bg-primary, ...) in a scratch copy of the vendored
// components, rebuilds the plan, and checks that every binding that pointed at the old class
// now points at the NEW class and binds a different variable. A binding that keeps the old
// variable or the old class means a builder still uses a typed-in value.
//
// Usage (from Tool/cli; also `npm run check:components-roundtrip`):
//   node scripts/check-components-roundtrip.ts [--code-dir <dir>] [--ui-dir <dir>] [--component <Name>] [--work-dir <dir>]
// Defaults point at the Demo project. Exit code 1 when any swap fails.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { buildFigmaComponentsPushPlanWithSources } from "../src/scaffold/figma-components-plan.ts";
import type { FigmaComponentSourceRecord } from "../src/scaffold/figma-components-sources.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const codeDir = resolve(repoRoot, flag("--code-dir") ?? "Demo/out/Code tokens (consumables)/sdsgt-demo");
const uiDir = resolve(repoRoot, flag("--ui-dir") ?? "Demo/sdsgt-demo-app/src/components/ui");
const workDir = resolve(repoRoot, flag("--work-dir") ?? ".tmp/components-roundtrip");
const onlyComponent = flag("--component");

// The core class after any variant prefix (`hover:`, `has-data-[slot=x]:`), split at the last
// `:` outside square brackets.
function splitPrefix(full: string): { prefix: string; core: string } {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < full.length; i++) {
    if (full[i] === "[") depth++;
    else if (full[i] === "]") depth--;
    else if (full[i] === ":" && depth === 0) cut = i;
  }
  return { prefix: full.slice(0, cut + 1), core: full.slice(cut + 1) };
}

const COLOR_NAMES = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "destructive", "border", "input", "ring"];
// Replacement colour per utility, tried in order: the first that differs from the original name
// and from what it maps to. Never `secondary` (only exists with a secondary brand colour) and never
// `destructive` (special-cased by the builders).
const COLOR_SWAPS: Record<string, string[]> = {
  bg: ["primary", "muted", "card"],
  text: ["primary", "muted-foreground", "foreground"],
  border: ["primary", "ring", "border"],
  ring: ["primary", "ring"],
};
const SAME_COLOR_GROUPS = [["card", "popover"], ["card-foreground", "popover-foreground"], ["border", "input"]];

// A different class of the same kind, or null when the class's kind isn't swappable.
function swapCore(core: string): string | null {
  const spacing = core.match(/^(px|py|pl|pr|pt|pb|p|gap|gap-x|gap-y|h|w|size)-(\d+(?:\.\d+)?)$/);
  if (spacing) return `${spacing[1]}-${parseFloat(spacing[2]) === 4 ? 8 : 4}`;
  if (/^text-(?:xs|sm|base|lg|\[\d*\.?\d+rem\])$/.test(core)) return core === "text-lg" ? "text-xs" : "text-lg";
  if (/^rounded-(?:none|sm|md|lg|xl|2xl|3xl|4xl|full)$/.test(core)) return core === "rounded-sm" ? "rounded-xl" : "rounded-sm";
  // Arbitrary-value radius (`rounded-[4px]`, `rounded-[min(var(--radius-md),10px)]`): a pull would write a named class.
  if (/^rounded-\[.+\]$/.test(core)) return core.includes("min(") ? "rounded-sm" : "rounded-full";
  // Card's `[--card-spacing:--spacing(N)]` and a font size with a line height (`text-sm/relaxed`).
  const cardSpacing = core.match(/^\[--card-spacing:--spacing\((\d+(?:\.\d+)?)\)\]$/);
  if (cardSpacing) return `[--card-spacing:--spacing(${parseFloat(cardSpacing[1]) === 4 ? 8 : 4})]`;
  const leading = core.match(/^text-(?:xs|sm|base|lg)(\/[a-z0-9.]+)$/);
  if (leading) return `text-${core.startsWith("text-lg") ? "xs" : "lg"}${leading[1]}`;
  const color = core.match(/^(bg|text|border|ring)-([a-z-]+?)(\/\d+)?$/);
  if (color && COLOR_NAMES.includes(color[2])) {
    const same = SAME_COLOR_GROUPS.find((g) => g.includes(color[2])) ?? [color[2]];
    const swap = COLOR_SWAPS[color[1]].find((n) => !same.includes(n) && n !== color[2]);
    return swap ? `${color[1]}-${swap}${color[3] ?? ""}` : null;
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keyOf = (r: FigmaComponentSourceRecord) => `${r.component}|${JSON.stringify(r.combination)}|${r.part ?? ""}|${r.property}`;

const base = buildFigmaComponentsPushPlanWithSources(codeDir, uiDir).sources.records;
const groups = new Map<string, FigmaComponentSourceRecord[]>();
for (const r of base) {
  if (r.origin !== "class") continue;
  if (onlyComponent && r.component !== onlyComponent) continue;
  const k = `${r.file}\u0000${r.location}\u0000${r.class}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
const workUi = join(workDir, "ui");
cpSync(uiDir, workUi, { recursive: true });

let failed = 0;
const notSwappable: string[] = [];
for (const [, records] of groups) {
  const { file, location, class: full } = records[0] as FigmaComponentSourceRecord & { file: string; location: string; class: string };
  const { prefix, core } = splitPrefix(full);
  const swappedCore = swapCore(core);
  if (!swappedCore) {
    notSwappable.push(`${file} ${location}: ${full}`);
    continue;
  }
  const swapped = prefix + swappedCore;
  const path = join(workUi, file);
  const original = readFileSync(path, "utf-8");
  const pattern = new RegExp(`(?<=^|[\\s"'\`])${escapeRe(full)}(?=$|[\\s"'\`])`, "g");
  writeFileSync(path, original.replace(pattern, swapped), "utf-8");
  let after: FigmaComponentSourceRecord[];
  try {
    after = buildFigmaComponentsPushPlanWithSources(codeDir, workUi).sources.records;
  } catch (e) {
    failed++;
    console.log(`FAIL ${file} ${location}: ${full} -> ${swapped}: the plan build threw: ${(e as Error).message.split("\n")[0]}`);
    continue;
  } finally {
    writeFileSync(path, original, "utf-8");
  }
  const afterByKey = new Map(after.map((r) => [keyOf(r), r]));
  const problems: string[] = [];
  for (const r of records) {
    const a = afterByKey.get(keyOf(r));
    const where = `${r.component} ${Object.values(r.combination).join("/")}${r.part ? ` ${r.part}` : ""} ${r.property}`;
    if (!a) problems.push(`${where}: binding disappeared`);
    else if (a.origin !== "class" || a.class !== swapped) problems.push(`${where}: origin is ${a.origin === "class" ? `class '${a.class}'` : `derived (${a.reason})`}, expected '${swapped}'`);
    else if (a.variable === r.variable) problems.push(`${where}: still binds ${r.variable}`);
  }
  if (problems.length > 0) {
    failed++;
    console.log(`FAIL ${file} ${location}: ${full} -> ${swapped} (${records.length} bindings)`);
    for (const p of problems.slice(0, 4)) console.log(`     ${p}`);
    if (problems.length > 4) console.log(`     ... and ${problems.length - 4} more`);
  }
}

console.log(`\n${groups.size} class origins: ${groups.size - failed - notSwappable.length} follow a code change, ${failed} fail, ${notSwappable.length} not swappable by this check.`);
if (notSwappable.length > 0) console.log(`Not swappable (checked by hand instead):\n  ${notSwappable.join("\n  ")}`);
rmSync(workDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
