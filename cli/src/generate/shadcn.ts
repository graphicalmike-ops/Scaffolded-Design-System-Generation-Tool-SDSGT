// shadcn/ui theme generator — Layer 2's first slice (see pipeline-plan.md,
// "Three layers": Layer 2 is the foundation applied to a real component
// library, not just relabeled tokens). Version-pinned against shadcn/ui's
// live docs (ui.shadcn.com/docs/theming, verified 2026-09-10, current
// published CLI 4.13.1) — see contracts-and-seeds.md, "shadcn/ui theming,"
// for the full token -> variable mapping table and the reasoning behind
// every gap-fill/approximation below.
//
// This generator only produces the CSS variable theme file. It does not run
// `shadcn init`/`shadcn add`, install any components, or touch a real
// project — component vendoring (installing + trimming + marking
// customized files, the ACIM lesson) is separate, not-yet-built work. See
// pipeline-plan.md, "Three layers," Layer 2.
//
// Like bootstrap.ts/swiftui.ts, this reads the DTCG JSON directly rather
// than running Style Dictionary — it only needs a curated set of resolved
// semantic values, not a full tree transform.
//
// Dark mode uses shadcn's own `.dark` class selector, NOT this project's
// usual `[data-theme="dark"]` convention — a deliberate, scoped exception.
// This file is meant to be the actual globals.css for a shadcn-flavored
// project, and shadcn's whole ecosystem (its own templates, next-themes,
// every community example) assumes `.dark` on <html>/<body>. Every other
// generator here keeps `[data-theme="dark"]`; this is the one documented
// exception, scoped to this one file. See contracts-and-seeds.md, "shadcn/ui
// theming."
//
// `--spacing` (added 2026-09-15, alongside the fix in generate/tailwind.ts —
// see that file's header for the full bug writeup): this file's `:root`
// block is the ACTUAL CSS that reaches a real shadcn/ui or shadcn-vue
// scaffold — scaffold/nextjs.ts and scaffold/vuejs.ts append this file's
// content on top of shadcn's own generated globals.css/main.css, and
// neither ever imports generate/tailwind.ts's own theme.css at all in the
// --shadcn path (confirmed by reading both scaffold files — `writeGlobalsCss`/
// its Vue equivalent, the only place that `@import`s that file, only runs in
// the NON-shadcn branch). So the base `--spacing` override has to live HERE
// to actually take effect for real vendored shadcn/ui or shadcn-vue
// component source. Verified empirically that this works even though this
// block is plain, unlayered `:root { }` CSS rather than an `@theme` block:
// Tailwind v4 always wraps its OWN theme defaults in `@layer theme`, and per
// the CSS Cascade Layers spec, ANY unlayered declaration beats ANY layered
// one regardless of source order — confirmed with a real compiled build
// PLUS a real browser's computed style (`getComputedStyle`), not just
// reading the generated CSS text, since two competing `--spacing`
// declarations in the same file can't be disambiguated by text alone.
//
// `--shadow-*` (added 2026-09-16, while auditing Layer 2 for gaps beyond
// radius/spacing/typography specifically) — a DIFFERENT injection point
// than `--spacing` above, not the same one (this header used to say
// otherwise — corrected 2026-09-16, see the bootstrap-spacing paragraph
// below for why it matters). A real, non-obvious finding while building
// this: Tailwind v4 RESHUFFLED its shadow scale relative to v3 — confirmed
// by reading the real npm-published `tailwindcss@^4` package's own
// `theme.css`. v4 added a new `2xs` tier and shifted names: v3's `sm`
// (`0 1px 2px 0 rgb(0 0 0/0.05)`) is v4's `xs`; v3's bare `DEFAULT`/
// `shadow` is v4's `sm`. This pipeline's own `shadow.tailwind.json` was
// built matching v3's real defaults (confirmed identical at every key it
// defines), so its `sm` token binds to v4's `--shadow-xs` CSS variable,
// NOT `--shadow-sm` — binding it to `--shadow-sm` would silently target
// the wrong real v4 tier. `md`/`lg`/`xl`/`2xl` are unaffected — confirmed
// identical between v3 and v4 at those four keys, so they map straight
// across by name. v4's own `2xs` and (real) `sm` tiers have no
// corresponding token in this pipeline's own 5-value scale — left
// unbound, same "framework has more tiers than us" pattern as Bootstrap's
// own missing `xl`/`2xl`. Skips cleanly (same as `bootstrap.ts`) if the
// resolved shadow preset is elevation-shaped (`md3`/`md2`) rather than
// box-shadow-shaped — see `read-tokens.ts`'s own `ShadowToken` comment.
// Lands in a real `@theme { }` block (see `generateShadcn`'s own inline
// comment for why plain `:root` doesn't work here, unlike `--spacing`).
//
// Named per-key `--spacing-<N>` overrides for NON-linear spacing presets
// (added 2026-09-16, closing the one gap the original `--spacing` fix
// above left open): the single `--spacing` base constant can only stand in
// for a preset whose scale is genuinely linear (key × one constant) —
// `computeLinearSpacingConstant` returns null for "bootstrap" (0/4/8/16/
// 24/48px, a 4x/4x/5.33x/6x/9.6x per-step ratio), and until this fix that
// meant a bootstrap-preset shadcn/shadcn-vue project silently got
// Tailwind's raw untouched 4px-per-step default for every spacing
// utility. Fixed by writing a NAMED override for each key `spacing.json`
// itself actually defines (0-5 for bootstrap) — real vendored shadcn/ui
// Button already uses `px-4 py-2`, both in range. Same partial-but-honest
// "extend, don't invent" shape as RNR's own `theme.spacing` fix
// (`scaffold/react-native.ts`): disclosed, not fixed, for any class using
// a key beyond what the preset defines (`h-8`, `gap-6`+) or any fractional
// class (`px-2.5`, `gap-1.5`) — both still fall back to Tailwind's raw
// default. Shares the SAME `@theme { }` block as `--shadow-*` just above,
// for the same reason: Tailwind only recognizes a new `--spacing-<N>` as a
// utility-generating theme key when it's inside a real `@theme` block that
// Tailwind's own build step scans — a plain `:root` declaration here would
// be an inert custom property nothing reads, since Tailwind's compiled
// `.p-4` rule falls back to `calc(var(--spacing) * 4)` regardless unless
// `--spacing-4` was visible to Tailwind at build time. (This is also why
// the paragraph above no longer claims the shadow fix shares `--spacing`'s
// own plain-`:root` mechanism — it never did; that was a documentation
// error, not a code one, caught while adding this fix.)
const SHADOW_KEY_TO_TAILWIND_V4: Record<string, string> = {
  sm: "--shadow-xs",
  md: "--shadow-md",
  lg: "--shadow-lg",
  xl: "--shadow-xl",
  "2xl": "--shadow-2xl",
};

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LIGHT_FILE, DARK_FILE, type GenerateResult } from "./index.ts";
import {
  readJson,
  resolveAlias,
  isSemanticToken,
  isShadowLayerToken,
  shadowLayersToCss,
  type ColorPrimitivesFile,
  type RadiusFile,
  type SemanticFile,
  type SemanticTree,
  type SemanticToken,
  type ShadowFile,
} from "./read-tokens.ts";
import { contrastText } from "./mui-color.ts";
import { computeLinearSpacingConstant, readSpacingEntries } from "./tailwind.ts";

