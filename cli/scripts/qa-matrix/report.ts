// Report rendering + result-file writers. The console/return output stays
// concise on purpose (pass/fail counts, one-line notes on failures only) —
// full detail (every check, full error stack, generated file list) always
// goes to disk under cases/<id>.json instead, never to the summary, so a
// large batch's output can't overflow whoever's reading it.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { CaseRunResult } from "./types.ts";

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

export function renderTable(results: CaseRunResult[]): string {
  if (results.length === 0) return "(no cases matched the given filters)";
  const idW = Math.max(4, ...results.map((r) => r.id.length));
  const lines: string[] = [`${pad("Case", idW)}  Result  Checks  Notes`];
  for (const r of results) {
    const passed = r.checks.filter((c) => c.status === "PASS").length;
    const total = r.checks.length;
    const checksStr = total > 0 ? `${passed}/${total}` : "-";
    let note = "";
    if (r.error) {
      note = r.error.message;
    } else {
      const firstFail = r.checks.find((c) => c.status === "FAIL");
      const firstSkip = r.checks.find((c) => c.status === "SKIP");
      if (firstFail) note = `${firstFail.platform}: ${firstFail.name}`;
      else if (r.result === "SKIP" && firstSkip) note = firstSkip.detail ?? firstSkip.name;
    }
    lines.push(`${pad(r.id, idW)}  ${pad(r.result, 6)}  ${pad(checksStr, 6)}  ${note}`);
  }
  return lines.join("\n");
}

export function renderSummaryLine(results: CaseRunResult[], runDir: string): string {
  const counts = {
    pass: results.filter((r) => r.result === "PASS").length,
    fail: results.filter((r) => r.result === "FAIL").length,
    error: results.filter((r) => r.result === "ERROR").length,
    skip: results.filter((r) => r.result === "SKIP").length,
  };
  const totalChecks = results.reduce((n, r) => n + r.checks.length, 0);
  const anomalies = results.reduce((n, r) => n + r.checks.filter((c) => c.status === "FAIL").length, 0);
  return [
    `${counts.pass} passed, ${counts.fail} failed, ${counts.error} errored, ${counts.skip} skipped-only (${totalChecks} checks, ${anomalies} anomalies)`,
    `Full details: ${runDir}/`,
  ].join("\n");
}

export function writeRunResults(runDir: string, selector: string, results: CaseRunResult[]): void {
  mkdirSync(join(runDir, "cases"), { recursive: true });
  for (const r of results) {
    writeFileSync(join(runDir, "cases", `${r.id}.json`), JSON.stringify(r, null, 2), "utf-8");
  }

  const timestamp = new Date().toISOString();
  const summaryJson = {
    timestamp,
    selector,
    counts: {
      pass: results.filter((r) => r.result === "PASS").length,
      fail: results.filter((r) => r.result === "FAIL").length,
      error: results.filter((r) => r.result === "ERROR").length,
      skip: results.filter((r) => r.result === "SKIP").length,
    },
    cases: results.map((r) => ({
      id: r.id,
      group: r.group,
      result: r.result,
      checks: r.checks.length,
      failed: r.checks.filter((c) => c.status === "FAIL").length,
    })),
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summaryJson, null, 2), "utf-8");

  const md = [
    `# QA Matrix run — ${timestamp}`,
    "",
    `Selector: \`${selector}\``,
    "",
    "```",
    renderTable(results),
    "```",
    "",
    renderSummaryLine(results, runDir),
  ].join("\n");
  writeFileSync(join(runDir, "summary.md"), md, "utf-8");
}
