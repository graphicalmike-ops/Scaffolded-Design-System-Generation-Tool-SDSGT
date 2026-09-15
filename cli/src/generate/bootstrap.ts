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
import { readJson, type ColorPrimitivesFile, type RadiusFile } from "./read-tokens.ts";

interface SpacingFile {
  spacing: Record<string, { $value: string }>;
}

// Picks the real spacing token whose pixel value is numerically closest to
// a raw target — same "nearest real value, never a fabricated one"
// approach `scaffold/figma-components-plan.ts` uses for the same class of
// problem (Bootstrap's own half-step rem defaults vs. this pipeline's
// integer-step spacing scale).
function nearestSpacingPx(targetPx: number, spacing: Record<string, { $value: string }>): number {
  let best: number | null = null;
  for (const token of Object.values(spacing)) {
    const px = parseFloat(token.$value);
    if (best === null || Math.abs(px - targetPx) < Math.abs(best - targetPx)) best = px;
  }
  if (best === null) throw new Error("spacing.json has no entries — was it written by this pipeline's promote?");
  return best;
}

// "6px" -> ".375rem", at this spec's fixed 16px root (same root used
// everywhere else in the token spec) — Bootstrap's own Sass variables are
// conventionally written in rem with the leading zero dropped.
export function pxToRem(pxValue: string): string {
  const rem = parseFloat(pxValue) / 16;
  const withoutLeadingZero = rem.toString().replace(/^0\./, ".");
  return `${withoutLeadingZero}rem`;
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

export function generateBootstrapVariables(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));
  const { spacing } = readJson<SpacingFile>(join(tokensDir, "spacing.json"));

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
  // fabricated exact one (see file header/nearestSpacingPx above).
  lines.push("");
  lines.push(`$btn-padding-y: ${pxToRem(String(nearestSpacingPx(6, spacing)))};`);
  lines.push(`$btn-padding-x: ${pxToRem(String(nearestSpacingPx(12, spacing)))};`);

  const buildPath = join(outDir, "bootstrap");
  mkdirSync(buildPath, { recursive: true });
  const destination = "_variables.scss";
  writeFileSync(join(buildPath, destination), `${lines.join("\n")}\n`, "utf-8");

  return { filesWritten: [`bootstrap/${destination}`] };
}