type Primitives = ColorPrimitivesFile["color"]["primitive"];

// SDSGT semantic token path -> shadcn/ui CSS variable name. Per
// contracts-and-seeds.md, "shadcn/ui theming" — every non-obvious mapping
// (gap-fills, approximations) is explained there, not re-derived here.
const CORE_VARS: ReadonlyArray<readonly [string, string]> = [
  ["--background", "background.primary"],
  ["--foreground", "text.primary"],
  ["--card", "background.surface"],
  ["--card-foreground", "text.on-surface"],
  ["--popover", "background.surface"],
  ["--popover-foreground", "text.on-surface"],
  ["--primary", "action.primary"],
  ["--primary-foreground", "text.on-primary"],
  ["--accent-foreground", "text.on-primary"],
  ["--border", "border.default"],
  ["--input", "border.default"],
  ["--ring", "border.focus"],
  ["--muted", "background.secondary"],
  ["--muted-foreground", "text.secondary"],
];

// Only emitted if this project has a secondary brand color (action.secondary
// is itself a conditional semantic token — see contracts-and-seeds.md).
const SECONDARY_VARS: ReadonlyArray<readonly [string, string]> = [
  ["--secondary", "action.secondary"],
  ["--secondary-foreground", "text.on-primary"],
];

// shadcn ships no native success/warning/info/promo slot — only
// --destructive. Added here as SDSGT extensions rather than silently
// dropping 4 of 5 status roles (the treatment Bootstrap/MUI use for their
// own native variable sets), since a real shadcn project still needs a
// consistent way to build success/warning/info/promo alerts and badges.
const STATUS_EXTRAS: ReadonlyArray<{ role: string; cssVar: string; fgVar: string }> = [
  { role: "success", cssVar: "--success", fgVar: "--success-foreground" },
  { role: "warning", cssVar: "--warning", fgVar: "--warning-foreground" },
  { role: "info", cssVar: "--info", fgVar: "--info-foreground" },
  { role: "promo", cssVar: "--promo", fgVar: "--promo-foreground" },
];

