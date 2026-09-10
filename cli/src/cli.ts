import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { promote } from "./promote/index.ts";
import { buildFigmaPushPlan } from "./promote/figma-plan.ts";
import { generateCodeTokens } from "./generate/index.ts";
import { generateTailwindTheme } from "./generate/tailwind.ts";
import { generateBootstrapVariables } from "./generate/bootstrap.ts";
import { generateMd2 } from "./generate/md2.ts";
import { generateMd3 } from "./generate/md3.ts";
import { generateSwiftUI } from "./generate/swiftui.ts";
import { generateShadcn } from "./generate/shadcn.ts";
import { generateRnr } from "./generate/rnr.ts";
import { generateRnPaper } from "./generate/rn-paper.ts";
import { generateVuetify } from "./generate/vuetify.ts";
import { writeProjectDocs } from "./generate/project-docs.ts";
import { buildTailwindDemo, buildBootstrapDemo, buildMuiDemo, buildMd3Demo, buildSwiftUIDemo, buildShadcnDemo, buildRnrDemo, buildRnPaperDemo, buildVuetifyDemo } from "./generate/demo.ts";
import type { SeedConfig, TargetFramework } from "./types/seed-config.ts";
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
  '  node src/cli.ts generate --tokens-dir "<dir>" --out "<dir>" [--tailwind] [--bootstrap]',
  "    --tailwind: also emit a Tailwind v4 @theme block with the primitive",
  "    color ramp relabeled onto Tailwind's native 50-950 keys. Only correct",
  "    for a Next.js/Vue.js + Tailwind project — Generate can't tell what the",
  "    original seed's target was, so this is opt-in, not auto-detected.",
  "    --bootstrap: also emit a Bootstrap Sass variables partial",
  "    ($primary/$secondary/$success/$danger/$warning/$info plus a few",
  "    $border-radius-* variables). Serves React-Bootstrap and",
  "    bootstrap-vue-next as-is — both consume plain Bootstrap Sass",
  "    variables directly, with no separate variable convention of their",
  "    own (verified — contracts-and-seeds.md, \"shadcn/ui theming\"'s",
  "    sibling note). Opt-in, not auto-detected, same reason as --tailwind.",
  "    --md2: also emit MUI-shaped TS files (relabeled 50-900 color ramp +",
  "    a derived main/light/dark/contrastText palette). Only correct for a",
  "    MUI/Vuetify/RN Paper project — opt-in, same reason as --tailwind.",
  "    --md3: also emit a Kotlin Color.kt with a real HCT-derived",
  "    LightColorScheme/DarkColorScheme (via Google's Material Color",
  "    Utilities) plus precomputed elevation overlays. Only correct for a",
  "    Jetpack Compose Material3 project — opt-in, same reason as --tailwind.",
  "    --swiftui: also emit a Swift DesignTokens.swift with the resolved",
  "    semantic color tokens as native Color values. Only correct for a",
  "    SwiftUI native iOS project — opt-in, same reason as --tailwind.",
  "    --shadcn: also emit a shadcn/ui theme.css with SDSGT's semantic",
  "    tokens mapped onto shadcn's own CSS variable names (--primary,",
  "    --card, --muted, etc.) plus SDSGT status-role extensions",
  "    (--success/--warning/--info/--promo) shadcn has no native slot for.",
  "    Uses shadcn's own .dark class selector, not this project's usual",
  "    [data-theme=\"dark\"] convention — see contracts-and-seeds.md,",
  "    \"shadcn/ui theming.\" This only emits the theme file — it does not",
  "    run `shadcn init`/`shadcn add` or install any components. Also",
  "    serves shadcn-vue as-is (verified — identical CSS variable",
  "    convention). Opt-in, same reason as --tailwind.",
  "    --rnr: also emit a React Native Reusables (RNR) theme — global.css",
  "    (same semantic mapping as --shadcn, but raw \"H S% L%\" triplets, not",
  "    hex — NativeWind's own requirement) plus constants.ts (NAV_THEME,",
  "    React Navigation's own Theme.colors shape). Only correct for an",
  "    Expo/React Native + NativeWind + RNR project — opt-in, same reason",
  "    as --tailwind. See contracts-and-seeds.md, \"React Native Reusables",
  "    (RNR) theming.\"",
  "    --rn-paper: also emit a React Native Paper MD3 theme.ts (real HCT",
  "    ColorScheme, reusing the same computation as --md3, reshaped onto",
  "    Paper's own MD3Theme.colors role subset plus its shadow/",
  "    surfaceDisabled/onSurfaceDisabled/backdrop/elevation extras). Only",
  "    correct for a React Native Paper project — opt-in, same reason as",
  "    --tailwind. See contracts-and-seeds.md, \"React Native Paper theming.\"",
  "    --vuetify: also emit a Vuetify 4 theme.ts (lightTheme/darkTheme,",
  "    each a ThemeDefinition — primary/secondary/background/surface/",
  "    error/info/success/warning; Vuetify's own runtime derives on-*/",
  "    lighten/darken variants from these). Only correct for a Vuetify",
  "    project — opt-in, same reason as --tailwind. See",
  "    contracts-and-seeds.md, \"Vuetify theming.\"",
  "",
  "  Every generate run also writes AGENTS.md, foundations-rules.md, and",
  "  design.md (see contracts-and-seeds.md/pipeline-plan.md, \"Agent rule",
  "  files\") — unconditional, not gated by any platform flag. Each platform",
  "  flag above additionally writes a matching",
  "  <platform>-design-system-demo.html proof-of-work page next to its code",
  "  files, using the same visual template as promote's report.html but",
  "  relabeled with that platform's own real generated identifiers.",
  "",
  "    --framework <nextjs|vuejs|react-native|kotlin|swiftui>: states the",
  "    original seed's targetFramework, same opt-in reasoning as the",
  "    platform flags above. Only affects AGENTS.md's NativeWind rule, which",
  "    only applies to a React Native + Tailwind (NativeWind) project —",
  "    omitted entirely if this flag isn't passed, or isn't react-native.",
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

  // Written unconditionally, same "harmless if unused" treatment as
  // report.html — pure, deterministic, network-free (see figma-plan.ts's
  // file header). The actual push only happens if the seed's figmaManaged
  // is true and a real Figma connection exists, but the plan itself costs
  // nothing to compute either way.
  const figmaPlan = buildFigmaPushPlan(outDir);
  writeFileSync(join(outDir, "figma-push-plan.json"), `${JSON.stringify(figmaPlan, null, 2)}\n`, "utf-8");

  console.log(`Wrote ${Object.keys(files).length} token files + report.html + figma-push-plan.json to ${outDir}/`);

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

  // Same opt-in reasoning as --tailwind above — Generate can't tell what the
  // original seed's targetFramework/targetDesignLanguage was, so the caller
  // has to say so explicitly.
  const bootstrapFiles = args.bootstrap !== undefined ? generateBootstrapVariables(tokensDir, outDir).filesWritten : [];
  const md2Files = args.md2 !== undefined ? generateMd2(tokensDir, outDir).filesWritten : [];
  const md3Files = args.md3 !== undefined ? generateMd3(tokensDir, outDir).filesWritten : [];
  const swiftuiFiles = args.swiftui !== undefined ? generateSwiftUI(tokensDir, outDir).filesWritten : [];
  const shadcnFiles = args.shadcn !== undefined ? generateShadcn(tokensDir, outDir).filesWritten : [];
  const rnrFiles = args.rnr !== undefined ? generateRnr(tokensDir, outDir).filesWritten : [];
  const rnPaperFiles = args["rn-paper"] !== undefined ? generateRnPaper(tokensDir, outDir).filesWritten : [];
  const vuetifyFiles = args.vuetify !== undefined ? generateVuetify(tokensDir, outDir).filesWritten : [];

  // Proof-of-work demo pages — one per platform flag actually passed, same
  // opt-in reasoning as the code-token generators above. See generate/demo.ts.
  const demoFiles = [
    ...(args.tailwind !== undefined ? buildTailwindDemo(tokensDir, outDir, tailwindFiles).filesWritten : []),
    ...(args.bootstrap !== undefined ? buildBootstrapDemo(tokensDir, outDir, bootstrapFiles).filesWritten : []),
    ...(args.md2 !== undefined ? buildMuiDemo(tokensDir, outDir, md2Files).filesWritten : []),
    ...(args.md3 !== undefined ? buildMd3Demo(tokensDir, outDir, md3Files).filesWritten : []),
    ...(args.swiftui !== undefined ? buildSwiftUIDemo(tokensDir, outDir, swiftuiFiles).filesWritten : []),
    ...(args.shadcn !== undefined ? buildShadcnDemo(tokensDir, outDir, shadcnFiles).filesWritten : []),
    ...(args.rnr !== undefined ? buildRnrDemo(tokensDir, outDir, rnrFiles).filesWritten : []),
    ...(args["rn-paper"] !== undefined ? buildRnPaperDemo(tokensDir, outDir, rnPaperFiles).filesWritten : []),
    ...(args.vuetify !== undefined ? buildVuetifyDemo(tokensDir, outDir, vuetifyFiles).filesWritten : []),
  ];

  // Unconditional — every generate run gets its agent-facing docs, not
  // gated by any platform flag. See generate/project-docs.ts.
  const framework = args.framework as TargetFramework | undefined;
  const docFiles = writeProjectDocs(outDir, {
    hasTailwind: args.tailwind !== undefined,
    isReactNative: framework === "react-native",
    hasShadcn: args.shadcn !== undefined,
    hasRnr: args.rnr !== undefined,
    hasRnPaper: args["rn-paper"] !== undefined,
    hasVuetify: args.vuetify !== undefined,
  }).filesWritten;

  const allFiles = [...filesWritten, ...tailwindFiles, ...bootstrapFiles, ...md2Files, ...md3Files, ...swiftuiFiles, ...shadcnFiles, ...rnrFiles, ...rnPaperFiles, ...vuetifyFiles, ...demoFiles, ...docFiles];
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
