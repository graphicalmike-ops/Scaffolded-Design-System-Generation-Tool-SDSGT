// Shared types for the QA matrix harness. Kept separate from matrix.ts/
// checks.ts/report.ts/cli-cases.ts to avoid circular imports between them.

import type { SeedConfig } from "../../src/types/seed-config.ts";

export type PlatformFlag = "tailwind" | "bootstrap" | "md2" | "md3" | "swiftui";
export const ALL_PLATFORMS: PlatformFlag[] = ["tailwind", "bootstrap", "md2", "md3", "swiftui"];

export type CaseGroup = "core" | "achromatic" | "mismatch" | "baseline" | "boundary" | "cli";

export interface QaCase {
  id: string;
  group: CaseGroup;
  seed: SeedConfig;
}

export type CheckStatus = "PASS" | "FAIL" | "SKIP";

export interface CheckResult {
  name: string;
  platform: "css" | "cli" | PlatformFlag;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  detail?: string;
}

export type CaseVerdict = "PASS" | "FAIL" | "ERROR" | "SKIP";

export interface CaseRunResult {
  id: string;
  group: CaseGroup;
  seed: SeedConfig | null;
  commands: string[];
  platformsRun: string[];
  result: CaseVerdict;
  checks: CheckResult[];
  error: { message: string; stack?: string } | null;
  generatedFiles: string[];
  durationMs: number;
}

// A case is PASS only if every check passed; SKIP-only (no FAIL, at least
// one SKIP, e.g. missing swiftc) reports as SKIP so environment gaps never
// masquerade as regressions; any FAIL makes the whole case FAIL.
export function verdictFromChecks(checks: CheckResult[]): CaseVerdict {
  if (checks.some((c) => c.status === "FAIL")) return "FAIL";
  if (checks.length > 0 && checks.every((c) => c.status === "SKIP")) return "SKIP";
  return "PASS";
}
