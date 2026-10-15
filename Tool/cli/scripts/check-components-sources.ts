// Checks figma-components-sources.json against figma-components-push-plan.json and the real
// vendored files (component pull, step 1). Independent of the generator: it walks the plan
// JSON with its OWN copy of the SDSGT-figma-push replay (SKILL.md step 2c's merge and the
// bindings of steps 1b/2/2b/2c/3), then requires:
//   1. every bound property of every combination has exactly one record, with the same variable;
//   2. no record exists for a binding the replay doesn't apply;
//   3. every "class" record's class really appears, as a whole class token, in a string literal
//      at the stated location of the stated file.
//
// Usage (from Tool/cli):
//   node scripts/check-components-sources.ts --plan <plan.json> --sources <sources.json> [--ui-dir <dir>] [--component <Name>]
// --ui-dir defaults to the Demo project's vendored components. Exit code 1 on any problem.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const planPath = flag("--plan");
const sourcesPath = flag("--sources");
if (!planPath || !sourcesPath) {
  console.error("Usage: node scripts/check-components-sources.ts --plan <plan.json> --sources <sources.json> [--ui-dir <dir>] [--component <Name>]");
  process.exit(2);
}
const uiDir = resolve(repoRoot, flag("--ui-dir") ?? "Demo/sdsgt-demo-app/src/components/ui");
const only = flag("--component");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const plan: Any = JSON.parse(readFileSync(resolve(process.cwd(), planPath), "utf-8"));
const sources: Any = JSON.parse(readFileSync(resolve(process.cwd(), sourcesPath), "utf-8"));

// ---- 1. The bindings the replay applies, walked from the plan JSON ----
type Binding = { component: string; combo: string; part: string; property: string; variable: string };
const expected: Binding[] = [];

