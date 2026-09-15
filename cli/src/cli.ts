import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { promote } from "./promote/index.ts";
import { buildFigmaPushPlan } from "./promote/figma-plan.ts";
import { generateCodeTokens } from "./generate/index.ts";
import { generateTailwindTheme } from "./generate/tailwind.ts";
import { generateBootstrapVariables } from "./generate/bootstrap.ts";
import { generateMd2 } from "./generate/md2.ts";
import { generateMd3 } from "./generate/md3.ts";
import { generateKotlinScaffoldGuide } from "./generate/kotlin-scaffold-guide.ts";
import { generateSwiftUI } from "./generate/swiftui.ts";
import { generateSwiftUIScaffoldGuide } from "./generate/swiftui-scaffold-guide.ts";
import { generateShadcn } from "./generate/shadcn.ts";
import { generateRnr } from "./generate/rnr.ts";
import { generateRnPaper } from "./generate/rn-paper.ts";
import { generateVuetify } from "./generate/vuetify.ts";
import { writeProjectDocs } from "./generate/project-docs.ts";
import { buildTailwindDemo, buildBootstrapDemo, buildMuiDemo, buildMd3Demo, buildSwiftUIDemo, buildShadcnDemo, buildRnrDemo, buildRnPaperDemo, buildVuetifyDemo } from "./generate/demo.ts";
import type { SeedConfig, TargetFramework } from "./types/seed-config.ts";
import type { FontFilesMap } from "./report/index.ts";
import { slugFont, FONT_WEIGHTS } from "./shared/font-slug.ts";
import { scaffoldNextjs } from "./scaffold/nextjs.ts";
import { scaffoldNextjsBootstrap } from "./scaffold/nextjs-bootstrap.ts";
import { scaffoldNextjsMui } from "./scaffold/nextjs-mui.ts";
import { scaffoldVuejs } from "./scaffold/vuejs.ts";
import { scaffoldVuejsVuetify } from "./scaffold/vuejs-vuetify.ts";
import { scaffoldVuejsBootstrap } from "./scaffold/vuejs-bootstrap.ts";
import { scaffoldReactNative } from "./scaffold/react-native.ts";
import { scaffoldReactNativePaper } from "./scaffold/react-native-paper.ts";

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

