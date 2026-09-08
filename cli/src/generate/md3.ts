// MD3/Jetpack Compose Material3 generator — see pipeline-plan.md,
// "Generators." The biggest lift of the five targets: unlike Tailwind/
// Bootstrap/MD2, MD3 doesn't reuse our own primitive ramp at all — it
// computes a real HCT tonal palette + androidx.compose.material3.ColorScheme
// via Google's own open-source Material Color Utilities library, seeded
// from our semantic brand/secondary/neutral/error colors.
//
// Dependency note: pinned to @material/material-color-utilities@^0.3.0, NOT
// the current 0.4.0 — 0.4.0 has a real, currently-open published-package
// bug (github.com/material-foundation/material-color-utilities issues #193/
// #195: a relative import in dynamiccolor/color_spec_2025.js is missing its
// .js extension, which fails Node's ESM resolution unconditionally, even
// when only the simpler 2021-spec API below is used). Verified 0.3.0 has no
// such bug and exposes the same DynamicScheme/TonalPalette/SchemeTonalSpot
// API this file needs. Don't bump this dependency without re-verifying the
// import actually resolves under plain Node ESM.
//
// Decided scope:
// - Real HCT tonal palettes, not a slice of the shared primitive ramp:
//   primaryPalette/secondaryPalette/neutralPalette are each
//   TonalPalette.fromInt() of our OWN already-chosen brand/brand-secondary/
//   neutral colors (their real hue+chroma, not normalized to a variant's
//   fixed chroma) — this keeps the generated scheme faithful to the actual
//   colors this project's seed input collected, rather than replacing them
//   with Material You's own hue-rotation heuristic. Where we have no real
//   seed of our own (secondary color not supplied; tertiary and
//   neutral-variant have no first-class concept in our token spec at all),
//   fall back to the TonalSpot variant's own real, documented formula
//   (verified from the library's real source, not invented) — TonalSpot is
//   "the default Material You theme on Android 12 and 13," the same spirit
//   as reusing Bootstrap's own tint-color()/shade-color() rather than
//   hand-rolling a substitute.
// - errorPalette overridden from our own status.1 (error) primitive rather
//   than Google's fixed default red — keeps MD3's error/onError/
//   errorContainer color-consistent with the same error color Bootstrap's
//   $danger and MUI's error group already use elsewhere in this project.
// - Elevation's tonal-surface overlay (contracts-and-seeds.md, "Shadow":
//   "MD3's elevation isn't a pure shadow") computed with Compose's own real
//   surfaceColorAtElevation formula (verified from
//   androidx.compose.material3.ColorScheme.kt): alpha = (4.5*ln(dp+1)+2)/100,
//   surfaceTint at that alpha composited over surface. Only runs when
//   shadow.json's tokens are the MD3/MD2 `dimension` (elevation dp) shape —
//   skipped, not approximated, if a mismatched Tailwind/Bootstrap `shadow`
//   composite preset was chosen instead (contracts-and-seeds.md: "never
//   assume one shadow shape covers every preset").

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  Hct,
  TonalPalette,
  DynamicScheme,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";

// The `Variant` enum exists in the installed package (dynamiccolor/
// variant.js, TONAL_SPOT = 2) but isn't re-exported from its public "."
// entry point in 0.3.0, and the package's `exports` map blocks reaching it
// via a deep import — so the real numeric value is used directly here
// rather than importing the type. Verified against the compiled
// variant.js in node_modules, not guessed.
const TONAL_SPOT_VARIANT = 2;

import type { GenerateResult } from "./index.ts";
import { readJson, type ColorPrimitivesFile } from "./read-tokens.ts";

// Real TonalSpot (2021 spec) formula, verified against the installed
// library's own compiled source (scheme/scheme_tonal_spot.js) — used only
// for the parts of the scheme we have no real seed color for.
const TONAL_SPOT_SECONDARY_CHROMA = 16;
const TONAL_SPOT_TERTIARY_HUE_OFFSET = 60;
const TONAL_SPOT_TERTIARY_CHROMA = 24;
const TONAL_SPOT_NEUTRAL_VARIANT_CHROMA_DELTA = 2; // neutral=6, neutralVariant=8

function sanitizeDegrees(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function buildScheme(
  primaryHex: string,
  secondaryHex: string | undefined,
  neutralHex: string,
  errorHex: string,
  isDark: boolean,
): DynamicScheme {
  const primaryArgb = argbFromHex(primaryHex);
  const primaryHct = Hct.fromInt(primaryArgb);
  const neutralHct = Hct.fromInt(argbFromHex(neutralHex));

  const secondaryPalette = secondaryHex
    ? TonalPalette.fromInt(argbFromHex(secondaryHex))
    : TonalPalette.fromHueAndChroma(primaryHct.hue, TONAL_SPOT_SECONDARY_CHROMA);

  const scheme = new DynamicScheme({
    sourceColorArgb: primaryArgb,
    variant: TONAL_SPOT_VARIANT as ConstructorParameters<typeof DynamicScheme>[0]["variant"],
    contrastLevel: 0,
    isDark,
    primaryPalette: TonalPalette.fromInt(primaryArgb),
    secondaryPalette,
    tertiaryPalette: TonalPalette.fromHueAndChroma(
      sanitizeDegrees(primaryHct.hue + TONAL_SPOT_TERTIARY_HUE_OFFSET),
      TONAL_SPOT_TERTIARY_CHROMA,
    ),
    neutralPalette: TonalPalette.fromInt(argbFromHex(neutralHex)),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(
      neutralHct.hue,
      neutralHct.chroma + TONAL_SPOT_NEUTRAL_VARIANT_CHROMA_DELTA,
    ),
  });
  scheme.errorPalette = TonalPalette.fromInt(argbFromHex(errorHex));
  return scheme;
}

// Every androidx.compose.material3.ColorScheme constructor field, in the
// order verified from the real Compose source (ColorScheme.kt) — emitted
// with named arguments below, so exact declared order doesn't matter for
// compiling, only that every name is present and spelled correctly.
const COLOR_SCHEME_ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "inversePrimary",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "background", "onBackground",
  "surface", "onSurface", "surfaceVariant", "onSurfaceVariant", "surfaceTint",
  "inverseSurface", "inverseOnSurface",
  "error", "onError", "errorContainer", "onErrorContainer",
  "outline", "outlineVariant",
  "scrim",
  "surfaceBright", "surfaceDim",
  "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest", "surfaceContainerLow", "surfaceContainerLowest",
  "primaryFixed", "primaryFixedDim", "onPrimaryFixed", "onPrimaryFixedVariant",
  "secondaryFixed", "secondaryFixedDim", "onSecondaryFixed", "onSecondaryFixedVariant",
  "tertiaryFixed", "tertiaryFixedDim", "onTertiaryFixed", "onTertiaryFixedVariant",
] as const;

