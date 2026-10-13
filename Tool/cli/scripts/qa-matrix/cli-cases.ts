// The 5 CLI-level regression cases (bug class #6) — real `node src/cli.ts
// ...` shell-outs, not direct function imports, since the point is to
// exercise the actual argument-parsing/error-handling layer in cli.ts, not
// the underlying promote()/generate*() functions the rest of the matrix
// calls directly.
//
// Each case runs in its own throwaway temp directory as cwd — never the
// real cli/ working tree, so a QA run can't clobber a developer's real
// cli/out/. Node resolves cli.ts's own relative imports (style-dictionary,
// etc.) against cli.ts's own file location, not cwd, so no node_modules
// copy is needed in the temp dir.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { CaseRunResult, CheckResult } from "./types.ts";
import { verdictFromChecks } from "./types.ts";
import { buildFigmaComponentsPushPlan } from "../../src/scaffold/figma-components-plan.ts";

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI_ENTRY = join(CLI_ROOT, "src", "cli.ts");
const EXAMPLE_CONFIG = join(CLI_ROOT, "examples", "sample-seed-config.json");

export const CLI_CASE_IDS = ["CLI-1", "CLI-2", "CLI-3", "CLI-4", "CLI-5", "CLI-6"];

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): RunResult {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd, encoding: "utf-8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function expect(checks: CheckResult[], name: string, ok: boolean, expected: string, actual: string, detail?: string): void {
  checks.push(ok ? { name, platform: "cli", status: "PASS" } : { name, platform: "cli", status: "FAIL", expected, actual, detail });
}

function makeResult(id: string, commands: string[], checks: CheckResult[], durationMs: number): CaseRunResult {
  return { id, group: "cli", seed: null, commands, platformsRun: [], result: verdictFromChecks(checks), checks, error: null, generatedFiles: [], durationMs };
}

function caseCli1(): CaseRunResult {
  const start = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "sdsgt-qa-"));
  const args = ["promote", "--config", join(tmp, "does-not-exist.json"), "--out", join(tmp, "out")];
  const { status, stderr } = runCli(args, tmp);
  const checks: CheckResult[] = [];
  expect(checks, "exits with code 1", status === 1, "1", String(status));
  expect(checks, "stderr mentions 'Could not find config file:'", stderr.includes("Could not find config file:"), "message present", stderr.slice(0, 300));
  expect(checks, "no raw stack trace in stderr", !/\n\s*at /.test(stderr), "no stack trace", /\n\s*at /.test(stderr) ? "stack trace present" : "n/a");
  rmSync(tmp, { recursive: true, force: true });
  return makeResult("CLI-1", [`node src/cli.ts ${args.join(" ")}`], checks, Date.now() - start);
}

function caseCli2(): CaseRunResult {
  const start = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "sdsgt-qa-"));
  const badConfig = join(tmp, "bad.json");
  writeFileSync(badConfig, "{ not valid json ", "utf-8");
  const args = ["promote", "--config", badConfig, "--out", join(tmp, "out")];
  const { status, stderr } = runCli(args, tmp);
  const checks: CheckResult[] = [];
  expect(checks, "exits with code 1", status === 1, "1", String(status));
  expect(checks, "stderr mentions 'Config file is not valid JSON:'", stderr.includes("Config file is not valid JSON:"), "message present", stderr.slice(0, 300));
  rmSync(tmp, { recursive: true, force: true });
  return makeResult("CLI-2", [`node src/cli.ts ${args.join(" ")}`], checks, Date.now() - start);
}

function caseCli3(): CaseRunResult {
  const start = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "sdsgt-qa-"));
  const args = ["generate", "--tokens-dir", join(tmp, "no-such-tokens"), "--out", join(tmp, "out")];
  const { status, stderr } = runCli(args, tmp);
  const checks: CheckResult[] = [];
  expect(checks, "exits with code 1", status === 1, "1", String(status));
  expect(checks, "stderr mentions 'No token spec found at'", stderr.includes("No token spec found at"), "message present", stderr.slice(0, 300));
  rmSync(tmp, { recursive: true, force: true });
  return makeResult("CLI-3", [`node src/cli.ts ${args.join(" ")}`], checks, Date.now() - start);
}

