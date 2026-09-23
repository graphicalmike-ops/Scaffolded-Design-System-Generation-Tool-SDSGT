// Layer 3 — React Native (Expo) scaffold, NativeWind path. Drives the
// official create-expo-app CLI non-interactively (verified 2026-09-14:
// blank-typescript template + --no-install + --no-agents-md, zero prompts,
// absolute paths work fine — unlike create-vue/create-vuetify, no
// parent-dir workaround needed here), then wires NativeWind v4 in by hand —
// create-expo-app has no built-in NativeWind template the way
// create-next-app has --tailwind.
//
// A REAL, CONSEQUENTIAL FINDING shapes this entire file: NativeWind v4
// (current stable — verified via real npm dist-tags, "latest": "4.2.6", v5
// only under "rc"/"preview") has a hard peer dependency on Tailwind CSS
// v3 (confirmed by inspecting nativewind's own dependency,
// react-native-css-interop, whose real peerDependencies pin
// `"tailwindcss": "~3"` — not `>3.3.0`'s looser range nativewind itself
// declares, which is misleadingly permissive on paper). That means this
// scaffold CANNOT reuse `generate --tailwind`'s output the way the Next.js
// and Vue.js scaffolds do — that generator targets Tailwind v4's CSS-native
// `@theme` syntax, incompatible here. Instead this uses `generate --rnr`'s
// already-built output (rnr/global.css, real "H S% L%" triplets under
// classic `@tailwind base/components/utilities` directives — already
// Tailwind-v3-shaped, built back on 2026-09-10 for RNR's own theming
// contract, which turns out to double as exactly the right base for ANY
// NativeWind project, vendored RNR components or not) — see
// contracts-and-seeds.md, "React Native Reusables (RNR) theming."
//
// tailwind.config.js's color-extend block is copied from RNR's own real
// template (founded-labs/react-native-reusables-templates, `minimal`
// variant, fetched 2026-09-14 — not invented), confirmed to use the exact
// same CSS variable names/shapes this pipeline's own rnr.ts generator
// already writes (`hsl(var(--primary))`, `.dark:root` selector, etc.) —
// plus this pipeline's own success/warning/info/promo status-role
// extensions, which vanilla RNR's template has no slot for (same treatment
// generate/shadcn.ts already gives these on web).
//
// metro.config.js's `inlineRem: 16` is NOT optional — see the
// nativewind-project-setup skill: NativeWind's own Metro plugin defaults
// `inlineRem` to 14, not the web-standard 16 every Tailwind utility class is
// authored against, silently shrinking every rem-based size to 87.5% with
// no error. Confirmed this is also how RNR's own real template sets it
// (same value, same key), not just this project's own opinion.
//
// RNR's real component vendoring stays blocked (docs/layer2-layer3-plan.md,
// Subject 2) — re-confirmed 2026-09-14: `@react-native-reusables/cli init`
// is still a live interactive menu ("A project already exists in this
// directory. How would you like to proceed?") with no flag to skip it, even
// with `-t <template>` set and stdin closed. This scaffold only reuses
// RNR's GENERATED THEME FILES (already built, not a vendoring mechanism);
// it does not run the RNR CLI at all.
//
// Fonts are NOT wired here, unlike every other scaffold in this pipeline —
// a real, deliberate, documented gap, not an oversight. Every other
// scaffold's font support (Next.js, Vue.js) works by writing a plain CSS
// `@font-face` block pointing at the same .woff2 files promote's own
// --fonts-dir already fetches. React Native has no CSS and no @font-face —
// real custom fonts need .ttf/.otf files loaded via expo-font's
// `useFonts()`, a completely different file format and loading mechanism
// this pipeline's font-fetching (built around Google Fonts' CSS2 API, which
// only serves .woff2) doesn't produce. Extending font-fetching to also grab
// .ttf files is real, separate, not-yet-scoped work — this scaffold falls
// back to the system font for both platforms, same "degrades gracefully"
// treatment every other scaffold already uses when fontsDir isn't passed,
// just unconditional here instead of conditional.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

