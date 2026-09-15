// React Native Paper generator — Layer 2 (see pipeline-plan.md, "Three
// layers"). Verified (oss.callstack.com/react-native-paper/docs/guides/
// theming, current npm 5.15.3, 2026-09-10) that Paper now defaults to MD3
// theming, not MD2 — pipeline-plan.md's older "MD2 (MUI, Vuetify, RN
// Paper)" grouping is stale for Paper specifically. Paper's MD3Theme.colors
// role set overlaps heavily with the real Material3 ColorScheme md3.ts
// already computes for Jetpack Compose, so this reuses buildScheme() and
// surfaceColorAtElevation() directly rather than recomputing a parallel
// palette.
//
// Not a blind 1:1 reuse of md3.ts's full COLOR_SCHEME_ROLES, though — Paper
// only uses a subset (it predates/omits Compose's newer *Fixed/*FixedDim/
// *FixedVariant roles and the surfaceBright/surfaceDim/surfaceContainer*
// tier), plus a handful of roles Compose's ColorScheme doesn't have at all:
//   - shadow: fixed pure black (#000000) per the MD3 spec default — same
//     "fixed, non-computed" treatment as our own `static` primitives.
//   - surfaceDisabled / onSurfaceDisabled: onSurface at 12%/38% alpha
//     (verified against Paper's real MD3LightTheme source, 2026-09-10 —
//     "rgba(32, 26, 24, 0.12)"/"rgba(32, 26, 24, 0.38)" in Paper's own
//     default, i.e. onSurface's own color at those two alpha levels).
//   - backdrop: Paper's own hardcoded default ("rgba(59, 45, 41, 0.4)") is
//     a generic Material default, brand-independent. Rather than
//     re-deriving a parallel formula, this reuses our own already-decided
//     overlay.scrim token directly (color.semantic.<mode>.json,
//     neutral.1100 @ 50% alpha) — same role (a dark translucent overlay
//     behind modals/dialogs), same reuse-over-reinvent discipline as
//     contrastText() in shadcn.ts.
// elevation.level0-5 uses MD3's own fixed dp scale (0/1/3/6/8/12) — a
// framework-level constant, independent of this project's own shadow.json
// (which has a different 5-tier sm-2xl shape, not the same cardinality as
// Paper's fixed 6 levels) — computed via surfaceColorAtElevation() at each
// fixed dp, not translated from our own shadow tokens.

import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { hexFromArgb } from "@material/material-color-utilities";

import type { GenerateResult } from "./index.ts";
import { readJson, resolveAlias, type ColorPrimitivesFile, type RadiusFile } from "./read-tokens.ts";
import { buildScheme, surfaceColorAtElevation } from "./md3.ts";
import { LIGHT_FILE, DARK_FILE } from "./index.ts";

// roundness wired 2026-09-15 — a real gap found while building the Figma
// component push: this pipeline's own corner-roundness preset never
// reached Paper's real components before this, only color did. Real,
// verified structural constraint, not a workaround-able one: Paper's own
// `roundness` is a SINGLE global multiplier every component multiplies by
// its own different internal factor (confirmed against Paper's real
// Button.tsx source: `borderRadius = (isV3 ? 5 : 1) * roundness`, i.e. 5x
// for the MD3 theme this generator targets) — there is no per-component
// override this generator can set instead. Calibrated so Button — the one
// component this pipeline's own Figma component push also builds, for the
// same shadcn/ui-equivalent reference point — matches `radius.md` exactly;
// every OTHER Paper component (Card, Chip, TextInput, ...) derives its own
// radius from this same roundness value using ITS OWN real multiplier, so
// only Button is guaranteed to land on this pipeline's real token exactly.
// Must be disclosed wherever this library gets selected — see
// SDSGT-start's own "Suggestion logic" and step 8/10 disclosure text.
const PAPER_MD3_BUTTON_RADIUS_MULTIPLIER = 5;

// Paper's real MD3Theme.colors role set (verified against
// oss.callstack.com/react-native-paper/docs/guides/theming and Paper's own
// MD3LightTheme/MD3DarkTheme source) — a subset of md3.ts's full
// COLOR_SCHEME_ROLES, not the whole 47.
export const PAPER_SCHEME_ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "error", "onError", "errorContainer", "onErrorContainer",
  "background", "onBackground",
  "surface", "onSurface", "surfaceVariant", "onSurfaceVariant",
  "outline", "outlineVariant",
  "inverseSurface", "inverseOnSurface", "inversePrimary",
  "scrim",
] as const;

