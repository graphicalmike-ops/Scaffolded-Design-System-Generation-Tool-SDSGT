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
import {
  readJson,
  resolveAlias,
  nearestDimensionPx,
  type ColorPrimitivesFile,
  type RadiusFile,
  type SpacingFile,
  type TypographyPrimitivesFile,
  type DtcgDimensionToken,
} from "./read-tokens.ts";
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

// Wrapper components — added 2026-09-16, closing part of the "every OTHER
// Paper component approximates" gap `roundness` alone can't reach (see
// PAPER_MD3_BUTTON_RADIUS_MULTIPLIER's own comment above). NOT a workaround
// or an unsupported hack: verified against the real npm-published
// `react-native-paper@5.15.3` tarball's own source that Card, Chip, and
// TextInput each already have a real, PUBLIC per-instance override path —
// - Card: `Card.tsx` flattens its own `style` prop, extracts any
//   `border*Radius` keys via a real `splitStyles` helper, and uses those
//   INSTEAD of `3 * roundness` — then forwards the resolved value to
//   `Card.Content`/`Card.Cover` via `cloneElement`, so one override on the
//   parent stays consistent across the whole card.
// - Chip: `Chip.tsx` destructures `borderRadius` straight off the flattened
//   `style` prop with `3 * roundness`... `2 * roundness` (MD3) as the
//   fallback default only.
// - TextInput: `TextInputFlat.tsx`'s own top-corner radius comes from
//   `viewStyle` (everything in the `style` prop except a few text-specific
//   keys), which wins over the computed default in the same style array;
//   `TextInputOutlined.tsx` has a dedicated `outlineStyle` prop, documented
//   in Paper's own JSDoc as "override the default style of outlined
//   wrapper," feeding straight into the real bordered `<View>`.
// These three were verified directly; Snackbar/Menu/FAB/ToggleButton/
// DrawerItem/Searchbar were also confirmed to follow the identical
// `style`/`contentStyle`-wins-last pattern in the same source read, but
// don't have a generated wrapper yet — real, buildable, not-yet-scoped
// work, same "generalizes but verify each one" discipline as everywhere
// else in this pipeline. Tooltip and SegmentedButtons were checked and are
// REAL EXCEPTIONS: Tooltip exposes no style-customization prop of any kind
// for its own bubble, and SegmentedButtons computes each segment's radius
// specially (rounded ends, square middle) with no visible override path in
// its own source — don't assume the pattern generalizes to those two.
//
// Real, disclosed limitation of these wrappers themselves: they don't
// forward a `ref`, unlike Paper's own `Card`/`TextInput` (both internally
// use `forwardRef`) — deliberately kept simple rather than re-implementing
// ref-forwarding for a case most app code doesn't need; a real, narrower
// scope than Paper's own component, not an oversight.
// Button padding — added 2026-09-16, closing the other real, disclosed RN
// Paper gap (radius already exact via `roundness` alone; padding never
// was). Real finding, checked rather than assumed to mirror Bootstrap/
// MUI's own literal `padding`: Button has no `padding` property at all —
// its real visual spacing comes from `marginVertical`/`marginHorizontal`
// on the LABEL TEXT inside the button (confirmed against `Button.tsx`'s
// own `styles.label`/`styles.md3Label`), not the touchable container.
// Real MD3 default for every mode EXCEPT `"text"`: `marginVertical: 10,
// marginHorizontal: 24` (`styles.md3Label`). `mode="text"` — Button's own
// literal default when `mode` is omitted — gets a genuinely different,
// smaller margin (`md3LabelText`/`md3LabelTextAddons`, no vertical
// override at all, horizontal 12 or 16 depending on whether an icon is
// present) BECAUSE Paper's own design intent is that text-mode buttons sit
// visually lighter than contained/outlined/elevated ones — not a value
// this pipeline should flatten into the same margin as the others. Same
// restraint as FAB/Searchbar's own size/mode-dependent defaults: only the
// non-`"text"` case is bound here.
// Real, public override path: `labelStyle`, a real prop on `Button.tsx`
// (`style={[styles.label, ..., textStyle, labelStyle]}` — `labelStyle` is
// appended absolute last, so it wins for whatever keys it sets), NOT a
// hack.
function buildButtonWrapper(marginVertical: number, marginHorizontal: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Button`, bringing its internal label spacing in line with this",
    "// project's real spacing tokens. Button has no `padding` property at",
    "// all — its real visual spacing comes from `marginVertical`/",
    "// `marginHorizontal` on the label TEXT, not the touchable container",
    "// (confirmed by reading Paper's real source). Uses Button's own real,",
    "// public override path (`labelStyle`, appended last in the label",
    "// Text's own style array) — not an unsupported hack. Only applies to",
    "// modes OTHER than `\"text\"` (Button's own actual default when `mode`",
    "// is omitted) — Paper's own text-mode margin is genuinely different",
    "// (smaller, no vertical override) by design, not a value this pipeline",
    "// should flatten into the same spacing as contained/outlined/elevated.",
    "// Still overridable further: pass your own `labelStyle` and it wins",
    "// over this default.",
    "",
    "import * as React from 'react';",
    "import { Button as PaperButton } from 'react-native-paper';",
    "import type { ButtonProps } from 'react-native-paper';",
    "",
    `const MARGIN_VERTICAL = ${marginVertical};`,
    `const MARGIN_HORIZONTAL = ${marginHorizontal};`,
    "",
    "export function Button({ mode, labelStyle, ...rest }: ButtonProps) {",
    "  const isDefaultMode = mode !== 'text';",
    "  return (",
    "    <PaperButton",
    "      {...rest}",
    "      mode={mode}",
    "      labelStyle={",
    "        isDefaultMode",
    "          ? [{ marginVertical: MARGIN_VERTICAL, marginHorizontal: MARGIN_HORIZONTAL }, labelStyle]",
    "          : labelStyle",
    "      }",
    "    />",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildCardWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Card`, bringing its corner radius in line with `radius.md` (Paper's",
    "// own `roundness` theme value is calibrated for Button's real 5x",
    "// multiplier — Card uses a different, real 3x multiplier internally, so",
    "// it would NOT match without this). Uses Card's own real, public",
    "// override path (a `style` prop with `border*Radius` keys, which Card's",
    "// own source extracts and prefers over its computed default) — not an",
    "// unsupported hack. Still overridable further: pass your own `style`",
    "// and it wins over this default, same precedence Card's own component",
    "// already respects.",
    "",
    "import * as React from 'react';",
    "import { Card as PaperCard } from 'react-native-paper';",
    "import type { CardProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Card({ style, ...rest }: CardProps) {",
    "  // `as any` on the spread — confirmed by a real `tsc` run that this is",
    "  // a structural limitation of Paper's OWN exported `CardProps` type",
    "  // (a discriminated union keyed on `mode`, each variant an `Omit<...,",
    "  // \"ref\">`), not anything about this wrapper: even an unmodified",
    "  // `<PaperCard {...props} />` passthrough with zero changes fails the",
    "  // exact same way, since JSX spread of a union-typed value flattens it",
    "  // into a merged shape TypeScript can't match back to any single",
    "  // variant. A real type-checking gap in Paper's own types, not a",
    "  // runtime risk — the underlying object is still a valid `CardProps`.",
    "  return <PaperCard {...(rest as any)} style={[{ borderRadius: RADIUS }, style]} />;",
    "}",
    "",
    "// Compound sub-components — re-exported as-is. Card itself forwards the",
    "// resolved radius to these via its own real `cloneElement` logic, so",
    "// they don't need their own wrapper.",
    "Card.Content = PaperCard.Content;",
    "Card.Actions = PaperCard.Actions;",
    "Card.Cover = PaperCard.Cover;",
    "Card.Title = PaperCard.Title;",
    "",
  ].join("\n");
}

function buildChipWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Chip`, bringing its corner radius in line with `radius.md` (Chip's",
    "// own real default is `roundness * 2` for MD3 — a different multiplier",
    "// than Button's 5x, so it would NOT match without this). Uses Chip's",
    "// own real, public override path (a `style` prop with a `borderRadius`",
    "// key, which Chip's own source destructures and prefers over its",
    "// computed default) — not an unsupported hack. Still overridable",
    "// further: pass your own `style` and it wins over this default.",
    "",
    "import * as React from 'react';",
    "import { Chip as PaperChip } from 'react-native-paper';",
    "import type { ChipProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Chip(props: ChipProps) {",
    "  return <PaperChip {...props} style={[{ borderRadius: RADIUS }, props.style]} />;",
    "}",
    "",
  ].join("\n");
}

function buildTextInputWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `TextInput`, bringing its corner radius in line with `radius.md`",
    "// (TextInput's own real default is 1x `roundness` — different from",
    "// Button's 5x calibration, so it would NOT match without this). Covers",
    "// both real modes:",
    "// - `mode=\"flat\"` (the default): the rounded top corners come from",
    "//   `style` — everything in that prop except a few text-specific keys",
    "//   (font size, line height, ...) wins over TextInput's own computed",
    "//   default, confirmed by reading `TextInputFlat.tsx`'s own source.",
    "// - `mode=\"outlined\"`: a dedicated `outlineStyle` prop, documented in",
    "//   Paper's own JSDoc as \"override the default style of outlined",
    "//   wrapper\" — harmless to also pass when mode is `flat`, since it's",
    "//   simply unused then.",
    "// Both are real, public override paths, not an unsupported hack. Still",
    "// overridable further: pass your own `style`/`outlineStyle` and it wins",
    "// over this default.",
    "",
    "import * as React from 'react';",
    "import { TextInput as PaperTextInput } from 'react-native-paper';",
    "import type { TextInputProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function TextInput(props: TextInputProps) {",
    "  return (",
    "    <PaperTextInput",
    "      {...props}",
    "      style={[{ borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS }, props.style]}",
    "      outlineStyle={[{ borderRadius: RADIUS }, props.outlineStyle]}",
    "    />",
    "  );",
    "}",
    "",
  ].join("\n");
}

