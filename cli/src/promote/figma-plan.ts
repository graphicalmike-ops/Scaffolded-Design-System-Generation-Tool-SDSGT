// Builds a deterministic, pure-data plan describing exactly what to create
// in Figma from this run's token spec — every variable/style name, type,
// value, and alias relationship, fully resolved ahead of time. Written
// alongside report.html on every `promote` run (regardless of whether
// Figma-managed was chosen — same "harmless if unused" treatment as
// report.html itself), so the actual Figma push is a mechanical replay of
// this file's contents rather than logic an agent has to re-derive.
//
// Why this lives in the CLI core and not the push procedure itself: Figma's
// variable-write surface is only reachable through an MCP tool running
// inside an agent session (see pipeline-plan.md, "Tool architecture" — the
// Southleft MCP requires the Desktop Bridge plugin, confirmed in
// docs/figma-mcp-capabilities.md), so the actual `figma_*` tool calls can't
// live here. But EVERYTHING upstream of those calls — reading the token
// spec, resolving aliases, deriving Figma-safe names — has no such
// dependency and is exactly the kind of deterministic, testable logic this
// project's CLI core is for (same reasoning as report.html generation).
// The push procedure's job becomes: read this plan, replay it with MCP
// calls, verify what Figma actually accepted.
//
// Figma-name mapping (contracts-and-seeds.md, "Naming & structure
// conventions" + contracts-proposals.md, "Figma-name mapping — mechanical
// and already exercised once"): a token's full dotted DTCG path becomes its
// Figma name by replacing every `.` with `/` — nothing fancier. Applies
// uniformly to every token category below, including alias targets (a
// `{color.primitive.neutral.100}` reference's OWN Figma name is derived by
// the exact same rule, not a separate lookup).

import { existsSync } from "node:fs";
import { join } from "node:path";

import { readJson, type ColorPrimitivesFile } from "../generate/read-tokens.ts";
import { LIGHT_FILE, DARK_FILE } from "../generate/index.ts";

export type FigmaVariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

export interface FigmaVariablePlanItem {
  // Full dotted DTCG path, e.g. "color.primitive.brand.600" — kept for
  // debugging/traceability, not used by the push procedure directly.
  path: string;
  figmaName: string;
  type: FigmaVariableType;
  group: "primitive" | "semantic" | "foundation";
  // Keyed by logical mode: "value" for anything mode-independent (every
  // primitive and foundation token), or "light"/"dark" for semantic color.
  // The push procedure maps these onto whichever real Figma modes actually
  // got created (see "Collection strategy" in contracts-and-seeds.md).
  valuesByMode: Record<string, string | number | boolean>;
  // Present when a mode's value is a DTCG alias rather than a literal —
  // the OTHER variable's figmaName it should point to. Must be created
  // (and pushed) before this one, so the push procedure processes
  // primitives/foundations before semantics.
  aliasByMode?: Record<string, string>;
  // Only ever set for overlay.scrim (the one non-alias, non-plain-hex
  // semantic value — see "Alias vs. baked value" in contracts-and-
  // seeds.md). The dedicated figma_create_variable/figma_update_variable
  // tools only accept a hex string, with no alpha channel — a variable
  // with this field set needs figma_execute instead, to set a real RGBA
  // value via the Plugin API directly.
  alphaByMode?: Record<string, number>;
}

export interface FigmaTextStylePlanItem {
  figmaName: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
}

export interface FigmaEffectStylePlanItem {
  figmaName: string;
  layers: Array<{ offsetX: number; offsetY: number; blur: number; spread: number; color: string }>;
}

export interface FigmaElevationVariablePlanItem {
  figmaName: string;
  value: number;
}