import { copyAgentDocs, hashFile, collectFilesRecursive, readCssScale, nearestScalePx, readThemeManifest, writeThemeManifest, guardedWriteFile } from "../shared/scaffold-common.ts";

export interface ScaffoldReactNativeOptions {
  codeDir: string; // output of `generate --rnr --framework react-native`
  outDir: string; // where a new project gets created (update: false/omitted)
  // or an already-scaffolded one gets refreshed (update: true)
  componentLibrary?: "rnr"; // real vendoring, built 2026-09-14 — see runRnrAdd's own header
  update?: boolean; // refresh an EXISTING project's theme files in place —
  // see docs/layer2-layer3-plan.md's 2026-09-17 entry / cli.ts's
  // `scaffold --update`.
  force?: boolean; // overwrite a hand-edited theme file anyway
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
  warnings: string[];
}

function run(cmd: string, args: string[], cwd: string, label: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

function runCreateExpoApp(outDir: string): void {
  run("npx", ["--yes", "create-expo-app@latest", outDir, "-t", "blank-typescript", "--no-install", "--no-agents-md"], ".", "create-expo-app");
}

// `expo install`, not plain `npm install`, for every package with an
// Expo-SDK-specific compatible version (react-native-reanimated,
// react-native-safe-area-context, react-dom, react-native-web) — this is
// Expo's own documented way to get the version matching the current SDK,
// already the convention this pipeline's own RN Paper SETUP.md uses
// ("npx expo install react-native-paper react-native-safe-area-context").
// react-dom/react-native-web specifically are needed because this scaffold
// sets app.json's web.bundler — blank-typescript has no web support by
// default (confirmed: a real `expo export --platform web` failed outright
// asking for exactly these two), but RNR's own real upstream template DOES
// ship both, confirming a real NativeWind project is expected to support
// web out of the box, not something invented here.
// nativewind itself, plus tailwindcss/prettier-plugin-tailwindcss/
// babel-preset-expo, aren't Expo-SDK-versioned — plain npm install.
// tailwindcss pinned to ^3 (never crosses into v4 — see file header) rather
// than @latest, since this is a real compatibility requirement, not a
// preference — unlike every other scaffold in this pipeline, which
// deliberately never version-pins the official CLI it drives.
function installDeps(outDir: string): void {
  // `expo install` needs the `expo` package already in node_modules to read
  // the project's SDK version — create-expo-app ran with --no-install, so
  // node_modules doesn't exist yet. Plain `npm install` first (installs the
  // template's own base deps), confirmed necessary by hitting a real
  // "Cannot determine the project's Expo SDK version" error without it.
  run("npm", ["install"], outDir, "npm install (base deps)");
  run("npx", ["expo", "install", "react-native-reanimated", "react-native-safe-area-context", "react-dom", "react-native-web"], outDir, "expo install");
  run("npm", ["install", "nativewind"], outDir, "npm install (nativewind)");
  run("npm", ["install", "--save-dev", "tailwindcss@^3", "prettier-plugin-tailwindcss", "babel-preset-expo"], outDir, "npm install (dev deps)");
}

function writeMetroConfig(outDir: string): void {
  const content = [
    "const { getDefaultConfig } = require('expo/metro-config');",
    "const { withNativeWind } = require('nativewind/metro');",
    "",
    "const config = getDefaultConfig(__dirname);",
    "",
    "// inlineRem MUST be 16, not NativeWind's own default of 14 — see the",
    "// nativewind-project-setup skill / this file's own header for why.",
    "module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "metro.config.js"), content, "utf-8");
}

function writeBabelConfig(outDir: string): void {
  const content = [
    "module.exports = function (api) {",
    "  api.cache(true);",
    "  return {",
    "    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],",
    "  };",
    "};",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "babel.config.js"), content, "utf-8");
}

// `nativewind/types` (re-exported from react-native-css-interop/types) only
// adds `className` props to RN components — it does NOT declare a `*.css`
// module, even though RNR's own real template's nativewind-env.d.ts omits
// this too (confirmed by fetching it directly). Without it, `import
// "./global.css"` fails a real `tsc --noEmit` with "Cannot find module or
// type declarations for side-effect import" — caught by actually running
// the typecheck against a real scaffolded project, not assumed from the
// upstream template being correct.
function writeNativewindEnvDts(outDir: string): void {
  const content = ['/// <reference types="nativewind/types" />', "", 'declare module "*.css";', ""].join("\n");
  writeFileSync(join(outDir, "nativewind-env.d.ts"), content, "utf-8");
}

// Color-extend block copied from RNR's own real template (see file header)
// plus this pipeline's success/warning/info/promo status extensions.
// `hasSecondary` is read from the copied global.css itself (does it declare
// --secondary?) rather than passed in separately, so this file only ever
// maps variables that actually exist — same "don't map what isn't there"
// discipline RNR's own generator already follows.
//
// theme.extend.spacing wired 2026-09-16 — closes the real gap flagged in
// this file's own README text ("Known gap" section) since 2026-09-14: this
// pipeline's own spacing preset never reached Tailwind's real `theme.
// spacing` scale before this. A real, non-obvious finding while fixing it,
// checked rather than assumed to need the same fix as the earlier shadcn
// v4 bug: three of this pipeline's four spacing presets (`tailwind`/`md3`/
// `md2`) are, BY THIS PIPELINE'S OWN DESIGN (contracts-and-seeds.md, row
// "Spacing" — MD3/MD2 have no spacing scale of their own, so they use
// Tailwind's under the hood), already numerically IDENTICAL to Tailwind
// v3's own real default scale (key N = N * 4px, confirmed against every
// entry in `spacing.tailwind.json`/`spacing.md3.json`/`spacing.md2.json`)
// — so for those three, Tailwind's un-overridden default was never
// actually wrong, just not EXPLICITLY sourced from this pipeline's own
// tokens. Only the fourth, `bootstrap` (a genuinely non-linear 4/8/16/24/
// 48px-per-step scale, keys 0-5 only), was ever really mismatched. Rather
// than detect which preset was used (extra plumbing this scaffold doesn't
// otherwise need), this just extends `theme.spacing` with whatever real
// keys/values this run's own `spacing.json` actually defines, read
// straight from the already-available `css/tokens.css` — correct either
// way: a no-op-in-effect restatement of Tailwind's own default for the
// three linear presets, a real partial fix for `bootstrap` (its own real
// vendored-component classes in the 0-5 key range, e.g. `px-3`/`py-2`, now
// bind to the chosen preset's real value instead of Tailwind's mismatched
// default). Uses `extend`, not a full replacement, on purpose — a full
// replacement would blank out every OTHER real Tailwind key (6, 7, 9,
// half-steps, ...) this pipeline's own curated preset files don't list,
// breaking real vendored component classes outside that list. **Disclosed,
// not fixed**: `bootstrap`'s own keys beyond 5 still fall back to
// Tailwind's real default, since `spacing.bootstrap.json` itself was never
// scoped past key 5 — the same structural ceiling as the Tailwind v4
// shadcn/shadcn-vue case, just reached by a different (object-merge vs.
// single-CSS-variable) mechanism.
// Real Tailwind v3 default `theme.fontSize` targets — confirmed against
// the real npm-published `tailwindcss@^3` package's own
// `stubs/config.full.js`. Unlike `theme.spacing` (which has many more real
// keys than this pipeline's own curated spacing presets list, so `extend`
// was required to avoid breaking classes outside that list), Tailwind's
// real fontSize scale has EXACTLY these 13 named keys and no others (no
// fractional/in-between fontSize classes exist the way `px-2.5` does for
// spacing) — so binding all 13 via `extend` is a complete fix, not a
// partial one; nothing is left for an unbound class to fall through to.
const RN_FONT_SIZE_TARGETS: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
  "5xl": 48,
  "6xl": 60,
  "7xl": 72,
  "8xl": 96,
  "9xl": 128,
};

