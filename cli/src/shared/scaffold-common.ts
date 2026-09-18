// Shared across every Layer 3 scaffold builder (cli/src/scaffold/*.ts) —
// the parts that don't vary by framework: hashing/collecting vendored files
// for the customization-guard manifest (docs/layer2-layer3-plan.md, Subject
// 2, "the ACIM lesson"), copying this pipeline's own agent-facing docs into
// a freshly scaffolded project, and turning already-fetched font files
// (promote's own --fonts-dir convention, see font-slug.ts) into real
// @font-face rules. First extracted from scaffold/nextjs.ts when the Vue
// scaffold builders needed the exact same logic — see "reuse over reinvent"
// in pipeline-plan.md.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

import { slugFont, FONT_WEIGHTS } from "./font-slug.ts";

export const AGENT_DOC_FILES = ["AGENTS.md", "foundations-rules.md", "design.md"];

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// The "update an already-scaffolded project" pathway (cli.ts's `scaffold
// --update`, built 2026-09-17 — see docs/layer2-layer3-plan.md's dated
// entry) needs its own customization guard, separate from
// sdsgt-vendored-components.json (which only ever covers vendored
// COMPONENT source — shadcn's .tsx files, RNR's equivalents — and is left
// completely alone by this pathway, per its own scope). This is the sibling
// manifest for token-DERIVED theme files: theme.ts/theme.css/theme-palette.ts/
// _variables.scss/global.css/constants.ts/settings.scss and the shadcn(-vue)
// globals.css/main.css override block. Same hash-per-file shape as the
// vendored-component manifest, same "never blindly overwrite a
// customization" discipline this project already applies everywhere else —
// just applied to a different class of file.
export const THEME_MANIFEST_FILE = "sdsgt-theme-manifest.json";