// Missing files are skipped silently — the report just falls back to its
// default system-font stack for that family/weight. Naming convention
// (slugFont/FONT_WEIGHTS) lives in shared/font-slug.ts since the Next.js
// scaffold step needs to look up these exact same files later.
function loadFontFiles(fontsDir: string | undefined, seed: SeedConfig): FontFilesMap | undefined {
  if (!fontsDir) return undefined;
  const families = [seed.primaryFont, seed.secondaryFont].filter((f): f is string => Boolean(f));
  const result: FontFilesMap = {};
  for (const family of families) {
    for (const weight of FONT_WEIGHTS) {
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
  "    Also writes md3/SCAFFOLD_GUIDE.md — Kotlin/Compose has no official",
  "    non-interactive scaffolding CLI (verified: no `android create`",
  "    command exists, `gradle init` only makes generic Kotlin JVM apps, not",
  "    real Android apps, and Android Studio has no headless project-",
  "    creation mode), so there's no `scaffold --framework kotlin` step —",
  "    this guide is Layer 3's answer instead, with your own real generated",
  "    values already filled in. See generate/kotlin-scaffold-guide.ts.",
  "    --swiftui: also emit a Swift DesignTokens.swift with the resolved",
  "    semantic color tokens as native Color values. Only correct for a",
  "    SwiftUI native iOS project — opt-in, same reason as --tailwind.",
  "    Also writes swiftui/Theme.swift (a real dynamic light/dark wrapper —",
  "    DesignTokens.swift's own flat enums have no built-in switching",
  "    mechanism) and swiftui/SCAFFOLD_GUIDE.md. Same reason as --md3's own",
  "    guide: no official non-interactive Xcode/SwiftUI scaffolding CLI",
  "    exists either (verified: no xcodebuild project-creation action,",
  "    `swift package init` has no iOS-app template type, Xcode's own",
  "    templates aren't exposed via any documented CLI). See",
  "    generate/swiftui-scaffold-guide.ts.",
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
  "",
  '  node src/cli.ts scaffold --framework nextjs --code-dir "<dir>" --out "<dir>" [--shadcn] [--fonts-dir <dir>]',
  "    Layer 3 (pipeline-plan.md, \"Who this is for, and the bar for 'done'\").",
  "    Drives the official create-next-app CLI non-interactively, then layers",
  "    this pipeline's already-generated Tailwind theme on top — colors,",
  "    fonts, and agent-rules files all wired in, ready to `npm run dev`.",
  "    --code-dir must point at a `generate --tailwind --framework nextjs`",
  "    run's --out directory. --out is where the new project gets created —",
  "    it must not already exist yet. --fonts-dir is optional and takes the",
  "    exact same files/naming convention as promote's own --fonts-dir; if",
  "    given, real font files get copied in and used for real (no font",
  "    files: falls back to a system-font default for that family, same as",
  "    promote's report.html).",
  "    --shadcn: also drives shadcn's own CLI non-interactively (`init -d -y`",
  "    then `add --all -y`) — every shadcn/ui component, already vendored and",
  "    already styled with this project's real brand colors. Requires",
  "    --code-dir to also have shadcn/theme.css (i.e. `generate --tailwind",
  "    --shadcn --framework nextjs`, both flags together). Writes",
  "    sdsgt-vendored-components.json (a hash per vendored file) so a future",
  "    re-vendor can tell an untouched component from a customized one — see",
  "    contracts-and-seeds.md, \"Next.js scaffold,\" for the full merge",
  "    strategy and why it's a safe CSS-cascade append, not a parse/replace.",
  "    Also writes figma-components-push-plan.json (Button only today) —",
  "    consumed by SDSGT-figma-push's own step 7 to push real components",
  "    into Figma, not just tokens. See scaffold/figma-components-plan.ts.",
  "",
  '  node src/cli.ts scaffold --framework nextjs --bootstrap --code-dir "<dir>" --out "<dir>" [--fonts-dir <dir>]',
  "    A separate path — drives create-next-app with --no-tailwind, then",
  "    wires in Sass + Bootstrap + React-Bootstrap + bootstrap-icons instead",
  "    of Tailwind. --code-dir must point at a `generate --bootstrap",
  "    --framework nextjs` run's --out directory. Installs a real `sass`",
  "    devDependency and compiles this pipeline's generated _variables.scss",
  "    into Bootstrap's own Sass before React-Bootstrap's components render —",
  "    no vendored component files (react-bootstrap is a plain npm package,",
  "    not a copy-paste library like shadcn). See scaffold/nextjs-bootstrap.ts",
  "    for the full reasoning, including why every page rendering a",
  "    react-bootstrap component needs its own \"use client\" directive.",
  "",
  '  node src/cli.ts scaffold --framework nextjs --md2 --code-dir "<dir>" --out "<dir>" [--fonts-dir <dir>]',
  "    Another separate path — drives create-next-app with --no-tailwind,",
  "    then wires in MUI (Material UI) instead: @mui/material-nextjs's",
  "    AppRouterCacheProvider for Emotion SSR, a real createTheme() using",
  "    this pipeline's generated mui/palette.ts, and @mui/icons-material for",
  "    icons. --code-dir must point at a `generate --md2 --framework nextjs`",
  "    run's --out directory — NOT --md3: MD3 generates Kotlin/Compose",
  "    Color.kt, nothing web-consumable, so a Next.js Material Design seed",
  "    (MD3 or MD2) should always generate with --md2 regardless of which",
  "    one was picked (see the SDSGT-start skill's own step 8 fix, same",
  "    session). No vendored component files — MUI is a plain npm package.",
  "    See scaffold/nextjs-mui.ts for the full reasoning, including why MUI's",
  "    own components already ship \"use client\" (unlike react-bootstrap).",
  "",
  '  node src/cli.ts scaffold --framework vuejs --code-dir "<dir>" --out "<dir>" [--shadcn] [--fonts-dir <dir>]',
  "    Drives the official create-vue CLI non-interactively, wires Tailwind",
  "    v4 in (create-vue has no built-in --tailwind flag, so this runs its",
  "    own npm install for tailwindcss + @tailwindcss/vite), then layers",
  "    tokens/fonts/agent-docs on top the same way the Next.js path does.",
  "    --code-dir must point at a `generate --tailwind --framework vuejs`",
  "    run's --out directory. Writes a project .npmrc",
  "    (legacy-peer-deps=true) — needed for a real, current version drift",
  "    between create-vue's own oxlint/eslint-plugin-oxlint devDependencies,",
  "    not something this pipeline introduced; see scaffold/vuejs.ts.",
  "    --shadcn: drives shadcn-vue's own CLI non-interactively the same way",
  "    --shadcn works for Next.js. Requires --code-dir to also have",
  "    shadcn/theme.css (`generate --tailwind --shadcn --framework vuejs`).",
  "",
  '  node src/cli.ts scaffold --framework vuejs --vuetify --code-dir "<dir>" --out "<dir>" [--fonts-dir <dir>]',
  "    A separate path from the Tailwind one above — drives the official",
  "    create-vuetify CLI non-interactively (Material Design via Vuetify's",
  "    own component styling, not Tailwind) and wires in this pipeline's",
  "    generated Vuetify theme. --code-dir must point at a `generate",
  "    --vuetify --framework vuejs` run's --out directory. See",
  "    scaffold/vuejs-vuetify.ts for the full reasoning.",
  "",
  '  node src/cli.ts scaffold --framework vuejs --bootstrap --code-dir "<dir>" --out "<dir>" [--fonts-dir <dir>]',
  "    Another separate path — drives create-vue (same base CLI as the",
  "    Tailwind path, since bootstrap-vue-next has no scaffolding CLI of its",
  "    own) then wires in Sass + Bootstrap + bootstrap-vue-next instead of",
  "    Tailwind. --code-dir must point at a `generate --bootstrap --framework",
  "    vuejs` run's --out directory. Installs a real `sass` devDependency and",
  "    compiles this pipeline's generated _variables.scss into Bootstrap's",
  "    own Sass before bootstrap-vue-next's component CSS loads — no vendored",
  "    component files (bootstrap-vue-next is a plain npm package, not a",
  "    copy-paste library like shadcn). See scaffold/vuejs-bootstrap.ts for",
  "    the full reasoning.",
  "",
  '  node src/cli.ts scaffold --framework react-native --code-dir "<dir>" --out "<dir>" [--rnr]',
  "    Drives create-expo-app non-interactively, then wires NativeWind v4 in",
  "    by hand (create-expo-app has no built-in NativeWind template). --code-",
  "    dir must point at a `generate --rnr --framework react-native` run's",
  "    --out directory — NOT --tailwind: NativeWind v4 has a hard peer",
  "    dependency on Tailwind v3, incompatible with this pipeline's v4-shaped",
  "    --tailwind output, so this reuses --rnr's already Tailwind-v3-shaped",
  "    theme instead. No font files wired in (a real, documented gap — React",
  "    Native needs .ttf/.otf via expo-font, not the .woff2 files this",
  "    pipeline fetches) — see scaffold/react-native.ts for the full reasoning.",
  "    --rnr: real React Native Reusables vendoring, built 2026-09-14 —",
  "    reverses an earlier 'blocked' finding. RNR's own `init` really is",
  "    still a blocked interactive wizard, but `add -a --styling-library",
  "    nativewind` runs standalone once components.json exists (real schema,",
  "    fetched from RNR's own template repo) and the git working tree is",
  "    clean (a real `git add -A && git commit`, not a workaround) — both",
  "    real, satisfiable preconditions, not keystroke-piping. Writes",
  "    sdsgt-vendored-components.json (a hash per vendored file), same",
  "    customization-guard treatment as shadcn/shadcn-vue. See",
  "    scaffold/react-native.ts's runRnrAdd for the full verification detail.",
  "",
  '  node src/cli.ts scaffold --framework react-native --rn-paper --code-dir "<dir>" --out "<dir>"',
  "    A separate path from NativeWind above — no Tailwind/NativeWind",
  "    involved at all. Drives create-expo-app, installs react-native-paper",
  "    for real, and wires this pipeline's generated MD3 theme into a real",
  "    PaperProvider wrap. --code-dir must point at a `generate --rn-paper",
  "    --framework react-native` run's --out directory. Icons need no extra",
  "    install (Expo bundles vector icons already). See",
  "    scaffold/react-native-paper.ts for the full reasoning.",
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
  const tailwindResult = args.tailwind !== undefined ? await generateTailwindTheme(tokensDir, outDir) : null;
  const tailwindFiles = tailwindResult?.filesWritten ?? [];
  // Only meaningful when --tailwind ran and its spacing preset turned out
  // non-linear (currently just "bootstrap") — see tailwind.ts's own header
  // and computeLinearSpacingConstant. Feeds AGENTS.md's disclosure so it
  // never claims a binding that didn't actually happen.
  const hasUnboundTailwindSpacing = tailwindResult !== null && !tailwindResult.spacingBaseVar.applied;

  // Same opt-in reasoning as --tailwind above — Generate can't tell what the
  // original seed's targetFramework/targetDesignLanguage was, so the caller
  // has to say so explicitly.
  const bootstrapFiles = args.bootstrap !== undefined ? generateBootstrapVariables(tokensDir, outDir).filesWritten : [];
  const md2Files = args.md2 !== undefined ? generateMd2(tokensDir, outDir).filesWritten : [];
  // Kotlin/Jetpack Compose has no official non-interactive scaffolding CLI
  // (verified 2026-09-14 — see generate/kotlin-scaffold-guide.ts's file
  // header), so --md3 also writes a real, filled-in SCAFFOLD_GUIDE.md next
  // to Color.kt instead of a separate `scaffold --framework kotlin` step
  // that would have nothing to drive — same "Pattern A" treatment already
  // used for Vuetify/RN Paper's own SETUP.md.
  const md3Files = args.md3 !== undefined ? generateMd3(tokensDir, outDir).filesWritten : [];
  const kotlinGuideFiles =
    args.md3 !== undefined
      ? generateKotlinScaffoldGuide(outDir, readFileSync(join(outDir, "md3", "Color.kt"), "utf-8")).filesWritten
      : [];
  // SwiftUI/Xcode has no official non-interactive scaffolding CLI either
  // (verified 2026-09-14, same conclusion as Kotlin — see
  // generate/swiftui-scaffold-guide.ts's file header), so --swiftui also
  // writes a real Theme.swift (dynamic light/dark wrapper, since
  // DesignTokens.swift's own flat enums have no built-in switching
  // mechanism) plus SCAFFOLD_GUIDE.md, same "Pattern A" treatment as Kotlin.
  const swiftuiFiles = args.swiftui !== undefined ? generateSwiftUI(tokensDir, outDir).filesWritten : [];
  const swiftuiGuideFiles =
    args.swiftui !== undefined
      ? generateSwiftUIScaffoldGuide(outDir, readFileSync(join(outDir, "swiftui", "DesignTokens.swift"), "utf-8")).filesWritten
      : [];
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
    hasUnboundTailwindSpacing,
  }).filesWritten;

  const allFiles = [...filesWritten, ...tailwindFiles, ...bootstrapFiles, ...md2Files, ...md3Files, ...kotlinGuideFiles, ...swiftuiFiles, ...swiftuiGuideFiles, ...shadcnFiles, ...rnrFiles, ...rnPaperFiles, ...vuetifyFiles, ...demoFiles, ...docFiles];
  console.log(`Wrote ${allFiles.length} code-token file(s) to ${outDir}/:`);
  for (const f of allFiles) {
    console.log(`  - ${f}`);
  }
}

