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
