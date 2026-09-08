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
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { CaseRunResult, CheckResult } from "./types.ts";
import { verdictFromChecks } from "./types.ts";

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI_ENTRY = join(CLI_ROOT, "src", "cli.ts");
const EXAMPLE_CONFIG = join(CLI_ROOT, "examples", "sample-seed-config.json");

export const CLI_CASE_IDS = ["CLI-1", "CLI-2", "CLI-3", "CLI-4", "CLI-5"];

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

export function runCliCases(ids: string[]): CaseRunResult[] {
  const results: CaseRunResult[] = [];
  if (ids.includes("CLI-1")) results.push(caseCli1());
  if (ids.includes("CLI-2")) results.push(caseCli2());
  if (ids.includes("CLI-3")) results.push(caseCli3());
  if (ids.includes("CLI-4") || ids.includes("CLI-5")) {
    const [c4, c5] = caseCli4And5();
    if (ids.includes("CLI-4")) results.push(c4);
    if (ids.includes("CLI-5")) results.push(c5);
  }
  return results;
}
