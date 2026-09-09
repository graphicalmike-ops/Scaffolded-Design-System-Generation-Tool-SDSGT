// Tailwind-family code-token generator — Next.js + Tailwind first (see
// pipeline-plan.md, "Generators"). Scope, per the documented contract
// (contracts-and-seeds.md, "Positional relabel"): relabel ONLY the
// primitive color ramp's step keys — our 100–1100 numbering onto Tailwind's
// native 50–950 — nothing else. Spacing/radius/type-scale/shadow already
// use Tailwind's own native keys when the Tailwind preset is chosen, so
// there's nothing to relabel there. Semantic color tokens keep their own
// names; their values are already-resolved hex by the time formatting
// happens, so relabeling only the primitive ramp's NAME doesn't touch any
// semantic token's VALUE.
//
// Deliberately NOT the same thing as shadcn/ui's own variable names
// (--primary, --primary-foreground, etc.) — mapping onto a specific
// component library's expected variables is Layer 2 work (see "Three
// layers" in pipeline-plan.md), not started, not scoped here.
//
// Output targets Tailwind v4 (CSS-native @theme block) — decided
// 2026-09-08, see pipeline-plan.md, "Generators."

import { existsSync } from "node:fs";
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

export async function generateTailwindTheme(tokensDir: string, outDir: string): Promise<GenerateResult> {
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
        // CSS platform uses, nested inside @theme so Tailwind still reads
        // these as theme values, not arbitrary custom properties. Style
        // Dictionary's css/variables format accepts `selector` as an array
        // for exactly this — properly nested with matching braces, not
        // string concatenation (verified against the format's actual
        // nestInSelector implementation, not assumed).
        options: { selector: ['[data-theme="dark"]', "@theme"] },
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

  return { filesWritten };
}