// `status.<role>-text` is the SAME saturated tone as `status.<role>` itself
// (see contracts-and-seeds.md, "Color semantic roles": it's meant for
// colored inline text on a neutral surface, e.g. a red error message — not
// a contrasting color for text sitting ON a status-colored fill). A
// -foreground var needs the latter, so it's computed the same way MD2's
// palette.ts derives contrastText — MUI's real WCAG-contrast-based pick
// between our own static.100/static.200 (white/black), not an invented
// formula. Caught by actually running this generator and inspecting the
// output (destructive-foreground came out identical to destructive itself,
// i.e. unreadable red-on-red) before this fix.
function foregroundFor(hex: string, white: string, black: string): string {
  return contrastText(hex, white, black);
}

function getSemanticToken(tree: SemanticTree, dottedPath: string): SemanticToken {
  const parts = dottedPath.split(".");
  let node: SemanticToken | SemanticTree = tree;
  for (const part of parts) {
    const next: SemanticToken | SemanticTree | undefined = (node as SemanticTree)[part];
    if (next === undefined) throw new Error(`Missing semantic token: ${dottedPath}`);
    node = next;
  }
  if (!isSemanticToken(node)) throw new Error(`Semantic path did not resolve to a token: ${dottedPath}`);
  return node;
}

function hasSemanticToken(tree: SemanticTree, dottedPath: string): boolean {
  try {
    getSemanticToken(tree, dottedPath);
    return true;
  } catch {
    return false;
  }
}

function resolvedHex(tree: SemanticTree, primitives: Primitives, dottedPath: string): string {
  const raw = getSemanticToken(tree, dottedPath).$value;
  return raw.startsWith("{") ? resolveAlias(raw, primitives) : raw;
}

// Exported so demo.ts and the QA checker compute the exact same var list
// this generator writes, rather than re-deriving their own copy of the
// mapping.
export function resolveShadcnVars(tree: SemanticTree, primitives: Primitives): Array<{ cssVar: string; hex: string }> {
  const hasSecondary = hasSemanticToken(tree, "action.secondary");
  const white = primitives.static["100"].$value;
  const black = primitives.static["200"].$value;
  const result: Array<{ cssVar: string; hex: string }> = [];

  for (const [cssVar, path] of CORE_VARS) {
    result.push({ cssVar, hex: resolvedHex(tree, primitives, path) });
  }

  if (hasSecondary) {
    for (const [cssVar, path] of SECONDARY_VARS) {
      result.push({ cssVar, hex: resolvedHex(tree, primitives, path) });
    }
  }

  // --accent: shadcn's hover/highlight slot. Prefer the secondary brand's
  // hover tone if this project has one, else fall back to the primary
  // brand's own hover tone — see contracts-and-seeds.md, "shadcn/ui
  // theming," for why this is a judgment call, not a clean 1:1 match.
  const accentPath = hasSecondary ? "action.secondary-hover" : "action.primary-hover";
  result.push({ cssVar: "--accent", hex: resolvedHex(tree, primitives, accentPath) });

  const destructiveHex = resolvedHex(tree, primitives, "status.error");
  result.push({ cssVar: "--destructive", hex: destructiveHex });
  result.push({ cssVar: "--destructive-foreground", hex: foregroundFor(destructiveHex, white, black) });

  for (const { role, cssVar, fgVar } of STATUS_EXTRAS) {
    const hex = resolvedHex(tree, primitives, `status.${role}`);
    result.push({ cssVar, hex });
    result.push({ cssVar: fgVar, hex: foregroundFor(hex, white, black) });
  }

  return result;
}

