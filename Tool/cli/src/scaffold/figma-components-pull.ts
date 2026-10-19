// Component pull, step 2 (2026-10-19): the BASELINE half of the Figma -> code component pull
// (pipeline-plan.md, "Tokens and components round-trip differently"). Same split as the token
// pull (promote/figma-pull.ts): the SDSGT-figma-push skill only copies live Figma data into
// files (the fixed read-back script in figma-components-readback.ts, one JSON file per component
// set); this module compares those files with the project's figma-components-sources.json and
// writes figma-components-sync-snapshot.json, the baseline step 3's pull will diff against.
// Only `--init` exists: the pull itself (step 3) is not built yet.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FigmaComponentSourceProperty, FigmaComponentSourceRecord, FigmaComponentsSources } from "./figma-components-sources.ts";
import type { ComponentsReadback, ReadbackProps, ReadbackScalar, ReadbackValue } from "./figma-components-readback.ts";

export const COMPONENTS_SOURCES_FILE = "figma-components-sources.json";
export const COMPONENTS_SNAPSHOT_FILE = "figma-components-sync-snapshot.json";

// What Figma has for one intended binding.
export type LiveScalar = { variable: string } | { raw: string } | { none: true };
export type LiveBinding = LiveScalar | { split: LiveScalar[] } | { missing: "component" | "combination" | "layer" };

export interface ComponentsSnapshotBinding {
  component: string;
  combination: string; // "Variant=Default, Size=Sm, State=Hover"
  part?: string;
  property: FigmaComponentSourceProperty;
  intended: string; // the variable the push meant to bind
  live: LiveBinding;
}

export interface ComponentsSnapshot {
  version: 1;
  // Node IDs, so a later pull can find a layer even if a designer renames it.
  components: Record<string, { id: string; combinations: Record<string, { id: string; nodes: Record<string, string | string[]> }> }>;
  bindings: ComponentsSnapshotBinding[];
}

