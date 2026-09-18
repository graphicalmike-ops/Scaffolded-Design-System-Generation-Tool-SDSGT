// Layer 3 — React Native (Expo) scaffold, React Native Paper (MD3) path.
// See scaffold/react-native.ts for the NativeWind path — this is a
// genuinely separate pipeline, not a variant: no NativeWind/Tailwind
// involved at all, Material Design comes from Paper's own component
// styling, matching the same split already established between
// scaffold/vuejs.ts and scaffold/vuejs-vuetify.ts.
//
// React Native Paper has no scaffolding/init CLI of its own (verified
// against Paper's own "Getting started"/"Theming" guides — same finding
// already recorded in generate/rn-paper.ts when Pattern A's SETUP.md was
// built) — theming is always a manual `PaperProvider` wrap. This scaffold
// automates exactly that wrap into a real generated project, the same real
// installation this pipeline already gives Vuetify on the Vue.js side,
// rather than leaving it as copy-paste instructions (which is still the
// right call for someone adding Paper to an EXISTING project — see Pattern
// A's own SETUP.md, unchanged).
//
// Icons need no separate install — verified 2026-09-14 against Paper's own
// real getting-started guide: "If you use Expo, you don't need to install
// vector icons - those are part of the expo package." Resolves the last
// open "icons as assets" gap from pipeline-plan.md's deferred list (RN
// Paper was the one item still unresolved there after shadcn/ui's
// lucide-react and Vuetify's @mdi/font were both closed).
//
// Same font gap as scaffold/react-native.ts — see that file's header. Not
// repeated here since it applies identically.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { copyAgentDocs, collectFilesRecursive, readThemeManifest, writeThemeManifest, guardedWriteFile } from "../shared/scaffold-common.ts";

export interface ScaffoldReactNativePaperOptions {
  codeDir: string; // output of `generate --rn-paper --framework react-native`
  outDir: string; // where a new project gets created (update: false/omitted)
  // or an already-scaffolded one gets refreshed (update: true)
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

// `expo install`, not plain `npm install` — gets the version matching the
// current Expo SDK, same convention this pipeline's own RN Paper SETUP.md
// already documents ("npx expo install react-native-paper
// react-native-safe-area-context"). react-dom/react-native-web included too
// since blank-typescript has no web support by default (same real gap
// found and fixed in scaffold/react-native.ts) but this scaffold's own
// README tells the user "w" for web is a real option.
function installDeps(outDir: string): void {
  // Same ordering requirement as scaffold/react-native.ts — `expo install`
  // needs `expo` already in node_modules, which --no-install skipped.
  run("npm", ["install"], outDir, "npm install (base deps)");
  run("npx", ["expo", "install", "react-native-paper", "react-native-safe-area-context", "react-dom", "react-native-web"], outDir, "expo install");
}

// Branches the same way Pattern A's own SETUP.md snippet already does
// (generate/rn-paper.ts's buildRnPaperSetup) — both/single-mode cases —
// so the real scaffold and the "add to an existing project" instructions
// stay consistent conventions for the same generator output, same
// discipline the Vuetify scaffold already follows against its own SETUP.md.
function rewriteAppTsx(outDir: string, projectName: string, hasLight: boolean, hasDark: boolean): void {
  const themeSetup = hasLight && hasDark
    ? [
        "import { useColorScheme } from 'react-native';",
        "import { LightTheme, DarkTheme } from './theme';",
      ].join("\n")
    : `import { ${hasDark ? "DarkTheme" : "LightTheme"} } from './theme';`;

  const themeSelection = hasLight && hasDark
    ? [
        "export default function App() {",
        "  const colorScheme = useColorScheme();",
        "  const theme = colorScheme === 'dark' ? DarkTheme : LightTheme;",
        "",
        "  return (",
      ].join("\n")
    : [
        "export default function App() {",
        `  const theme = ${hasDark ? "DarkTheme" : "LightTheme"};`,
        "",
        "  return (",
      ].join("\n");

  const content = [
    "import { StatusBar } from 'expo-status-bar';",
    "import { PaperProvider, Text } from 'react-native-paper';",
    "import { View, StyleSheet } from 'react-native';",
    "import { Button } from './components/Button';",
    themeSetup,
    "",
    themeSelection,
    "    <PaperProvider theme={theme}>",
    "      <View style={styles.container}>",
    '        <Text variant="headlineMedium" style={styles.title}>',
    "          Your design system is ready",
    "        </Text>",
    "        <Text style={styles.body}>",
    `          This project was generated by SDSGT — ${projectName}'s tokens and`,
    "          colors are already wired in. Open App.tsx to start building.",
    "        </Text>",
    '        <Button mode="contained">Primary button</Button>',
    '        <StatusBar style="auto" />',
    "      </View>",
    "    </PaperProvider>",
    "  );",
    "}",
    "",
    "const styles = StyleSheet.create({",
    "  container: {",
    "    flex: 1,",
    "    alignItems: 'center',",
    "    justifyContent: 'center',",
    "    gap: 16,",
    "    padding: 32,",
    "  },",
    "  title: {",
    "    textAlign: 'center',",
    "  },",
    "  body: {",
    "    textAlign: 'center',",
    "  },",
    "});",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "App.tsx"), content, "utf-8");
}

