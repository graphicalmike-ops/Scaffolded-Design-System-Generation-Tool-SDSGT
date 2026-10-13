import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { SeedConfig } from "../types/seed-config.ts";
import { color, dimension, alias } from "../types/tokens.ts";
import { hexToHsl, hexToRgb, blendHex, type HSL } from "../color/hsl.ts";
import { generateRamp, type Ramp } from "../color/ramp.ts";
import { generateBoilerplateStatusPalette } from "../color/status.ts";
import { buildReportHtml, type TypographySpecimen, type FontFilesMap } from "../report/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "..", "presets");
const DEFAULTS_DIR = join(__dirname, "..", "defaults");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadPreset(group: string, preset: string): any {
  return readJson(join(PRESETS_DIR, `${group}.${preset}.json`));
}

function loadDefault(name: string): any {
  return readJson(join(DEFAULTS_DIR, `${name}.json`));
}

export interface AccessibilityWarning {
  token: string;
  ratio: number;
  required: number;
}

export interface PromoteResult {
  files: Record<string, unknown>;
  warnings: AccessibilityWarning[];
  reportHtml: string;
}

export interface PromoteOptions {
  // Real font files (base64 woff2, keyed by family then weight), fetched by
  // a caller that can reach the network — e.g. the SDSGT-start skill. See
  // report/index.ts, "FontFilesMap". Omitted entirely, the report falls back
  // to a system-font stack referencing the same family names.
  fontFiles?: FontFilesMap;
}

export function promote(seed: SeedConfig, options: PromoteOptions = {}): PromoteResult {
  const warnings: AccessibilityWarning[] = [];

  // --- Color primitives -----------------------------------------------
  const brandHsl = hexToHsl(seed.primaryColor);
  const brandRamp = generateRamp(brandHsl);

  const brandSecondaryRamp = seed.secondaryColor
    ? generateRamp(hexToHsl(seed.secondaryColor))
    : undefined;

  // An achromatic brand color (s=0) has no real hue — hexToHsl still returns
  // h=0 (red) for it, since hue is mathematically undefined at zero
  // saturation, not because red is meaningful here. Tinting the neutral
  // ramp with that fabricated hue at a real 6% saturation produced a
  // visible reddish cast on what should stay pure gray; fall back to s=0
  // (matching the achromatic brand ramp's own actual appearance) instead.
  const neutralBase: HSL =
    seed.neutralColorStyle === "brand-tinted"
      ? { h: brandHsl.h, s: brandHsl.s === 0 ? 0 : 6, l: 50 }
      : { h: 0, s: 0, l: 50 };
  const neutralRamp = generateRamp(neutralBase);

  const status = generateBoilerplateStatusPalette();

  // No contrast check between .100 and .200 here — they aren't assumed to
  // render stacked on each other (a .200 icon/badge/border might sit on a
  // neutral surface instead of its own .100 tint), so testing them against
  // each other was testing an assumption, not a guarantee. See
  // contracts-and-seeds.md, "Boilerplate status-color formula," and
  // "Accessibility checks are advisory, not a gate" in pipeline-plan.md —
  // `warnings` stays here as a general, non-blocking flagging mechanism for
  // whatever accessibility checks do apply, not specifically this one.

  const colorPrimitive: Record<string, unknown> = {
    color: {
      primitive: {
        brand: rampToTokens(brandRamp),
        ...(brandSecondaryRamp ? { "brand-secondary": rampToTokens(brandSecondaryRamp) } : {}),
        neutral: rampToTokens(neutralRamp),
        static: { "100": color("#FFFFFF"), "200": color("#000000") },
        status: Object.fromEntries(
          (["1", "2", "3", "4", "5"] as const).map((n) => [
            n,
            { "100": color(status[n]["100"]), "200": color(status[n]["200"]) },
          ]),
        ),
      },
    },
  };

  // --- Color semantics ---------------------------------------------------
  const modes: Array<"light" | "dark"> =
    seed.lightDarkMode === "both" ? ["light", "dark"] : [seed.lightDarkMode];

  const semanticFiles: Record<string, unknown> = {};
  for (const mode of modes) {
    semanticFiles[`color.semantic.${mode}.json`] = buildSemanticColor(
      mode,
      brandRamp,
      neutralRamp,
      brandSecondaryRamp,
      status["1"]["200"], // the error tone (role 1), see Proposal 2 A1
    );
  }

  // --- Typography ----------------------------------------------------
  const typeScale = loadPreset("type-scale", seed.typeScalePreset) as Record<string, number>;
  const { primitive: typographyPrimitive, semantic: typographySemantic, specimens } = buildTypography(seed, typeScale);

  // --- Straight preset / default copies -------------------------------
  const spacing = loadPreset("spacing", seed.spacingPreset);
  const radius = loadPreset("radius", seed.radiusPreset);
  const opacity = loadPreset("opacity", seed.opacityPreset);
  const shadow = loadPreset("shadow", seed.shadowPreset);
  const borderWidth = loadDefault("border-width");
  const breakpoint = loadDefault("breakpoint");
  const grid = loadDefault("grid");

  const files: Record<string, unknown> = {
    "color.primitive.json": colorPrimitive,
    ...semanticFiles,
    "typography.primitive.json": typographyPrimitive,
    "typography.semantic.json": typographySemantic,
    "spacing.json": spacing,
    "radius.json": radius,
    "border-width.json": borderWidth,
    "opacity.json": opacity,
    "shadow.json": shadow,
    "breakpoint.json": breakpoint,
    "grid.json": grid,
  };

  // --- Report (proof-of-work HTML, generated every run) ----------------
  const reportHtml = buildReportHtml(seed, {
    brandRamp,
    brandSecondaryRamp,
    neutralRamp,
    status,
    modes,
    typography: specimens,
    spacing: spacing.spacing,
    radius: radius.radius,
    shadow: shadow.shadow,
    opacity: opacity.opacity,
    borderWidth: borderWidth["border-width"],
    breakpoint: breakpoint.breakpoint,
    grid: grid.grid,
    fileNames: Object.keys(files),
    warnings,
    fontFiles: options.fontFiles,
  });

  return { files, warnings, reportHtml };
}