function buildTailwindConfig(hasSecondary: boolean, spacingScale: Record<string, number>, fontSizeScale: Record<string, number>): string {
  const secondaryBlock = hasSecondary
    ? ["        secondary: {", "          DEFAULT: 'hsl(var(--secondary))',", "          foreground: 'hsl(var(--secondary-foreground))',", "        },"].join("\n")
    : "";
  const spacingEntries = Object.entries(spacingScale)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, px]) => `        '${key}': '${px}px',`)
    .join("\n");
  // theme.extend.fontSize wired 2026-09-16 — closes the real gap this
  // pipeline's own type-scale preset never reached for RNR: this run's
  // vendored `components/ui/` already uses real `text-sm`/`text-lg`/
  // `text-2xl`/etc. classes (confirmed by grepping a real vendored
  // project), which previously always used Tailwind's raw default size
  // regardless of the chosen type-scale preset. Each of Tailwind's 13 real
  // named keys is bound to the nearest real type-scale token for THAT
  // key's own real default px target (same "nearest real value" discipline
  // as the spacing fix above) — for the `tailwind` type-scale preset this
  // is a correct no-op (that preset was deliberately built to match
  // Tailwind's own real scale at every key it defines), a real fix for
  // `bootstrap`/`md3`/`md2`. No fallback gap here the way `bootstrap`
  // spacing has beyond key 5 — Tailwind's fontSize scale has no keys
  // outside these 13 to fall through to.
  const fontSizeEntries = Object.entries(RN_FONT_SIZE_TARGETS)
    .map(([key, targetPx]) => `        '${key}': '${nearestScalePx(targetPx, fontSizeScale)}px',`)
    .join("\n");
  const content = [
    "/** @type {import('tailwindcss').Config} */",
    "module.exports = {",
    "  darkMode: 'class',",
    "  content: ['./App.tsx', './components/**/*.{ts,tsx}'],",
    "  presets: [require('nativewind/preset')],",
    "  theme: {",
    "    extend: {",
    "      colors: {",
    "        border: 'hsl(var(--border))',",
    "        input: 'hsl(var(--input))',",
    "        ring: 'hsl(var(--ring))',",
    "        background: 'hsl(var(--background))',",
    "        foreground: 'hsl(var(--foreground))',",
    "        card: {",
    "          DEFAULT: 'hsl(var(--card))',",
    "          foreground: 'hsl(var(--card-foreground))',",
    "        },",
    "        popover: {",
    "          DEFAULT: 'hsl(var(--popover))',",
    "          foreground: 'hsl(var(--popover-foreground))',",
    "        },",
    "        primary: {",
    "          DEFAULT: 'hsl(var(--primary))',",
    "          foreground: 'hsl(var(--primary-foreground))',",
    "        },",
    ...(secondaryBlock ? [secondaryBlock] : []),
    "        muted: {",
    "          DEFAULT: 'hsl(var(--muted))',",
    "          foreground: 'hsl(var(--muted-foreground))',",
    "        },",
    "        accent: {",
    "          DEFAULT: 'hsl(var(--accent))',",
    "          foreground: 'hsl(var(--accent-foreground))',",
    "        },",
    "        // shadcn/RNR's own convention has no --destructive-foreground —",
    "        // matched here for fidelity, same treatment generate/rnr.ts uses.",
    "        destructive: 'hsl(var(--destructive))',",
    "        // SDSGT's own status-role extensions — no slot in vanilla RNR.",
    "        success: {",
    "          DEFAULT: 'hsl(var(--success))',",
    "          foreground: 'hsl(var(--success-foreground))',",
    "        },",
    "        warning: {",
    "          DEFAULT: 'hsl(var(--warning))',",
    "          foreground: 'hsl(var(--warning-foreground))',",
    "        },",
    "        info: {",
    "          DEFAULT: 'hsl(var(--info))',",
    "          foreground: 'hsl(var(--info-foreground))',",
    "        },",
    "        promo: {",
    "          DEFAULT: 'hsl(var(--promo))',",
    "          foreground: 'hsl(var(--promo-foreground))',",
    "        },",
    "      },",
    "      borderRadius: {",
    "        lg: 'var(--radius)',",
    "        md: 'calc(var(--radius) - 2px)',",
    "        sm: 'calc(var(--radius) - 4px)',",
    "      },",
    "      // Real spacing.json keys/values for this run — see this file's",
    "      // own header for why `extend` (not a full replacement) and why",
    "      // this matters for real for the `bootstrap` preset specifically.",
    "      spacing: {",
    spacingEntries,
    "      },",
    "      // Real type-scale fontSize primitives, bound to Tailwind's own",
    "      // 13 real named keys — see this file's own header for why this",
    "      // one is a complete fix, not a partial one like spacing.",
    "      fontSize: {",
    fontSizeEntries,
    "      },",
    "    },",
    "  },",
    "  plugins: [],",
    "};",
    "",
  ].join("\n");
  return content;
}