for (const c of plan.components as Any[]) {
  if (only && c.name !== only) continue;
  const axes: Any[] = c.extraAxes || [];
  let combos: Any[][] = [[]];
  for (const axis of axes) combos = combos.flatMap((combo) => axis.options.map((option: Any) => [...combo, { axis, option }]));
  for (const combo of combos) {
    const comboOverrides = combo.flatMap((a: Any) => combo.filter((o: Any) => o !== a).map((o: Any) => (a.option.combinationOverrides || {})[`${o.axis.propertyName}=${o.option.name}`]).filter(Boolean));
    const allOverrides = [...combo.map((a: Any) => a.option.overrides), ...comboOverrides];
    const item = Object.assign({}, c, ...allOverrides);
    const stateNames: Array<string | null> = c.statePropertyName ? [null, ...((c.variants[0].states || []).map((s: Any) => s.name))] : [null];
    for (const stateName of stateNames) {
      for (const variant of c.variants as Any[]) {
        const state = stateName ? (variant.states || []).find((s: Any) => s.name === stateName) : null;
        const stateIgnored = state && allOverrides.some((o: Any) => (o.ignoreStates || []).includes(state.name));
        const stateFields = state && !stateIgnored ? (({ name: _n, ...rest }: Any) => rest)(state) : {};
        const vi = Object.assign({}, variant, ...allOverrides.map((o: Any) => (o.variantOverrides || {})[variant.name] || {}), stateFields);
        const names = [`${c.variantPropertyName}=${variant.name}`, ...combo.map((a: Any) => `${a.axis.propertyName}=${a.option.name}`), ...(c.statePropertyName ? [`${c.statePropertyName}=${stateName ?? "Default"}`] : [])];
        const combo_ = names.join(", ");
        const bind = (property: string, part: string, variable: unknown) => {
          if (typeof variable === "string" && variable !== "") expected.push({ component: c.name, combo: combo_, part, property, variable });
        };

        if (c.icon) { bind("stroke", "Icon", c.icon.colorVariable); continue; }
        if (item.line) {
          bind("fill", item.line.centerLabel ? "Line" : "", item.line.colorVariable);
          if (item.line.centerLabel) {
            bind("itemSpacing", "", item.line.centerLabel.gapVariable);
            bind("fontSize", "CenterLabelText", item.line.centerLabel.fontSizeVariable);
            bind("textColor", "CenterLabelText", item.line.centerLabel.textVariable);
          }
          continue;
        }
        if (c.bar) {
          bind("fill", "", c.bar.trackColorVariable);
          bind("fill", "Indicator", c.bar.indicatorColorVariable);
          bind("height", "", c.bar.heightVariable);
          bind("height", "Indicator", c.bar.heightVariable);
          bind("radius", "", c.bar.radiusVariable);
          continue;
        }
        if (vi.thumb) {
          bind("radius", "", vi.thumb.radiusVariable);
          bind("fill", "", vi.thumb.trackColorVariable);
          bind("fill", "Thumb", vi.thumb.thumbColorVariable);
          if (vi.strokeVariable) bind("stroke", "", vi.strokeVariable);
          if (vi.focusRing) bind("ringColor", "", vi.focusRing.colorVariable);
          continue;
        }
        if (!c.fixedSizePx) {
          if (item.iconOnly || (item.square && item.heightVariable)) {
            bind("width", "", item.heightVariable);
            bind("height", "", item.heightVariable);
          } else if (!item.sections) {
            bind("paddingHorizontal", "", item.paddingHorizontalVariable);
            if (item.heightVariable) bind("height", "", item.heightVariable);
            else bind("paddingVertical", "", item.paddingVerticalVariable);
          }
        }
        if (item.sections) {
          if (item.sections[0]?.textLineDirection !== "horizontal") bind("paddingVertical", "", item.sectionGapVariable);
          bind("itemSpacing", "", item.sectionGapVariable);
          if (item.widthVariable) bind("width", "", item.widthVariable);
        }
        bind("radius", "", item.radiusVariable);
        if (vi.fillVariable) bind("fill", "", vi.fillVariable);
        if (vi.strokeVariable) bind("stroke", "", vi.strokeVariable);
        if (vi.paddingBottomVariable) bind("paddingBottom", "", vi.paddingBottomVariable);
        if (vi.focusRing) bind("ringColor", "", vi.focusRing.colorVariable);
        if (item.iconOnly) {
          bind("stroke", "Icon", vi.textVariable || item.iconOnly.colorVariable);
        } else if (item.sections) {
          for (const section of item.sections) {
            bind("paddingHorizontal", `Section:${section.textLines[0]?.labelPropertyName}`, section.paddingHorizontalVariable);
            for (const line of section.textLines) {
              bind("fontSize", line.labelPropertyName, line.fontSizeVariable);
              bind("textColor", line.labelPropertyName, (vi.textLineOverrides?.[line.labelPropertyName]?.textVariable) || line.textVariable);
            }
          }
        } else if (variant.icon) {
          bind("stroke", "Icon", variant.icon.colorVariable);
        } else if (variant.centerDot) {
          bind("fill", "CenterDot", variant.centerDot.colorVariable);
        } else if (variant.textVariable) {
          bind("fontSize", "PrimaryText", item.fontSizeVariable);
          bind("textColor", "PrimaryText", vi.textVariable);
          bind("fontFamily", "PrimaryText", c.fontFamilyVariable);
          if (vi.flankLines) {
            bind("itemSpacing", "", vi.flankLines.gapVariable);
            bind("fill", "FlankLine", vi.flankLines.colorVariable);
          }
          if (c.secondaryTextVariable) {
            bind("fontSize", "SecondaryText", c.secondaryFontSizeVariable);
            bind("textColor", "SecondaryText", c.secondaryTextVariable);
            if (c.inlineLink) bind("textColor", "InlineLink", vi.linkTextVariable || c.secondaryTextVariable);
          }
        }
      }
    }
  }
}

// ---- 2. Match records to bindings ----
const keyOf = (component: string, combo: string, part: string, property: string) => `${component} | ${combo} | ${part || "(root)"} | ${property}`;
const recordCombo = (r: Any) => Object.entries(r.combination).map(([k, v]) => `${k}=${v}`).join(", ");
const byKey = new Map<string, Any[]>();
for (const r of sources.records as Any[]) {
  if (only && r.component !== only) continue;
  const k = keyOf(r.component, recordCombo(r), r.part ?? "", r.property);
  byKey.set(k, [...(byKey.get(k) ?? []), r]);
}
const problems: string[] = [];
const expectedKeys = new Set<string>();
for (const b of expected) {
  const k = keyOf(b.component, b.combo, b.part, b.property);
  if (expectedKeys.has(k)) continue; // the replay binds the same property twice only for identical values
  expectedKeys.add(k);
  const recs = byKey.get(k) ?? [];
  if (recs.length === 0) problems.push(`NO RECORD     ${k} -> ${b.variable}`);
  else if (recs.length > 1) problems.push(`${recs.length} RECORDS     ${k}`);
  else if (recs[0].variable !== b.variable) problems.push(`WRONG VARIABLE ${k}: record ${recs[0].variable}, plan ${b.variable}`);
}
for (const k of byKey.keys()) if (!expectedKeys.has(k)) problems.push(`EXTRA RECORD  ${k}`);