const ELEVATION_DP = [0, 1, 3, 6, 8, 12] as const;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readBackdrop(semanticFile: string, primitives: ColorPrimitivesFile["color"]["primitive"]): string {
  const { color } = readJson<{ color: { semantic: { overlay: { scrim: { $value: string } } } } }>(semanticFile);
  const raw = color.semantic.overlay.scrim.$value;
  return raw.startsWith("{") ? resolveAlias(raw, primitives) : raw;
}

function colorsLiteral(
  scheme: ReturnType<typeof buildScheme>,
  backdrop: string,
): string {
  const lines: string[] = [];
  for (const role of PAPER_SCHEME_ROLES) {
    const hex = hexFromArgb((scheme as unknown as Record<string, number>)[role]);
    lines.push(`      ${role}: '${hex}',`);
  }
  const onSurfaceHex = hexFromArgb((scheme as unknown as Record<string, number>).onSurface);
  const surfaceHex = hexFromArgb((scheme as unknown as Record<string, number>).surface);
  const tintHex = hexFromArgb((scheme as unknown as Record<string, number>).surfaceTint);

  lines.push(`      shadow: '#000000',`);
  lines.push(`      surfaceDisabled: '${hexToRgba(onSurfaceHex, 0.12)}',`);
  lines.push(`      onSurfaceDisabled: '${hexToRgba(onSurfaceHex, 0.38)}',`);
  lines.push(`      backdrop: '${backdrop}',`);
  lines.push(`      elevation: {`);
  for (const [i, dp] of ELEVATION_DP.entries()) {
    lines.push(`        level${i}: '${surfaceColorAtElevation(surfaceHex, tintHex, dp)}',`);
  }
  lines.push(`      },`);
  return lines.join("\n");
}

// Pattern A integration snippet (pipeline-plan.md / docs/layer2-layer3-plan.md,
// Subject 2). React Native Paper has no scaffolding/init CLI at all — theming
// is always a manual PaperProvider wrap (verified against Paper's own
// "Getting started"/"Theming" guides, oss.callstack.com/react-native-paper,
// 2026-09-11). No Layer 3 project exists yet for this pipeline to wire into,
// so this writes instructions + a real, ready-to-copy code snippet next to
// theme.ts, not something this pipeline runs itself. Deterministic — same
// template every run, branched only on which of theme.ts's exports actually
// exist (hasLight/hasDark), same conditional treatment as colorsLiteral()
// above.
function buildRnPaperSetup(hasLight: boolean, hasDark: boolean): string {
  let providerSnippet: string;
  if (hasLight && hasDark) {
    providerSnippet = [
      "```tsx",
      "import * as React from 'react';",
      "import { PaperProvider } from 'react-native-paper';",
      "import { useColorScheme } from 'react-native';",
      "import { LightTheme, DarkTheme } from './theme';",
      "import App from './App';",
      "",
      "export default function Root() {",
      "  const colorScheme = useColorScheme();",
      "  const theme = colorScheme === 'dark' ? DarkTheme : LightTheme;",
      "",
      "  return (",
      "    <PaperProvider theme={theme}>",
      "      <App />",
      "    </PaperProvider>",
      "  );",
      "}",
      "```",
    ].join("\n");
  } else {
    const themeName = hasDark ? "DarkTheme" : "LightTheme";
    providerSnippet = [
      "```tsx",
      "import * as React from 'react';",
      "import { PaperProvider } from 'react-native-paper';",
      `import { ${themeName} } from './theme';`,
      "import App from './App';",
      "",
      "export default function Root() {",
      "  return (",
      `    <PaperProvider theme={${themeName}}>`,
      "      <App />",
      "    </PaperProvider>",
      "  );",
      "}",
      "```",
    ].join("\n");
  }

  return [
    "# React Native Paper — theme setup",
    "",
    "Generated alongside `theme.ts` — this is instructions, not itself part of",
    "the app. React Native Paper has no scaffolding/init CLI (verified against",
    "Paper's own \"Getting started\"/\"Theming\" guides, oss.callstack.com/",
    "react-native-paper, 2026-09-11) — theming is always a manual `PaperProvider`",
    "wrap, so follow these steps once in your real Expo/React Native project.",
    "This is still theme-only — no components are vendored by this step.",
    "",
    "## 1. Install",
    "",
    "```",
    "npx expo install react-native-paper react-native-safe-area-context",
    "```",
    "",
    "Not using Expo? `npm install react-native-paper react-native-safe-area-context`",
    "instead. Vector icons ship as part of the Expo package already — no extra",
    "install needed there. Outside Expo, also install `react-native-vector-icons`",
    "per Paper's own install guide.",
    "",
    "## 2. Babel (optional — production bundle-size optimization)",
    "",
    "Add to `babel.config.js`:",
    "",
    "```js",
    "module.exports = function (api) {",
    "  api.cache(true);",
    "  return {",
    "    presets: ['babel-preset-expo'],",
    "    env: {",
    "      production: {",
    "        plugins: ['react-native-paper/babel'],",
    "      },",
    "    },",
    "  };",
    "};",
    "```",
    "",
    "## 3. Wrap your app root in PaperProvider",
    "",
    "Copy `theme.ts` (generated next to this file) into your project, then wire",
    "it into your root component:",
    "",
    providerSnippet,
    "",
  ].join("\n");
}

