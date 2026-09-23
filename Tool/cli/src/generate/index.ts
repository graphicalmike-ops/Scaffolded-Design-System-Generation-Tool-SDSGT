// Generate step: turns the DTCG token spec Promote already wrote into real
// code tokens, via Style Dictionary. Reads from wherever Promote's output
// landed (default out/DTCG Token spec (non-consumables)/) and writes into a
// sibling folder (default out/Code tokens (consumables)/) — the token spec
// and the generated code are never mixed into the same directory, so
// re-running Generate never risks clobbering Promote's output or vice versa.
//
// Scope for now: a single CSS custom-properties platform — the simplest,
// most universal code-token shape, and a foundation every framework-specific
// generator (Tailwind relabel, Bootstrap Sass, MD3 tonal palette, etc. — see
// "Generators" in pipeline-plan.md) can build on later. Those are each a
// meaningfully separate piece of work, not built yet.
//
// Style Dictionary v5 auto-detects our DTCG-shaped token files ($value/
// $type keys) with no extra config — verified against the actual SD source
// (lib/utils/detectDtcgSyntax.js) before writing this, not assumed.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import StyleDictionary from "style-dictionary";
import { formats, transformGroups } from "style-dictionary/enums";

export interface FilterableToken {
  filePath: string;
}

export interface FileConfig {
  destination: string;
  format: string;
  filter: (token: FilterableToken) => boolean;
  // Style Dictionary's css/variables format accepts a single selector or an
  // array to nest — e.g. ['[data-theme="dark"]', '@theme'] wraps the
  // content in both, correctly nested with matching braces.
  options?: { selector: string | string[] };
}

export interface GenerateResult {
  filesWritten: string[];
}

// Shared by every platform (this file's plain CSS, tailwind.ts's relabeled
// theme, and whatever's next) — light/dark file detection and source
// exclusion is the part that's actually easy to get wrong (see the bug note
// below), so it's centralized here rather than re-derived per platform.
export const LIGHT_FILE = "color.semantic.light.json";
export const DARK_FILE = "color.semantic.dark.json";
export const isLightFile = (filePath: string) => filePath.includes(LIGHT_FILE);
export const isDarkFile = (filePath: string) => filePath.includes(DARK_FILE);

async function buildPlatform(source: string[], buildPath: string, files: FileConfig[]): Promise<void> {
  const sd = new StyleDictionary({
    source,
    platforms: {
      css: { transformGroup: transformGroups.css, buildPath, files },
    },
  });
  await sd.buildAllPlatforms();
}

// Style Dictionary merges same-path tokens across every file in one `source`
// set — it's how "base + override" layering is meant to work, not a bug.
// But light/dark semantic tokens share the exact same paths
// (color.semantic.background.primary, etc.) with genuinely different
// values, so loading both files into one source silently drops one mode
// (whichever merges last wins, the other vanishes with no error). Light and
// dark each need their own Style Dictionary run, with the OTHER mode's file
// excluded from that run's source entirely — confirmed by hitting this
// exact bug on the first pass (11 real value collisions reported, and the
// dark output came out empty).
export function sourceFilesExcluding(tokensDir: string, excludeFilename: string | null): string[] {
  return readdirSync(tokensDir)
    .filter((f) => f.endsWith(".json") && f !== excludeFilename)
    .map((f) => join(tokensDir, f));
}

export async function generateCodeTokens(tokensDir: string, outDir: string): Promise<GenerateResult> {
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const buildPath = `${outDir}/css/`;
  const filesWritten: string[] = [];

  if (hasLight) {
    const source = sourceFilesExcluding(tokensDir, hasDark ? DARK_FILE : null);
    await buildPlatform(source, buildPath, [
      { destination: "tokens.css", format: formats.cssVariables, filter: (t) => !isLightFile(t.filePath) },
      { destination: "light.css", format: formats.cssVariables, filter: (t) => isLightFile(t.filePath) },
    ]);
    filesWritten.push("css/tokens.css", "css/light.css");
  }

  if (hasDark) {
    const source = sourceFilesExcluding(tokensDir, hasLight ? LIGHT_FILE : null);
    const files: FileConfig[] = [
      {
        destination: "dark.css",
        format: formats.cssVariables,
        filter: (t) => isDarkFile(t.filePath),
        options: { selector: '[data-theme="dark"]' },
      },
    ];
    // Dark-only project: no light run happened to emit tokens.css, so this
    // run has to cover the mode-independent groups too.
    if (!hasLight) {
      files.unshift({ destination: "tokens.css", format: formats.cssVariables, filter: (t) => !isDarkFile(t.filePath) });
      filesWritten.push("css/tokens.css");
    }
    await buildPlatform(source, buildPath, files);
    filesWritten.push("css/dark.css");
  }

  return { filesWritten };
}
