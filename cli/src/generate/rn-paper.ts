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
import { readJson, resolveAlias, type ColorPrimitivesFile } from "./read-tokens.ts";
import { buildScheme, surfaceColorAtElevation } from "./md3.ts";
import { LIGHT_FILE, DARK_FILE } from "./index.ts";

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

export function generateRnPaper(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const primaryHex = primitives.brand["600"].$value;
  const secondaryHex = primitives["brand-secondary"]?.["600"].$value;
  const neutralHex = primitives.neutral["600"].$value;
  const errorHex = primitives.status["1"]["200"].$value;

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
    "// overrides only `colors` — fonts/roundness/etc. stay Paper's defaults.",
    "",
    "import { MD3LightTheme as DefaultLightTheme, MD3DarkTheme as DefaultDarkTheme } from 'react-native-paper';",
    "",
    themes.join("\n\n"),
    "",
  ].join("\n");

  const buildPath = join(outDir, "rn-paper");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "theme.ts"), content, "utf-8");

  return { filesWritten: ["rn-paper/theme.ts"] };
}
