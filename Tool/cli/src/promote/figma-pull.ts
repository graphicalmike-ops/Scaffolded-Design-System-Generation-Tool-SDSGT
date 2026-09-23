// Pull direction of Figma <-> code token sync (pipeline-plan.md, "Token
// sync staying live" — the "everyday" edit path that stays live in a
// project after it's handed off, as opposed to `promote`'s one-time
// generation). `figma-plan.ts` is the PUSH half (one-time, first-push-only
// replay); this is the pull half: read live Figma variable AND style
// values, diff against a snapshot of what was last known, and write ONLY
// what actually changed back into the DTCG spec.
//
// Same "CLI computes, agent-side skill replays the live half" split as
// every other Figma-touching piece of this pipeline (see figma-plan.ts's
// own header for the full reasoning): this file can't reach Figma itself,
// only an agent session with the Desktop Bridge connected can. The actual
// `figma_get_variables`/`getLocalTextStylesAsync`/`getLocalEffectStylesAsync`
// calls are the SDSGT-figma-push skill's job. This module's job is
// everything deterministic downstream of that: diffing, deciding what
// changed, and writing the token files.
//
// Snapshot mechanism, decided over "always overwrite everything from
// Figma" (2026-09-17, asked directly): a plain JSON file
// (figma-sync-snapshot.json, written alongside the DTCG spec) records the
// fully-resolved value of every pushed variable AND style at the time of
// the last successful push or pull. Each pull compares LIVE Figma values
// against this snapshot, not against the DTCG JSON's own current values —
// so a token that was only ever edited in code (never touched in Figma)
// is left alone, and the report only ever lists genuine Figma-side edits.
//
// Figma-name <-> DTCG-path mapping reuses the exact mechanical rule
// figma-plan.ts's own header documents (dots <-> slashes, both
// directions) — never a separate lookup table, so this stays correct
// automatically if that rule ever changes.
//
// Alias-following, not alias-breaking, by default — applies to BOTH
// semantic color variables (action.primary = {color.primitive.brand.500})
// AND, per-field, text styles (each of fontFamily/fontWeight/fontSize/
// lineHeight is its own alias into a typography primitive). A value is
// only ever rewritten as a literal if it diverges from its OWN alias
// target's live value — i.e. the user pointed it at something else, or
// hard-overrode it, directly in Figma. If it changed only because the
// primitive it points to changed, that's the PRIMITIVE's own diff entry,
// not a second, redundant one — and the alias itself is left untouched,
// so `generate` naturally picks up the primitive's new value for every
// token/field that references it.
//
// Scope, real and disclosed: pulls VARIABLES (color primitives/semantics,
// spacing, radius, opacity, border-width, breakpoint, typography
// primitives, MD3/MD2 elevation FLOATs) AND STYLES (text styles, box-
// shadow effect styles — added 2026-09-17). Structural changes are never
// inferred: a Figma variable/style with no match in this pipeline's own
// naming convention is reported as unmapped, never guessed into a new
// token. Only the four typography-style fields and shadow layer values
// have an alias/comparison concept at all — nothing here renames tokens,
// adds new ones, or restructures a file.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildFigmaPushPlan, type FigmaVariablePlanItem } from "./figma-plan.ts";
import { LIGHT_FILE, DARK_FILE } from "../generate/index.ts";

export const SNAPSHOT_FILE = "figma-sync-snapshot.json";

export interface LiveFigmaVariable {
  figmaName: string;
  mode: string; // "value" | "light" | "dark" — same convention as valuesByMode
  value: string | number;
}

export interface LiveFigmaTextStyle {
  figmaName: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
}

export interface LiveFigmaEffectLayer {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string; // "rgba(r,g,b,a)" — r/g/b 0-255 ints, a 0-1 decimal, no spaces (this pipeline's own shadow.json format)
}

export interface LiveFigmaEffectStyle {
  figmaName: string;
  layers: LiveFigmaEffectLayer[];
}

