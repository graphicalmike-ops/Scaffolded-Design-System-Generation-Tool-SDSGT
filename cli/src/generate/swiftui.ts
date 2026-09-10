// SwiftUI native generator — see pipeline-plan.md, "Generators": "SwiftUI
// native: reads semantic tokens directly, no native structure to
// reconcile." The simplest of the five targets — no ramp relabel, no
// derived palette math, just the resolved semantic color tokens expressed
// as native SwiftUI `Color` values.
//
// "Reads ... directly" still requires one real step: most semantic tokens
// in color.semantic.<mode>.json are DTCG aliases (`$value: "{color.
// primitive.neutral.100}"`), not baked hex — see contracts-and-seeds.md,
// "Alias vs. baked value." This resolves each alias against
// color.primitive.json (the only two already-baked exceptions,
// action.*-disabled and overlay.scrim, pass through their own literal
// hex/rgba() string). Nothing here computes a NEW value the way
// mui-color.ts or md3.ts do — it only resolves what's already decided.
//
// Emits Color(red:green:blue:opacity:) calls (SwiftUI's own built-in
// initializer) rather than a custom hex-parsing extension — no Swift
// dependency, works on every Apple platform, not just the ones with
// UIKit's UIColor. Light and dark are two separate namespaces
// (DesignTokens.Light / DesignTokens.Dark), same pattern as every other
// generator here (light.css/dark.css, LightColorScheme/DarkColorScheme) —
// the consuming app switches between them itself (e.g. via
// @Environment(\.colorScheme)), Generate doesn't invent an auto-switching
// mechanism any more than the CSS or Kotlin outputs do.
//
// No iOS/Swift version target decided or needed here (checked 2026-09-08,
// alongside deciding Bootstrap 5.3/MUI 9.x/Compose Material3 1.4.0 as
// targets for the other three generators) — Color(red:green:blue:opacity:)
// is a plain SwiftUI initializer available since iOS 13, so this generator
// has no version-gated API to pin. A real iOS/Swift deployment-target
// decision still exists for Layer 2/3 (SwiftUI-native component library,
// Xcode project scaffolding) — deliberately left open until that work is
// actually built, not decided speculatively now.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LIGHT_FILE, DARK_FILE, type GenerateResult } from "./index.ts";
import {
  readJson,
  resolveAlias,
  isSemanticToken,
  type ColorPrimitivesFile,
  type SemanticToken,
  type SemanticTree,
  type SemanticFile,
} from "./read-tokens.ts";

export type { SemanticToken, SemanticTree, SemanticFile };

function hexToFloats(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const channel = (i: number) => parseInt(clean.slice(i, i + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

// "rgba(31, 32, 29, 0.5)" -> [0.122, 0.125, 0.114, 0.5]
function rgbaToFloats(rgba: string): [number, number, number, number] {
  const [r, g, b, a] = rgba.replace(/rgba?\(|\)/g, "").split(",").map((s) => parseFloat(s.trim()));
  return [r / 255, g / 255, b / 255, a ?? 1];
}

export function swiftColorLiteral(rawValue: string, primitives: ColorPrimitivesFile["color"]["primitive"]): string {
  if (rawValue.startsWith("rgba")) {
    const [r, g, b, a] = rgbaToFloats(rawValue);
    return `Color(red: ${r.toFixed(3)}, green: ${g.toFixed(3)}, blue: ${b.toFixed(3)}, opacity: ${a.toFixed(3)})`;
  }
  const hex = rawValue.startsWith("{") ? resolveAlias(rawValue, primitives) : rawValue;
  const [r, g, b] = hexToFloats(hex);
  return `Color(red: ${r.toFixed(3)}, green: ${g.toFixed(3)}, blue: ${b.toFixed(3)})`;
}

// "on-primary" -> "OnPrimary", "primary-hover" -> "PrimaryHover"
function toPascalSegment(segment: string): string {
  return segment.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

// ["action", "primary-hover"] -> "actionPrimaryHover"
export function toSwiftPropertyName(path: string[]): string {
  return path.map((segment, i) => (i === 0 ? segment.split("-").map((w, j) => (j === 0 ? w : toPascalSegment(w))).join("") : toPascalSegment(segment))).join("");
}

export function flattenTokens(tree: SemanticTree, path: string[] = []): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  for (const [key, node] of Object.entries(tree)) {
    const nextPath = [...path, key];
    if (isSemanticToken(node)) {
      result.push({ name: toSwiftPropertyName(nextPath), value: node.$value });
    } else {
      result.push(...flattenTokens(node, nextPath));
    }
  }
  return result;
}

function buildNamespace(
  name: string,
  semanticFilePath: string,
  primitives: ColorPrimitivesFile["color"]["primitive"],
): string {
  const { color } = readJson<SemanticFile>(semanticFilePath);
  const tokens = flattenTokens(color.semantic);
  const lines = tokens.map(({ name: propName, value }) => `        static let ${propName} = ${swiftColorLiteral(value, primitives)}`);
  return [`    enum ${name} {`, ...lines, "    }"].join("\n");
}

export function generateSwiftUI(tokensDir: string, outDir: string): GenerateResult {
  const { color: primitivesRoot } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = primitivesRoot.primitive;

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));

  const namespaces: string[] = [];
  if (hasLight) namespaces.push(buildNamespace("Light", join(tokensDir, LIGHT_FILE), primitives));
  if (hasDark) namespaces.push(buildNamespace("Dark", join(tokensDir, DARK_FILE), primitives));

  const content = [
    "// Generated by SDSGT — SwiftUI semantic color tokens.",
    "// Resolved directly from color.semantic.<mode>.json — no ramp relabel",
    "// or derived palette math, per pipeline-plan.md's \"Generators\": SwiftUI",
    "// reads semantic tokens directly.",
    "",
    "import SwiftUI",
    "",
    "enum DesignTokens {",
    namespaces.join("\n\n"),
    "}",
    "",
  ].join("\n");

  const buildPath = join(outDir, "swiftui");
  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, "DesignTokens.swift"), content, "utf-8");

  return { filesWritten: ["swiftui/DesignTokens.swift"] };
}
