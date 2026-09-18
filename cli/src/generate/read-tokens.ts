// Shared by every generator that reads the DTCG token spec directly rather
// than running it through Style Dictionary (bootstrap.ts, md2.ts, and
// others as they're built) — these generators pull a curated set of
// specific values rather than transforming the whole token tree, so a
// plain JSON read is simpler and more direct than Style Dictionary's
// tree-walking machinery (see bootstrap.ts's file header for why).

import { readFileSync } from "node:fs";

export interface DtcgColorToken {
  $type: "color";
  $value: string;
}

export interface DtcgDimensionToken {
  $type: "dimension";
  $value: string;
}

export interface ColorPrimitivesFile {
  color: {
    primitive: {
      brand: Record<string, DtcgColorToken>;
      "brand-secondary"?: Record<string, DtcgColorToken>;
      neutral: Record<string, DtcgColorToken>;
      static: Record<string, DtcgColorToken>;
      status: Record<string, Record<string, DtcgColorToken>>;
    };
  };
}

export interface RadiusFile {
  radius: Record<string, DtcgDimensionToken>;
}

export interface SpacingFile {
  spacing: Record<string, DtcgDimensionToken>;
}

export interface TypographyPrimitivesFile {
  typography: {
    primitive: {
      fontSize: Record<string, DtcgDimensionToken>;
    };
  };
}

export interface DtcgShadowLayer {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

export interface DtcgShadowToken {
  $type: "shadow";
  $value: DtcgShadowLayer[];
}

// `shadow.json`'s own token SHAPE varies by preset, by this project's own
// deliberate, pre-existing design — a real, structural difference this
// pipeline already modeled in its presets before any generator consumed
// them: `shadow.tailwind.json`/`shadow.bootstrap.json` are real, multi-
// layer CSS box-shadow definitions (`$type: "shadow"`), while
// `shadow.md3.json`/`shadow.md2.json` are a single elevation dp/px number
// each (`$type: "dimension"`) — Material Design's own real elevation model
// has no per-tier box-shadow definition to give, only a physical height.
// Found the hard way: an early version of `generate/bootstrap.ts`'s own
// shadow binding assumed every `shadow.json` was array-of-layers shaped
// and crashed (`token.$value.map is not a function`) on a real QA case
// that mixed a Bootstrap-language seed with an `md2` shadow preset —
// caught by the real QA matrix, not missed. Callers must check `$type`
// before treating a shadow token as either shape.
export type ShadowToken = DtcgShadowToken | DtcgDimensionToken;

export interface ShadowFile {
  shadow: Record<string, ShadowToken>;
}

export function isShadowLayerToken(token: ShadowToken): token is DtcgShadowToken {
  return token.$type === "shadow";
}

export interface DtcgNumberToken {
  $type: "number";
  $value: number;
}

export interface OpacityFile {
  opacity: Record<string, DtcgNumberToken>;
}

// Same "nearest real value, never fabricated" discipline as
// `nearestDimensionPx`, for opacity's own plain 0-1 number values instead
// of px dimensions — added 2026-09-16 while auditing Layer 2's remaining
// scope beyond radius/spacing/typography (button/component disabled,
// hover, focus, etc. opacities — real single values several component
// libraries expose, same shape as button padding).
export function nearestOpacity(target: number, tokens: Record<string, DtcgNumberToken>): number {
  let best: number | null = null;
  for (const token of Object.values(tokens)) {
    const value = token.$value;
    if (best === null || Math.abs(value - target) < Math.abs(best - target)) best = value;
  }
  if (best === null) throw new Error("opacity.json has no entries — was it written by this pipeline's promote?");
  return best;
}

// Converts a real shadow token's layer array into a real, complete CSS
// `box-shadow` value string — the exact same shape Style Dictionary's own
// built-in `shadow/css/shorthand` transform already produces for the
// always-written plain CSS platform (confirmed by reading a real generated
// `css/tokens.css`, e.g. `--shadow-md: 0px 4px 6px -1px rgba(...), 0px 2px
// 4px -2px rgba(...);`) — this just replicates that same format for
// generators (like `generate/bootstrap.ts`) that read the raw DTCG JSON
// directly instead of going through Style Dictionary. `unit` lets a caller
// convert to a different unit (e.g. Bootstrap's own rem convention) via a
// provided formatter; defaults to passing px lengths through unchanged.
export function shadowLayersToCss(token: DtcgShadowToken, formatLength: (px: string) => string = (px) => px): string {
  return token.$value
    .map((layer) => `${formatLength(layer.offsetX)} ${formatLength(layer.offsetY)} ${formatLength(layer.blur)} ${formatLength(layer.spread)} ${layer.color}`)
    .join(", ");
}

// Picks the real token whose pixel value is numerically closest to a raw
// target — the "nearest real value, never a fabricated one" discipline
// this pipeline uses everywhere a preset's own scale doesn't land exactly
// on a component library's real default (same reasoning as
// `scaffold/figma-components-plan.ts`'s own `nearestToken`, just operating
// on the raw DTCG token JSON directly rather than an already-flattened CSS
// scale — see `shared/scaffold-common.ts`'s `nearestScalePx` for that
// sibling version, used at scaffold time instead of generate time). First
// built for `generate/bootstrap.ts`'s own `$btn-padding-*`/`$btn-font-size`
// (2026-09-15/16), moved here once `generate/rn-paper.ts` needed the exact
// same logic (2026-09-16) rather than a third hand-rolled copy.
export function nearestDimensionPx(targetPx: number, tokens: Record<string, DtcgDimensionToken>): number {
  let best: number | null = null;
  for (const token of Object.values(tokens)) {
    const px = parseFloat(token.$value);
    if (best === null || Math.abs(px - targetPx) < Math.abs(best - targetPx)) best = px;
  }
  if (best === null) throw new Error("Token scale has no entries — was it written by this pipeline's promote?");
  return best;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// Shared shape for color.semantic.<mode>.json, and the alias-resolution
// logic every reader of it needs — moved here from swiftui.ts (its original
// home) once shadcn.ts needed the exact same resolution logic. Semantic
// tokens are almost all DTCG aliases (`$value: "{color.primitive.neutral.
// 100}"`), not baked hex — see contracts-and-seeds.md, "Alias vs. baked
// value." The two already-baked exceptions (action.*-disabled,
// overlay.scrim) pass through their own literal value untouched.
export interface SemanticToken {
  $value: string;
}

export type SemanticTree = { [key: string]: SemanticToken | SemanticTree };

export interface SemanticFile {
  color: { semantic: SemanticTree };
}

export function isSemanticToken(node: SemanticToken | SemanticTree): node is SemanticToken {
  return typeof (node as SemanticToken).$value === "string";
}

// "{color.primitive.neutral.100}" -> the neutral primitive group's "100"
// hex. Path depth varies: brand/brand-secondary/neutral/static are 2 levels
// deep (group.step), status is 3 (status.role.tone) — walk generically
// rather than assuming a fixed depth.
export function resolveAlias(ref: string, primitives: ColorPrimitivesFile["color"]["primitive"]): string {
  const [, , ...steps] = ref.replace(/[{}]/g, "").split(".");
  let node: unknown = primitives;
  for (const step of steps) {
    node = (node as Record<string, unknown> | undefined)?.[step];
  }
  const resolved = (node as { $value?: string } | undefined)?.$value;
  if (!resolved) throw new Error(`Unresolvable color alias: ${ref}`);
  return resolved;
}