export interface FigmaPullInput {
  variables: LiveFigmaVariable[];
  textStyles?: LiveFigmaTextStyle[];
  effectStyles?: LiveFigmaEffectStyle[];
}

interface TextStyleFieldValues {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
}

export interface FigmaSyncSnapshot {
  variables: Record<string, Record<string, string | number>>; // figmaName -> mode -> value
  textStyles: Record<string, TextStyleFieldValues>; // figmaName -> field values
  effectStyles: Record<string, LiveFigmaEffectLayer[]>; // figmaName -> layers
}

export interface FigmaPullChange {
  figmaName: string;
  path: string;
  oldValue: string | number;
  newValue: string | number;
  note?: string; // set when converting an alias to a literal
}

export interface FigmaPullResult {
  changes: FigmaPullChange[];
  // Live variable/style names that don't match anything this pipeline
  // pushed — e.g. something added by hand in Figma outside this
  // pipeline's own naming convention. Disclosed, never guessed at or
  // written anywhere.
  unmapped: string[];
  updatedSnapshot: FigmaSyncSnapshot;
}

function figmaNameToPath(figmaName: string): string[] {
  return figmaName.split("/");
}

function lastSegment(figmaName: string): string {
  const parts = figmaName.split("/");
  return parts[parts.length - 1];
}