function kotlinColor(hex: string): string {
  return `Color(0xFF${hex.replace("#", "").toUpperCase()})`;
}

function colorSchemeKotlin(scheme: DynamicScheme, valName: string): string {
  const args = COLOR_SCHEME_ROLES.map((role) => {
    const argb = (scheme as unknown as Record<string, number>)[role];
    return `    ${role} = ${kotlinColor(hexFromArgb(argb))},`;
  });
  return `val ${valName} = ColorScheme(\n${args.join("\n")}\n)`;
}

// Compose's own real surfaceColorAtElevation formula, verified from
// androidx.compose.material3's ColorScheme.kt — surfaceTint at this alpha,
// alpha-composited over surface (standard "over" compositing, since surface
// is always opaque).
function surfaceColorAtElevation(surfaceHex: string, surfaceTintHex: string, elevationDp: number): string {
  if (elevationDp === 0) return surfaceHex;
  const alpha = (4.5 * Math.log(elevationDp + 1) + 2) / 100;
  const surface = argbFromHex(surfaceHex);
  const tint = argbFromHex(surfaceTintHex);
  const channel = (shift: number) => {
    const s = (surface >> shift) & 0xff;
    const t = (tint >> shift) & 0xff;
    return Math.round(t * alpha + s * (1 - alpha));
  };
  const r = channel(16).toString(16).padStart(2, "0");
  const g = channel(8).toString(16).padStart(2, "0");
  const b = channel(0).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

interface ShadowFile {
  shadow: Record<string, { $type: string; $value: unknown }>;
}

const SHADOW_KEYS = ["sm", "md", "lg", "xl", "2xl"] as const;

function elevationOverlayKotlin(
  shadow: ShadowFile["shadow"] | undefined,
  lightScheme: DynamicScheme,
  darkScheme: DynamicScheme,
): string | null {
  if (!shadow || SHADOW_KEYS.some((k) => shadow[k]?.$type !== "dimension")) return null;

  const forScheme = (scheme: DynamicScheme) => {
    const surfaceHex = hexFromArgb(scheme.surface);
    const tintHex = hexFromArgb(scheme.surfaceTint);
    return SHADOW_KEYS.map((key) => {
      const dp = parseFloat(String(shadow[key].$value));
      return `        val ${key.replace("2xl", "xxl")} = ${kotlinColor(surfaceColorAtElevation(surfaceHex, tintHex, dp))}`;
    }).join("\n");
  };

  return [
    "// Compose's own real surfaceColorAtElevation() formula, precomputed at",
    "// generation time for this project's shadow.sm-2xl elevation dp values",
    "// (see ColorScheme.surfaceColorAtElevation() at runtime for the same",
    "// values computed live from LightColorScheme/DarkColorScheme directly).",
    "object ElevationOverlay {",
    "    object Light {",
    forScheme(lightScheme),
    "    }",
    "    object Dark {",
    forScheme(darkScheme),
    "    }",
    "}",
  ].join("\n");
}

export function generateMd3(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primaryHex = color.primitive.brand["600"].$value;
  const secondaryHex = color.primitive["brand-secondary"]?.["600"].$value;
  const neutralHex = color.primitive.neutral["600"].$value;
  const errorHex = color.primitive.status["1"]["200"].$value;

  const lightScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, false);
  const darkScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, true);

  let shadowFile: ShadowFile["shadow"] | undefined;
  try {
    shadowFile = readJson<ShadowFile>(join(tokensDir, "shadow.json")).shadow;
  } catch {
    shadowFile = undefined;
  }
  const elevationOverlay = elevationOverlayKotlin(shadowFile, lightScheme, darkScheme);

  const content = [
    "// Generated by SDSGT — MD3/Jetpack Compose Material3 color scheme.",
    "// Real HCT tonal palette + ColorScheme via Google's Material Color",
    "// Utilities, seeded from this project's own brand/secondary/neutral/",
    "// error colors (see generate/md3.ts for the exact derivation).",
    "",
    "import androidx.compose.material3.ColorScheme",
    "import androidx.compose.ui.graphics.Color",
    "",
    colorSchemeKotlin(lightScheme, "LightColorScheme"),
    "",
    colorSchemeKotlin(darkScheme, "DarkColorScheme"),
    ...(elevationOverlay ? ["", elevationOverlay] : []),
    "",
  ].join("\n");

  const buildPath = join(outDir, "md3");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "Color.kt"), content, "utf-8");

  return { filesWritten: ["md3/Color.kt"] };
}