// CLI-4/5 are coupled — CLI-5 (`generate` with default flags) reads what
// CLI-4 (`promote` with default --out) wrote, in the same temp cwd. Both
// always run when either is requested; the caller filters which result(s)
// it wants back.
function caseCli4And5(): [CaseRunResult, CaseRunResult] {
  const tmp = mkdtempSync(join(tmpdir(), "sdsgt-qa-"));

  const start4 = Date.now();
  const args4 = ["promote", "--config", EXAMPLE_CONFIG];
  const r4 = runCli(args4, tmp);
  const checks4: CheckResult[] = [];
  expect(checks4, "exits with code 0", r4.status === 0, "0", String(r4.status), r4.stderr.slice(0, 300));
  const defaultTokensFile = join(tmp, "out", "DTCG Token spec (non-consumables)", "color.primitive.json");
  expect(checks4, "default tokens dir populated", existsSync(defaultTokensFile), "file present", existsSync(defaultTokensFile) ? "present" : "missing");
  const result4 = makeResult("CLI-4", [`node src/cli.ts ${args4.join(" ")}`], checks4, Date.now() - start4);

  const start5 = Date.now();
  const args5: string[] = ["generate"];
  const r5 = runCli(args5, tmp);
  const checks5: CheckResult[] = [];
  expect(checks5, "exits with code 0", r5.status === 0, "0", String(r5.status), r5.stderr.slice(0, 300));
  const defaultCodeFile = join(tmp, "out", "Code tokens (consumables)", "css", "tokens.css");
  expect(checks5, "default code-tokens dir populated", existsSync(defaultCodeFile), "file present", existsSync(defaultCodeFile) ? "present" : "missing");
  const result5 = makeResult("CLI-5", [`node src/cli.ts ${args5.join(" ")}`], checks5, Date.now() - start5);

  rmSync(tmp, { recursive: true, force: true });
  return [result4, result5];
}


// CLI-6 — Figma push drift check (Batch 16 of figma-component-variations-plan.md). The vendored shadcn/ui
// components already ship every variation; the Figma push plan models them as properties. If a future shadcn
// release adds a variant/size/orientation key (or a whole new axis) the plan has not seen, this fails instead of
// the new option silently missing from Figma. Rule: every cva `variant` / `size` / `orientation` key in a mapped
// vendored file must be BUILT (a plan variant or axis option) or LISTED in the plan's skipped list
// (`skippedVariants` / the axis' `skippedOptions`). Uses its OWN tiny parser (not the plan builder's) so a builder
// that fails to read a key cannot hide it. Needs a real vendored shadcn/ui folder; SKIPs when there is none
// (point SDSGT_VENDORED_UI_DIR at a freshly scaffolded project's src/components/ui to check a new release).
const FIGMA_DRIFT_MAP: Array<{ file: string; component: string; axis: string; planAxis: "Variant" | "Size" | "Orientation" | "Style" }> = [
  { file: "button.tsx", component: "Button", axis: "variant", planAxis: "Variant" },
  { file: "button.tsx", component: "Button", axis: "size", planAxis: "Size" },
  { file: "badge.tsx", component: "Badge", axis: "variant", planAxis: "Variant" },
  { file: "toggle.tsx", component: "Toggle", axis: "variant", planAxis: "Variant" },
  { file: "toggle.tsx", component: "Toggle", axis: "size", planAxis: "Size" },
  { file: "alert.tsx", component: "Alert", axis: "variant", planAxis: "Variant" },
  { file: "item.tsx", component: "Item", axis: "variant", planAxis: "Variant" },
  { file: "item.tsx", component: "Item", axis: "size", planAxis: "Size" },
  { file: "attachment.tsx", component: "Attachment", axis: "size", planAxis: "Size" },
  { file: "attachment.tsx", component: "Attachment", axis: "orientation", planAxis: "Orientation" },
  { file: "bubble.tsx", component: "Bubble", axis: "variant", planAxis: "Variant" },
  { file: "field.tsx", component: "Field", axis: "orientation", planAxis: "Orientation" },
  { file: "tabs.tsx", component: "Tabs", axis: "variant", planAxis: "Style" },
  { file: "marker.tsx", component: "Marker", axis: "variant", planAxis: "Variant" },
];

