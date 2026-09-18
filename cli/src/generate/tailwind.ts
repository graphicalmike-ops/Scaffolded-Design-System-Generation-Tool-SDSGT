// Tailwind-family code-token generator — Next.js + Tailwind first (see
// pipeline-plan.md, "Generators"). Scope, per the documented contract
// (contracts-and-seeds.md, "Positional relabel"): relabel ONLY the
// primitive color ramp's step keys — our 100–1100 numbering onto Tailwind's
// native 50–950 — nothing else. Semantic color tokens keep their own
// names; their values are already-resolved hex by the time formatting
// happens, so relabeling only the primitive ramp's NAME doesn't touch any
// semantic token's VALUE.
//
// Spacing is NOT a "nothing to relabel, already native" case — it was a
// real, silent bug, fixed 2026-09-15. Tailwind v4's @theme block resolves
// any spacing utility that ISN'T an explicit named override (every
// fractional class like `px-2.5`/`gap-1.5`, plus any integer key this
// project's own spacing preset doesn't happen to name) via its own base
// `--spacing` variable: `calc(var(--spacing) * N)`. This generator used to
// only ever write named per-key overrides (`--spacing-0`, `--spacing-4`,
// ...), never touching that base variable — confirmed with a real compiled
// build (`.next/static/chunks/*.css` showing `.px-2\.5{padding-inline:
// calc(var(--spacing) * 2.5)}`, reading Tailwind's raw untouched 4px
// default regardless of which spacing-rhythm preset the seed actually
// chose) that real, unmodified vendored shadcn/ui (and shadcn-vue)
// component source uses exactly these classes.
//
// Fixed HERE (`injectBaseSpacingVar`, applied to this file's own theme.css)
// only for the PLAIN Tailwind scaffold path (no component library — see
// scaffold/nextjs.ts's `writeGlobalsCss`, the only place that actually
// `@import`s this file's theme.css). The `--shadcn` scaffold path is a
// SEPARATE fix, in generate/shadcn.ts: that path never imports this file's
// theme.css at all (confirmed by reading scaffold/nextjs.ts and
// scaffold/vuejs.ts — the shadcn branch only ever appends generate/
// shadcn.ts's own theme.css on top of shadcn's/shadcn-vue's own generated
// globals.css/main.css), so this file's own injected --spacing would be
// dead code for real vendored shadcn/ui or shadcn-vue projects. Both fixes
// share the same linearity computation, `computeLinearSpacingConstant`
// below (exported, imported by generate/shadcn.ts) — for every spacing
// preset whose scale is genuinely linear (every key's px value = key × one
// constant — true for "tailwind"/"md3"/"md2", all 4px/step). The one
// preset that isn't linear ("bootstrap": 0/4/8/16/24/48px — a
// 4x/4x/5.33x/6x/9.6x per-step ratio, not a constant one) structurally
// can't be represented this way at all — disclosed in AGENTS.md and the
// SDSGT-start skill's "Geometry fidelity" section instead of faked. Radius
// has no equivalent gap — shadcn/RNR's own generated `--radius` variable
// already binds directly to `radius.md`, not Tailwind's own radius scale.
//
// Deliberately NOT the same thing as shadcn/ui's own variable names
// (--primary, --primary-foreground, etc.) — mapping onto a specific
// component library's expected variables is Layer 2 work (see "Three
// layers" in pipeline-plan.md), not started, not scoped here.
//
// Output targets Tailwind v4 (CSS-native @theme block) — decided
// 2026-09-08, see pipeline-plan.md, "Generators."

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import StyleDictionary from "style-dictionary";
import { formats } from "style-dictionary/enums";

import {
  LIGHT_FILE,
  DARK_FILE,
  isLightFile,
  isDarkFile,
  sourceFilesExcluding,
  type FileConfig,
  type GenerateResult,
} from "./index.ts";
import { readJson, type DtcgDimensionToken } from "./read-tokens.ts";

// Per contracts-and-seeds.md, "Positional relabel." Only brand/
// brand-secondary/neutral use this — static (white/black) and status (5
// roles x 2 tones) don't use the 100-1100 ramp numbering at all, so they
// pass through with their own path segment unchanged.
export const STEP_RELABEL: Record<string, string> = {
  "100": "50",
  "200": "100",
  "300": "200",
  "400": "300",
  "500": "400",
  "600": "500",
  "700": "600",
  "800": "700",
  "900": "800",
  "1000": "900",
  "1100": "950",
};

