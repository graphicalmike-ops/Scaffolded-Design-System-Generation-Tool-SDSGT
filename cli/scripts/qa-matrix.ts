// QA matrix entrypoint. Runs promote()/generate*() directly (in-process,
// not shelled out) for the 30 seed-based cases, plus real `node src/cli.ts`
// shell-outs for the 5 CLI-level cases (see qa-matrix/cli-cases.ts).
//
// Designed to run in slices across multiple turns/sessions, not all at
// once — see --list/--case/--group/--language/--platform/--batch below.
// There is deliberately no --all: a bare invocation refuses to run and
// prints usage instead, so a QA pass never dumps everything by accident.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { promote } from "../src/promote/index.ts";
import { generateCodeTokens } from "../src/generate/index.ts";
import { generateTailwindTheme } from "../src/generate/tailwind.ts";
import { generateBootstrapVariables } from "../src/generate/bootstrap.ts";
import { generateMd2 } from "../src/generate/md2.ts";
import { generateMd3 } from "../src/generate/md3.ts";
import { generateSwiftUI } from "../src/generate/swiftui.ts";
import { generateShadcn } from "../src/generate/shadcn.ts";
import { generateRnr } from "../src/generate/rnr.ts";
import { generateRnPaper } from "../src/generate/rn-paper.ts";
import { generateVuetify } from "../src/generate/vuetify.ts";
import type { SeedConfig } from "../src/types/seed-config.ts";

import { getSeedCases } from "./qa-matrix/matrix.ts";
import { runCliCases, CLI_CASE_IDS } from "./qa-matrix/cli-cases.ts";
import { checkCss, checkTailwind, checkBootstrap, checkMd2, checkMd3, checkSwiftui, checkShadcn, checkRnr, checkRnPaper, checkVuetify } from "./qa-matrix/checks.ts";
import { renderTable, renderSummaryLine, writeRunResults } from "./qa-matrix/report.ts";
import { ALL_PLATFORMS, verdictFromChecks } from "./qa-matrix/types.ts";
import type { CaseRunResult, CheckResult, PlatformFlag, QaCase } from "./qa-matrix/types.ts";

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = [
  "Usage: node scripts/qa-matrix.ts [flags]",
  "",
  "  --list                 Print the resolved case table and exit. No side effects.",
  "  --dry-run              Print exactly what would run (commands + seed JSON), without executing.",
  "  --case=<id[,id...]>    Run only the named case IDs.",
  "  --group=<g[,g...]>     Run only these groups: core, achromatic, mismatch, baseline, boundary, cli.",
  "  --language=<l[,l...]>  Run only seed cases whose targetDesignLanguage is one of these (tailwind, bootstrap, md3, md2).",
  "  --platform=<p[,p...]>  Restrict which generate flag(s)/checks run per seed case: tailwind, bootstrap, md2, md3, swiftui, shadcn, rnr, rn-paper, vuetify (all built).",
  "                         (Plain CSS checks always run regardless — it's the always-on base platform.)",
  "  --batch=<i>/<n>        Split the resolved case list into n fixed-order chunks, run chunk i (1-indexed).",
  "  --out=<dir>            Override the run's output directory (default: a timestamped dir under qa-results/runs/).",
  "",
  "No flags at all refuses to run (prints this + --list) — there is no --all, on purpose.",
].join("\n");

interface Args {
  list: boolean;
  dryRun: boolean;
  case?: string[];
  group?: string[];
  language?: string[];
  platform?: PlatformFlag[];
  batch?: { i: number; n: number };
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string> = {};
  const flags = new Set<string>();
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq === -1) flags.add(token.slice(2));
    else raw[token.slice(2, eq)] = token.slice(eq + 1);
  }
  const list = (key: string) => (raw[key] !== undefined ? raw[key].split(",") : undefined);
  const batchRaw = raw.batch;
  let batch: Args["batch"];
  if (batchRaw) {
    const [iStr, nStr] = batchRaw.split("/");
    batch = { i: parseInt(iStr, 10), n: parseInt(nStr, 10) };
  }
  return {
    list: flags.has("list"),
    dryRun: flags.has("dry-run"),
    case: list("case"),
    group: list("group"),
    language: list("language"),
    platform: list("platform") as PlatformFlag[] | undefined,
    batch,
    out: raw.out,
  };
}

interface ResolvedCase {
  id: string;
  group: string;
  kind: "seed" | "cli";
  seed?: SeedConfig;
}

function resolveCases(args: Args): ResolvedCase[] {
  let seedCases: QaCase[] = getSeedCases();
  let cliIds: string[] = [...CLI_CASE_IDS];

  if (args.language) {
    seedCases = seedCases.filter((c) => args.language!.includes(c.seed.targetDesignLanguage));
    cliIds = []; // CLI cases have no seed/design language to filter on
  }
  if (args.group) {
    seedCases = seedCases.filter((c) => args.group!.includes(c.group));
    if (!args.group.includes("cli")) cliIds = [];
  }
  if (args.case) {
    const ids = new Set(args.case);
    seedCases = seedCases.filter((c) => ids.has(c.id));
    cliIds = cliIds.filter((id) => ids.has(id));
  }

  let resolved: ResolvedCase[] = [
    ...seedCases.map((c): ResolvedCase => ({ id: c.id, group: c.group, kind: "seed", seed: c.seed })),
    ...cliIds.map((id): ResolvedCase => ({ id, group: "cli", kind: "cli" })),
  ];

  if (args.batch) {
    const { i, n } = args.batch;
    const chunkSize = Math.ceil(resolved.length / n);
    resolved = resolved.slice((i - 1) * chunkSize, i * chunkSize);
  }

  return resolved;
}