export function readThemeManifest(outDir: string): Record<string, string> {
  const path = join(outDir, THEME_MANIFEST_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeThemeManifest(outDir: string, entries: Record<string, string>): void {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(outDir, THEME_MANIFEST_FILE), `${JSON.stringify(sorted, null, 2)}\n`, "utf-8");
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface GuardedWriteResult {
  written: boolean;
  hash: string;
  warning?: string;
}

// Writes `content` to `relPath` (relative to outDir) UNLESS the file
// already exists on disk with a hash that doesn't match what this
// manifest recorded last time this pipeline wrote it — that mismatch means
// a human hand-edited it since (against AGENTS.md's own advice, but still
// possible), and this never silently clobbers that edit. `opts.force`
// bypasses the check for someone who's reviewed the conflict and wants
// SDSGT's regenerated version anyway. Returns the hash of whatever ends up
// on disk (the new content if written, the existing file's if skipped) so
// the caller can fold it back into the manifest either way — a skipped
// file keeps warning on every future update until it's force-overwritten
// or manually reconciled, which is the intended behavior, not a bug.
export function guardedWriteFile(outDir: string, relPath: string, content: string | Buffer, manifest: Record<string, string>, opts: { force: boolean }): GuardedWriteResult {
  const fullPath = join(outDir, relPath);
  const newHash = sha256(content);
  const previousHash = manifest[relPath];

  if (existsSync(fullPath) && previousHash) {
    const currentHash = sha256(readFileSync(fullPath));
    if (currentHash !== previousHash && !opts.force) {
      return {
        written: false,
        hash: currentHash,
        warning: `${relPath} was hand-edited since SDSGT last wrote it (its content no longer matches ${THEME_MANIFEST_FILE}'s recorded hash) — left untouched, not overwritten. Re-run with --force to overwrite it with the newly generated version, or hand-merge your edits with the new generated content yourself.`,
      };
    }
  }

  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content);
  return { written: true, hash: newHash };
}

// The shadcn/ui (Next.js) and shadcn-vue (Vue.js) globals.css/main.css
// override — see nextjs.ts's appendShadcnThemeOverride / vuejs.ts's
// finalizeShadcnMainCss. Originally just appended after a start-comment
// with no end marker, so a second run would append a second, duplicate
// block forever (a real bug, fixed 2026-09-17 — see
// docs/layer2-layer3-plan.md's dated entry). `block` must itself start
// with SDSGT_BLOCK_START and end with SDSGT_BLOCK_END.
export const SDSGT_BLOCK_START = "/* --- SDSGT overrides below:";
export const SDSGT_BLOCK_END = "/* --- SDSGT overrides end --- */";

// A second, independent marker pair for shadcn-vue's own @font-face block
// (vuejs.ts) — added 2026-09-17 (see docs/layer2-layer3-plan.md's follow-up
// entry) to close the real gap the theme-override block above already
// solved for colors/font-family but font-face rules didn't: without its own
// start/end markers, a changed font choice on `--update` could only be
// detected by a plain substring check ("is this exact block already
// present"), which can add a NEW font's rules but can't find and remove a
// STALE font's. Same shape as SDSGT_BLOCK_START/END, deliberately a
// separate pair (not reused) since a file can own both an independent
// font-face block and an independent theme-override block at once, each
// needing its own hash-guarded region.
export const SDSGT_FONT_BLOCK_START = "/* --- SDSGT font-face rules below:";
export const SDSGT_FONT_BLOCK_END = "/* --- SDSGT font-face rules end --- */";

// Generalized 2026-09-17 to take an explicit marker pair (defaulting to the
// original theme-override markers, so every existing caller is unaffected)
// once SDSGT_FONT_BLOCK_START/END became a second real consumer of the
// identical "find by start/end marker, replace in place" logic — same
// "extract once a second real consumer needs it" discipline this project
// already applies elsewhere (e.g. shared/tailwind.ts's readSpacingEntries).
export function replaceOrAppendSdsgtBlock(existing: string, block: string, markers: { start: string; end: string } = { start: SDSGT_BLOCK_START, end: SDSGT_BLOCK_END }): string {
  const { start, end } = markers;
  const startIdx = existing.indexOf(start);
  if (startIdx === -1) {
    return `${existing.trimEnd()}\n\n${block.trim()}\n`;
  }
  const endIdx = existing.indexOf(end);
  if (endIdx === -1) {
    // Old-format file, written before the end marker existed — the SDSGT
    // block ran to EOF with nothing to bound it. Replacing from the start
    // marker onward is the correct, safe upgrade path (same net effect as
    // a fresh append, just cleaning up the un-terminated old block).
    return `${existing.slice(0, startIdx).trimEnd()}\n\n${block.trim()}\n`;
  }
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx + end.length).trim();
  return [before, "", block.trim(), ...(after ? [after] : [])].join("\n\n").trimEnd() + "\n";
}

// Extracts just the current SDSGT-owned block from `existing` (bounded by
// the given markers, defaulting to the theme-override pair), or null if
// there isn't one yet (first run, or an old-format file with no end marker
// — see replaceOrAppendSdsgtBlock).
function extractSdsgtBlock(existing: string, markers: { start: string; end: string } = { start: SDSGT_BLOCK_START, end: SDSGT_BLOCK_END }): string | null {
  const { start, end } = markers;
  const startIdx = existing.indexOf(start);
  if (startIdx === -1) return null;
  const endIdx = existing.indexOf(end);
  if (endIdx === -1) return null;
  return existing.slice(startIdx, endIdx + end.length);
}

export interface GuardedBlockResult {
  content: string; // the full file content to write (unchanged from `existing` if skipped)
  written: boolean;
  hash: string; // the block's own hash — fold into the manifest under `${manifestKey}#block` either way
  warning?: string;
}

// The block-level equivalent of guardedWriteFile — for a file (shadcn/ui's
// or shadcn-vue's globals.css/main.css) where SDSGT only owns ONE bounded
// block inside a larger file it doesn't otherwise control (shadcn's/
// shadcn-vue's own generated defaults sit above it). Hash-guards just that
// block, not the whole file, so a hand-edit anywhere else in the file (or
// to shadcn's own defaults) never trips the guard. `markers` defaults to
// the theme-override pair; pass SDSGT_FONT_BLOCK_START/END (or any other
// pair) to guard a second, independent block in the same file.
export function guardedBlockReplace(
  existing: string,
  newBlock: string,
  previousBlockHash: string | undefined,
  opts: { force: boolean },
  markers: { start: string; end: string } = { start: SDSGT_BLOCK_START, end: SDSGT_BLOCK_END },
): GuardedBlockResult {
  const existingBlock = extractSdsgtBlock(existing, markers);
  const newHash = sha256(newBlock);

  if (existingBlock && previousBlockHash) {
    const currentHash = sha256(existingBlock);
    if (currentHash !== previousBlockHash && !opts.force) {
      return {
        content: existing,
        written: false,
        hash: currentHash,
        warning: `The SDSGT-owned block was hand-edited since last written (its content no longer matches the recorded hash) — left untouched, not overwritten. Re-run with --force to overwrite it with the newly generated version, or hand-merge your edits yourself.`,
      };
    }
  }

  return { content: replaceOrAppendSdsgtBlock(existing, newBlock, markers), written: true, hash: newHash };
}