export function generateRnPaper(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));
  const primitives = color.primitive;
  const primaryHex = primitives.brand["600"].$value;
  const secondaryHex = primitives["brand-secondary"]?.["600"].$value;
  const neutralHex = primitives.neutral["600"].$value;
  const errorHex = primitives.status["1"]["200"].$value;

  // See PAPER_MD3_BUTTON_RADIUS_MULTIPLIER's own comment above for why
  // this only guarantees Button, not every Paper component.
  const roundness = parseFloat(radius.md.$value) / PAPER_MD3_BUTTON_RADIUS_MULTIPLIER;

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));

  const themes: string[] = [];

  if (hasLight) {
    const scheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, false);
    const backdrop = readBackdrop(join(tokensDir, LIGHT_FILE), primitives);
    themes.push(
      [
        "export const LightTheme = {",
        "  ...DefaultLightTheme,",
        `  roundness: ${roundness},`,
        "  colors: {",
        colorsLiteral(scheme, backdrop),
        "  },",
        "};",
      ].join("\n"),
    );
  }

  if (hasDark) {
    const scheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, true);
    const backdrop = readBackdrop(join(tokensDir, DARK_FILE), primitives);
    themes.push(
      [
        "export const DarkTheme = {",
        "  ...DefaultDarkTheme,",
        `  roundness: ${roundness},`,
        "  colors: {",
        colorsLiteral(scheme, backdrop),
        "  },",
        "};",
      ].join("\n"),
    );
  }

  const content = [
    "// Generated by SDSGT — React Native Paper MD3 theme.",
    "// Reuses the same real HCT ColorScheme computation as the MD3/Jetpack",
    "// Compose generator (generate/md3.ts) — see that file and",
    "// contracts-and-seeds.md, \"React Native Paper theming,\" for the exact",
    "// derivation. Spreads Paper's own MD3LightTheme/MD3DarkTheme as the",
    "// base (per Paper's own documented customization pattern) and",
    "// overrides `colors` plus `roundness` (radius.md / 5 — Paper's own real",
    "// Button formula, see PAPER_MD3_BUTTON_RADIUS_MULTIPLIER's comment in",
    "// this file — guarantees Button matches, not every Paper component).",
    "// Fonts stay Paper's defaults — a separate, still-open gap.",
    "",
    "import { MD3LightTheme as DefaultLightTheme, MD3DarkTheme as DefaultDarkTheme } from 'react-native-paper';",
    "",
    themes.join("\n\n"),
    "",
  ].join("\n");

  const buildPath = join(outDir, "rn-paper");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "theme.ts"), content, "utf-8");
  writeFileSync(join(buildPath, "SETUP.md"), buildRnPaperSetup(hasLight, hasDark), "utf-8");

  return { filesWritten: ["rn-paper/theme.ts", "rn-paper/SETUP.md"] };
}