function mergeWebBundlerIntoAppJson(outDir: string): void {
  const path = join(outDir, "app.json");
  const json = JSON.parse(readFileSync(path, "utf-8"));
  json.expo.web = { ...(json.expo.web ?? {}), bundler: "metro" };
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
}

// Strips the default "Open up App.tsx..." placeholder — same
// "light-touch, just enough real markup to prove this isn't the generic
// starter" restraint as every other scaffold's own minimal page, using
// NativeWind classNames against this project's real token colors.
function rewriteAppTsx(outDir: string, projectName: string): void {
  const content = [
    'import "./global.css";',
    "",
    'import { StatusBar } from "expo-status-bar";',
    'import { Text, View } from "react-native";',
    "",
    "export default function App() {",
    "  return (",
    '    <View className="flex-1 items-center justify-center gap-4 bg-background p-8">',
    '      <Text className="text-2xl font-bold text-foreground">Your design system is ready</Text>',
    '      <Text className="text-center text-foreground">',
    `        This project was generated by SDSGT — ${projectName}'s tokens and colors`,
    "        are already wired in. Open App.tsx to start building.",
    "      </Text>",
    '      <View className="rounded-lg bg-primary px-4 py-2">',
    '        <Text className="font-semibold text-primary-foreground">Primary button</Text>',
    "      </View>",
    '      <StatusBar style="auto" />',
    "    </View>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "App.tsx"), content, "utf-8");
}

// Real RNR vendoring — built 2026-09-14, reversing the "blocked" conclusion
// docs/layer2-layer3-plan.md's Subject 2 (and Subject 5's re-check)
// recorded earlier the same day. RNR's own `init` really is still a live
// interactive menu with no flag to skip it — that part was never wrong.
// What changes the outcome is that `add` (which already had real
// non-interactive flags: -a/--all, --styling-library) turns out NOT to
// require `init` at all — it only asks two things when run standalone,
// and both are real, satisfiable preconditions, not something to script
// keystrokes around:
// 1. "Missing components.json (required to continue) — write one?" — a
//    plain y/n prompt that never fires if the file already exists. Its
//    real schema was fetched from RNR's own real template repo
//    (founded-labs/react-native-reusables-templates, `minimal` variant),
//    not guessed — see writeComponentsJson below.
// 2. "The Git repository is dirty — continue anyway?" — an arrow-key
//    prompt (confirmed via a real bounded test: plain piped "y\n" text
//    does NOT satisfy it, same raw-keypress UI class as `init`'s own
//    blocked menu) that never fires if the repo is actually clean. Since
//    create-expo-app already initializes a real git repo, a real `git add
//    -A && git commit` makes this true, not fake.
// With both satisfied, `add -a --styling-library nativewind` ran to real
// completion (verified: exit 0, 32 real component files in
// components/ui/, real @rn-primitives/* dependencies installed) — no
// keystroke-piping, no fighting the interactive TUI RNR's own `init` still
// has. A real, transient connect-timeout to reactnativereusables.com was
// hit once during verification and resolved on retry — same class of
// flakiness create-vuetify's own template download has (Subject 4),
// unrelated to any of the above.

// Fetched verbatim from RNR's own real template repo, 2026-09-14 — not
// invented. tailwind.config/css point at this scaffold's own real root-level
// files (already correct, since this pipeline's own file layout matches).
function writeComponentsJson(outDir: string): void {
  const content = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "tailwind.config.js",
      css: "global.css",
      baseColor: "neutral",
      cssVariables: true,
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  };
  writeFileSync(join(outDir, "components.json"), `${JSON.stringify(content, null, 2)}\n`, "utf-8");
}