export function collectFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

export function copyAgentDocs(codeDir: string, outDir: string): string[] {
  const written: string[] = [];
  for (const file of AGENT_DOC_FILES) {
    const src = join(codeDir, file);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(outDir, file));
    written.push(file);
  }
  return written;
}

// Tailwind's own platform (generate/tailwind.ts) names this token
// --typography-primitive-fontFamily-primary (camelCase path segment,
// untouched by the ramp-relabel transform) — different from the plain CSS
// platform below, verified by actually diffing the two real outputs, not
// assumed to match.
export function parseFontFamiliesFromTailwindCss(themeCss: string): { primary: string; secondary?: string } {
  const primaryMatch = themeCss.match(/--typography-primitive-fontFamily-primary:\s*([^;]+);/);
  const secondaryMatch = themeCss.match(/--typography-primitive-fontFamily-secondary:\s*([^;]+);/);
  if (!primaryMatch) {
    throw new Error("theme.css has no --typography-primitive-fontFamily-primary — was it generated by this pipeline?");
  }
  return { primary: primaryMatch[1].trim(), secondary: secondaryMatch?.[1]?.trim() };
}

// The plain CSS platform (generate/index.ts, always written regardless of
// which platform flags were passed) uses Style Dictionary's standard kebab
// transform on every path segment, so the SAME token comes out as
// --typography-primitive-font-family-primary (dashed) here — confirmed by
// inspecting a real generate run's css/tokens.css, not assumed to match
// tailwind.ts's own naming. Platforms with no dedicated typography output
// of their own (Vuetify's theme.ts is colors-only) fall back to this file
// for font family names instead.
export function parseFontFamiliesFromPlainCss(tokensCss: string): { primary: string; secondary?: string } {
  const primaryMatch = tokensCss.match(/--typography-primitive-font-family-primary:\s*([^;]+);/);
  const secondaryMatch = tokensCss.match(/--typography-primitive-font-family-secondary:\s*([^;]+);/);
  if (!primaryMatch) {
    throw new Error("tokens.css has no --typography-primitive-font-family-primary — was it generated by this pipeline?");
  }
  return { primary: primaryMatch[1].trim(), secondary: secondaryMatch?.[1]?.trim() };
}

// Builds @font-face rules for whichever families actually have real font
// files sitting in fontsDir (same files/naming convention promote's own
// --fonts-dir already uses — see font-slug.ts). Not fatal if a family's
// files are missing, or fontsDir wasn't passed at all: skipped silently,
// same "degrades to a system-font fallback" precedent as promote's
// report.html. Framework-agnostic — publicFontsDir is just wherever that
// framework's static dir lives (Next.js's public/fonts, Vite's public/fonts
// — both served from site root the same way).
// Reads every `--<cssPrefix>-<key>: <N>px;` custom property out of the base
// plain-CSS platform's own `css/tokens.css` (always written by `generate`,
// regardless of platform flag — see generate/index.ts). Same source/
// reasoning as `scaffold/figma-components-plan.ts`'s own (separately
// maintained) `readCssScale` — pulled out here as a shared version once a
// second real consumer (nextjs-mui.ts's button-padding fix, 2026-09-16)
// needed the identical logic, rather than a third hand-rolled copy.
// `unit` defaults to `"px"` (every existing real consumer — spacing,
// radius, font-size — uses px custom properties); pass `""` for a scale
// written as bare numbers instead, like `--opacity-N: 0.N;` (added
// 2026-09-16 for MUI/Vuetify's own real opacity constants).
export function readCssScale(tokensCss: string, cssPrefix: string, unit: string = "px"): Record<string, number> {
  const pattern = new RegExp(`--${cssPrefix}-([a-z0-9-]+):\\s*([\\d.]+)${unit};`, "g");
  const scale: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(tokensCss)) !== null) {
    scale[m[1]] = parseFloat(m[2]);
  }
  return scale;
}

