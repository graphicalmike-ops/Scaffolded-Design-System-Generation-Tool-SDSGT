// Bootstrap Sass-variable generator (React-Bootstrap, bootstrap-vue-next —
// see pipeline-plan.md, "Generators"). Unlike the Tailwind relabel, this
// isn't a full-tree Style Dictionary transform: the contract only pulls a
// small, curated set of base values and lets Bootstrap's own Sass
// (tint-color()/shade-color(), its $border-radius scale) derive everything
// else — so this reads the DTCG JSON directly and writes exactly those
// lines, rather than running the whole token tree through Style Dictionary.
//
// Decided scope (contracts-and-seeds.md, "Positional relabel" + "Radius"):
// - $primary/$secondary from the base step (600) only — no ramp
//   translation, Bootstrap's own Sass derives every tint/shade from there.
// - status.* onto Bootstrap's own $success/$danger/$warning/$info (status
//   role 5, "promo," has no Bootstrap equivalent — skipped, same as the
//   "no framework defines an equivalent 5th role" note in
//   "Boilerplate status-color formula").
// - radius.sm/md/lg onto $border-radius-sm/$border-radius/$border-radius-lg
//   (same direct-passthrough treatment as $primary/$secondary — not a new
//   kind of behavior).
// - radius.full (spec value 9999, "fully round") maps onto Bootstrap's own
//   $border-radius-pill idiom, left at Bootstrap's real default (50rem)
//   rather than a literal 9999px — functionally identical, see
//   contracts-and-seeds.md, "Radius."
// Extended 2026-09-08 from an initially narrower $primary/$secondary-only
// scope — see pipeline-plan.md, "Generators."
//
// $btn-padding-y/$btn-padding-x added 2026-09-15 (real, verified against
// Bootstrap 5.3's own documented Sass variables — real defaults 0.375rem/
// 0.75rem) — closes a real gap found while building the Figma component
// push: this pipeline's own spacing preset never reached Bootstrap's real
// button geometry before this, only color and radius did. Bound to the
// NEAREST real spacing token (same "pick the closest real value, never
// fabricate one" approach `figma-components-plan.ts` already uses), since
// Bootstrap's own half-step rem defaults (6px/12px) don't always land
// exactly on this pipeline's integer spacing scale.
//
// $btn-font-size added 2026-09-16 — real gap left open by the 2026-09-15
// pass above (disclosed then, not silently assumed fixed). Verified against
// the real npm-published bootstrap@5.3.8 tarball's own scss/_variables.scss:
// $btn-font-size -> $input-btn-font-size -> $font-size-base, real default
// 1rem (16px). Bound to the nearest real type-scale fontSize primitive (same
// nearest-value discipline as $btn-padding-*), not Bootstrap's own literal
// default.
//
// $box-shadow-sm/$box-shadow/$box-shadow-lg and $btn-disabled-opacity added
// 2026-09-16, while auditing Layer 2 for gaps beyond radius/spacing/
// typography specifically (asked directly, not assumed complete after the
// earlier passes). Verified against the real bootstrap@5.3.8 source:
// $box-shadow/-sm/-lg are real, current Sass variables (real defaults `0
// .5rem 1rem rgba($black, .15)` / `0 .125rem .25rem rgba($black, .075)` /
// `0 1rem 3rem rgba($black, .175)`) — Bootstrap has no 4th/5th tier, so
// this pipeline's own `xl`/`2xl` shadow tokens have no real Bootstrap
// variable to bind (same "framework doesn't have a bigger tier" situation
// as the type-scale table). Each real Bootstrap tier is bound to this
// pipeline's own real shadow token of the SAME name (sm/md→base/lg), using
// the same layer-count and color as the token — only the length units are
// reformatted to Bootstrap's own rem convention (real px values, `0` left
// bare/unitless the way Bootstrap's own literal defaults are, e.g. `0
// .5rem 1rem ...`, not `0rem .5rem 1rem ...`). $btn-disabled-opacity's real
// default is `.65` (confirmed against the same source) — bound to the
// nearest real opacity token instead.
//
// Targets Bootstrap 5.3 (decided 2026-09-08, verified against the real
// npm-published 5.3.8 source, the current latest) — the $border-radius-sm/
// $border-radius/$border-radius-lg/$border-radius-pill variable names and
// defaults (.25rem/.375rem/.5rem/50rem) are a Bootstrap 5.x convention,
// not present in Bootstrap 4. This is a documentation/output-shape target,
// not an npm dependency — the CLI doesn't install `bootstrap` itself, it
// only generates Sass that assumes this version's variable names exist.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerateResult } from "./index.ts";
import {
  readJson,
  nearestDimensionPx,
  nearestOpacity,
  shadowLayersToCss,
  isShadowLayerToken,
  type ColorPrimitivesFile,
  type RadiusFile,
  type SpacingFile,
  type TypographyPrimitivesFile,
  type ShadowFile,
  type OpacityFile,
} from "./read-tokens.ts";

// "6px" -> ".375rem", at this spec's fixed 16px root (same root used
// everywhere else in the token spec) — Bootstrap's own Sass variables are
// conventionally written in rem with the leading zero dropped.
export function pxToRem(pxValue: string): string {
  const rem = parseFloat(pxValue) / 16;
  const withoutLeadingZero = rem.toString().replace(/^0\./, ".");
  return `${withoutLeadingZero}rem`;
}

