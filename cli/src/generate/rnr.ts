// React Native Reusables (RNR) generator — Layer 2 (see pipeline-plan.md,
// "Three layers"). RNR is explicitly "shadcn for React Native": same
// variable set and mapping decisions as generate/shadcn.ts (reuses
// resolveShadcnVars directly, see contracts-and-seeds.md, "shadcn/ui
// theming," for the full mapping table and gap-fill reasoning) — only the
// value *serialization* differs.
//
// Verified against the real, current repo (founded-labs/react-native-
// reusables, checked 2026-09-10 — an older mrzachnugent/react-native-
// reusables org shows up in some search results too, likely a prior name/
// transfer; re-check if this generator ever needs updating): RNR's
// global.css writes each CSS variable as a raw "H S% L%" triplet with NO
// hsl() wrapper (e.g. `--background: 0 0% 100%;`), not hex. The wrapper
// lives in tailwind.config.js instead (`background: 'hsl(var(--background))'`)
// — this is NativeWind's own requirement, not a style choice: substituting
// a hex string into that hsl() wrapper would be invalid CSS. So shadcn.ts's
// hex output can't serve RNR as-is; this generator converts the same
// resolved hex values to HSL triplets instead. RNR's own file also has no
// --destructive-foreground var (it forked from an older shadcn/ui
// convention, before that var existed) — matched here for fidelity, though
// SDSGT's own shadcn.ts generator does compute one.
//
// RNR also needs a second file, constants.ts, exporting NAV_THEME.light/
// .dark — React Navigation's own Theme.colors shape (verified against
// reactnavigation.org/docs/themes, 2026-09-10: primary, background, card,
// text, border, notification — 6 keys, unrelated to the fonts field newer
// Theme versions also require, since that comes from spreading React
// Navigation's own DefaultTheme/DarkTheme as the base, not from here).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LIGHT_FILE, DARK_FILE, type GenerateResult } from "./index.ts";
import { readJson, type ColorPrimitivesFile, type SemanticFile } from "./read-tokens.ts";
import { resolveShadcnVars } from "./shadcn.ts";

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// Round to 1 decimal, drop a trailing ".0" — matches RNR's own real
// global.css formatting (e.g. "45.1%" but "100%", not "100.0%").
function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

// Standard RGB -> HSL conversion, verified against the CSS Color Module's
// own algorithm (no external formula needed — this is a well-defined,
// widely-implemented conversion, not something to independently verify
// like a vendor's own theming contract).
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${trimDecimal(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return `${Math.round(h)} ${trimDecimal(s * 100)}% ${trimDecimal(l * 100)}%`;
}

function varsBlock(vars: Array<{ cssVar: string; hex: string }>): string[] {
  return vars
    .filter(({ cssVar }) => cssVar !== "--destructive-foreground") // see file header — RNR's own file has no foreground pair for destructive
    .map(({ cssVar, hex }) => `    ${cssVar}: ${hexToHslTriplet(hex)};`);
}

interface NavColors {
  primary: string;
  background: string;
  card: string;
  text: string;
  border: string;
  notification: string;
}

function navColorsFor(vars: Array<{ cssVar: string; hex: string }>): NavColors {
  const byVar = new Map(vars.map((v) => [v.cssVar, v.hex]));
  return {
    primary: byVar.get("--primary")!,
    background: byVar.get("--background")!,
    card: byVar.get("--card")!,
    text: byVar.get("--foreground")!,
    border: byVar.get("--border")!,
    notification: byVar.get("--destructive")!,
  };
}

function navColorsLiteral(colors: NavColors): string {
  return `{\n    primary: '${colors.primary}',\n    background: '${colors.background}',\n    card: '${colors.card}',\n    text: '${colors.text}',\n    border: '${colors.border}',\n    notification: '${colors.notification}',\n  }`;
}

export function generateRnr(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));

  const cssBlocks: string[] = [];
  let lightVars: Array<{ cssVar: string; hex: string }> | null = null;
  let darkVars: Array<{ cssVar: string; hex: string }> | null = null;

  // :root always carries --radius (mode-independent) even on a dark-only
  // project, same precedent as shadcn.ts — only the color values are
  // conditional on a light mode existing.
  const rootLines: string[] = [];
  if (hasLight) {
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, LIGHT_FILE));
    lightVars = resolveShadcnVars(semanticRoot.semantic, primitives);
    rootLines.push(...varsBlock(lightVars));
  }
  rootLines.push(`    --radius: 0.625rem;`);
  cssBlocks.push(["  :root {", ...rootLines, "  }"].join("\n"));

  if (hasDark) {
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, DARK_FILE));
    darkVars = resolveShadcnVars(semanticRoot.semantic, primitives);
    cssBlocks.push(["  .dark:root {", ...varsBlock(darkVars), "  }"].join("\n"));
  }

  const cssContent = [
    "/* Generated by SDSGT — React Native Reusables (RNR) theme. */",
    '/* Same semantic mapping as shadcn/ui (generate/shadcn.ts) — RNR is */',
    '/* explicitly "shadcn for React Native" — but values are raw "H S% L%" */',
    "/* triplets, not hex: NativeWind's tailwind.config.js wraps these in */",
    "/* hsl(var(--x)) itself, and a hex string there would be invalid CSS. */",
    "/* See contracts-and-seeds.md, \"React Native Reusables (RNR) theming.\" */",
    "",
    "@tailwind base;",
    "@tailwind components;",
    "@tailwind utilities;",
    "",
    "@layer base {",
    cssBlocks.join("\n\n"),
    "}",
    "",
  ].join("\n");

  const tsContent = [
    "// Generated by SDSGT — React Native Reusables NAV_THEME.",
    "// React Navigation's own Theme.colors shape (6 keys) — spread this into",
    "// DefaultTheme/DarkTheme's own `colors`, don't replace the whole Theme.",
    "// See contracts-and-seeds.md, \"React Native Reusables (RNR) theming.\"",
    "",
    "export const NAV_THEME = {",
    ...(lightVars ? [`  light: ${navColorsLiteral(navColorsFor(lightVars))},`] : []),
    ...(darkVars ? [`  dark: ${navColorsLiteral(navColorsFor(darkVars))},`] : []),
    "} as const;",
    "",
  ].join("\n");

  const buildPath = join(outDir, "rnr");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "global.css"), cssContent, "utf-8");
  writeFileSync(join(buildPath, "constants.ts"), tsContent, "utf-8");

  return { filesWritten: ["rnr/global.css", "rnr/constants.ts"] };
}
