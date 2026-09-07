import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { promote } from "./promote/index.ts";
import type { SeedConfig } from "./types/seed-config.ts";
import type { FontFilesMap } from "./report/index.ts";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i += 1;
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

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== "promote") {
    console.error(`Unknown command: ${command ?? "(none)"}. Usage: node src/cli.ts promote --config <path> --out <dir>`);
    process.exit(1);
  }

  const args = parseArgs(rest);
  const configPath = args.config ?? "examples/sample-seed-config.json";
  const outDir = args.out ?? "out/tokens";

  const seed = JSON.parse(readFileSync(configPath, "utf-8")) as SeedConfig;
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

main();