function readJsonRaw(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJsonPretty(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

// Longest/most-specific prefix first — "color.primitive"/"color.semantic"
// must be tried before a bare "color" prefix ever would (there is no bare
// "color" file, but checking specific-first is the only safe order
// regardless of what's added later).
const FILE_FOR_PATH_PREFIX: ReadonlyArray<readonly [string[], string | null]> = [
  [["color", "primitive"], "color.primitive.json"],
  [["color", "semantic"], null], // resolved per-mode below (light/dark file)
  [["typography", "primitive"], "typography.primitive.json"],
  [["spacing"], "spacing.json"],
  [["radius"], "radius.json"],
  [["opacity"], "opacity.json"],
  [["border-width"], "border-width.json"],
  [["breakpoint"], "breakpoint.json"],
  [["shadow"], "shadow.json"],
];

function fileForPath(pathSegments: string[], mode: string): string {
  for (const [prefix, file] of FILE_FOR_PATH_PREFIX) {
    if (prefix.every((seg, i) => pathSegments[i] === seg)) {
      if (file) return file;
      if (mode === "light") return LIGHT_FILE;
      if (mode === "dark") return DARK_FILE;
      throw new Error(`color.semantic path "${pathSegments.join(".")}" has no light/dark mode to resolve a file from (got mode "${mode}")`);
    }
  }
  throw new Error(`No known token file for path "${pathSegments.join(".")}" — this pipeline's own naming convention may have changed since figma-pull.ts was written.`);
}

function getAtPath(root: any, pathSegments: string[]): any {
  let node = root;
  for (const seg of pathSegments) {
    if (node === undefined || node === null) return undefined;
    node = node[seg];
  }
  return node;
}

function setValueAtPath(root: any, pathSegments: string[], newValue: string | number): void {
  let node = root;
  for (const seg of pathSegments.slice(0, -1)) node = node[seg];
  node[pathSegments[pathSegments.length - 1]].$value = newValue;
}

// Formats a raw Figma value back into this token's own EXISTING $value
// shape, rather than asserting one from the Figma variable type — a
// "dimension" token needs its "<N>px" string convention restored; a
// "number"/"fontWeight" token, or a color hex, stays exactly what Figma
// reported. Copying the existing convention (instead of hardcoding a
// per-category rule) keeps this correct even if a token category's shape
// changes later.
function formatValueLikeExisting(existingValue: string | number, newRaw: string | number): string | number {
  if (typeof existingValue === "string" && /px$/.test(existingValue) && typeof newRaw === "number") {
    return `${newRaw}px`;
  }
  return newRaw;
}

// rgba(r,g,b,a) -> numeric components, for a tolerant comparison instead
// of brittle string equality (a Figma-reported alpha like 0.5 could
// stringify slightly differently than this pipeline's own writer did).
// Returns null for anything that doesn't match the expected shape —
// callers fall back to plain string equality in that case.
function parseRgba(s: string): [number, number, number, number] | null {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(s.replace(/\s+/g, ""));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function colorsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseRgba(a);
  const pb = parseRgba(b);
  if (!pa || !pb) return false;
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2] && Math.abs(pa[3] - pb[3]) < 0.001;
}

function layersEqual(a: LiveFigmaEffectLayer[], b: LiveFigmaEffectLayer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((la, i) => {
    const lb = b[i];
    return la.offsetX === lb.offsetX && la.offsetY === lb.offsetY && la.blur === lb.blur && la.spread === lb.spread && colorsEqual(la.color, lb.color);
  });
}

function formatShadowLayers(layers: LiveFigmaEffectLayer[]): Array<{ offsetX: string; offsetY: string; blur: string; spread: string; color: string }> {
  return layers.map((l) => ({ offsetX: `${l.offsetX}px`, offsetY: `${l.offsetY}px`, blur: `${l.blur}px`, spread: `${l.spread}px`, color: l.color }));
}

function emptySnapshot(): FigmaSyncSnapshot {
  return { variables: {}, textStyles: {}, effectStyles: {} };
}

// Writes the very first snapshot right after a real push — no diffing, no
// existing snapshot required. Called once per push (SDSGT-figma-push's own
// job, right after variables/styles land in a real Figma file, reading
// their live resolved values back rather than reusing the plan's own
// placeholder literals for alias/alpha entries).
export function writeInitialSnapshot(tokensDir: string, input: FigmaPullInput): FigmaSyncSnapshot {
  const snapshot = buildSnapshotFromLive(input);
  writeJsonPretty(join(tokensDir, SNAPSHOT_FILE), snapshot);
  return snapshot;
}

export function computeFigmaPull(tokensDir: string, input: FigmaPullInput): FigmaPullResult {
  const snapshotPath = join(tokensDir, SNAPSHOT_FILE);
  if (!existsSync(snapshotPath)) {
    throw new Error(
      `No ${SNAPSHOT_FILE} found in ${tokensDir} — this project has never been pushed with sync support, or the snapshot file was deleted. Push tokens to Figma first (SDSGT-figma-push) to establish a baseline before pulling.`,
    );
  }
  // Old snapshots (written before styles were supported) may be missing
  // these keys entirely — default to empty rather than crash, so a
  // pre-existing project's first pull after this upgrade just treats
  // every style as "new since last sync" instead of erroring out.
  const rawSnapshot = readJsonRaw(snapshotPath);
  const snapshot: FigmaSyncSnapshot = { variables: rawSnapshot.variables ?? {}, textStyles: rawSnapshot.textStyles ?? {}, effectStyles: rawSnapshot.effectStyles ?? {} };

  const plan = buildFigmaPushPlan(tokensDir);
  const allVars: FigmaVariablePlanItem[] = [
    ...plan.variables,
    ...plan.elevationVariables.map((e) => ({
      path: figmaNameToPath(e.figmaName).join("."),
      figmaName: e.figmaName,
      type: "FLOAT" as const,
      group: "foundation" as const,
      valuesByMode: { value: e.value },
    })),
  ];

  const liveVarMap = new Map<string, Record<string, string | number>>();
  for (const v of input.variables) {
    if (!liveVarMap.has(v.figmaName)) liveVarMap.set(v.figmaName, {});
    liveVarMap.get(v.figmaName)![v.mode] = v.value;
  }
  const liveTextStyleMap = new Map((input.textStyles ?? []).map((s) => [s.figmaName, s]));
  const liveEffectStyleMap = new Map((input.effectStyles ?? []).map((s) => [s.figmaName, s]));

  const changes: FigmaPullChange[] = [];
  const fileCache = new Map<string, any>();
  const fileWasWritten = new Set<string>();

  function loadFile(filename: string): any {
    if (!fileCache.has(filename)) fileCache.set(filename, readJsonRaw(join(tokensDir, filename)));
    return fileCache.get(filename);
  }

  // --- Variables (color/spacing/radius/opacity/border-width/breakpoint/
  // typography primitives, MD3/MD2 elevation floats) ---
  for (const variable of allVars) {
    const liveModes = liveVarMap.get(variable.figmaName);
    if (!liveModes) continue; // not present live — reported via `unmapped` only in the other direction

    for (const mode of Object.keys(variable.valuesByMode)) {
      const liveValue = liveModes[mode];
      if (liveValue === undefined) continue;
      const snapshotValue = snapshot.variables[variable.figmaName]?.[mode];
      if (snapshotValue === undefined) continue; // new since last push — nothing to diff against yet
      if (liveValue === snapshotValue) continue; // unchanged since last sync

      const aliasTarget = variable.aliasByMode?.[mode];
      if (aliasTarget) {
        // The target is usually a primitive/foundation, which is
        // mode-independent (only ever has a "value" key) even when the
        // alias itself is being checked per light/dark mode — try the
        // same mode name first, then fall back to "value". Missing this
        // fallback was a real bug caught in testing: every alias looked
        // "broken" simply because a primitive has no "light"/"dark" key
        // to match against.
        const targetModes = liveVarMap.get(aliasTarget);
        const targetLive = targetModes?.[mode] ?? targetModes?.["value"];
        if (targetLive !== undefined && targetLive === liveValue) continue; // still following — the target's own diff entry covers this
      }

      const pathSegments = figmaNameToPath(variable.figmaName);
      const filename = fileForPath(pathSegments, mode);
      const file = loadFile(filename);
      const existing = getAtPath(file, pathSegments);
      if (existing === undefined || existing.$value === undefined) {
        changes.push({ figmaName: variable.figmaName, path: pathSegments.join("."), oldValue: snapshotValue, newValue: liveValue, note: "no matching token found in the token spec at this path — skipped, not written" });
        continue;
      }

      const wasAlias = typeof existing.$value === "string" && existing.$value.startsWith("{");
      const formatted = formatValueLikeExisting(existing.$value, liveValue);
      const oldValue = existing.$value;
      setValueAtPath(file, pathSegments, formatted);
      fileWasWritten.add(filename);
      changes.push({ figmaName: variable.figmaName, path: pathSegments.join("."), oldValue, newValue: formatted, note: wasAlias ? "was an alias in code — overridden directly in Figma, pulled as a literal value" : undefined });
    }
  }

  // --- Text styles (typography.semantic.json) ---
  const FIELDS = ["fontFamily", "fontWeight", "fontSize", "lineHeight"] as const;
  for (const style of plan.textStyles) {
    const live = liveTextStyleMap.get(style.figmaName);
    if (!live) continue;
    const snapshotStyle = snapshot.textStyles[style.figmaName];
    if (!snapshotStyle) continue; // new since last sync

    const styleKey = lastSegment(style.figmaName);

    for (const field of FIELDS) {
      const liveValue = live[field];
      const snapshotValue = snapshotStyle[field];
      if (liveValue === snapshotValue) continue;

      const aliasTarget = style.aliasFigmaNames?.[field];
      if (aliasTarget) {
        const targetModes = liveVarMap.get(aliasTarget);
        const targetLive = targetModes?.["value"];
        if (targetLive !== undefined && targetLive === liveValue) continue; // still following its primitive
      }

      const file = loadFile("typography.semantic.json");
      const entry = file.typography?.semantic?.[styleKey];
      if (!entry) {
        changes.push({ figmaName: `${style.figmaName}#${field}`, path: `typography.semantic.${styleKey}.${field}`, oldValue: snapshotValue, newValue: liveValue, note: "no matching text style found in the token spec — skipped, not written" });
        continue;
      }

      const existingFieldValue = entry.$value[field];
      const wasAlias = typeof existingFieldValue === "string" && existingFieldValue.startsWith("{");
      const formatted = field === "fontSize" || field === "lineHeight" ? `${liveValue}px` : liveValue;
      entry.$value[field] = formatted;
      fileWasWritten.add("typography.semantic.json");
      changes.push({
        figmaName: `${style.figmaName}#${field}`,
        path: `typography.semantic.${styleKey}.${field}`,
        oldValue: existingFieldValue,
        newValue: formatted,
        note: wasAlias ? "was an alias in code — overridden directly in Figma, pulled as a literal value" : undefined,
      });
    }
  }

  // --- Effect styles (shadow.json's box-shadow-shaped entries only —
  // MD3/MD2's elevation-dp shape is handled above, as a plain variable) ---
  for (const style of plan.effectStyles) {
    const live = liveEffectStyleMap.get(style.figmaName);
    if (!live) continue;
    const snapshotLayers = snapshot.effectStyles[style.figmaName];
    if (!snapshotLayers) continue; // new since last sync
    if (layersEqual(live.layers, snapshotLayers)) continue; // unchanged since last sync (tolerant color comparison)

    const shadowKey = lastSegment(style.figmaName);
    const file = loadFile("shadow.json");
    const entry = file.shadow?.[shadowKey];
    if (!entry) {
      changes.push({ figmaName: style.figmaName, path: `shadow.${shadowKey}`, oldValue: JSON.stringify(snapshotLayers), newValue: JSON.stringify(live.layers), note: "no matching shadow token found in the token spec — skipped, not written" });
      continue;
    }

    const oldValue = JSON.stringify(entry.$value);
    const newValue = formatShadowLayers(live.layers);
    entry.$value = newValue;
    fileWasWritten.add("shadow.json");
    changes.push({ figmaName: style.figmaName, path: `shadow.${shadowKey}`, oldValue, newValue: JSON.stringify(newValue) });
  }

  for (const filename of fileWasWritten) {
    writeJsonPretty(join(tokensDir, filename), fileCache.get(filename));
  }

  // Snapshot always refreshed to the full current live state, even for
  // untouched entries — keeps every future pull's baseline accurate
  // without needing to merge partial updates by hand.
  const updatedSnapshot = buildSnapshotFromLive(input);
  writeJsonPretty(snapshotPath, updatedSnapshot);

  const knownVarNames = new Set(allVars.map((v) => v.figmaName));
  const knownTextStyleNames = new Set(plan.textStyles.map((s) => s.figmaName));
  const knownEffectStyleNames = new Set(plan.effectStyles.map((s) => s.figmaName));
  const unmapped = [
    ...[...liveVarMap.keys()].filter((n) => !knownVarNames.has(n)),
    ...[...liveTextStyleMap.keys()].filter((n) => !knownTextStyleNames.has(n)),
    ...[...liveEffectStyleMap.keys()].filter((n) => !knownEffectStyleNames.has(n)),
  ];

  return { changes, unmapped, updatedSnapshot };
}

export function buildSnapshotFromLive(input: FigmaPullInput): FigmaSyncSnapshot {
  const snapshot = emptySnapshot();
  for (const v of input.variables) {
    if (!snapshot.variables[v.figmaName]) snapshot.variables[v.figmaName] = {};
    snapshot.variables[v.figmaName][v.mode] = v.value;
  }
  for (const s of input.textStyles ?? []) {
    snapshot.textStyles[s.figmaName] = { fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeight };
  }
  for (const s of input.effectStyles ?? []) {
    snapshot.effectStyles[s.figmaName] = s.layers;
  }
  return snapshot;
}
