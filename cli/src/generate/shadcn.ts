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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LIGHT_FILE, DARK_FILE, type GenerateResult } from "./index.ts";
import {
  readJson,
  resolveAlias,
  isSemanticToken,
  type ColorPrimitivesFile,
  type RadiusFile,
  type SemanticFile,
  type SemanticTree,
  type SemanticToken,
} from "./read-tokens.ts";
import { contrastText } from "./mui-color.ts";

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
  blocks.push([":root {", ...rootVars, "}"].join("\n"));

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