function rampToTokens(ramp: Ramp): Record<string, unknown> {
  return Object.fromEntries(Object.entries(ramp).map(([step, hex]) => [step, color(hex)]));
}

// The real shadcn ring transparencies (`ring-ring/50` for Focus, `ring-destructive/20`
// for Invalid). Baked into `border.focus-ring` / `status.error-ring`; the Figma
// components plan matches a ring by (colour, this alpha) to pick those tokens.
const FOCUS_RING_ALPHA = 0.5;
const ERROR_RING_ALPHA = 0.2;

function buildSemanticColor(
  mode: "light" | "dark",
  brandRamp: Ramp,
  neutralRamp: Ramp,
  brandSecondaryRamp: Ramp | undefined,
  statusErrorHex: string,
): unknown {
  const isLight = mode === "light";

  // Background/Text/Border ramp mapping, per contracts-and-seeds.md.
  const bg = {
    primary: isLight ? "color.primitive.neutral.100" : "color.primitive.neutral.1100",
    secondary: isLight ? "color.primitive.neutral.200" : "color.primitive.neutral.1000",
    surface: isLight ? "color.primitive.static.100" : "color.primitive.neutral.1000",
    inverse: isLight ? "color.primitive.neutral.1100" : "color.primitive.neutral.100",
    // Disabled field fill (Input, Textarea), added 2026-10-13: a solid step chosen by the user
    // from the compared options (see contracts-and-seeds.md, "Figma instances lose a fill's or
    // ring's transparency"); plain alias, no transparency.
    fieldDisabled: isLight ? "color.primitive.neutral.200" : "color.primitive.neutral.900",
    // Hover fill of an interactive card-like surface (Attachment), added 2026-10-13: the real
    // `hover:bg-muted/50` is background.secondary at 50% over the page; a fill's transparency is
    // lost on Figma instances, so this is the nearest SOLID step per mode, chosen by the user from
    // a comparison page (see contracts-and-seeds.md). In dark mode it is the same step as the card
    // at rest (background.surface = neutral.1000), so the hover shows no change there.
    surfaceHover: isLight ? "color.primitive.neutral.200" : "color.primitive.neutral.1000",
  };
  const text = {
    primary: isLight ? "color.primitive.neutral.1100" : "color.primitive.neutral.100",
    secondary: isLight ? "color.primitive.neutral.900" : "color.primitive.neutral.200",
    disabled: isLight ? "color.primitive.neutral.700" : "color.primitive.neutral.400",
    onPrimary: "color.primitive.static.100",
    onSurface: isLight ? "color.primitive.neutral.1100" : "color.primitive.neutral.100",
    inverse: isLight ? "color.primitive.neutral.100" : "color.primitive.neutral.1100",
    // Disabled field placeholder (2026-10-13), see bg.fieldDisabled.
    fieldDisabled: isLight ? "color.primitive.neutral.500" : "color.primitive.neutral.600",
    // Resting text of an INACTIVE tab (Tabs), added 2026-10-13: the real light-mode class is
    // `text-foreground/60` (text.primary at 60%), whose transparency is lost on Figma instances, so
    // it is the nearest SOLID step, chosen by the user from a comparison page (neutral.700 matches
    // text.primary @ 60% exactly on the tab bar). Dark mode is the real `dark:text-muted-foreground`
    // = text.secondary = neutral.200, an exact match.
    tabInactive: isLight ? "color.primitive.neutral.700" : "color.primitive.neutral.200",
    // Label of a DISABLED Field (2026-10-13): the real `group-data-[disabled=true]/field:opacity-50` dims
    // only the label (text.primary at 50%); a transparency is not used, so this is the best single solid
    // step per mode chosen by the user from a comparison page (light neutral.600, dark neutral.500).
    labelDisabled: isLight ? "color.primitive.neutral.600" : "color.primitive.neutral.500",
  };
  const border = {
    default: isLight ? "color.primitive.neutral.400" : "color.primitive.neutral.800",
    subtle: isLight ? "color.primitive.neutral.300" : "color.primitive.neutral.900",
    focus: "color.primitive.brand.600",
    onPrimary: "color.primitive.static.100",
    // Disabled field stroke (2026-10-13), see bg.fieldDisabled. In dark mode the stroke and the
    // fill are the same step (neutral.900), so the edge does not stand out from the fill there.
    fieldDisabled: isLight ? "color.primitive.neutral.300" : "color.primitive.neutral.900",
  };

  // action-disabled is the one non-alias case: brand.600 blended 50% toward
  // neutral.600, baked once at promote time into a plain color value (not an
  // alias), per "Formulas run once" — there's no live formula left afterward.
  //
  // `<name>-hover-soft` (added 2026-10-13, see contracts-and-seeds.md, "Figma
  // instances lose a fill's or ring's transparency"): the hover fill of a
  // component whose real hover is `bg-primary/80`. It is a plain alias to a
  // solid step per mode, because a fill's transparency does not survive on a
  // Figma INSTANCE: brand.400 in light mode, brand.700 in dark mode. Separate
  // from `-hover` (brand.700 in both modes), whose meaning is unchanged.
  const actionGroup = (name: "primary" | "secondary", ramp: Ramp, primitiveName: "brand" | "brand-secondary") => ({
    [name]: alias(`color.primitive.${primitiveName}.600`),
    [`${name}-hover`]: alias(`color.primitive.${primitiveName}.700`),
    [`${name}-hover-soft`]: alias(`color.primitive.${primitiveName}.${isLight ? "400" : "700"}`),
    [`${name}-active`]: alias(`color.primitive.${primitiveName}.800`),
    [`${name}-pressed`]: alias(`color.primitive.${primitiveName}.800`),
    [`${name}-disabled`]: color(blendHex(ramp["600"], neutralRamp["600"], 0.5)),
  });

  const action: Record<string, unknown> = actionGroup("primary", brandRamp, "brand");
  if (brandSecondaryRamp) {
    Object.assign(action, actionGroup("secondary", brandSecondaryRamp, "brand-secondary"));
  }

  const statusTokens: Record<string, unknown> = {};
  for (const [n, role] of [
    ["1", "error"],
    ["2", "success"],
    ["3", "warning"],
    ["4", "info"],
    ["5", "promo"],
  ] as const) {
    statusTokens[role] = alias(`color.primitive.status.${n}.200`);
    statusTokens[`${role}-bg`] = alias(`color.primitive.status.${n}.100`);
    statusTokens[`${role}-text`] = alias(`color.primitive.status.${n}.200`);
    statusTokens[`${role}-border`] = alias(`color.primitive.status.${n}.200`);
  }
  // `status.error-ring` (added 2026-10-13): the error colour at the real
  // `ring-destructive/20` transparency, baked (not an alias, like overlay.scrim
  // and action-disabled) so the Figma ring keeps its fade on instances. NOT
  // derived live: it does not follow later edits to status.error. See
  // contracts-and-seeds.md, "Figma instances lose a fill's or ring's transparency".
  statusTokens["error-ring"] = { $type: "color", $value: hexToRgba(statusErrorHex, ERROR_RING_ALPHA) };

  return {
    color: {
      semantic: {
        background: {
          primary: alias(bg.primary),
          secondary: alias(bg.secondary),
          surface: alias(bg.surface),
          inverse: alias(bg.inverse),
          "field-disabled": alias(bg.fieldDisabled),
          "surface-hover": alias(bg.surfaceHover),
        },
        text: {
          primary: alias(text.primary),
          secondary: alias(text.secondary),
          disabled: alias(text.disabled),
          "on-primary": alias(text.onPrimary),
          "on-surface": alias(text.onSurface),
          inverse: alias(text.inverse),
          "field-disabled": alias(text.fieldDisabled),
          "tab-inactive": alias(text.tabInactive),
          "label-disabled": alias(text.labelDisabled),
        },
        action,
        border: {
          default: alias(border.default),
          subtle: alias(border.subtle),
          focus: alias(border.focus),
          // `border.focus-ring` (added 2026-10-13): the focus colour at the real
          // `ring-ring/50` transparency, baked (see `status.error-ring` above).
          // Not derived live: it does not follow later edits to border.focus.
          "focus-ring": { $type: "color", $value: hexToRgba(brandRamp["600"], FOCUS_RING_ALPHA) },
          "field-disabled": alias(border.fieldDisabled),
          "on-primary": alias(border.onPrimary),
        },
        status: statusTokens,
        // overlay.scrim is neutral.1100 at 50% alpha — baked to an explicit
        // rgba(), same non-alias treatment as action-disabled, since a plain
        // alias can't carry an alpha override on top of the primitive.
        overlay: {
          scrim: { $type: "color", $value: hexToRgba(neutralRamp["1100"], 0.5) },
        },
      },
    },
  };
}