// Picks the real token px value numerically closest to a raw target — same
// "nearest real value, never a fabricated one" discipline as
// `generate/bootstrap.ts`'s own `nearestSpacingPx`/`nearestFontSizePx`.
export function nearestScalePx(targetPx: number, scale: Record<string, number>): number {
  let best: number | null = null;
  for (const px of Object.values(scale)) {
    if (best === null || Math.abs(px - targetPx) < Math.abs(best - targetPx)) best = px;
  }
  if (best === null) throw new Error("Scale has no entries — was css/tokens.css written by this pipeline's `generate`?");
  return best;
}

// Patches an existing `--font-sans`/`--font-heading` custom-property
// declaration IN PLACE, wherever it's declared (not scoped to any specific
// selector or @theme block), replacing whatever value is currently there —
// a literal, a `var()` reference, or an alias of the other property — with
// this project's own literal family name. First extracted here 2026-09-17
// when nextjs.ts needed the exact same "don't rely on a later declaration
// to win the cascade, patch shadcn's own declared value directly" logic
// vuejs.ts's own patchShadcnDefaultFontVars already uses for shadcn-vue
// (kept as its own local copy there, not migrated — this project doesn't
// revisit already-working code without a reason). No `g` flag deliberately:
// only the FIRST occurrence in the file (shadcn's/shadcn-vue's own
// declaration, which always appears before this pipeline's own override
// block gets appended) is meant to be touched; a pipeline-owned override
// block is replaced wholesale by guardedBlockReplace regardless, so it's
// never at risk of a double-edit. Naturally idempotent on `--update` (a
// regex matching by property name replaces whatever value is currently
// there, stale or not).
export function patchFontFamilyVars(css: string, families: { primary: string; secondary?: string }): string {
  const bodyFont = `${families.secondary ?? families.primary}, sans-serif`;
  const headingFont = `${families.primary}, sans-serif`;
  return css.replace(/--font-sans:\s*[^;]+;/, `--font-sans: ${bodyFont};`).replace(/--font-heading:\s*[^;]+;/, `--font-heading: ${headingFont};`);
}

export function buildFontFaces(
  families: { primary: string; secondary?: string },
  fontsDir: string | undefined,
  publicFontsDir: string,
): { css: string; filesWritten: string[] } {
  if (!fontsDir) return { css: "", filesWritten: [] };

  const uniqueFamilies = new Map<string, string>(); // slug -> raw (already-quoted-if-needed) literal
  const primaryUnquoted = families.primary.replace(/^['"]|['"]$/g, "");
  uniqueFamilies.set(slugFont(primaryUnquoted), families.primary);
  if (families.secondary) {
    const secondaryUnquoted = families.secondary.replace(/^['"]|['"]$/g, "");
    uniqueFamilies.set(slugFont(secondaryUnquoted), families.secondary);
  }

  const rules: string[] = [];
  const filesWritten: string[] = [];
  for (const [slug, rawFamily] of uniqueFamilies) {
    for (const weight of FONT_WEIGHTS) {
      const srcPath = join(fontsDir, `${slug}-${weight}.woff2`);
      if (!existsSync(srcPath)) continue;
      const fileName = `${slug}-${weight}.woff2`;
      mkdirSync(publicFontsDir, { recursive: true });
      copyFileSync(srcPath, join(publicFontsDir, fileName));
      filesWritten.push(join("public", "fonts", fileName));
      rules.push(
        [
          "@font-face {",
          `  font-family: ${rawFamily};`,
          `  src: url('/fonts/${fileName}') format('woff2');`,
          `  font-weight: ${weight};`,
          "  font-style: normal;",
          "  font-display: swap;",
          "}",
        ].join("\n"),
      );
    }
  }
  return { css: rules.join("\n\n"), filesWritten };
}