export interface FigmaPushPlan {
  // Which logical modes this project actually has — drives whether the
  // push procedure needs one Figma mode or two.
  modes: Array<"light" | "dark">;
  variables: FigmaVariablePlanItem[];
  textStyles: FigmaTextStylePlanItem[];
  // Only populated when shadow.json is the Tailwind/Bootstrap `shadow`
  // composite shape (contracts-and-seeds.md, "Shadow").
  effectStyles: FigmaEffectStylePlanItem[];
  // Only populated when shadow.json is the MD3/MD2 `dimension` (elevation
  // dp) shape — pushed as a plain FLOAT rather than a fabricated shadow,
  // since there's no real CSS shadow to represent (see file header).
  elevationVariables: FigmaElevationVariablePlanItem[];
  notes: string[];
}

function dtcgPathToFigmaName(path: string[]): string {
  return path.join("/");
}

function tryReadJson<T>(path: string): T | undefined {
  try {
    return readJson<T>(path);
  } catch {
    return undefined;
  }
}

function rampVariables(
  groupPath: string[],
  ramp: Record<string, { $value: string }>,
): FigmaVariablePlanItem[] {
  return Object.entries(ramp).map(([step, token]) => {
    const path = [...groupPath, step];
    return {
      path: path.join("."),
      figmaName: dtcgPathToFigmaName(path),
      type: "COLOR" as const,
      group: "primitive" as const,
      valuesByMode: { value: token.$value },
    };
  });
}

interface SemNode {
  $value: string;
}
type SemTree = { [key: string]: SemNode | SemTree };

function isSemToken(node: SemNode | SemTree): node is SemNode {
  return typeof (node as SemNode).$value === "string";
}

function flattenSemantic(tree: SemTree, path: string[] = []): Array<{ path: string[]; raw: string }> {
  const out: Array<{ path: string[]; raw: string }> = [];
  for (const [key, node] of Object.entries(tree)) {
    const nextPath = [...path, key];
    if (isSemToken(node)) out.push({ path: nextPath, raw: node.$value });
    else out.push(...flattenSemantic(node, nextPath));
  }
  return out;
}

// "{color.primitive.neutral.100}" -> "color/primitive/neutral/100" (the
// alias target's own Figma name, via the same dot->slash rule as everything
// else — see file header).
function aliasRefToFigmaName(ref: string): string {
  return ref.replace(/[{}]/g, "").replace(/\./g, "/");
}