function writeReadme(outDir: string, projectName: string): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — an Expo (React Native) project with your design",
    "system's colors already wired in via React Native Paper (Material",
    "Design 3).",
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
    "- `theme.ts` — your generated Paper `MD3Theme` (real HCT tonal palette,",
    "  same computation as Jetpack Compose Material3). After editing tokens,",
    "  run `generate` then `scaffold --update` (same flags, --out pointing",
    "  back at this project) to refresh this in place; don't hand-edit it",
    "  directly — an update run warns instead of silently overwriting a",
    "  hand-edited file.",
    "- `App.tsx` — wraps the app in `PaperProvider` with that theme, switching",
    "  between light/dark automatically if both exist.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "",
    "No component vendoring here (unlike shadcn/shadcn-vue) — React Native",
    "Paper ships as one complete package, but eleven of its components need",
    "to be imported from `./components/` instead of `react-native-paper`",
    "directly (see below) for their geometry to actually reflect your",
    "tokens.",
    "",
    "- `components/` — eleven thin wrappers around Paper's own real",
    "  components (`Button`, `Card`, `Chip`, `TextInput`, `Snackbar`, `Menu`,",
    "  `ToggleButton`, `Drawer.Item`, `FAB`, `Searchbar`, `Dialog`). Paper's",
    "  `roundness` theme value alone only guarantees `Button`'s CORNERS match",
    "  your real radius token — every one of the other ten uses a DIFFERENT",
    "  internal multiplier and would render the wrong radius if imported",
    "  straight from `react-native-paper`. `Button` itself needs wrapping for",
    "  a different reason: its real internal PADDING (`marginVertical`/",
    "  `marginHorizontal` on its label — Paper has no literal `padding` here)",
    "  was never bound to your spacing tokens at all. Import all eleven from",
    "  `./components/` instead — they use each real component's own real,",
    "  public per-instance override prop (`style`, `contentStyle` for Menu,",
    "  `outlineStyle` for outlined TextInput, `labelStyle` for Button — not a",
    "  hack) to bring these in line, and still forward your own override on",
    "  top if you pass one. `Button`, `FAB`, and `Searchbar` only apply this",
    "  to their real default mode/size (`Button` any mode except `\"text\"`,",
    "  `FAB` `size=\"medium\"`, `Searchbar` `mode=\"bar\"`) — other modes/sizes",
    "  keep Paper's own real defaults, since this pipeline has no real source",
    "  for what proportion they should keep instead. This covers every real",
    "  Paper component whose OWN source references `roundness` at all —",
    "  confirmed exhaustively (grepped the entire real component source",
    "  tree, not just the ones already suspected), not just the ones",
    "  checked so far. SegmentedButtons and Tooltip are the only two that",
    "  use `roundness` but have no real override path in their own source —",
    "  confirmed, genuine exceptions, not oversights. Every other Paper",
    "  component (Avatar, Badge, IconButton, and more) either has no radius",
    "  concept at all or uses a deliberately fixed, circular shape",
    "  (`size / 2`) independent of any roundness preset — correct Material",
    "  Design behavior, not a gap to fix. Keep importing all of those",
    "  directly from `react-native-paper`.",
    "- `theme.ts` also binds every real MD3 typescale role's `fontSize`",
    "  (`displayLarge` through `bodySmall`) to your nearest real type-scale",
    "  token — a genuine theme-level fix, no wrapper needed for this one.",
    "  Font FAMILY stays Paper's own default — see the known gap below.",
    "",
    "**Known gap:** custom fonts aren't wired into this project — see",
    "`AGENTS.md` for why (same reason as every SDSGT React Native scaffold).",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldReactNativePaper(opts: ScaffoldReactNativePaperOptions): ScaffoldResult {
  const { codeDir, outDir, update = false, force = false } = opts;

  const themeTsPath = join(codeDir, "rn-paper", "theme.ts");
  if (!existsSync(themeTsPath)) {
    throw new Error(`No React Native Paper theme found in ${codeDir} — run \`generate --rn-paper --framework react-native\` first.`);
  }
  if (update) {
    if (!existsSync(outDir)) {
      throw new Error(`--update was passed but ${outDir} doesn't exist — nothing to update. Run \`scaffold\` without --update first to create it.`);
    }
  } else if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-expo-app can create it fresh. Pass --update to refresh an existing project instead.`);
  }

  const themeTsContent = readFileSync(themeTsPath, "utf-8");
  const hasLight = /export const LightTheme/.test(themeTsContent);
  const hasDark = /export const DarkTheme/.test(themeTsContent);

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

  guarded("theme.ts", readFileSync(themeTsPath));

  // Eleven wrapper components (Card/Chip/TextInput, then Snackbar/Menu/
  // ToggleButton/DrawerItem/FAB/Searchbar/Dialog, then Button — all added
  // 2026-09-16) — see generate/rn-paper.ts's own buildCardWrapper header
  // for the full "why" on radius: Paper's own `roundness` theme value only
  // guarantees Button's RADIUS matches `radius.md`, since every other
  // component multiplies it by its own different real factor. `Button`
  // itself is wrapped for a different reason — its own real PADDING
  // (actually `marginVertical`/`marginHorizontal` on its label, see
  // buildButtonWrapper's own header) was never bound at all, radius aside.
  // Each of these eleven wraps Paper's own real component, using its own
  // real public override path (`style`/`contentStyle`/`outlineStyle`/
  // `labelStyle`, verified against Paper's actual source per-component,
  // not assumed to generalize) — closing part of the previously
  // fully-disclosed "every OTHER component approximates" gap. Tooltip and
  // SegmentedButtons are confirmed, real exceptions with no override path
  // in their own source — not wrapped, not silently skipped.
  //
  // Each wrapper is guarded individually (not treated as untouchable
  // "vendored" source the way shadcn's/RNR's own registry files are) —
  // unlike those, these bake real token values (radius/padding numbers)
  // directly into each file at generate time rather than referencing an
  // external CSS-variable file, so `scaffold --update` needs to actually
  // refresh them for a token change to reach these eleven components at all.
  const componentsSrcPath = join(codeDir, "rn-paper", "components");
  if (existsSync(componentsSrcPath)) {
    for (const file of collectFilesRecursive(componentsSrcPath)) {
      const rel = join("components", relative(componentsSrcPath, file));
      guarded(rel, readFileSync(file));
    }
  }

  if (!update) {
    rewriteAppTsx(outDir, projectName, hasLight, hasDark);
    filesWritten.push("App.tsx");
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName);
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