export function generateShadcn(tokensDir: string, outDir: string): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));

  const blocks: string[] = [];

  // :root only carries color values when a light mode exists (mirrors the
  // base CSS platform's own dark-only handling in generate/index.ts — a
  // dark-only project relies on `.dark` being applied unconditionally,
  // there's no separate "light" to fall back to). --radius isn't
  // mode-dependent, so it always belongs in :root.
  const rootVars: string[] = [];
  if (hasLight) {
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, LIGHT_FILE));
    rootVars.push(...resolveShadcnVars(semanticRoot.semantic, primitives).map(({ cssVar, hex }) => `  ${cssVar}: ${hex};`));
  }
  rootVars.push(`  --radius: ${radius.md.$value};`);
  // Only emitted when the resolved spacing preset is genuinely linear — see
  // computeLinearSpacingConstant in tailwind.ts and this file's own header.
  // A non-linear preset (currently just "bootstrap") gets the named-per-key
  // fix below instead — a single constant here would only ever be right for
  // the keys it happens to share with Tailwind's own multiplier, silently
  // wrong for the rest.
  const spacingConstant = computeLinearSpacingConstant(tokensDir);
  const spacingThemeVars: string[] = [];
  if (spacingConstant !== null) {
    rootVars.push(`  --spacing: ${spacingConstant}px;`);
  } else {
    // Non-linear preset (bootstrap: 0/4/8/16/24/48px, a 4x/4x/5.33x/6x/9.6x
    // per-step ratio) — no single --spacing multiplier can stand in for it.
    // Fixed 2026-09-16: write a NAMED override for each key spacing.json
    // itself defines (0-5 for bootstrap), so any real vendored component
    // class matching one of those exact integers resolves to this project's
    // real value instead of Tailwind's raw 4px-per-step default — e.g.
    // shadcn/ui's own real Badge uses `px-2` (in range, gets fixed here).
    // Same "extend, don't invent," partial-but-honest shape as RNR's own
    // theme.spacing fix (scaffold/react-native.ts) — NOT a full recreation
    // of Tailwind's own ~30-key default scale, since this preset has no
    // opinion on keys past 5. Disclosed, not fixed: any class using a key
    // beyond what this preset defines, and any FRACTIONAL class — both
    // still fall back to Tailwind's raw default, same as before this fix.
    // A real, live example of exactly this disclosed gap, confirmed while
    // verifying this fix (2026-09-16): shadcn/ui's own real Button uses
    // `px-2.5` (fractional, outside this fix's scope) for its default
    // size, while Badge's own real `px-2` is exactly the kind of class
    // this fix covers — both checked against a fresh `shadcn add`, not
    // assumed.
    //
    // Named per-key spacing overrides are a DIFFERENT mechanism than the
    // --spacing base constant above, load-bearing to get right: Tailwind
    // only recognizes a new --spacing-<N> as a utility-generating theme key
    // when it's declared inside a real `@theme { }` block that Tailwind's
    // OWN build step scans — a plain `:root` declaration here would just be
    // an inert custom property nothing ever reads, since Tailwind's
    // compiled `.p-4` rule falls back to `calc(var(--spacing) * 4)`
    // regardless, unless `--spacing-4` was visible to Tailwind at build
    // time. Same category of bug as the `--shadow-*` fix elsewhere in this
    // file (see that comment) — confirmed by the same reasoning, not
    // re-derived from scratch.
    const entries = readSpacingEntries(tokensDir) ?? [];
    for (const [key, px] of entries) {
      spacingThemeVars.push(`  --spacing-${key}: ${px}px;`);
    }
  }
  blocks.push([":root {", ...rootVars, "}"].join("\n"));

  // Real, load-bearing difference from --spacing/--radius, found the hard
  // way with a real browser check (not assumed to work the same way): a
  // plain `:root { --shadow-md: ... }` — even unlayered, even placed after
  // Tailwind's own `@theme` — has NO EFFECT on `shadow-md` etc. Confirmed
  // by reading Tailwind v4's own real compiled output: `.shadow-md`'s
  // LENGTHS get baked as literal numbers directly into the utility rule at
  // BUILD time (only the color stays a live `var(--tw-shadow-color)`
  // reference) — unlike `--spacing` (referenced live via `calc(var(
  // --spacing) * N)`) or `--radius`/colors (referenced live via `@theme
  // inline`'s own `var()` indirection), a later plain `:root` redefinition
  // is invisible to shadow utilities, since they never read the variable
  // at runtime at all. The real fix has to be a genuine `@theme { }` block
  // — processed by Tailwind's OWN build step, not shipped to the browser
  // as literal CSS the way `:root` is — so our real values get baked in
  // AS the utility's own literal, not a var() Tailwind then has to know to
  // reference. See this file's own header for the real v3->v4 key-name
  // shift (our `sm` binds to `--shadow-xs`, not `--shadow-sm`) and why a
  // mismatched elevation-shaped shadow preset (md3/md2) is skipped, not
  // fabricated.
  const { shadow } = readJson<ShadowFile>(join(tokensDir, "shadow.json"));
  const shadowThemeVars: string[] = [];
  for (const [key, cssVar] of Object.entries(SHADOW_KEY_TO_TAILWIND_V4)) {
    const token = shadow[key];
    if (token && isShadowLayerToken(token)) shadowThemeVars.push(`  ${cssVar}: ${shadowLayersToCss(token)};`);
  }
  // Same real `@theme { }` block for both fixes that need one (see the
  // spacingThemeVars comment above and this file's original --shadow-*
  // header comment) — Tailwind only scans for new utility-generating theme
  // keys inside an actual @theme block, so both share it rather than
  // emitting two separate blocks for no reason.
  const themeBlockVars = [...spacingThemeVars, ...shadowThemeVars];
  if (themeBlockVars.length > 0) {
    blocks.push(["@theme {", ...themeBlockVars, "}"].join("\n"));
  }

  if (hasDark) {
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, DARK_FILE));
    const darkVars = resolveShadcnVars(semanticRoot.semantic, primitives).map(({ cssVar, hex }) => `  ${cssVar}: ${hex};`);
    blocks.push([".dark {", ...darkVars, "}"].join("\n"));
  }

  const content = [
    "/* Generated by SDSGT — shadcn/ui theme (globals.css). */",
    '/* SDSGT semantic tokens mapped onto shadcn/ui\'s CSS variable contract — */',
    '/* see contracts-and-seeds.md, "shadcn/ui theming," for the full mapping */',
    "/* table and the reasoning behind every gap-fill/approximation. */",
    "/* */",
    "/* Uses shadcn's own .dark class selector, NOT this project's usual */",
    '/* [data-theme="dark"] convention — a deliberate, scoped exception, see */',
    "/* the file header in generate/shadcn.ts. */",
    ...(!hasLight && hasDark
      ? [
          "/* */",
          "/* This project has no light mode — :root intentionally has no color */",
          "/* values below (only --radius, which isn't mode-dependent). Apply the */",
          '/* .dark class unconditionally for this project to render correctly, */',
          '/* same requirement the base CSS platform has for [data-theme="dark"]. */',
        ]
      : []),
    "",
    ...blocks,
    "",
    "/* --success/--warning/--info/--promo (+ -foreground pairs) above are SDSGT */",
    "/* additions — shadcn/ui's own variable set only defines --destructive */",
    '/* natively. See contracts-and-seeds.md, "shadcn/ui theming." */',
    "",
  ].join("\n");

  const buildPath = join(outDir, "shadcn");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "theme.css"), content, "utf-8");

  return { filesWritten: ["shadcn/theme.css"] };
}
