import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { promote } from "./promote/index.ts";
import { generateCodeTokens } from "./generate/index.ts";
import { generateTailwindTheme } from "./generate/tailwind.ts";
import type { SeedConfig } from "./types/seed-config.ts";
import type { FontFilesMap } from "./report/index.ts";

// A flag with no following value (or immediately followed by another flag,
// e.g. `--tailwind --out foo`) is a boolean flag — present means true, not
// "consume the next token as its value." Previously every flag unconditionally
// ate the next token, which would have silently swallowed `--out` as
// `--tailwind`'s own value the moment a real boolean flag got used.
function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = "true";
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

// Naming convention a caller (e.g. the SDSGT-start skill, which can reach
// the network) must follow when dropping font files for `promote` to embed:
// <fonts-dir>/<slugified family name>-<weight>.woff2 — e.g. "Source Sans Pro"
// weight 600 -> "source-sans-pro-600.woff2". 400/600/700 are the only
// weights typography.primitive ever generates, so those are the only ones
// looked up. Missing files are skipped silently — the report just falls
// back to its default system-font stack for that family/weight.
function slugFont(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function loadFontFiles(fontsDir: string | undefined, seed: SeedConfig): FontFilesMap | undefined {
  if (!fontsDir) return undefined;
  const families = [seed.primaryFont, seed.secondaryFont].filter((f): f is string => Boolean(f));
  const weights = [400, 600, 700] as const;
  const result: FontFilesMap = {};
  for (const family of families) {
    for (const weight of weights) {
      const path = join(fontsDir, `${slugFont(family)}-${weight}.woff2`);
      if (existsSync(path)) {
        result[family] ??= {};
        result[family][weight] = readFileSync(path).toString("base64");
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// Default output folders, always siblings under out/ — promote's DTCG spec
// is never consumed directly by an app (hence "non-consumables"), generate's
// code tokens are what a real project actually imports ("consumables").
const DEFAULT_TOKENS_DIR = "out/DTCG Token spec (non-consumables)";
const DEFAULT_CODE_DIR = "out/Code tokens (consumables)";

const USAGE = [
  "Usage:",
  '  node src/cli.ts promote --config <path> --out "<dir>" [--fonts-dir <dir>]',
  '  node src/cli.ts generate --tokens-dir "<dir>" --out "<dir>" [--tailwind]',
  "    --tailwind: also emit a Tailwind v4 @theme block with the primitive",
  "    color ramp relabeled onto Tailwind's native 50-950 keys. Only correct",
  "    for a Next.js/Vue.js + Tailwind project — Generate can't tell what the",
  "    original seed's target was, so this is opt-in, not auto-detected.",
].join("\n");

function runPromote(rest: string[]) {
  const args = parseArgs(rest);
  const configPath = args.config ?? "examples/sample-seed-config.json";
  const outDir = args.out ?? DEFAULT_TOKENS_DIR;

  let configText: string;
  try {
    configText = readFileSync(configPath, "utf-8");
  } catch {
    console.error(`Could not find config file: ${configPath}`);
    process.exit(1);
  }

  let seed: SeedConfig;
  try {
    seed = JSON.parse(configText) as SeedConfig;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`Config file is not valid JSON: ${configPath}\n  ${detail}`);
    process.exit(1);
  }

  const fontFiles = loadFontFiles(args["fonts-dir"], seed);

  const { files, warnings, reportHtml } = promote(seed, { fontFiles });

  mkdirSync(outDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(outDir, filename), `${JSON.stringify(content, null, 2)}\n`, "utf-8");
  }
  writeFileSync(join(outDir, "report.html"), reportHtml, "utf-8");

  console.log(`Wrote ${Object.keys(files).length} token files + report.html to ${outDir}/`);

  // Advisory only — flagged here (and in report.html) if a future check
  // populates `warnings`, but never blocks generation. See
  // "Accessibility checks are advisory, not a gate" in pipeline-plan.md.
  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} accessibility warning(s):`);
    for (const w of warnings) {
      console.warn(`  - ${w.token}: contrast ${w.ratio.toFixed(2)}:1, needs ${w.required}:1`);
    }
  }
}

async function runGenerate(rest: string[]) {
  const args = parseArgs(rest);
  // Deliberately a sibling of promote's own default output, not nested
  // inside it — the token spec and generated code never share a directory,
  // so re-running either step can't clobber the other.
  const tokensDir = args["tokens-dir"] ?? DEFAULT_TOKENS_DIR;
  const outDir = args.out ?? DEFAULT_CODE_DIR;

  if (!existsSync(tokensDir)) {
    console.error(`No token spec found at ${tokensDir} — run promote first (or pass --tokens-dir pointing at its output).`);
    process.exit(1);
  }

  const { filesWritten } = await generateCodeTokens(tokensDir, outDir);

  // Opt-in — the plain CSS platform above always runs regardless of target,
  // but the Tailwind relabel is only correct for a Tailwind-targeted
  // project. Generate doesn't know the original seed's targetFramework/
  // targetDesignLanguage (Promote's output carries no such metadata), so
  // the caller has to say so explicitly rather than Generate guessing.
  const tailwindFiles = args.tailwind !== undefined ? (await generateTailwindTheme(tokensDir, outDir)).filesWritten : [];

  const allFiles = [...filesWritten, ...tailwindFiles];
  console.log(`Wrote ${allFiles.length} code-token file(s) to ${outDir}/:`);
  for (const f of allFiles) {
    console.log(`  - ${f}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "promote") {
    runPromote(rest);
  } else if (command === "generate") {
    await runGenerate(rest);
  } else {
    console.error(`Unknown command: ${command ?? "(none)"}.\n\n${USAGE}`);
    process.exit(1);
  }
}

await main();