// "rgba(29, 32, 30, 0.5)" -> { hex: "#1D201E", alpha: 0.5 }
function rgbaToHexAndAlpha(rgba: string): { hex: string; alpha: number } {
  const [r, g, b, a] = rgba.replace(/rgba?\(|\)/g, "").split(",").map((s) => parseFloat(s.trim()));
  const hex = `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return { hex, alpha: a ?? 1 };
}

function semanticVariables(mode: "light" | "dark", filePath: string): FigmaVariablePlanItem[] {
  const { color } = readJson<{ color: { semantic: SemTree } }>(filePath);
  const flat = flattenSemantic(color.semantic);
  return flat.map(({ path, raw }) => {
    const fullPath = ["color", "semantic", ...path];
    const item: FigmaVariablePlanItem = {
      path: fullPath.join("."),
      figmaName: dtcgPathToFigmaName(fullPath),
      type: "COLOR",
      group: "semantic",
      valuesByMode: {},
    };
    if (raw.startsWith("{")) {
      item.aliasByMode = { [mode]: aliasRefToFigmaName(raw) };
      // Dedicated variable-create tools require a literal value even when
      // the mode will immediately be overwritten with an alias via
      // figma_execute — carry the alias's resolved-looking placeholder so
      // creation never fails on a missing value. The push procedure treats
      // aliasByMode as authoritative and this as a throwaway seed value.
      item.valuesByMode[mode] = "#000000";
    } else if (raw.startsWith("rgba")) {
      const { hex, alpha } = rgbaToHexAndAlpha(raw);
      item.valuesByMode[mode] = hex;
      item.alphaByMode = { [mode]: alpha };
    } else {
      item.valuesByMode[mode] = raw;
    }
    return item;
  });
}

function foundationFloatVariables(groupName: string, file: Record<string, { $value: string | number }>): FigmaVariablePlanItem[] {
  return Object.entries(file).map(([key, token]) => {
    const path = [groupName, key];
    const raw = token.$value;
    const value = typeof raw === "number" ? raw : parseFloat(String(raw));
    return {
      path: path.join("."),
      figmaName: dtcgPathToFigmaName(path),
      type: "FLOAT",
      group: "foundation",
      valuesByMode: { value },
    };
  });
}

export function buildFigmaPushPlan(tokensDir: string): FigmaPushPlan {
  const notes: string[] = [
    "grid.json is code-only and intentionally not pushed — a Figma grid is a frame's layout-grid property, not a variable (pipeline-plan.md, \"Value-foundations\").",
  ];

  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;

  const variables: FigmaVariablePlanItem[] = [
    ...rampVariables(["color", "primitive", "brand"], primitives.brand),
    ...(primitives["brand-secondary"] ? rampVariables(["color", "primitive", "brand-secondary"], primitives["brand-secondary"]) : []),
    ...rampVariables(["color", "primitive", "neutral"], primitives.neutral),
    ...rampVariables(["color", "primitive", "static"], primitives.static),
  ];
  for (const [n, tones] of Object.entries(primitives.status)) {
    variables.push(...rampVariables(["color", "primitive", "status", n], tones));
  }

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  if (hasLight) variables.push(...semanticVariables("light", join(tokensDir, LIGHT_FILE)));
  if (hasDark) variables.push(...semanticVariables("dark", join(tokensDir, DARK_FILE)));

  // Merge same-path variables that exist in both modes (e.g.
  // color.semantic.background.primary) into one plan item with both mode
  // keys populated, rather than two separate items — semanticVariables()
  // above emits one item per mode/file since it reads each file
  // independently.
  const merged = new Map<string, FigmaVariablePlanItem>();
  for (const item of variables) {
    const existing = merged.get(item.figmaName);
    if (!existing) {
      merged.set(item.figmaName, item);
      continue;
    }
    Object.assign(existing.valuesByMode, item.valuesByMode);
    if (item.aliasByMode) existing.aliasByMode = { ...existing.aliasByMode, ...item.aliasByMode };
    if (item.alphaByMode) existing.alphaByMode = { ...existing.alphaByMode, ...item.alphaByMode };
  }

  const typographyPrimitive = tryReadJson<{
    typography: { primitive: { fontFamily: Record<string, { $value: string }>; fontWeight: Record<string, { $value: number }>; fontSize: Record<string, { $value: string }>; lineHeight: Record<string, { $value: string }> } };
  }>(join(tokensDir, "typography.primitive.json"));

  if (typographyPrimitive) {
    const p = typographyPrimitive.typography.primitive;
    for (const [key, token] of Object.entries(p.fontFamily)) {
      const path = ["typography", "primitive", "fontFamily", key];
      merged.set(dtcgPathToFigmaName(path), { path: path.join("."), figmaName: dtcgPathToFigmaName(path), type: "STRING", group: "primitive", valuesByMode: { value: token.$value } });
    }
    for (const [key, token] of Object.entries(p.fontWeight)) {
      const path = ["typography", "primitive", "fontWeight", key];
      merged.set(dtcgPathToFigmaName(path), { path: path.join("."), figmaName: dtcgPathToFigmaName(path), type: "FLOAT", group: "primitive", valuesByMode: { value: token.$value } });
    }
    for (const [key, token] of Object.entries(p.fontSize)) {
      const path = ["typography", "primitive", "fontSize", key];
      merged.set(dtcgPathToFigmaName(path), { path: path.join("."), figmaName: dtcgPathToFigmaName(path), type: "FLOAT", group: "primitive", valuesByMode: { value: parseFloat(token.$value) } });
    }
    for (const [key, token] of Object.entries(p.lineHeight)) {
      const path = ["typography", "primitive", "lineHeight", key];
      merged.set(dtcgPathToFigmaName(path), { path: path.join("."), figmaName: dtcgPathToFigmaName(path), type: "FLOAT", group: "primitive", valuesByMode: { value: parseFloat(token.$value) } });
    }
  }

  const textStyles: FigmaTextStylePlanItem[] = [];
  const typographySemantic = tryReadJson<{
    typography: { semantic: Record<string, { $value: { fontFamily: string; fontWeight: string; fontSize: string; lineHeight: string } }> };
  }>(join(tokensDir, "typography.semantic.json"));
  if (typographyPrimitive && typographySemantic) {
    const p = typographyPrimitive.typography.primitive;
    const resolve = (ref: string): string | number => {
      const [, group, key] = ref.replace(/[{}]/g, "").split(".").slice(1);
      return (p as any)[group][key].$value;
    };
    for (const [token, entry] of Object.entries(typographySemantic.typography.semantic)) {
      textStyles.push({
        figmaName: dtcgPathToFigmaName(["typography", "semantic", token]),
        fontFamily: String(resolve(entry.$value.fontFamily)),
        fontWeight: Number(resolve(entry.$value.fontWeight)),
        fontSize: parseFloat(String(resolve(entry.$value.fontSize))),
        lineHeight: parseFloat(String(resolve(entry.$value.lineHeight))),
      });
    }
  } else {
    notes.push("typography.primitive.json/typography.semantic.json not found — no text styles planned.");
  }

  const spacing = tryReadJson<Record<string, Record<string, { $value: string }>>>(join(tokensDir, "spacing.json"));
  if (spacing?.spacing) for (const item of foundationFloatVariables("spacing", spacing.spacing)) merged.set(item.figmaName, item);

  const radius = tryReadJson<Record<string, Record<string, { $value: string }>>>(join(tokensDir, "radius.json"));
  if (radius?.radius) for (const item of foundationFloatVariables("radius", radius.radius)) merged.set(item.figmaName, item);

  const borderWidth = tryReadJson<Record<string, Record<string, { $value: string }>>>(join(tokensDir, "border-width.json"));
  if (borderWidth?.["border-width"]) for (const item of foundationFloatVariables("border-width", borderWidth["border-width"])) merged.set(item.figmaName, item);

  const opacity = tryReadJson<Record<string, Record<string, { $value: number }>>>(join(tokensDir, "opacity.json"));
  if (opacity?.opacity) for (const item of foundationFloatVariables("opacity", opacity.opacity)) merged.set(item.figmaName, item);

  const breakpoint = tryReadJson<Record<string, Record<string, { $value: string }>>>(join(tokensDir, "breakpoint.json"));
  if (breakpoint?.breakpoint) for (const item of foundationFloatVariables("breakpoint", breakpoint.breakpoint)) merged.set(item.figmaName, item);

  const effectStyles: FigmaEffectStylePlanItem[] = [];
  const elevationVariables: FigmaElevationVariablePlanItem[] = [];
  const shadow = tryReadJson<{ shadow: Record<string, { $type: string; $value: unknown }> }>(join(tokensDir, "shadow.json"));
  if (shadow?.shadow) {
    for (const [key, token] of Object.entries(shadow.shadow)) {
      const figmaName = dtcgPathToFigmaName(["shadow", key]);
      if (token.$type === "dimension") {
        elevationVariables.push({ figmaName, value: parseFloat(String(token.$value)) });
      } else {
        const layers = (Array.isArray(token.$value) ? token.$value : [token.$value]) as Array<{ offsetX: string; offsetY: string; blur: string; spread: string; color: string }>;
        effectStyles.push({
          figmaName,
          layers: layers.map((l) => ({
            offsetX: parseFloat(l.offsetX),
            offsetY: parseFloat(l.offsetY),
            blur: parseFloat(l.blur),
            spread: parseFloat(l.spread),
            color: l.color,
          })),
        });
      }
    }
    if (elevationVariables.length > 0) {
      notes.push("shadow.json is the MD3/MD2 elevation-dp shape — pushed as plain FLOAT variables (elevation dp), not fabricated Figma effect styles, since there's no real CSS shadow to represent.");
    }
  }

  return { modes, variables: [...merged.values()], textStyles, effectStyles, elevationVariables, notes };
}