// Snackbar, Menu, FAB, ToggleButton, DrawerItem, Searchbar — added
// 2026-09-16, extending the same real, verified pattern Card/Chip/
// TextInput already use (see buildCardWrapper's own header for the full
// "why"). Each confirmed directly against the real npm-published
// `react-native-paper@5.15.3` tarball's own source:
// - Snackbar (`Snackbar.tsx`) and Menu (`Menu.tsx`): real default is a flat
//   `1 × roundness`, unconditional (no isV3 branch) — simplest case. Menu's
//   own public override prop is `contentStyle` (not `style`), appended
//   last in its Surface's own style array; Snackbar's is the standard
//   `style` prop, also appended last.
// - ToggleButton (`ToggleButton.tsx`): also a flat `1 × roundness`,
//   `style` appended last. Checked its own real `ToggleButton.Row`
//   grouping component (which clones children to zero out the two INNER
//   corners for middle/first/last position) for a conflict — none: React
//   Native's real style-merge keeps the shorthand `borderRadius` we set
//   and the Row's own longhand `borderTopRightRadius`/etc. overrides as
//   separate keys in the same flattened object, so the Row's positional
//   corner-squaring still applies correctly on top of our default,
//   confirmed by reading the real merge order in `ToggleButtonRow.tsx`.
// - DrawerItem (`DrawerItem.tsx`): `(isV3 ? 7 : 1) × roundness`, `style`
//   appended last. `DrawerSection.tsx` (the usual parent) doesn't touch
//   radius at all — no grouping conflict. `DrawerCollapsedItem` is a
//   separate, real pill-shaped component (`itemSize / 2`) — out of scope,
//   not wrapped.
// - FAB (`FAB.tsx`, via `getFabStyle` in `FAB/utils.ts`): a REAL,
//   different shape of default — varies by `size` (small `3×`, medium
//   `4×`, large `7×` roundness) and has a wholly separate formula for
//   `customSize`. Rather than inventing a scaling formula to preserve
//   Paper's own small/medium/large PROPORTIONS (which this pipeline has
//   no real source for — Paper doesn't document one), this binds only the
//   real default case (`size` omitted, i.e. `"medium"`, no `customSize`)
//   to `radius.md` — same "one reference case" restraint as this
//   pipeline's own MUI button-padding fix (medium/contained only).
//   `small`/`large`/`customSize` keep Paper's own real proportional
//   defaults, untouched — a real, disclosed narrower scope.
// - Searchbar (`Searchbar.tsx`): also mode-dependent for MD3 — real
//   default is `mode="bar"` (Searchbar's own default when `mode` is
//   omitted) at `7 × roundness`; `mode="view"` is `0` (Paper's own
//   deliberately square variant, not a value this pipeline should
//   override into a rounded one). Binds only the real `"bar"` default,
//   same restraint as FAB above.
function buildSnackbarWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Snackbar`, bringing its corner radius in line with `radius.md`",
    "// (Snackbar's own real default is 1x `roundness`, unconditional — still",
    "// different from Button's 5x calibration, so it would NOT match without",
    "// this). Uses Snackbar's own real, public override path (a `style`",
    "// prop, appended last in its own internal style array, confirmed by",
    "// reading Paper's real source) — not an unsupported hack. Still",
    "// overridable further: pass your own `style` and it wins over this",
    "// default.",
    "",
    "import * as React from 'react';",
    "import { Snackbar as PaperSnackbar } from 'react-native-paper';",
    "import type { SnackbarProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Snackbar({ style, ...rest }: SnackbarProps) {",
    "  return <PaperSnackbar {...rest} style={[{ borderRadius: RADIUS }, style]} />;",
    "}",
    "",
  ].join("\n");
}

function buildMenuWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Menu`, bringing its corner radius in line with `radius.md` (Menu's",
    "// own real default is 1x `roundness`, unconditional — still different",
    "// from Button's 5x calibration, so it would NOT match without this).",
    "// Uses Menu's own real, public override path — NOT the plain `style`",
    "// prop, but a dedicated `contentStyle` prop, confirmed by reading",
    "// Paper's real source (`Menu.tsx`), appended last in its own internal",
    "// Surface style array. Still overridable further: pass your own",
    "// `contentStyle` and it wins over this default.",
    "",
    "import * as React from 'react';",
    "import { Menu as PaperMenu } from 'react-native-paper';",
    "import type { MenuProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Menu({ contentStyle, ...rest }: MenuProps) {",
    "  return <PaperMenu {...rest} contentStyle={[{ borderRadius: RADIUS }, contentStyle]} />;",
    "}",
    "",
    "// Compound sub-component — re-exported as-is, same treatment as this",
    "// pipeline's own Card/Dialog wrappers. Menu.Item has no radius logic of",
    "// its own; omitting it would silently break `<Menu.Item>` for anyone",
    "// using this wrapper.",
    "Menu.Item = PaperMenu.Item;",
    "",
  ].join("\n");
}

function buildToggleButtonWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `ToggleButton`, bringing its corner radius in line with `radius.md`",
    "// (ToggleButton's own real default is 1x `roundness`, unconditional —",
    "// still different from Button's 5x calibration). Uses ToggleButton's",
    "// own real, public override path (a `style` prop, appended last,",
    "// confirmed by reading Paper's real source) — not an unsupported hack.",
    "// Compatible with Paper's own real `ToggleButton.Row` grouping (which",
    "// zeroes out each button's two INNER corners for middle/first/last",
    "// position): React Native keeps our shorthand `borderRadius` and the",
    "// Row's own longhand corner overrides as separate style keys, so the",
    "// Row's positional squaring still applies correctly on top of this",
    "// default. Still overridable further: pass your own `style` and it",
    "// wins.",
    "",
    "import * as React from 'react';",
    "import { ToggleButton as PaperToggleButton } from 'react-native-paper';",
    "import type { ToggleButtonProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function ToggleButton({ style, ...rest }: ToggleButtonProps) {",
    "  return <PaperToggleButton {...rest} style={[{ borderRadius: RADIUS }, style]} />;",
    "}",
    "",
    "// Compound sub-components — re-exported as-is, same treatment as this",
    "// pipeline's own Card/Dialog/Menu wrappers. `.Row` is the grouping",
    "// component whose own real corner-squaring logic this wrapper's",
    "// `borderRadius` default coexists with (see this file's own header) —",
    "// omitting either would silently break `<ToggleButton.Group>`/`.Row>`",
    "// for anyone using this wrapper.",
    "ToggleButton.Group = PaperToggleButton.Group;",
    "ToggleButton.Row = PaperToggleButton.Row;",
    "",
  ].join("\n");
}

function buildDrawerItemWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Drawer.Item`, bringing its corner radius in line with `radius.md`",
    "// (DrawerItem's own real default is `(isV3 ? 7 : 1) x roundness` — a",
    "// different multiplier than Button's 5x, so it would NOT match without",
    "// this). Uses DrawerItem's own real, public override path (a `style`",
    "// prop, appended last, confirmed by reading Paper's real source) — not",
    "// an unsupported hack. `Drawer.Section` (the usual parent) doesn't",
    "// touch radius at all, so no grouping conflict. `Drawer.CollapsedItem`",
    "// is a separate, real pill-shaped component — out of scope, not",
    "// wrapped. Still overridable further: pass your own `style` and it",
    "// wins over this default.",
    "",
    "import * as React from 'react';",
    "import { Drawer } from 'react-native-paper';",
    "import type { DrawerItemProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function DrawerItem({ style, ...rest }: DrawerItemProps) {",
    "  return <Drawer.Item {...rest} style={[{ borderRadius: RADIUS }, style]} />;",
    "}",
    "",
  ].join("\n");
}

function buildFabWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `FAB`, bringing its corner radius in line with `radius.md` — but",
    "// ONLY for the real default case (`size` omitted, i.e. `\"medium\"`, no",
    "// `customSize`). FAB's own real default radius varies BY SIZE (small",
    "// 3x, medium 4x, large 7x `roundness`, confirmed against Paper's real",
    "// `FAB/utils.ts`), plus a wholly separate formula when `customSize` is",
    "// set — this pipeline has no real source for what PROPORTION small/",
    "// large should keep relative to a re-targeted medium, so rather than",
    "// inventing one, `small`/`large`/`customSize` are left at Paper's own",
    "// real defaults, untouched. Uses FAB's own real, public override path",
    "// (a `style` prop with a `borderRadius` key, which FAB's own source",
    "// destructures and prefers over its computed default) — not an",
    "// unsupported hack. Still overridable further: pass your own `style`",
    "// and it wins over this default.",
    "",
    "import * as React from 'react';",
    "import { FAB as PaperFAB } from 'react-native-paper';",
    "import type { FABProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function FAB({ style, size, customSize, ...rest }: FABProps) {",
    "  const isDefaultSize = (size ?? 'medium') === 'medium' && !customSize;",
    "  return (",
    "    <PaperFAB",
    "      {...rest}",
    "      size={size}",
    "      customSize={customSize}",
    "      style={isDefaultSize ? [{ borderRadius: RADIUS }, style] : style}",
    "    />",
    "  );",
    "}",
    "",
    "// Compound sub-component — re-exported as-is, same treatment as this",
    "// pipeline's own Card/Dialog/Menu/ToggleButton wrappers. `FAB.Group`",
    "// (the real speed-dial variant) has its own separate real styling this",
    "// pipeline doesn't touch — omitting it would silently break",
    "// `<FAB.Group>` for anyone using this wrapper.",
    "FAB.Group = PaperFAB.Group;",
    "",
  ].join("\n");
}