// Keys of one cva axis, e.g. `size: { default: "...", xs: "..." }` -> ["default","xs"].
function cvaAxisKeys(source: string, axis: string): string[] | null {
  const block = source.match(new RegExp(`\\n {6}${axis}:\\s*\\{([\\s\\S]*?)\\n {6}\\},?`));
  if (!block) return null;
  const keys: string[] = [];
  for (const m of block[1].matchAll(/^ {8}(?:["']([a-zA-Z0-9-]+)["']|([a-zA-Z0-9-]+)):/gm)) keys.push((m[1] ?? m[2]).toLowerCase());
  return keys;
}

// Every cva axis name written in a vendored file (6-space indent inside `variants: {`).
function cvaAxisNames(source: string): string[] {
  const afterVariants = source.split("variants: {")[1];
  if (!afterVariants) return [];
  return [...afterVariants.matchAll(/^ {6}([a-zA-Z]+): \{/gm)].map((m) => m[1]);
}

function caseCli6(): CaseRunResult {
  const start = Date.now();
  const checks: CheckResult[] = [];
  const uiDir = process.env.SDSGT_VENDORED_UI_DIR ?? join(CLI_ROOT, "..", "..", "Demo", "sdsgt-demo-app", "src", "components", "ui");
  const commands = [`buildFigmaComponentsPushPlan(<tokens>, ${uiDir})`];
  if (!existsSync(uiDir)) {
    checks.push({ name: "vendored shadcn/ui source available", platform: "cli", status: "SKIP", detail: `no folder at ${uiDir}; set SDSGT_VENDORED_UI_DIR to a scaffolded project's src/components/ui to run the Figma drift check` });
    return makeResult("CLI-6", commands, checks, Date.now() - start);
  }
  const tmp = mkdtempSync(join(tmpdir(), "sdsgt-qa-"));
  try {
    const p = runCli(["promote", "--config", EXAMPLE_CONFIG], tmp);
    const g = runCli(["generate"], tmp);
    expect(checks, "tokens for the plan generated (promote + generate)", p.status === 0 && g.status === 0, "exit 0 and 0", `${p.status} and ${g.status}`, (p.stderr + g.stderr).slice(0, 300));
    const codeDir = join(tmp, "out", "Code tokens (consumables)");
    const plan = buildFigmaComponentsPushPlan(codeDir, uiDir);
    const byName = new Map(plan.components.map((c) => [c.name, c]));
    const seenFiles = new Set<string>();
    for (const { file, component, axis, planAxis } of FIGMA_DRIFT_MAP) {
      const path = join(uiDir, file);
      if (!existsSync(path)) { checks.push({ name: `${file} ${axis}: file vendored`, platform: "cli", status: "SKIP", detail: `${file} is not in the vendored folder` }); continue; }
      const source = readFileSync(path, "utf-8");
      seenFiles.add(file);
      const keys = cvaAxisKeys(source, axis);
      const comp = byName.get(component);
      const name = `${file} ${axis}: every cva key is built or listed as skipped in the plan's ${component} ${planAxis}`;
      if (!keys) { checks.push({ name, platform: "cli", status: "FAIL", expected: `a cva "${axis}" axis in ${file}`, actual: "axis not found (shadcn changed the file's shape?)" }); continue; }
      if (!comp) { checks.push({ name, platform: "cli", status: "FAIL", expected: `${component} in the plan`, actual: "component missing from the plan" }); continue; }
      let known: string[];
      if (planAxis === "Variant") known = [...comp.variants.map((v) => v.name), ...comp.skippedVariants.map((v) => v.name)];
      else {
        const a = comp.extraAxes?.find((x) => x.propertyName === planAxis);
        known = a ? [...a.options.map((o) => o.name), ...a.skippedOptions.map((o) => o.name)] : [];
      }
      const knownLower = new Set(known.map((n) => n.toLowerCase()));
      const missing = keys.filter((k) => !knownLower.has(k));
      expect(checks, name, missing.length === 0, "every key built or skipped", `not in the plan: ${missing.join(", ")}`, `source keys: ${keys.join(", ")}; plan knows: ${known.join(", ")}`);
    }
    // A brand-new cva axis (not variant/size/orientation) in a mapped file would also go unseen.
    const mappedAxes = new Set(FIGMA_DRIFT_MAP.map((m) => m.axis));
    for (const file of seenFiles) {
      const extra = cvaAxisNames(readFileSync(join(uiDir, file), "utf-8")).filter((a) => !mappedAxes.has(a));
      expect(checks, `${file}: no cva axis outside variant/size/orientation`, extra.length === 0, "none", extra.join(", "), "a new axis needs a decision (build it or add it to the drift map)");
    }
  } catch (e) {
    checks.push({ name: "plan built from the vendored folder", platform: "cli", status: "FAIL", expected: "plan built without error", actual: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return makeResult("CLI-6", commands, checks, Date.now() - start);
}

export function runCliCases(ids: string[]): CaseRunResult[] {
  const results: CaseRunResult[] = [];
  if (ids.includes("CLI-1")) results.push(caseCli1());
  if (ids.includes("CLI-2")) results.push(caseCli2());
  if (ids.includes("CLI-3")) results.push(caseCli3());
  if (ids.includes("CLI-6")) results.push(caseCli6());
  if (ids.includes("CLI-4") || ids.includes("CLI-5")) {
    const [c4, c5] = caseCli4And5();
    if (ids.includes("CLI-4")) results.push(c4);
    if (ids.includes("CLI-5")) results.push(c5);
  }
  return results;
}