export interface ComponentsBaselineReport {
  total: number;
  matched: number;
  differs: ComponentsSnapshotBinding[];
  split: ComponentsSnapshotBinding[];
  unbound: ComponentsSnapshotBinding[];
  missingComponents: Array<{ component: string; bindings: number; reason: string }>;
  missingCombinations: Array<{ component: string; combinations: string[]; bindings: number }>;
  missingLayers: Array<{ component: string; part: string; combinations: number; bindings: number }>;
  unknownBoundLayers: Array<{ component: string; layer: string; combinations: number }>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Reading the live chunks
// ---------------------------------------------------------------------------

interface LiveCombination {
  id: string;
  root: ReadbackProps;
  parts: Map<string, Array<{ id: string; props: ReadbackProps }>>;
}

interface LiveSet {
  readback: ComponentsReadback;
  combinations: Map<string, LiveCombination>;
  unparsedNames: string[];
}

const comboKey = (combination: Record<string, string>) =>
  Object.entries(combination)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
const comboLabel = (combination: Record<string, string>) => Object.entries(combination).map(([k, v]) => `${k}=${v}`).join(", ");

// The file is what the MCP returned, saved verbatim: the object itself, a `{ result }` wrapper,
// or the object as a JSON string. Accept all three.
export function parseReadbackFile(text: string, file: string): ComponentsReadback {
  let data: unknown = JSON.parse(text);
  for (let i = 0; i < 3; i += 1) {
    if (typeof data === "string") data = JSON.parse(data);
    else if (data && typeof data === "object" && !("set" in data) && "result" in data) data = (data as { result: unknown }).result;
    else break;
  }
  const r = data as ComponentsReadback;
  if (!r || typeof r !== "object" || r.v !== 1 || typeof r.set !== "string") throw new Error(`${file} is not a component read-back (expected the object the read-back script returns, with "v": 1 and "set")`);
  return r;
}

export function readLiveDir(liveDir: string): ComponentsReadback[] {
  const files = readdirSync(liveDir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`no .json read-back files in ${liveDir}`);
  return files.map((f) => parseReadbackFile(readFileSync(join(liveDir, f), "utf-8"), f));
}

function indexLiveSet(r: ComponentsReadback): LiveSet {
  const combinations = new Map<string, LiveCombination>();
  const unparsedNames: string[] = [];
  const axes = r.axes ?? [];
  const parts = r.parts ?? [];
  for (const [combo, id, root, list] of r.c ?? []) {
    if (typeof combo === "string") {
      unparsedNames.push(combo);
      continue;
    }
    const combination: Record<string, string> = {};
    combo.forEach((valueIdx, axisIdx) => {
      if (valueIdx >= 0) combination[axes[axisIdx][0]] = axes[axisIdx][1][valueIdx];
    });
    const partMap = new Map<string, Array<{ id: string; props: ReadbackProps }>>();
    for (const [partIdx, nodeId, props] of list) {
      const name = parts[partIdx];
      if (!partMap.has(name)) partMap.set(name, []);
      partMap.get(name)!.push({ id: nodeId, props });
    }
    combinations.set(comboKey(combination), { id, root, parts: partMap });
  }
  return { readback: r, combinations, unparsedNames };
}

// ---------------------------------------------------------------------------
// Property -> read-back key (+ which sides)
// ---------------------------------------------------------------------------

const PROPERTY_KEY: Record<FigmaComponentSourceProperty, { key: keyof ReadbackProps; sides?: number[] }> = {
  fill: { key: "f" },
  stroke: { key: "s" },
  textColor: { key: "t" },
  ringColor: { key: "k" },
  radius: { key: "r", sides: [0, 1, 2, 3] },
  paddingHorizontal: { key: "x", sides: [0, 1] },
  paddingVertical: { key: "y", sides: [0, 1] },
  paddingBottom: { key: "y", sides: [1] },
  itemSpacing: { key: "g" },
  height: { key: "h" },
  width: { key: "w" },
  fontSize: { key: "z" },
  fontFamily: { key: "n" },
};

const SIDE_NAMES: Partial<Record<keyof ReadbackProps, string[]>> = {
  r: ["top-left", "top-right", "bottom-right", "bottom-left"],
  x: ["left", "right"],
  y: ["top", "bottom"],
};

function decodeScalar(v: ReadbackScalar | undefined, vars: string[]): LiveScalar {
  if (typeof v === "number") return { variable: vars[v] ?? `?${v}` };
  if (typeof v === "string") return { raw: v };
  return { none: true };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function foldScalars(values: LiveScalar[]): LiveScalar | { split: LiveScalar[] } {
  return values.every((v) => same(v, values[0])) ? values[0] : { split: values };
}

function decode(value: ReadbackValue | undefined, sides: number[] | undefined, vars: string[]): LiveScalar | { split: LiveScalar[] } {
  if (!Array.isArray(value)) return decodeScalar(value, vars);
  const picked = sides ? sides.map((i) => value[i]) : value;
  return foldScalars(picked.map((v) => decodeScalar(v, vars)));
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

const isBound = (props: ReadbackProps) => Object.values(props).some((v) => typeof v === "number" || (Array.isArray(v) && v.some((x) => typeof x === "number")));

export function buildComponentsBaseline(sources: FigmaComponentsSources, live: ComponentsReadback[]): { snapshot: ComponentsSnapshot; report: ComponentsBaselineReport } {
  const report: ComponentsBaselineReport = { total: 0, matched: 0, differs: [], split: [], unbound: [], missingComponents: [], missingCombinations: [], missingLayers: [], unknownBoundLayers: [], warnings: [] };
  const sets = new Map<string, LiveSet>();
  const sourceComponents = new Set(sources.records.map((r) => r.component));
  for (const r of live) {
    if (sets.has(r.set)) report.warnings.push(`Two read-back files for "${r.set}" — only the first was used.`);
    else if (!sourceComponents.has(r.set)) report.warnings.push(`A read-back for "${r.set}" was saved, but the project's source list has no component by that name — ignored.`);
    else sets.set(r.set, indexLiveSet(r));
  }

  const snapshot: ComponentsSnapshot = { version: 1, components: {}, bindings: [] };
  const byComponent = new Map<string, FigmaComponentSourceRecord[]>();
  for (const r of sources.records) {
    if (!byComponent.has(r.component)) byComponent.set(r.component, []);
    byComponent.get(r.component)!.push(r);
  }

  for (const [component, records] of byComponent) {
    const set = sets.get(component);
    if (!set || set.readback.missing) {
      report.missingComponents.push({ component, bindings: records.length, reason: set ? "no component set by that name in the Figma file" : "no read-back was saved for it" });
      for (const r of records) addBinding(r, { missing: "component" });
      continue;
    }
    const vars = set.readback.vars ?? [];
    if (set.readback.also?.length) report.warnings.push(`${component}: ${set.readback.also.length + 1} component sets have this name in Figma; the first one (${set.readback.id}) was read. Delete the extra one(s) so the pull knows which is real.`);
    if (set.unparsedNames.length) report.warnings.push(`${component}: ${set.unparsedNames.length} variant(s) have a name that isn't "Property=Value, ..." and were skipped (e.g. "${set.unparsedNames[0]}").`);

    // Node IDs for the snapshot.
    const comps: ComponentsSnapshot["components"][string] = { id: set.readback.id ?? "", combinations: {} };
    const usedCombos = new Map<string, Record<string, string>>();
    for (const r of records) usedCombos.set(comboKey(r.combination), r.combination);
    for (const [key, combination] of usedCombos) {
      const lc = set.combinations.get(key);
      if (!lc) continue;
      const nodes: Record<string, string | string[]> = {};
      for (const [name, list] of lc.parts) nodes[name] = list.length === 1 ? list[0].id : list.map((n) => n.id);
      comps.combinations[comboLabel(combination)] = { id: lc.id, nodes };
    }
    snapshot.components[component] = comps;

    const missingCombos = new Map<string, number>();
    const missingLayers = new Map<string, { combos: Set<string>; bindings: number }>();
    const knownParts = new Set(records.map((r) => (r.part === "InlineLink" ? "SecondaryText" : r.part)).filter((p): p is string => Boolean(p)));
    const hasBottomRecord = new Set(records.filter((r) => r.property === "paddingBottom").map((r) => `${comboKey(r.combination)}|${r.part ?? ""}`));

    for (const r of records) {
      const key = comboKey(r.combination);
      const lc = set.combinations.get(key);
      if (!lc) {
        missingCombos.set(comboLabel(r.combination), (missingCombos.get(comboLabel(r.combination)) ?? 0) + 1);
        addBinding(r, { missing: "combination" });
        continue;
      }
      let { key: propKey, sides } = PROPERTY_KEY[r.property];
      if (r.property === "paddingVertical" && hasBottomRecord.has(`${key}|${r.part ?? ""}`)) sides = [0];
      let nodes: ReadbackProps[] | undefined;
      if (!r.part) {
        nodes = [lc.root];
        // Bare Separator: if Figma wrapped the line rectangle instead of converting it, the
        // binding sits on the child named "Line".
        const line = lc.parts.get("Line");
        if (lc.root[propKey] === undefined && line?.length === 1 && !knownParts.has("Line")) nodes = [line[0].props];
      } else if (r.part === "InlineLink") {
        nodes = lc.parts.get("SecondaryText")?.map((n) => n.props);
        propKey = "l";
      } else nodes = lc.parts.get(r.part)?.map((n) => n.props);
      if (!nodes || nodes.length === 0) {
        const layer = r.part === "InlineLink" ? "SecondaryText" : (r.part as string);
        const entry = missingLayers.get(layer) ?? { combos: new Set<string>(), bindings: 0 };
        entry.combos.add(key);
        entry.bindings += 1;
        missingLayers.set(layer, entry);
        addBinding(r, { missing: "layer" });
        continue;
      }
      const values = nodes.map((props) => decode(props[propKey], sides, vars));
      const flat = values.flatMap((v) => ("split" in v ? v.split : [v]));
      addBinding(r, values.length === 1 ? values[0] : foldScalars(flat));
    }

    if (missingCombos.size > 0) report.missingCombinations.push({ component, combinations: [...missingCombos.keys()], bindings: [...missingCombos.values()].reduce((a, b) => a + b, 0) });
    for (const [part, e] of missingLayers) report.missingLayers.push({ component, part, combinations: e.combos.size, bindings: e.bindings });

    // Bound layers the push doesn't name: most likely a renamed layer.
    const unknown = new Map<string, number>();
    for (const lc of set.combinations.values()) {
      for (const [name, list] of lc.parts) {
        if (knownParts.has(name) || (name === "Line" && !knownParts.has("Line"))) continue;
        if (list.some((n) => isBound(n.props))) unknown.set(name, (unknown.get(name) ?? 0) + 1);
      }
    }
    for (const [layer, combinations] of unknown) report.unknownBoundLayers.push({ component, layer, combinations });
  }

  function addBinding(r: FigmaComponentSourceRecord, liveValue: LiveBinding) {
    const b: ComponentsSnapshotBinding = { component: r.component, combination: comboLabel(r.combination), ...(r.part ? { part: r.part } : {}), property: r.property, intended: r.variable, live: liveValue };
    snapshot.bindings.push(b);
    report.total += 1;
    if ("missing" in liveValue) return;
    if ("split" in liveValue) report.split.push(b);
    else if ("variable" in liveValue) {
      if (liveValue.variable === r.variable) report.matched += 1;
      else report.differs.push(b);
    } else report.unbound.push(b);
  }

  return { snapshot, report };
}

// One binding per line, so the file stays diffable.
export function serializeComponentsSnapshot(s: ComponentsSnapshot): string {
  const comps = Object.entries(s.components).map(([name, c]) => `    ${JSON.stringify(name)}: ${JSON.stringify(c)}`);
  return `{\n  "version": ${s.version},\n  "components": {\n${comps.join(",\n")}\n  },\n  "bindings": [\n${s.bindings.map((b) => `    ${JSON.stringify(b)}`).join(",\n")}\n  ]\n}\n`;
}

export function writeComponentsBaseline(projectDir: string, liveDir: string): { report: ComponentsBaselineReport; snapshotPath: string } {
  const sourcesPath = join(projectDir, COMPONENTS_SOURCES_FILE);
  if (!existsSync(sourcesPath)) throw new Error(`${sourcesPath} not found — run \`scaffold\` (Next.js + shadcn/ui) first; it writes the source list next to figma-components-push-plan.json.`);
  const sources = JSON.parse(readFileSync(sourcesPath, "utf-8")) as FigmaComponentsSources;
  const { snapshot, report } = buildComponentsBaseline(sources, readLiveDir(liveDir));
  const snapshotPath = join(projectDir, COMPONENTS_SNAPSHOT_FILE);
  writeFileSync(snapshotPath, serializeComponentsSnapshot(snapshot), "utf-8");
  return { report, snapshotPath };
}

// ---------------------------------------------------------------------------
// Plain-language report
// ---------------------------------------------------------------------------

const MAX_LINES = 25;

function liveText(v: LiveBinding): string {
  if ("missing" in v) return "missing";
  if ("split" in v) return v.split.map(liveText).join(" / ");
  if ("variable" in v) return v.variable;
  if ("raw" in v) return `a typed value (${v.raw})`;
  return "nothing";
}

function where(b: ComponentsSnapshotBinding): string {
  const part = b.part ? ` > ${b.part}` : "";
  return `${b.component} [${b.combination}]${part} ${b.property}`;
}

function splitText(b: ComponentsSnapshotBinding): string {
  const v = b.live as { split: LiveScalar[] };
  const names = SIDE_NAMES[PROPERTY_KEY[b.property].key];
  const sideNames = b.property === "paddingBottom" ? ["bottom"] : names;
  return v.split.map((s, i) => `${sideNames && v.split.length === sideNames.length ? sideNames[i] : `layer ${i + 1}`} ${liveText(s)}`).join(", ");
}

export function formatComponentsBaselineReport(report: ComponentsBaselineReport, snapshotPath: string): string {
  const out: string[] = [];
  const list = (items: string[]) => {
    for (const line of items.slice(0, MAX_LINES)) out.push(`  - ${line}`);
    if (items.length > MAX_LINES) out.push(`  ...and ${items.length - MAX_LINES} more (all listed in the baseline file).`);
  };
  out.push(`Wrote the component baseline to ${snapshotPath}.`);
  out.push(`${report.matched} of ${report.total} intended component bindings match Figma exactly.`);
  if (report.differs.length) {
    out.push(`\n${report.differs.length} binding(s) use a different variable in Figma than the push intended:`);
    list(report.differs.map((b) => `${where(b)}: intended ${b.intended}, Figma has ${liveText(b.live)}`));
  }
  if (report.split.length) {
    out.push(`\n${report.split.length} binding(s) are split — the sides (or layers) no longer use one value:`);
    list(report.split.map((b) => `${where(b)}: ${splitText(b)} (intended ${b.intended} everywhere)`));
  }
  if (report.unbound.length) {
    out.push(`\n${report.unbound.length} binding(s) are not bound to any variable in Figma (a typed raw value, or nothing):`);
    list(report.unbound.map((b) => `${where(b)}: Figma has ${liveText(b.live)} (intended ${b.intended})`));
  }
  if (report.missingComponents.length) {
    out.push(`\n${report.missingComponents.length} component(s) are missing from Figma:`);
    list(report.missingComponents.map((m) => `${m.component}: ${m.reason} (${m.bindings} binding(s) not checked)`));
  }
  if (report.missingCombinations.length) {
    out.push("\nVariants in the source list that the Figma component set doesn't have:");
    list(report.missingCombinations.map((m) => `${m.component}: ${m.combinations.length} variant(s), e.g. "${m.combinations[0]}" (${m.bindings} binding(s) not checked)`));
  }
  if (report.missingLayers.length) {
    out.push("\nLayers not found by name (renamed or deleted in Figma, or the file was pushed before the push named its layers):");
    list(report.missingLayers.map((m) => `${m.component}: layer "${m.part}" not found in ${m.combinations} variant(s) (${m.bindings} binding(s) not checked)`));
    out.push("  If nobody renamed these layers, the file predates layer naming: re-push the components so the baseline can cover them.");
  }
  if (report.unknownBoundLayers.length) {
    out.push("\nBound layers the push doesn't name (possibly a renamed layer):");
    list(report.unknownBoundLayers.map((u) => `${u.component}: layer "${u.layer}" in ${u.combinations} variant(s)`));
  }
  if (report.warnings.length) {
    out.push("\nNotes:");
    list(report.warnings);
  }
  const differing = report.differs.length + report.split.length + report.unbound.length;
  const unchecked = report.total - report.matched - differing;
  if (differing === 0 && unchecked === 0) out.push("\nEverything the push meant to bind is bound exactly as intended.");
  else out.push(`\n${differing} binding(s) differ from the push's intent and ${unchecked} couldn't be checked. The baseline records Figma as it is now, so a later pull treats only edits made after this point as changes.`);
  return out.join("\n");
}
