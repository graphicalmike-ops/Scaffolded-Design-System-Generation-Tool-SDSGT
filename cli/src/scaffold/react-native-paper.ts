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
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, join } from "node:path";

import { copyAgentDocs } from "../shared/scaffold-common.ts";

export interface ScaffoldReactNativePaperOptions {
  codeDir: string; // output of `generate --rn-paper --framework react-native`
  outDir: string; // where the new project gets created — must not already exist
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
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
    "import { PaperProvider, Text, Button } from 'react-native-paper';",
    "import { View, StyleSheet } from 'react-native';",
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
    "  same computation as Jetpack Compose Material3). Re-run SDSGT's",
    "  `generate` step to update this; don't hand-edit it directly, since the",
    "  next scaffold run overwrites it.",
    "- `App.tsx` — wraps the app in `PaperProvider` with that theme, switching",
    "  between light/dark automatically if both exist.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "",
    "No component vendoring here (unlike shadcn/shadcn-vue) — React Native",
    "Paper ships as one complete package you import components from directly",
    "(`import { Button } from 'react-native-paper'`), the same way Vuetify",
    "does on the Vue.js side.",
    "",
    "**Known gap:** custom fonts aren't wired into this project — see",
    "`AGENTS.md` for why (same reason as every SDSGT React Native scaffold).",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldReactNativePaper(opts: ScaffoldReactNativePaperOptions): ScaffoldResult {
  const { codeDir, outDir } = opts;

  const themeTsPath = join(codeDir, "rn-paper", "theme.ts");
  if (!existsSync(themeTsPath)) {
    throw new Error(`No React Native Paper theme found in ${codeDir} — run \`generate --rn-paper --framework react-native\` first.`);
  }
  if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-expo-app can create it fresh.`);
  }

  const themeTsContent = readFileSync(themeTsPath, "utf-8");
  const hasLight = /export const LightTheme/.test(themeTsContent);
  const hasDark = /export const DarkTheme/.test(themeTsContent);

  const projectName = basename(outDir);
  const filesWritten: string[] = [];

  runCreateExpoApp(outDir);
  installDeps(outDir);

  copyFileSync(themeTsPath, join(outDir, "theme.ts"));
  filesWritten.push("theme.ts");

  rewriteAppTsx(outDir, projectName, hasLight, hasDark);
  filesWritten.push("App.tsx");

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  writeReadme(outDir, projectName);
  filesWritten.push("README.md");

  return { filesWritten, projectDir: outDir };
}