// Same conversion, but a zero length becomes a bare unitless `0` — matches
// Bootstrap's own real literal shadow defaults exactly (e.g. `0 .5rem 1rem
// rgba($black, .15)`, not `0rem .5rem 1rem ...`). Only used for shadow
// offset/blur/spread values, which is the one place this pipeline emits a
// Bootstrap length that's routinely zero (a shadow's own X offset).
function pxToRemForShadow(pxValue: string): string {
  return parseFloat(pxValue) === 0 ? "0" : pxToRem(pxValue);
}

// Per "Boilerplate status-color formula": role 1=error, 2=success,
// 3=warning, 4=info, 5=promo. Bootstrap's danger/success/warning/info are
// the same four roles under Bootstrap's own names; promo has no Bootstrap
// equivalent and is deliberately omitted, not approximated.
export const STATUS_ROLE_TO_BOOTSTRAP: Record<string, string> = {
  "1": "danger",
  "2": "success",
  "3": "warning",
  "4": "info",
};

export const RADIUS_KEY_TO_BOOTSTRAP: Record<string, string> = {
  sm: "border-radius-sm",
  md: "border-radius",
  lg: "border-radius-lg",
};

// Bootstrap's own real tiers only go up to `lg` — no 4th/5th tier exists,
// same "framework doesn't have a bigger one" situation as the type-scale
// table (see file header).
export const SHADOW_KEY_TO_BOOTSTRAP: Record<string, string> = {
  sm: "box-shadow-sm",
  md: "box-shadow",
  lg: "box-shadow-lg",
};

export function generateBootstrapVariables(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));
  const { spacing } = readJson<SpacingFile>(join(tokensDir, "spacing.json"));
  const { typography } = readJson<TypographyPrimitivesFile>(join(tokensDir, "typography.primitive.json"));
  const { shadow } = readJson<ShadowFile>(join(tokensDir, "shadow.json"));
  const { opacity } = readJson<OpacityFile>(join(tokensDir, "opacity.json"));

  const lines: string[] = [
    "// Generated by SDSGT — Bootstrap Sass variable overrides.",
    '// Import this BEFORE `@import "bootstrap/scss/bootstrap";` so these',
    "// override Bootstrap's own defaults. Only the base color step and a",
    "// few of Bootstrap's own border-radius variables are set here —",
    "// Bootstrap's own Sass (tint-color()/shade-color()) derives every",
    "// tint/shade from these, not a ramp we generate ourselves.",
    "",
    `$primary: ${color.primitive.brand["600"].$value};`,
  ];

  if (color.primitive["brand-secondary"]) {
    lines.push(`$secondary: ${color.primitive["brand-secondary"]["600"].$value};`);
  }

  for (const [role, name] of Object.entries(STATUS_ROLE_TO_BOOTSTRAP)) {
    const token = color.primitive.status[role]?.["200"];
    if (token) lines.push(`$${name}: ${token.$value};`);
  }

  lines.push("");
  for (const [key, name] of Object.entries(RADIUS_KEY_TO_BOOTSTRAP)) {
    const token = radius[key];
    if (token) lines.push(`$${name}: ${pxToRem(token.$value)};`);
  }
  // radius.full — see file header note on the $border-radius-pill idiom.
  lines.push("$border-radius-pill: 50rem;");

  // Real Bootstrap 5.3 defaults are 0.375rem (6px)/0.75rem (12px) — nearest
  // real spacing token used instead of the literal default, or a
  // fabricated exact one (see file header/nearestDimensionPx above).
  lines.push("");
  lines.push(`$btn-padding-y: ${pxToRem(String(nearestDimensionPx(6, spacing)))};`);
  lines.push(`$btn-padding-x: ${pxToRem(String(nearestDimensionPx(12, spacing)))};`);

  // Real Bootstrap 5.3 default is 1rem (16px) — see file header. Nearest
  // real type-scale fontSize primitive used instead of the literal default.
  lines.push(`$btn-font-size: ${pxToRem(String(nearestDimensionPx(16, typography.primitive.fontSize)))};`);

  // Real Bootstrap tiers only (sm/base/lg) — see file header and
  // SHADOW_KEY_TO_BOOTSTRAP's own comment for why xl/2xl have nothing to
  // bind to. Same layer count/color as this pipeline's own shadow token,
  // only the lengths reformatted to Bootstrap's own rem convention.
  // Skips cleanly (real Bootstrap default stays in place) if the chosen
  // shadow preset is elevation-shaped (`md3`/`md2` — a single dp/px
  // number, not real box-shadow layer data) rather than box-shadow-shaped
  // (`tailwind`/`bootstrap`) — see `read-tokens.ts`'s own `ShadowToken`
  // comment for why both shapes are real and expected, not a malformed
  // file. A real, mismatched-preset combination (Bootstrap design language
  // + an `md2`/`md3` shadow preset) crashed here before this check was
  // added — caught by the real QA matrix, fixed by checking `$type`
  // instead of assuming every shadow.json is array-of-layers shaped.
  lines.push("");
  for (const [key, name] of Object.entries(SHADOW_KEY_TO_BOOTSTRAP)) {
    const token = shadow[key];
    if (token && isShadowLayerToken(token)) lines.push(`$${name}: ${shadowLayersToCss(token, pxToRemForShadow)};`);
  }

  // Real Bootstrap 5.3 default is .65 — nearest real opacity token used
  // instead of the literal default.
  lines.push("");
  lines.push(`$btn-disabled-opacity: ${nearestOpacity(0.65, opacity)};`);

  const buildPath = join(outDir, "bootstrap");
  mkdirSync(buildPath, { recursive: true });
  const destination = "_variables.scss";
  writeFileSync(join(buildPath, destination), `${lines.join("\n")}\n`, "utf-8");

  return { filesWritten: [`bootstrap/${destination}`] };
}