// blank-typescript's own tsconfig.json (already written by create-expo-app
// at this point) has no @/* alias — components.json's own aliases above
// need one to resolve. Merged in, not overwritten wholesale, so whatever
// create-expo-app itself already set stays intact. Deliberately no
// `baseUrl` — a real `tsc --noEmit` run against this exact template
// (TypeScript 6.0.3) failed with "Option 'baseUrl' is deprecated" (a real
// error under moduleResolution: "bundler", the mode Expo's own
// tsconfig.base.json sets, not just a warning). `paths` alone resolves
// correctly relative to tsconfig.json's own location under "bundler"
// resolution without it — confirmed by re-running the same real typecheck
// after removing it.
function addTsconfigPathAlias(outDir: string): void {
  const path = join(outDir, "tsconfig.json");
  const json = JSON.parse(readFileSync(path, "utf-8"));
  json.compilerOptions = { ...(json.compilerOptions ?? {}), paths: { "@/*": ["./*"] } };
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
}

// create-expo-app already runs `git init` itself (confirmed via a real
// scaffolded project's own `git status` succeeding) — this only needs to
// make the working tree clean, which is the real, literal thing RNR's own
// dirty-repo check is asking about.
function ensureGitCommitted(outDir: string): void {
  if (!existsSync(join(outDir, ".git"))) {
    run("git", ["init"], outDir, "git init");
  }
  run("git", ["add", "-A"], outDir, "git add");
  const result = spawnSync("git", ["commit", "-m", "SDSGT scaffold checkpoint"], { cwd: outDir, stdio: "pipe" });
  // A clean/empty commit (nothing to commit) is not an error here — it just
  // means the tree was already clean, which is exactly the state this step
  // wants either way.
  if (result.status !== 0 && !/nothing to commit/i.test(String(result.stdout))) {
    throw new Error(`git commit failed: ${result.stderr?.toString() ?? "unknown error"}`);
  }
}

