// design.md section 2's "Text-on-background pairings" — see
// contracts-and-seeds.md, "design.md (contract decided — not built)."
//
// WHICH pairs get checked is one fixed list, the same on every project.
// WHETHER each pair passes depends on this project's own colors, so it's
// computed per project, per mode that exists. Notes are deliberately
// neutral (user decision 2026-10-21): a pair below AA is reported as the
// designer's choice, never as a "don't use" verdict — contrast decisions
// belong to the designer, not the agent.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../../color/contrast.ts";
import {
  isSemanticToken,
  readJson,
  resolveAlias,
  type ColorPrimitivesFile,
  type SemanticFile,
  type SemanticTree,
} from "../read-tokens.ts";
import { DARK_FILE, LIGHT_FILE } from "../index.ts";

// WCAG 2.1 AA for large text and UI components (foundations-rules.md, "Contrast").
const WCAG_AA_LARGE_TEXT = 3;

// The fixed list, in the order it appears in design.md. A pair whose tokens
// don't both exist in this project (e.g. action.secondary with no secondary
// brand color) is left out, never invented.
export const TEXT_PAIRS: ReadonlyArray<{ text: string; on: string }> = [
  ...["background.primary", "background.secondary", "background.surface"].flatMap((on) => [
    { text: "text.primary", on },
    { text: "text.secondary", on },
  ]),
  { text: "text.on-surface", on: "background.surface" },
  { text: "text.on-primary", on: "action.primary" },
  { text: "text.on-primary", on: "action.secondary" },
  { text: "text.inverse", on: "background.inverse" },
  { text: "text.disabled", on: "background.primary" },
  // No status.<role>-text on status.<role>-bg pairs (user decision
  // 2026-10-21): those tokens aren't meant to be stacked — the designer
  // uses them separately, so checking them as a pair would imply a
  // combination the system doesn't intend.
];

export type PairingNote =
  | "Meets AA for body text"
  | "Meets AA for large text and UI only"
  | "Below AA contrast — designer's choice; don't change it"
  | "Not checked — one of these colors is partly transparent";

export interface PairingResult {
  text: string;
  on: string;
  // Truncated (not rounded) to one decimal, so the shown number never
  // crosses a threshold the note doesn't: 4.49 shows as 4.4, not 4.5.
  // null when not checked.
  ratio: number | null;
  note: PairingNote;
}

export interface ModePairings {
  mode: "light" | "dark";
  pairs: PairingResult[];
}

const OPAQUE_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Flattens color.semantic into "group.name" -> resolved value (hex, or a
// baked rgba string for the few tokens that carry transparency).
function resolveSemantic(tree: SemanticTree, primitives: ColorPrimitivesFile["color"]["primitive"]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: SemanticTree, path: string[]) => {
    for (const [key, child] of Object.entries(node)) {
      if (isSemanticToken(child)) {
        const value = child.$value.startsWith("{") ? resolveAlias(child.$value, primitives) : child.$value;
        out.set([...path, key].join("."), value);
      } else {
        walk(child, [...path, key]);
      }
    }
  };
  walk(tree, []);
  return out;
}

function noteFor(ratio: number): PairingNote {
  if (ratio >= WCAG_AA_NORMAL_TEXT) return "Meets AA for body text";
  if (ratio >= WCAG_AA_LARGE_TEXT) return "Meets AA for large text and UI only";
  return "Below AA contrast — designer's choice; don't change it";
}

export function computeTextPairings(tokensDir: string): ModePairings[] {
  const primitives = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json")).color.primitive;
  const results: ModePairings[] = [];

  for (const [mode, file] of [["light", LIGHT_FILE], ["dark", DARK_FILE]] as const) {
    const path = join(tokensDir, file);
    if (!existsSync(path)) continue;
    const values = resolveSemantic(readJson<SemanticFile>(path).color.semantic, primitives);

    const pairs: PairingResult[] = [];
    for (const { text, on } of TEXT_PAIRS) {
      const fg = values.get(text);
      const bg = values.get(on);
      if (fg === undefined || bg === undefined) continue;
      if (!OPAQUE_HEX.test(fg) || !OPAQUE_HEX.test(bg)) {
        pairs.push({ text, on, ratio: null, note: "Not checked — one of these colors is partly transparent" });
        continue;
      }
      const ratio = contrastRatio(fg, bg);
      pairs.push({ text, on, ratio: Math.floor(ratio * 10) / 10, note: noteFor(ratio) });
    }
    results.push({ mode, pairs });
  }

  return results;
}