function describeCase(rc: ResolvedCase): string {
  if (rc.kind === "cli") return `${rc.id} [cli] — CLI-level error-handling regression`;
  const s = rc.seed!;
  const secondary = s.secondaryColor ? "secondary" : "no-secondary";
  return `${rc.id} [${rc.group}] — ${s.targetDesignLanguage}, ${s.lightDarkMode}, ${secondary}, ${s.neutralColorStyle}, primary=${s.primaryColor}`;
}

async function runSeedCase(qc: QaCase, runDir: string, platforms: PlatformFlag[]): Promise<CaseRunResult> {
  const start = Date.now();
  const caseDir = join(runDir, "generated", qc.id);
  const tokensDir = join(caseDir, "tokens");
  const codeDir = join(caseDir, "code");
  const commands: string[] = [];
  const generatedFiles: string[] = [];

  try {
    const { files, reportHtml } = promote(qc.seed, {});
    mkdirSync(tokensDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(tokensDir, filename), `${JSON.stringify(content, null, 2)}\n`, "utf-8");
    }
    writeFileSync(join(tokensDir, "report.html"), reportHtml, "utf-8");
    commands.push(`promote(${qc.id} seed) -> ${tokensDir}`);

    const base = await generateCodeTokens(tokensDir, codeDir);
    generatedFiles.push(...base.filesWritten);
    commands.push(`generateCodeTokens -> ${codeDir}`);

    const checks: CheckResult[] = [...checkCss(tokensDir, codeDir, qc.seed)];

    for (const platform of platforms) {
      commands.push(`generate --${platform} -> ${codeDir}`);
      switch (platform) {
        case "tailwind": {
          const r = await generateTailwindTheme(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkTailwind(tokensDir, codeDir, qc.seed));
          break;
        }
        case "bootstrap": {
          const r = generateBootstrapVariables(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkBootstrap(tokensDir, codeDir, qc.seed));
          break;
        }
        case "md2": {
          const r = generateMd2(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkMd2(tokensDir, codeDir, qc.seed));
          break;
        }
        case "md3": {
          const r = generateMd3(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkMd3(tokensDir, codeDir, qc.seed));
          break;
        }
        case "swiftui": {
          const r = generateSwiftUI(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkSwiftui(tokensDir, codeDir, qc.seed));
          break;
        }
        case "shadcn": {
          const r = generateShadcn(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkShadcn(tokensDir, codeDir, qc.seed));
          break;
        }
        case "rnr": {
          const r = generateRnr(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkRnr(tokensDir, codeDir, qc.seed));
          break;
        }
        case "rn-paper": {
          const r = generateRnPaper(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkRnPaper(tokensDir, codeDir, qc.seed));
          break;
        }
        case "vuetify": {
          const r = generateVuetify(tokensDir, codeDir);
          generatedFiles.push(...r.filesWritten);
          checks.push(...checkVuetify(tokensDir, codeDir, qc.seed));
          break;
        }
      }
    }

    return {
      id: qc.id, group: qc.group, seed: qc.seed, commands, platformsRun: platforms,
      result: verdictFromChecks(checks), checks, error: null, generatedFiles, durationMs: Date.now() - start,
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return {
      id: qc.id, group: qc.group, seed: qc.seed, commands, platformsRun: platforms,
      result: "ERROR", checks: [], error: { message: e.message, stack: e.stack }, generatedFiles, durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const noSelector = !args.list && !args.dryRun && !args.case && !args.group && !args.language && !args.batch;
  if (noSelector) {
    console.log(USAGE);
    console.log("");
    for (const rc of resolveCases(args)) console.log(describeCase(rc));
    process.exit(1);
  }

  const resolved = resolveCases(args);

  if (args.list) {
    for (const rc of resolved) console.log(describeCase(rc));
    console.log(`\n${resolved.length} case(s) match.`);
    return;
  }

  const platforms = args.platform ?? ALL_PLATFORMS;

  if (args.dryRun) {
    for (const rc of resolved) {
      console.log(describeCase(rc));
      if (rc.kind === "seed") {
        console.log(`  seed: ${JSON.stringify(rc.seed)}`);
        console.log(`  would run: promote -> generateCodeTokens -> [${platforms.join(", ")}]`);
      } else {
        console.log("  would shell out to: node src/cli.ts ... (see qa-matrix/cli-cases.ts)");
      }
    }
    console.log(`\n${resolved.length} case(s) would run (no execution performed).`);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const selector = JSON.stringify({ case: args.case, group: args.group, language: args.language, platform: args.platform, batch: args.batch });
  const selectorSlug = args.group?.join("+") ?? args.language?.join("+") ?? args.case?.join("+") ?? "custom";
  const runDir = args.out ?? join(CLI_ROOT, "qa-results", "runs", `${timestamp}-${selectorSlug}`);
  mkdirSync(runDir, { recursive: true });

  const results: CaseRunResult[] = [];
  const seedCases = resolved.filter((rc): rc is ResolvedCase & { kind: "seed"; seed: SeedConfig } => rc.kind === "seed");
  const cliIds = resolved.filter((rc) => rc.kind === "cli").map((rc) => rc.id);

  for (const rc of seedCases) {
    const qc: QaCase = { id: rc.id, group: rc.group as QaCase["group"], seed: rc.seed };
    results.push(await runSeedCase(qc, runDir, platforms));
  }
  if (cliIds.length > 0) {
    results.push(...runCliCases(cliIds));
  }

  console.log(`SDSGT QA Matrix — run ${timestamp}`);
  console.log(`Selected: ${selector} (${results.length} case(s))`);
  console.log("");
  console.log(renderTable(results));
  console.log("");
  console.log(renderSummaryLine(results, runDir));

  writeRunResults(runDir, selector, results);
}

await main();