function runRnrAdd(outDir: string): void {
  run("npx", ["--yes", "@react-native-reusables/cli@latest", "add", "-a", "--styling-library", "nativewind"], outDir, "RNR add --all");
}

// Two real gaps found by actually typechecking the real vendored output
// (same discipline that caught shadcn-vue's own @unovis gap):
// 1. `add --all` never vendors lib/utils.ts (the cn() helper almost every
//    component imports) — that's normally `init`'s job, which this
//    pipeline never runs. Real content fetched from RNR's own template
//    repo (same source as components.json), not invented.
// 2. `add --all` doesn't install every real dependency its own vendored
//    files actually import: react-native-screens (Expo-SDK-versioned,
//    needed by dropdown-menu/hover-card/menubar/popover/select/tooltip),
//    lucide-react-native (icon.tsx/menubar.tsx/select.tsx),
//    class-variance-authority (text.tsx/toggle.tsx/toggle-group.tsx), and
//    clsx/tailwind-merge (lib/utils.ts's own cn() helper needs both) —
//    confirmed by a real `tsc --noEmit` failing with "Cannot find module"
//    for each until these were added.
function finishRnrSetup(outDir: string): void {
  const libDir = join(outDir, "lib");
  if (!existsSync(libDir)) {
    spawnSync("mkdir", ["-p", libDir]);
  }
  writeFileSync(join(libDir, "utils.ts"), "import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n", "utf-8");

  run("npx", ["expo", "install", "react-native-screens"], outDir, "expo install (react-native-screens)");
  run("npm", ["install", "lucide-react-native", "class-variance-authority", "clsx", "tailwind-merge"], outDir, "npm install (RNR peer deps)");
}