// ---- 3. Every class record's class is really at its location ----
const fileCache = new Map<string, string>();
const read = (file: string) => {
  if (!fileCache.has(file)) fileCache.set(file, readFileSync(join(uiDir, file), "utf-8"));
  return fileCache.get(file)!;
};
// The source text of a location: a top-level declaration's body, narrowed for cva parts.
function locationText(source: string, location: string): string | null {
  const declStarts = [...source.matchAll(/^(?:export\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/gm)].map((m) => ({ name: m[1], index: m.index! }));
  const declText = (name: string) => {
    const i = declStarts.findIndex((d) => d.name === name);
    if (i < 0) return null;
    return source.slice(declStarts[i].index, declStarts[i + 1]?.index ?? source.length);
  };
  let m = location.match(/^function ([A-Za-z0-9_]+)$/);
  if (m) return declText(m[1]);
  m = location.match(/^cva ([A-Za-z0-9_]+) base$/);
  if (m) return declText(m[1])?.match(/cva\(\s*"([^"]*)"/)?.[1] ?? null;
  m = location.match(/^cva ([A-Za-z0-9_]+) variants\.([A-Za-z0-9]+)\.([A-Za-z0-9-]+)$/);
  if (m) {
    const text = declText(m[1]);
    const axisBody = text?.match(new RegExp(`\\n\\s*${m[2]}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`))?.[1];
    return axisBody?.match(new RegExp(`(["']?)${m[3].replace(/-/g, "\\-")}\\1:\\s*"([^"]*)"`))?.[2] ?? null;
  }
  return null;
}
const classRecords = (sources.records as Any[]).filter((r) => r.origin === "class" && (!only || r.component === only));
const checkedClasses = new Set<string>();
for (const r of classRecords) {
  const k = `${r.file}|${r.location}|${r.class}`;
  if (checkedClasses.has(k)) continue;
  checkedClasses.add(k);
  const text = locationText(read(r.file), r.location);
  if (text === null) { problems.push(`BAD LOCATION  ${r.file} "${r.location}" (for class ${r.class})`); continue; }
  const tokens = new Set([...text.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].flatMap((x) => (x[1] ?? x[2] ?? "").split(/\s+/)).concat(r.location.endsWith("base") || r.location.includes("variants.") ? text.split(/\s+/) : []));
  if (!tokens.has(r.class)) problems.push(`CLASS NOT AT LOCATION ${r.file} "${r.location}": ${r.class}`);
}

// ---- Report ----
const recs = (sources.records as Any[]).filter((r) => !only || r.component === only);
const perComponent = new Map<string, { bindings: number; cls: number; derived: number }>();
for (const k of expectedKeys) {
  const name = k.split(" | ")[0];
  perComponent.set(name, { bindings: (perComponent.get(name)?.bindings ?? 0) + 1, cls: 0, derived: 0 });
}
for (const r of recs) {
  const e = perComponent.get(r.component) ?? { bindings: 0, cls: 0, derived: 0 };
  if (r.origin === "class") e.cls++;
  else e.derived++;
  perComponent.set(r.component, e);
}
for (const [name, e] of perComponent) console.log(`${name.padEnd(16)} bindings ${String(e.bindings).padStart(5)}  class ${String(e.cls).padStart(5)}  derived ${String(e.derived).padStart(5)}`);
console.log(`TOTAL records ${recs.length} (class ${recs.filter((r) => r.origin === "class").length}, derived ${recs.filter((r) => r.origin === "derived").length}); expected bindings ${expectedKeys.size}; distinct class origins checked ${checkedClasses.size}`);
if (problems.length > 0) {
  const shown = problems.slice(0, Number(flag("--max") ?? 60));
  console.log(`\n${problems.length} PROBLEM(S):\n${shown.join("\n")}${problems.length > shown.length ? `\n... and ${problems.length - shown.length} more` : ""}`);
  process.exit(1);
}
console.log("OK: every binding has exactly one record, and every class record's class is at its stated location.");