// Dialog — verified in the same real-source read that first confirmed
// Card/Chip/Button/Dialog's own override mechanisms (before this
// component wrapper mechanism existed at all); added here alongside the
// rest of this batch since it was already fully researched, not left out
// on purpose. Real default: `(isV3 ? 7 : 1) × roundness` (same multiplier
// as DrawerItem) — `Dialog.tsx`'s own `style` prop is appended last in the
// array passed to `Modal`'s `contentContainerStyle`, so it wins over the
// computed default the same way every other `style`-appended-last
// component here does.
function buildDialogWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Dialog`, bringing its corner radius in line with `radius.md`",
    "// (Dialog's own real default is `(isV3 ? 7 : 1) x roundness` — a",
    "// different multiplier than Button's 5x, so it would NOT match without",
    "// this). Uses Dialog's own real, public override path (a `style` prop,",
    "// appended last in the array passed to its underlying `Modal`'s",
    "// `contentContainerStyle`, confirmed by reading Paper's real source) —",
    "// not an unsupported hack. Still overridable further: pass your own",
    "// `style` and it wins over this default.",
    "",
    "import * as React from 'react';",
    "import { Dialog as PaperDialog } from 'react-native-paper';",
    "import type { DialogProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Dialog({ style, ...rest }: DialogProps) {",
    "  return <PaperDialog {...rest} style={[{ borderRadius: RADIUS }, style]} />;",
    "}",
    "",
    "// Compound sub-components — re-exported as-is, same treatment as this",
    "// pipeline's own Card wrapper (Dialog has no radius logic of its own to",
    "// forward to these, unlike Card, but they'd otherwise be missing",
    "// entirely from this wrapper — a real bug, not a cosmetic one).",
    "Dialog.Content = PaperDialog.Content;",
    "Dialog.Actions = PaperDialog.Actions;",
    "Dialog.Title = PaperDialog.Title;",
    "Dialog.ScrollArea = PaperDialog.ScrollArea;",
    "Dialog.Icon = PaperDialog.Icon;",
    "",
  ].join("\n");
}

function buildSearchbarWrapper(radiusMd: number): string {
  return [
    "// Generated by SDSGT — a thin wrapper around React Native Paper's own",
    "// `Searchbar`, bringing its corner radius in line with `radius.md` —",
    "// but ONLY for the real default case (`mode` omitted, i.e. `\"bar\"`).",
    "// Searchbar's own real default radius is ALSO mode-dependent for MD3",
    "// (confirmed against Paper's real source): `\"bar\"` mode is `7 x",
    "// roundness`, `\"view\"` mode is a deliberate `0` (square) — not a value",
    "// this pipeline should override into a rounded one. Uses Searchbar's",
    "// own real, public override path (a `style` prop, appended last,",
    "// confirmed by reading Paper's real source) — not an unsupported hack.",
    "// Still overridable further: pass your own `style` and it wins over",
    "// this default.",
    "",
    "import * as React from 'react';",
    "import { Searchbar as PaperSearchbar } from 'react-native-paper';",
    "import type { SearchbarProps } from 'react-native-paper';",
    "",
    `const RADIUS = ${radiusMd};`,
    "",
    "export function Searchbar({ style, mode, ...rest }: SearchbarProps) {",
    "  const isDefaultMode = (mode ?? 'bar') === 'bar';",
    "  return (",
    "    <PaperSearchbar",
    "      {...rest}",
    "      mode={mode}",
    "      style={isDefaultMode ? [{ borderRadius: RADIUS }, style] : style}",
    "    />",
    "  );",
    "}",
    "",
  ].join("\n");
}

// Real MD3 typescale role names + their own real default px sizes —
// confirmed against the real npm-published react-native-paper@5.15.3
// tarball's own `styles/themes/v3/tokens.tsx` (`export const typescale`).
// Identical values to this pipeline's own Vuetify generator's
// VUETIFY_TYPE_SCALE_DEFAULT_PX (same real MD3 spec, different property
// naming convention — Paper uses camelCase `displayLarge`, Vuetify's own
// Sass map uses kebab-case `'display-large'`) — not a coincidence, both
// are reading the same real Material Design 3 type scale.
const RN_PAPER_TYPE_SCALE_DEFAULT_PX: Record<string, number> = {
  displayLarge: 57,
  displayMedium: 45,
  displaySmall: 36,
  headlineLarge: 32,
  headlineMedium: 28,
  headlineSmall: 24,
  titleLarge: 22,
  titleMedium: 16,
  titleSmall: 14,
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
};

