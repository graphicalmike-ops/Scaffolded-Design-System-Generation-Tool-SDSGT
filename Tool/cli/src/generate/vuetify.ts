// Vuetify generator — Layer 2 (see pipeline-plan.md, "Three layers").
// Targets Vuetify 4 (current npm latest, verified 2026-09-10 — Vuetify
// 3.13.0 became the final v3 minor and moved to LTS in July 2026; 4.x is
// now the actively developed line). Verified against Vuetify's own real
// theme composable source (packages/vuetify/src/composables/theme.ts,
// master branch) and its migration notes: the theme system's core
// `ThemeDefinition` shape (`{ dark: boolean, colors: {...} }`) and base
// color keys are unchanged from v3 to v4 — the real breaking changes in v4
// are the default theme mode (system vs light) and elevation moving to
// MD3's 6-level scale, neither of which affects this generator's output
// shape.
//
// Decided scope: like bootstrap.ts, this supplies only the small,
// well-documented custom-theme input contract (primary, secondary,
// background, surface, error, info, success, warning) and lets Vuetify's
// own runtime auto-derive on-*/lighten/darken variants from it — same
// "supply the base, let the framework derive the rest" pattern as
// Bootstrap's own Sass. Vuetify's own DEFAULT theme additionally hardcodes
// a few more keys (surface-bright, primary-darken-1, etc. — confirmed by
// reading the real source) instead of relying purely on auto-derivation,
// but those are Vuetify's own internal implementation choice, not part of
// the documented custom-theme contract this generator targets.
// status.* maps onto Vuetify's native error/warning/info/success color
// keys (role 5, "promo," skipped — same precedent as Bootstrap/MUI's own
// promo-skip, Vuetify has no 5th status slot either).
//
// `variables` (real opacity/emphasis constants) added 2026-09-16 — see
// VUETIFY_OPACITY_DEFAULTS_LIGHT/DARK's own comment for the real source
// and why light/dark get genuinely different values, not just this
// pipeline's own color split.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerateResult } from "./index.ts";
import { readJson, resolveAlias, nearestOpacity, type ColorPrimitivesFile, type SemanticFile, type OpacityFile } from "./read-tokens.ts";
import { LIGHT_FILE, DARK_FILE } from "./index.ts";

// Real Vuetify 4 `theme.variables` opacity/emphasis defaults — confirmed
// against the real npm-published `vuetify@4.2.1` tarball's own
// `composables/theme.js` (`genDefaults()`'s real `light`/`dark` blocks).
// Added 2026-09-16 while auditing Layer 2 for gaps beyond radius/spacing/
// typography specifically — these were never bound to this pipeline's own
// opacity tokens before, only colors were. Real, genuine light/dark
// differences (not just a coincidence of this pipeline's own light/dark
// color split) — e.g. dark mode's real `disabled-opacity` is 0.50, not
// light's 0.38, and `high-emphasis-opacity` is a full 1 in dark vs. 0.87 in
// light. `border-color`/`shadow-color`/the `theme-*` string variables are
// left at Vuetify's own real defaults — this pipeline has no equivalent
// token for those.
const VUETIFY_OPACITY_DEFAULTS_LIGHT: Record<string, number> = {
  "border-opacity": 0.12,
  "high-emphasis-opacity": 0.87,
  "medium-emphasis-opacity": 0.6,
  "disabled-opacity": 0.38,
  "idle-opacity": 0.04,
  "hover-opacity": 0.04,
  "focus-opacity": 0.12,
  "selected-opacity": 0.08,
  "activated-opacity": 0.12,
  "pressed-opacity": 0.12,
  "dragged-opacity": 0.08,
};

const VUETIFY_OPACITY_DEFAULTS_DARK: Record<string, number> = {
  "border-opacity": 0.12,
  "high-emphasis-opacity": 1,
  "medium-emphasis-opacity": 0.7,
  "disabled-opacity": 0.5,
  "idle-opacity": 0.1,
  "hover-opacity": 0.04,
  "focus-opacity": 0.12,
  "selected-opacity": 0.08,
  "activated-opacity": 0.12,
  "pressed-opacity": 0.16,
  "dragged-opacity": 0.08,
};

function themeVariablesBlock(defaults: Record<string, number>, opacity: Record<string, { $type: "number"; $value: number }>): string {
  return Object.entries(defaults)
    .map(([key, target]) => `      '${key}': ${nearestOpacity(target, opacity)},`)
    .join("\n");
}

// Per "Boilerplate status-color formula": role 1=error, 2=success,
// 3=warning, 4=info, 5=promo. Promo has no Vuetify color slot and is
// deliberately omitted, not approximated — same treatment as Bootstrap/MUI.
export const STATUS_ROLE_TO_VUETIFY: Record<string, string> = {
  "1": "error",
  "2": "success",
  "3": "warning",
  "4": "info",
};

export function resolveSemanticPath(
  semanticFile: string,
  group: string,
  role: string,
  primitives: ColorPrimitivesFile["color"]["primitive"],
): string {
  const { color } = readJson<SemanticFile>(semanticFile);
  const tree = color.semantic as unknown as Record<string, Record<string, { $value: string }>>;
  const raw = tree[group][role].$value;
  return raw.startsWith("{") ? resolveAlias(raw, primitives) : raw;
}