// Same customization-guard shape as shadcn/ui's own manifest (flat files —
// RNR's real `add --all` output is flat single-file components under
// components/ui/, confirmed by a real run, not nested per-component folders
// the way shadcn-vue's own output is) — basename keying is safe here.
function buildRnrVendoredManifest(outDir: string): string {
  const uiDir = join(outDir, "components", "ui");
  const libDir = join(outDir, "lib");
  const entries: Record<string, { path: string; hash: string }> = {};

  for (const file of collectFilesRecursive(uiDir)) {
    const name = basename(file, extname(file));
    entries[name] = { path: relative(outDir, file), hash: hashFile(file) };
  }
  for (const file of collectFilesRecursive(libDir)) {
    const name = basename(file, extname(file));
    entries[name] = { path: relative(outDir, file), hash: hashFile(file) };
  }

  return `${JSON.stringify({ rnr: entries }, null, 2)}\n`;
}

function writeReadme(outDir: string, projectName: string, hasRnr: boolean): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — an Expo (React Native) project with your design",
    "system's colors already wired in via NativeWind (Tailwind classes on",
    "native).",
    "",
    "## Run it",
    "",
    "```",
    "npm start",
    "```",
    "",
    "Then press `i` for iOS, `a` for Android, or `w` for web — or scan the QR",
    "code with Expo Go.",
    "",
    "## What's in here",
    "",
    "- `global.css` — your generated design tokens as NativeWind/Tailwind CSS",
    "  variables. After editing tokens, run `generate` then `scaffold",
    "  --update` (same flags, --out pointing back at this project) to refresh",
    "  these in place; don't hand-edit them directly — an update run warns",
    "  instead of silently overwriting a hand-edited file.",
    "- `constants.ts` — a `NAV_THEME` object matching React Navigation's own",
    "  `Theme.colors` shape, generated from the exact same tokens as",
    "  `global.css`. Keep the two in sync via `scaffold --update`, not by",
    "  hand-editing either file.",
    "- `tailwind.config.js` — maps those variables onto Tailwind color names",
    "  (`bg-primary`, `text-foreground`, etc.) usable in any component's",
    "  `className`.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    ...(hasRnr
      ? [
          "- `components/ui/` — every React Native Reusables (RNR) component,",
          "  already vendored and already styled with your brand colors.",
          "- `sdsgt-vendored-components.json` — a hash of each vendored component's",
          "  original content. If you customize a component, don't blindly re-run",
          "  `@react-native-reusables/cli add` on it later — check this file first",
          "  (an AI agent reading `AGENTS.md` already knows to).",
        ]
      : []),
    "",
    "**Known gap:** custom fonts aren't wired into this project. React Native",
    "needs real .ttf/.otf font files loaded via `expo-font`, a different",
    "mechanism and file format than every other SDSGT scaffold's CSS",
    "`@font-face` approach — not yet built. Your type still uses the tokens'",
    "correct sizes/weights, just the platform's default font family rather",
    "than your chosen one.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldReactNative(opts: ScaffoldReactNativeOptions): ScaffoldResult {
  const { codeDir, outDir, componentLibrary, update = false, force = false } = opts;

  const globalCssPath = join(codeDir, "rnr", "global.css");
  if (!existsSync(globalCssPath)) {
    throw new Error(`No RNR theme found in ${codeDir} — run \`generate --rnr --framework react-native\` first (NOT --tailwind — see this file's header for why NativeWind needs RNR's output specifically).`);
  }
  // Real bug found and fixed 2026-09-17: `generate --rnr` always writes a
  // SECOND file, rnr/constants.ts (NAV_THEME — see generate/rnr.ts's own
  // header), but this scaffold only ever copied global.css into the
  // project — constants.ts was silently never delivered at all, on any
  // scaffold run before this one, not just on `update`. Fixed below by
  // copying it too (when it exists — a project generated with an older
  // `generate` build before this file existed won't have one, and that's
  // not fatal).
  const constantsTsPath = join(codeDir, "rnr", "constants.ts");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(tokensCssPath)) {
    throw new Error(`No ${tokensCssPath} found — was ${codeDir} really written by this pipeline's \`generate\`? Spacing values come from there.`);
  }
  if (update) {
    if (!existsSync(outDir)) {
      throw new Error(`--update was passed but ${outDir} doesn't exist — nothing to update. Run \`scaffold\` without --update first to create it.`);
    }
  } else if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-expo-app can create it fresh. Pass --update to refresh an existing project instead.`);
  }

  const projectName = basename(outDir);
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const manifest = readThemeManifest(outDir);
  const nextManifest: Record<string, string> = { ...manifest };

  function guarded(relPath: string, content: string | Buffer, label?: string): void {
    const result = guardedWriteFile(outDir, relPath, content, manifest, { force });
    nextManifest[relPath] = result.hash;
    if (result.written) {
      filesWritten.push(label ?? relPath);
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  if (!update) {
    runCreateExpoApp(outDir);
    installDeps(outDir);
  }

  const globalCss = readFileSync(globalCssPath, "utf-8");
  guarded("global.css", globalCss);
  if (existsSync(constantsTsPath)) {
    guarded("constants.ts", readFileSync(constantsTsPath));
  }

  const hasSecondary = /--secondary:/.test(globalCss);
  const tokensCssContent = readFileSync(tokensCssPath, "utf-8");
  const spacingScale = readCssScale(tokensCssContent, "spacing");
  const fontSizeScale = readCssScale(tokensCssContent, "typography-primitive-font-size");
  guarded("tailwind.config.js", buildTailwindConfig(hasSecondary, spacingScale, fontSizeScale));

  if (!update) {
    writeMetroConfig(outDir);
    filesWritten.push("metro.config.js");
    writeBabelConfig(outDir);
    filesWritten.push("babel.config.js");
    writeNativewindEnvDts(outDir);
    filesWritten.push("nativewind-env.d.ts");
    mergeWebBundlerIntoAppJson(outDir);
    filesWritten.push("app.json (merged web.bundler)");

    rewriteAppTsx(outDir, projectName);
    filesWritten.push("App.tsx");

    if (componentLibrary === "rnr") {
      writeComponentsJson(outDir);
      filesWritten.push("components.json");
      addTsconfigPathAlias(outDir);
      filesWritten.push("tsconfig.json (added @/* path alias)");
      ensureGitCommitted(outDir);
      runRnrAdd(outDir);
      finishRnrSetup(outDir);
      filesWritten.push("components/ui/ (RNR components, vendored)", "lib/utils.ts");

      writeFileSync(join(outDir, "sdsgt-vendored-components.json"), buildRnrVendoredManifest(outDir), "utf-8");
      filesWritten.push("sdsgt-vendored-components.json");
    }
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName, componentLibrary === "rnr");
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