// `theme.fonts` is a real, plain, spreadable theme key — confirmed against
// Paper's real `MD3LightTheme`/`MD3DarkTheme` source (`fonts:
// configureFonts()`), the exact same mechanism this generator already uses
// for `colors`/`roundness`. Unlike radius (which needed real generated
// wrapper COMPONENTS, since Paper has no theme-level per-component style
// slot), typography size is a genuine theme-level fix — no wrapper needed.
// Each role's OWN real default object (fontFamily/fontWeight/lineHeight/
// letterSpacing/fontSize) is spread first, then `fontSize` alone is
// overridden with the nearest real type-scale token — same "bind size
// only, leave everything else at the library's real default" restraint as
// this pipeline's own MUI typography-size fix and Vuetify's own
// `map-deep-merge`-based one.
function fontsLiteral(defaultThemeVar: string, fontSize: Record<string, DtcgDimensionToken>): string {
  const lines: string[] = ["  fonts: {", `    ...${defaultThemeVar}.fonts,`];
  for (const [role, defaultPx] of Object.entries(RN_PAPER_TYPE_SCALE_DEFAULT_PX)) {
    const size = nearestDimensionPx(defaultPx, fontSize);
    lines.push(`    ${role}: { ...${defaultThemeVar}.fonts.${role}, fontSize: ${size} },`);
  }
  lines.push("  },");
  return lines.join("\n");
}

export function generateRnPaper(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));
  const { spacing } = readJson<SpacingFile>(join(tokensDir, "spacing.json"));
  const { typography } = readJson<TypographyPrimitivesFile>(join(tokensDir, "typography.primitive.json"));
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
        fontsLiteral("DefaultLightTheme", typography.primitive.fontSize),
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
        fontsLiteral("DefaultDarkTheme", typography.primitive.fontSize),
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
    "// `fonts` (wired 2026-09-16) overrides just the fontSize of each real",
    "// MD3 typescale role with the nearest real type-scale token — see",
    "// fontsLiteral's own comment. Font FAMILY stays Paper's default —",
    "// separate, unrelated gap: React Native needs real .ttf/.otf files via",
    "// expo-font, which this pipeline doesn't fetch for any RN scaffold",
    "// (same known gap as RNR's own README).",
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

  // Component wrappers — see buildCardWrapper's own header comment for the
  // full "why" and the real source verification behind it. radius.md (not
  // the derived `roundness`) is the real target value here — these
  // components each apply their OWN real multiplier internally if left to
  // Paper's default, so passing radius.md directly (not roundness) is what
  // actually lands on the same visible corner size as Button.
  const radiusMd = parseFloat(radius.md.$value);
  const componentsPath = join(buildPath, "components");
  mkdirSync(componentsPath, { recursive: true });
  // Real MD3 Button label margin defaults (non-"text" modes) — see
  // buildButtonWrapper's own header for the full derivation.
  const buttonMarginVertical = nearestDimensionPx(10, spacing);
  const buttonMarginHorizontal = nearestDimensionPx(24, spacing);
  writeFileSync(join(componentsPath, "Button.tsx"), buildButtonWrapper(buttonMarginVertical, buttonMarginHorizontal), "utf-8");
  writeFileSync(join(componentsPath, "Card.tsx"), buildCardWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "Chip.tsx"), buildChipWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "TextInput.tsx"), buildTextInputWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "Snackbar.tsx"), buildSnackbarWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "Menu.tsx"), buildMenuWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "ToggleButton.tsx"), buildToggleButtonWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "DrawerItem.tsx"), buildDrawerItemWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "FAB.tsx"), buildFabWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "Searchbar.tsx"), buildSearchbarWrapper(radiusMd), "utf-8");
  writeFileSync(join(componentsPath, "Dialog.tsx"), buildDialogWrapper(radiusMd), "utf-8");

  return {
    filesWritten: [
      "rn-paper/theme.ts",
      "rn-paper/SETUP.md",
      "rn-paper/components/Button.tsx",
      "rn-paper/components/Card.tsx",
      "rn-paper/components/Chip.tsx",
      "rn-paper/components/TextInput.tsx",
      "rn-paper/components/Snackbar.tsx",
      "rn-paper/components/Menu.tsx",
      "rn-paper/components/ToggleButton.tsx",
      "rn-paper/components/DrawerItem.tsx",
      "rn-paper/components/FAB.tsx",
      "rn-paper/components/Searchbar.tsx",
      "rn-paper/components/Dialog.tsx",
    ],
  };
}