function runScaffold(rest: string[]) {
  const args = parseArgs(rest);
  const framework = args.framework;
  const codeDir = args["code-dir"];
  const outDir = args.out;
  const fontsDir = args["fonts-dir"];
  const shadcn = args.shadcn !== undefined;
  const vuetify = args.vuetify !== undefined;
  const bootstrap = args.bootstrap !== undefined;
  const md2 = args.md2 !== undefined;
  const rnPaper = args["rn-paper"] !== undefined;
  const rnr = args.rnr !== undefined;

  if (!codeDir || !outDir) {
    console.error(`scaffold needs both --code-dir and --out.\n\n${USAGE}`);
    process.exit(1);
  }
  if (framework !== "nextjs" && framework !== "vuejs" && framework !== "react-native") {
    console.error(
      `--framework ${framework ?? "(none)"} isn't built yet — only "nextjs", "vuejs", and "react-native" are today. ` +
        "See docs/layer2-layer3-plan.md, Subject 3, for what's still open.",
    );
    process.exit(1);
  }

  try {
    if (framework === "nextjs" && bootstrap) {
      const { filesWritten, projectDir } = scaffoldNextjsBootstrap({ codeDir, outDir, fontsDir });
      console.log(`\nScaffolded a Next.js + React-Bootstrap project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:3000");
    } else if (framework === "nextjs" && md2) {
      const { filesWritten, projectDir } = scaffoldNextjsMui({ codeDir, outDir, fontsDir });
      console.log(`\nScaffolded a Next.js + MUI project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:3000");
    } else if (framework === "nextjs") {
      const { filesWritten, projectDir } = scaffoldNextjs({ codeDir, outDir, fontsDir, componentLibrary: shadcn ? "shadcn" : undefined });
      console.log(`\nScaffolded a Next.js project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:3000");
    } else if (framework === "vuejs" && vuetify) {
      const { filesWritten, projectDir } = scaffoldVuejsVuetify({ codeDir, outDir, fontsDir });
      console.log(`\nScaffolded a Vue.js + Vuetify project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:3000");
    } else if (framework === "vuejs" && bootstrap) {
      const { filesWritten, projectDir } = scaffoldVuejsBootstrap({ codeDir, outDir, fontsDir });
      console.log(`\nScaffolded a Vue.js + bootstrap-vue-next project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:5173");
    } else if (framework === "vuejs") {
      const { filesWritten, projectDir } = scaffoldVuejs({ codeDir, outDir, fontsDir, componentLibrary: shadcn ? "shadcn" : undefined });
      console.log(`\nScaffolded a Vue.js project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm run dev`, then open http://localhost:5173");
    } else if (rnPaper) {
      const { filesWritten, projectDir } = scaffoldReactNativePaper({ codeDir, outDir });
      console.log(`\nScaffolded an Expo + React Native Paper project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm start`, then press i/a/w or scan the QR code with Expo Go");
    } else {
      const { filesWritten, projectDir } = scaffoldReactNative({ codeDir, outDir, componentLibrary: rnr ? "rnr" : undefined });
      console.log(`\nScaffolded an Expo + NativeWind project at ${projectDir}/:`);
      for (const f of filesWritten) {
        console.log(`  - ${f}`);
      }
      console.log("\nRun it: cd into the project, then `npm start`, then press i/a/w or scan the QR code with Expo Go");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`scaffold failed: ${detail}`);
    process.exit(1);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "promote") {
    runPromote(rest);
  } else if (command === "generate") {
    await runGenerate(rest);
  } else if (command === "scaffold") {
    runScaffold(rest);
  } else {
    console.error(`Unknown command: ${command ?? "(none)"}.\n\n${USAGE}`);
    process.exit(1);
  }
}

await main();