const RAMP_GROUPS = new Set(["brand", "brand-secondary", "neutral"]);

interface NameTransformToken {
  path: string[];
}

// Same shape as Style Dictionary's own built-in name/kebab transform
// (path.join('-')) — our token path segments are already plain
// lowercase/kebab-safe strings, so no case-conversion library is needed to
// match it exactly for our specific token set.
function tailwindRampRelabelName(token: NameTransformToken): string {
  const path = [...token.path];
  if (path[0] === "color" && path[1] === "primitive" && RAMP_GROUPS.has(path[2]) && STEP_RELABEL[path[3]]) {
    path[3] = STEP_RELABEL[path[3]];
  }
  return path.join("-");
}

// The full "css" transformGroup's transform list (verified against Style
// Dictionary's own lib/common/transformGroups.js), with name/kebab swapped
// for our custom relabeling transform — every value transform (color, size,
// shadow, typography, etc.) stays identical to the plain CSS platform in
// index.ts, only how primitive ramp tokens are NAMED changes.
const TAILWIND_TRANSFORMS = [
  "attribute/cti",
  "tailwind/ramp-relabel",
  "time/seconds",
  "html/icon",
  "size/rem",
  "color/css",
  "asset/url",
  "fontFamily/css",
  "cubicBezier/css",
  "strokeStyle/css/shorthand",
  "border/css/shorthand",
  "typography/css/shorthand",
  "transition/css/shorthand",
  "shadow/css/shorthand",
];

interface SpacingFile {
  spacing: Record<string, DtcgDimensionToken>;
}

// Every baked spacing preset value is a plain "<N>px" string (verified
// against the real resolved token spec — e.g. out/DTCG Token spec
// (non-consumables)/spacing.json — not assumed from the preset source).
function parsePx(value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) throw new Error(`Expected a plain "<N>px" spacing value, got "${value}"`);
  return Number(match[1]);
}

// Every resolved spacing.json entry as [key, px] pairs, sorted by key. Shared
// by computeLinearSpacingConstant below and, for the non-linear case it
// can't handle, generate/shadcn.ts's own named-per-key override (see that
// file's header for why a non-linear preset needs a different mechanism
// than the single --spacing constant). Returns null only when spacing.json
// itself doesn't exist for this project.
export function readSpacingEntries(tokensDir: string): ReadonlyArray<readonly [number, number]> | null {
  const path = join(tokensDir, "spacing.json");
  if (!existsSync(path)) return null;
  const { spacing } = readJson<SpacingFile>(path);
  return Object.entries(spacing)
    .map(([key, token]) => [Number(key), parsePx(token.$value)] as const)
    .sort(([a], [b]) => a - b);
}

// Tailwind v4's own base --spacing variable (see this file's header) is a
// SINGLE multiplier: every utility without an explicit named override
// resolves to calc(var(--spacing) * N). That can only ever correctly stand
// in for a spacing scale that is itself linear — every key's pixel value
// equal to that same key times one constant, for every key in the resolved
// scale. Computed here from the real resolved spacing.json values (not
// from the preset's name) so this stays correct even if a preset's own
// table ever changes, or a project's tokens get hand-edited afterward.
// Returns null when the scale isn't linear (nothing to safely inject).
export function computeLinearSpacingConstant(tokensDir: string): number | null {
  const all = readSpacingEntries(tokensDir);
  if (all === null) return null;
  const entries = all.filter(([key]) => key !== 0); // 0 -> 0px is consistent with any constant — not a useful data point
  if (entries.length === 0) return null;
  const constant = entries[0][1] / entries[0][0];
  const isLinear = entries.every(([key, px]) => Math.abs(px - key * constant) < 0.01);
  return isLinear ? constant : null;
}