function themeColorsBlock(
  semanticFile: string,
  primitives: ColorPrimitivesFile["color"]["primitive"],
): string {
  const lines: string[] = [
    `      primary: '${primitives.brand["600"].$value}',`,
  ];
  if (primitives["brand-secondary"]) {
    lines.push(`      secondary: '${primitives["brand-secondary"]["600"].$value}',`);
  }
  lines.push(`      background: '${resolveSemanticPath(semanticFile, "background", "primary", primitives)}',`);
  lines.push(`      surface: '${resolveSemanticPath(semanticFile, "background", "surface", primitives)}',`);
  for (const [role, name] of Object.entries(STATUS_ROLE_TO_VUETIFY)) {
    const token = primitives.status[role]?.["200"];
    if (token) lines.push(`      ${name}: '${token.$value}',`);
  }
  return lines.join("\n");
}

// Pattern A integration snippet (pipeline-plan.md / docs/layer2-layer3-plan.md,
// Subject 2). Verified against Vuetify's own real installation docs
// (packages/docs/src/pages/en/getting-started/installation.md, master
// branch, 2026-09-11): `npm create vuetify` / create-vuetify only scaffolds
// a brand-new project — it has no mode for adding Vuetify to an existing
// one. No Layer 3 project exists yet for this pipeline to scaffold anyway,
// so the correct path is the plain manual install Vuetify itself documents
// for existing projects, not attempting to shell out to create-vuetify.
// Deterministic — same template every run, branched only on which of
// theme.ts's exports actually exist (hasLight/hasDark), same conditional
// treatment as themeColorsBlock() above.
function buildVuetifySetup(hasLight: boolean, hasDark: boolean): string {
  const themeEntries: string[] = [];
  if (hasLight) themeEntries.push("      light: lightTheme,");
  if (hasDark) themeEntries.push("      dark: darkTheme,");
  const importNames = [hasLight ? "lightTheme" : null, hasDark ? "darkTheme" : null].filter(Boolean).join(", ");
  const defaultTheme = hasLight ? "light" : "dark";

  const pluginSnippet = [
    "```ts",
    "import { createApp } from 'vue';",
    "import 'vuetify/styles';",
    "import { createVuetify } from 'vuetify';",
    "import * as components from 'vuetify/components';",
    "import * as directives from 'vuetify/directives';",
    `import { ${importNames} } from './theme';`,
    "import App from './App.vue';",
    "",
    "const vuetify = createVuetify({",
    "  components,",
    "  directives,",
    "  theme: {",
    `    defaultTheme: '${defaultTheme}',`,
    "    themes: {",
    ...themeEntries,
    "    },",
    "  },",
    "});",
    "",
    "createApp(App).use(vuetify).mount('#app');",
    "```",
  ].join("\n");

  return [
    "# Vuetify — theme setup",
    "",
    "Generated alongside `theme.ts` — this is instructions, not itself part of",
    "the app. `npm create vuetify` / `create-vuetify` only scaffolds a",
    "brand-new project — it can't target an existing one (verified against",
    "Vuetify's own installation docs, 2026-09-11) — so this is the plain manual",
    "install Vuetify itself documents for adding it to an existing project.",
    "This is still theme-only — no components are vendored by this step.",
    "",
    "## 1. Install",
    "",
    "```",
    "npm install vuetify",
    "```",
    "",
    "## 2. Wire it into your app's entry file",
    "",
    "Copy `theme.ts` (generated next to this file) into your project, then wire",
    "it into your entry file (typically `main.ts`):",
    "",
    pluginSnippet,
    "",
  ].join("\n");
}

export function generateVuetify(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const { opacity } = readJson<OpacityFile>(join(tokensDir, "opacity.json"));

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));

  const themes: string[] = [];
  if (hasLight) {
    themes.push(
      [
        "export const lightTheme = {",
        "  dark: false,",
        "  colors: {",
        themeColorsBlock(join(tokensDir, LIGHT_FILE), primitives),
        "  },",
        "  variables: {",
        themeVariablesBlock(VUETIFY_OPACITY_DEFAULTS_LIGHT, opacity),
        "  },",
        "};",
      ].join("\n"),
    );
  }
  if (hasDark) {
    themes.push(
      [
        "export const darkTheme = {",
        "  dark: true,",
        "  colors: {",
        themeColorsBlock(join(tokensDir, DARK_FILE), primitives),
        "  },",
        "  variables: {",
        themeVariablesBlock(VUETIFY_OPACITY_DEFAULTS_DARK, opacity),
        "  },",
        "};",
      ].join("\n"),
    );
  }

  const content = [
    "// Generated by SDSGT — Vuetify 4 theme definitions.",
    "// A small, curated base-color set (primary/secondary/background/",
    "// surface/error/info/success/warning) — Vuetify's own runtime derives",
    "// on-*/lighten/darken variants from these, same pattern as Bootstrap's",
    "// own Sass deriving tints from just $primary. Spread into createVuetify",
    "// ({ theme: { themes: { light: lightTheme, dark: darkTheme } } }).",
    "",
    themes.join("\n\n"),
    "",
  ].join("\n");

  const buildPath = join(outDir, "vuetify");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "theme.ts"), content, "utf-8");
  writeFileSync(join(buildPath, "SETUP.md"), buildVuetifySetup(hasLight, hasDark), "utf-8");

  return { filesWritten: ["vuetify/theme.ts", "vuetify/SETUP.md"] };
}