function hexToRgba(hex: string, alphaValue: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alphaValue})`;
}

function buildTypography(seed: SeedConfig, typeScale: Record<string, number>) {
  const ROLE_WEIGHTS: Record<string, string[]> = {
    caption: ["regular", "semibold"],
    "body-sm": ["regular", "semibold"],
    body: ["regular", "semibold"],
    "body-lg": ["regular", "semibold"],
    "heading-sm": ["semibold", "bold"],
    "heading-md": ["semibold", "bold"],
    "heading-lg": ["semibold", "bold"],
    display: ["bold"],
  };
  const PRIMARY_ROLES = new Set(["heading-sm", "heading-md", "heading-lg", "display"]);

  const hasSecondary = Boolean(seed.secondaryFont);
  const familyFor = (role: string) =>
    PRIMARY_ROLES.has(role) || !hasSecondary ? "primary" : "secondary";

  const WEIGHT_NUMBERS: Record<string, number> = { regular: 400, semibold: 600, bold: 700 };

  const fontSizeEntries: Record<string, unknown> = {};
  const lineHeightEntries: Record<string, unknown> = {};
  const semantic: Record<string, unknown> = {};
  const specimens: TypographySpecimen[] = [];

  for (const [role, weights] of Object.entries(ROLE_WEIGHTS)) {
    const px = typeScale[role];
    const isBodyish = !PRIMARY_ROLES.has(role);
    const lh = Math.round(px * (isBodyish ? 1.5 : 1.2));

    fontSizeEntries[String(px)] = dimension(px);
    lineHeightEntries[String(lh)] = dimension(lh);

    for (const weight of weights) {
      const tokenName = `${role}-${weight}`;
      semantic[tokenName] = {
        $type: "typography",
        $value: {
          fontFamily: `{typography.primitive.fontFamily.${familyFor(role)}}`,
          fontWeight: `{typography.primitive.fontWeight.${weight}}`,
          fontSize: `{typography.primitive.fontSize.${px}}`,
          lineHeight: `{typography.primitive.lineHeight.${lh}}`,
        },
      };
      const family = familyFor(role) === "primary" ? seed.primaryFont : (seed.secondaryFont ?? seed.primaryFont);
      specimens.push({ token: tokenName, family, weight: WEIGHT_NUMBERS[weight], size: px, lineHeight: lh });
    }
  }

  const primitive = {
    typography: {
      primitive: {
        fontFamily: {
          primary: { $type: "fontFamily", $value: seed.primaryFont },
          ...(hasSecondary
            ? { secondary: { $type: "fontFamily", $value: seed.secondaryFont } }
            : {}),
        },
        fontWeight: {
          regular: { $type: "fontWeight", $value: 400 },
          semibold: { $type: "fontWeight", $value: 600 },
          bold: { $type: "fontWeight", $value: 700 },
        },
        fontSize: fontSizeEntries,
        lineHeight: lineHeightEntries,
      },
    },
  };

  return { primitive, semantic: { typography: { semantic } }, specimens };
}