// Inserts Tailwind's own reserved `--spacing` base variable right after the
// @theme block's opening line, so every spacing utility this pipeline never
// explicitly names (every fractional class, plus any integer key the
// chosen preset doesn't happen to list) resolves via this project's real
// spacing rhythm instead of Tailwind's own untouched 4px default. Written
// in plain px, matching this file's existing named `--spacing-N` overrides
// (see generateTailwindTheme) rather than converting to rem — Tailwind
// itself only ever consumes --spacing through `calc(var(--spacing) * N)`,
// so any valid CSS length unit works; verified this actually takes effect
// with a real compiled build (see the fix's own verification run).
function injectBaseSpacingVar(themeCssPath: string, constantPx: number): void {
  const css = readFileSync(themeCssPath, "utf-8");
  const withBaseVar = css.replace(/@theme\s*\{\n/, (match) => `${match}  --spacing: ${constantPx}px;\n`);
  writeFileSync(themeCssPath, withBaseVar, "utf-8");
}

async function buildTailwindPlatform(source: string[], buildPath: string, files: FileConfig[]): Promise<void> {
  const sd = new StyleDictionary({
    source,
    hooks: {
      transforms: {
        "tailwind/ramp-relabel": {
          type: "name",
          transform: tailwindRampRelabelName,
        },
      },
    },
    platforms: {
      tailwind: { transforms: TAILWIND_TRANSFORMS, buildPath, files },
    },
  });
  await sd.buildAllPlatforms();
}

export interface TailwindGenerateResult extends GenerateResult {
  // Whether a real `--spacing` base-variable override got injected (true
  // only when the resolved spacing preset is linear — see
  // computeLinearSpacingConstant) — and the constant used, when it did.
  // Callers (cli.ts's AGENTS.md/report wiring) use this to disclose the
  // real, current state rather than assuming every preset got the fix.
  spacingBaseVar: { applied: boolean; constantPx: number | null };
}

export async function generateTailwindTheme(tokensDir: string, outDir: string): Promise<TailwindGenerateResult> {
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const buildPath = `${outDir}/tailwind/`;
  const filesWritten: string[] = [];

  if (hasLight) {
    const source = sourceFilesExcluding(tokensDir, hasDark ? DARK_FILE : null);
    await buildTailwindPlatform(source, buildPath, [
      { destination: "theme.css", format: formats.cssVariables, filter: (t) => !isLightFile(t.filePath), options: { selector: "@theme" } },
      { destination: "theme-light.css", format: formats.cssVariables, filter: (t) => isLightFile(t.filePath), options: { selector: "@theme" } },
    ]);
    filesWritten.push("tailwind/theme.css", "tailwind/theme-light.css");
  }

  if (hasDark) {
    const source = sourceFilesExcluding(tokensDir, hasLight ? LIGHT_FILE : null);
    const files: FileConfig[] = [
      {
        destination: "theme-dark.css",
        format: formats.cssVariables,
        filter: (t) => isDarkFile(t.filePath),
        // Tailwind v4 has no built-in dark-mode @theme variant — scope the
        // override under the same [data-theme="dark"] selector the plain
        // CSS platform uses. Deliberately PLAIN custom properties here, NOT
        // nested inside another @theme block — confirmed by a real build
        // (2026-09-12, via a scaffolded Next.js project actually compiled
        // with Tailwind v4) that @theme is not scopable this way: Tailwind
        // hoists any @theme block straight to the root regardless of what
        // selector it's nested inside, so a nested `[data-theme="dark"] {
        // @theme { ... } }` silently overwrote the light values globally
        // instead of only applying under that selector — a real, previously
        // undetected bug (see qa-matrix's new real-build check, below,
        // which now catches exactly this class of bug; the old check only
        // verified the generated file's raw text, not real compiled
        // behavior). Plain custom properties don't have this problem —
        // they respect the selector they're written under normally, the
        // same way any ordinary CSS custom property does.
        options: { selector: '[data-theme="dark"]' },
      },
    ];
    if (!hasLight) {
      files.unshift({
        destination: "theme.css",
        format: formats.cssVariables,
        filter: (t) => !isDarkFile(t.filePath),
        options: { selector: "@theme" },
      });
      filesWritten.push("tailwind/theme.css");
    }
    await buildTailwindPlatform(source, buildPath, files);
    filesWritten.push("tailwind/theme-dark.css");
  }

  // spacing.json is mode-independent (no light/dark split), so it always
  // lands in theme.css — written above by whichever branch ran (hasLight,
  // or the !hasLight fallback inside the hasDark branch). One of those two
  // always fires for any real project (promote always writes at least one
  // of LIGHT_FILE/DARK_FILE), so theme.css always exists at this point.
  const constant = computeLinearSpacingConstant(tokensDir);
  const themeCssPath = join(buildPath, "theme.css");
  if (constant !== null && existsSync(themeCssPath)) {
    injectBaseSpacingVar(themeCssPath, constant);
  }

  return { filesWritten, spacingBaseVar: { applied: constant !== null, constantPx: constant } };
}
