// Offline check for the component pull baseline (component pull, step 2). No live Figma: it
// builds a MOCK of just the Plugin API surface the read-back script uses (figma.root.findAll,
// loadAllPagesAsync, variables.getVariableByIdAsync, figma.mixed, node fields, findAll,
// getStyledTextSegments), shaped like the push's output for the Demo project, built from the
// Demo's source list (one component set per component, one variant component per combination,
// named parts, variable bindings). Then it runs the REAL read-back script per component set,
// saves each result, runs the REAL `figma-components-pull --init` on a scratch project and checks:
//   (a) a faithful mock: every source record matched, nothing else reported;
//   (b) a mock with a swapped binding, a typed raw value, a split padding, a renamed layer and a
//       missing component: exactly the expected report lines.
// Also prints the read-back size per component and in total.
//
// Usage (from Tool/cli): node scripts/check-components-baseline.ts [--work-dir <dir>]
// --work-dir defaults to <repo>/.tmp/component-pull-step2/baseline-check. Exit code 1 on failure.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { buildFigmaComponentsPushPlanWithSources } from "../src/scaffold/figma-components-plan.ts";
import { serializeFigmaComponentsSources, type FigmaComponentSourceRecord } from "../src/scaffold/figma-components-sources.ts";
import { buildComponentsReadbackScript } from "../src/scaffold/figma-components-readback.ts";

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(cliDir, "..", "..");
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const workDir = resolve(process.cwd(), flag("--work-dir") ?? join(repoRoot, ".tmp/component-pull-step2/baseline-check"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ---------------------------------------------------------------------------
// The mock Plugin API
// ---------------------------------------------------------------------------

const MIXED = Symbol("figma.mixed");
let nextId = 1;
const alias = (id: string) => ({ type: "VARIABLE_ALIAS", id });

class MockNode {
  id = `${nextId++}:1`;
  children: MockNode[] = [];
  boundVariables: Record<string, Any> = {};
  [key: string]: Any;
  type: string;
  name: string;
  constructor(type: string, name: string, fields: Record<string, Any> = {}) {
    this.type = type;
    this.name = name;
    Object.assign(this, fields);
  }
  append(...nodes: MockNode[]) {
    this.children.push(...nodes);
    return this;
  }
  findAll(pred: (n: MockNode) => boolean): MockNode[] {
    const out: MockNode[] = [];
    const walk = (n: MockNode) => {
      for (const c of n.children) {
        if (pred(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  // Text segments: `segments` when the push styled a range (Alert's inline link), else one.
  getStyledTextSegments(fields: string[]) {
    const segs: Any[] = this.segments ?? [{ fills: this.fills, textDecoration: "NONE", fontSize: this.fontSize, fontName: this.fontName }];
    return segs.map((s) => Object.fromEntries(fields.map((f) => [f, s[f]])));
  }
}

const frameFields = (layoutMode = "HORIZONTAL") => ({
  layoutMode, primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "AUTO", width: 80, height: 32,
  paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, itemSpacing: 0,
  topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0,
  fills: [], strokes: [], effects: [],
});
const shapeFields = (withRadius: boolean) => ({ width: 8, height: 1, fills: [], strokes: [], effects: [], ...(withRadius ? { topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0 } : {}) });
const textFields = () => ({ fills: [], fontSize: 14, fontName: { family: "Inter", style: "Regular" }, width: 40, height: 20 });

const TEXT_LIKE = (part: string) => !["Line", "FlankLine", "Indicator", "Thumb", "Icon", "CenterDot"].includes(part) && !part.startsWith("Section:");
const NON_LAYOUT_ROOTS = new Set(["Separator", "Progress", "Switch", "Spinner"]);

class MockVariables {
  byName = new Map<string, string>();
  byId = new Map<string, { id: string; name: string }>();
  idOf(name: string) {
    if (!this.byName.has(name)) {
      const id = `VariableID:${this.byName.size + 1}:0`;
      this.byName.set(name, id);
      this.byId.set(id, { id, name });
    }
    return this.byName.get(name)!;
  }
  async getVariableByIdAsync(id: string) {
    return this.byId.get(id) ?? null;
  }
}

const boundPaint = (vars: MockVariables, name: string) => ({ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 }, boundVariables: { color: alias(vars.idOf(name)) } });

function applyBinding(node: MockNode, r: FigmaComponentSourceRecord, vars: MockVariables) {
  const a = alias(vars.idOf(r.variable));
  const set = (...fields: string[]) => { for (const f of fields) node.boundVariables[f] = a; };
  switch (r.property) {
    case "fill": node.fills = [boundPaint(vars, r.variable)]; break;
    case "stroke": node.strokes = [boundPaint(vars, r.variable)]; break;
    case "textColor": node.fills = [boundPaint(vars, r.variable)]; break;
    case "ringColor": node.effects = [{ type: "DROP_SHADOW", visible: true, color: { r: 0, g: 0, b: 0, a: 0.5 }, spread: 3, boundVariables: { color: a } }]; break;
    case "radius": set("topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"); break;
    case "paddingHorizontal": set("paddingLeft", "paddingRight"); break;
    case "paddingVertical": set("paddingTop", "paddingBottom"); break;
    case "paddingBottom": set("paddingBottom"); break;
    case "itemSpacing": set("itemSpacing"); break;
    case "width": set("width"); if (node.layoutMode) node[node.layoutMode === "HORIZONTAL" ? "primaryAxisSizingMode" : "counterAxisSizingMode"] = "FIXED"; break;
    case "height": set("height"); if (node.layoutMode) node[node.layoutMode === "HORIZONTAL" ? "counterAxisSizingMode" : "primaryAxisSizingMode"] = "FIXED"; break;
    // Text fields bind per range in Figma, so they read back as alias ARRAYS.
    case "fontSize": node.boundVariables.fontSize = [a]; break;
    case "fontFamily": node.boundVariables.fontFamily = [a]; break;
  }
}

const comboLabel = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(", ");

// One component set per component, shaped like SKILL.md step 7's output.
function buildMockFile(records: FigmaComponentSourceRecord[], vars: MockVariables): MockNode {
  const page = new MockNode("PAGE", "Components");
  const sets = new Map<string, MockNode>();
  const comps = new Map<string, MockNode>();
  const order = (r: FigmaComponentSourceRecord) => (r.property === "paddingBottom" ? 1 : 0); // the push binds paddingBottom after paddingVertical
  for (const r of [...records].sort((x, y) => order(x) - order(y))) {
    let set = sets.get(r.component);
    if (!set) {
      set = new MockNode("COMPONENT_SET", r.component);
      sets.set(r.component, set);
      page.append(set);
    }
    const key = `${r.component}|${comboLabel(r.combination)}`;
    let comp = comps.get(key);
    if (!comp) {
      comp = new MockNode("COMPONENT", comboLabel(r.combination), NON_LAYOUT_ROOTS.has(r.component) ? { ...frameFields("NONE") } : frameFields());
      comps.set(key, comp);
      set.append(comp);
      // Push-shaped extras with no binding: Breadcrumb's "›" glyphs, Alert's text stack frame.
      if (r.component === "Breadcrumb") comp.append(new MockNode("TEXT", "Separator", textFields()), new MockNode("TEXT", "Separator", textFields()));
      if (r.component === "Alert") comp.append(new MockNode("FRAME", "Frame", frameFields("VERTICAL")));
    }
    let nodes: MockNode[];
    if (!r.part) nodes = [comp];
    else if (r.part === "InlineLink") {
      const text = comp.findAll((n) => n.name === "SecondaryText")[0];
      const rest = text.fills;
      text.segments = [{ fills: rest, textDecoration: "NONE" }, { fills: [boundPaint(vars, r.variable)], textDecoration: "UNDERLINE" }];
      if (JSON.stringify(rest) !== JSON.stringify(text.segments[1].fills)) text.fills = MIXED;
      continue;
    } else {
      nodes = comp.findAll((n) => n.name === r.part);
      if (nodes.length === 0) {
        const p = r.part;
        if (p === "Line" || p === "FlankLine") nodes = [new MockNode("RECTANGLE", p, shapeFields(true)), new MockNode("RECTANGLE", p, shapeFields(true))];
        else if (p === "Indicator") nodes = [new MockNode("RECTANGLE", p, shapeFields(true))];
        else if (p === "Thumb" || p === "CenterDot") nodes = [new MockNode("ELLIPSE", p, shapeFields(false))];
        else if (p === "Icon") nodes = [new MockNode("VECTOR", p, shapeFields(false))];
        else if (p.startsWith("Section:")) nodes = [new MockNode("FRAME", p, frameFields("VERTICAL"))];
        else if (TEXT_LIKE(p)) nodes = [new MockNode("TEXT", p, textFields())];
        else throw new Error(`mock: unknown part ${p}`);
        // createNodeFromSvg's wrapper frame around the icon vector (no bindings of its own).
        const parent = p === "Icon" && r.component !== "Spinner" ? new MockNode("FRAME", "svg", { ...frameFields("NONE") }).append(...nodes) : null;
        comp.append(...(parent ? [parent] : nodes));
        if (p === "Icon" && r.component === "Spinner") comp.fills = [];
      }
    }
    for (const n of nodes) applyBinding(n, r, vars);
    // The push's ring-on-fill-less-frame fix: a near-invisible white fill.
    if (r.property === "ringColor" && (!r.part) && comp.fills.length === 0) comp.fills = [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 }, opacity: 0.0001 }];
  }
  return page;
}

function mockFigma(page: MockNode, vars: MockVariables) {
  const root = new MockNode("DOCUMENT", "Document").append(page);
  return { mixed: MIXED, root, loadAllPagesAsync: async () => {}, variables: vars };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function readBack(figma: Any, components: string[], liveDir: string, wrapOne?: string): Promise<Record<string, number>> {
  rmSync(liveDir, { recursive: true, force: true });
  mkdirSync(liveDir, { recursive: true });
  const sizes: Record<string, number> = {};
  for (const name of components) {
    const result = await new AsyncFunction("figma", buildComponentsReadbackScript(name))(figma);
    const json = JSON.stringify(result);
    sizes[name] = json.length;
    // One file saved the way an MCP might wrap it, to exercise the lenient parser.
    writeFileSync(join(liveDir, `${name}.json`), name === wrapOne ? JSON.stringify({ success: true, result: json }) : json, "utf-8");
  }
  return sizes;
}

function runInit(projectDir: string, liveDir: string): string {
  return execFileSync(process.execPath, ["src/cli.ts", "figma-components-pull", "--project-dir", projectDir, "--live-data", liveDir, "--init"], { cwd: cliDir, encoding: "utf-8" });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const failures: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) failures.push(msg); };

const { sources } = buildFigmaComponentsPushPlanWithSources(
  resolve(repoRoot, "Demo/out/Code tokens (consumables)/sdsgt-demo"),
  resolve(repoRoot, "Demo/sdsgt-demo-app/src/components/ui"),
);
const records = sources.records;
const components = [...new Set(records.map((r) => r.component))];
const projectDir = join(workDir, "project");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(projectDir, { recursive: true });
writeFileSync(join(projectDir, "figma-components-sources.json"), serializeFigmaComponentsSources(sources), "utf-8");

// (a) Faithful mock.
{
  const vars = new MockVariables();
  const page = buildMockFile(records, vars);
  const sizes = await readBack(mockFigma(page, vars), components, join(workDir, "live-a"), "Card");
  const out = runInit(projectDir, join(workDir, "live-a"));
  const total = records.length;
  check(out.includes(`${total} of ${total} intended component bindings match Figma exactly.`), `(a) expected all ${total} bindings matched`);
  check(out.includes("Everything the push meant to bind is bound exactly as intended."), "(a) expected the all-clear line");
  check(!out.includes("\n  - "), `(a) expected no listed problems, got:\n${out}`);
  const snap = JSON.parse(readFileSync(join(projectDir, "figma-components-sync-snapshot.json"), "utf-8"));
  check(snap.bindings.length === total && snap.bindings.every((b: Any) => b.live.variable === b.intended), "(a) snapshot: every binding should record its intended variable as live");
  check(Object.keys(snap.components).length === components.length, "(a) snapshot: every component should have node IDs");
  const sorted = Object.entries(sizes).sort((x, y) => y[1] - x[1]);
  const totalBytes = Object.values(sizes).reduce((x, y) => x + y, 0);
  console.log(`(a) faithful mock: ${failures.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`    read-back size: ${totalBytes} bytes total for ${components.length} component sets (${records.length} bindings); largest: ${sorted.slice(0, 5).map(([n, s]) => `${n} ${s}`).join(", ")}`);
}

// (b) Faulty mock.
{
  const before = failures.length;
  const vars = new MockVariables();
  const page = buildMockFile(records, vars);
  const set = (name: string) => page.children.find((s) => s.name === name)!;
  const comp = (setName: string, combo: string) => set(setName).children.find((c) => c.name === combo)!;
  const rec = (component: string, combo: string, property: string, part?: string) => records.find((r) => r.component === component && comboLabel(r.combination) === combo && r.property === property && r.part === part)!;

  // 1. Swapped binding: Button Default's fill -> Destructive's fill variable.
  const bCombo = "Variant=Default, Size=Default, State=Default";
  const intendedFill = rec("Button", bCombo, "fill").variable;
  const otherFill = rec("Button", "Variant=Destructive, Size=Default, State=Default", "fill").variable;
  comp("Button", bCombo).fills = [boundPaint(vars, otherFill)];
  // 2. Typed raw value: Badge Default's radius unbound and set to 13px.
  const badgeCombo = "Variant=Default, State=Default";
  const badge = comp("Badge", badgeCombo);
  for (const k of ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]) { delete badge.boundVariables[k]; badge[k] = 13; }
  // 3. Split padding: Toggle Default's right padding bound to another spacing variable.
  const tCombo = "Variant=Default, Size=Default, State=Default";
  const tIntended = rec("Toggle", tCombo, "paddingHorizontal").variable;
  const otherSpacing = [...new Set(records.map((r) => r.variable))].find((v) => v.startsWith("spacing/") && v !== tIntended)!;
  comp("Toggle", tCombo).boundVariables.paddingRight = alias(vars.idOf(otherSpacing));
  // 4. Renamed layer: Alert Default's PrimaryText -> "Heading".
  const aCombo = "Variant=Default, State=Default";
  comp("Alert", aCombo).findAll((n) => n.name === "PrimaryText")[0].name = "Heading";
  const alertPrimary = records.filter((r) => r.component === "Alert" && comboLabel(r.combination) === aCombo && r.part === "PrimaryText").length;
  // 5. Missing component: Tooltip deleted.
  page.children = page.children.filter((s) => s.name !== "Tooltip");
  const tooltip = records.filter((r) => r.component === "Tooltip").length;

  await readBack(mockFigma(page, vars), components, join(workDir, "live-b"));
  const out = runInit(projectDir, join(workDir, "live-b"));
  const total = records.length;
  const matched = total - 3 - alertPrimary - tooltip;
  const expected = [
    `  - Button [${bCombo}] fill: intended ${intendedFill}, Figma has ${otherFill}`,
    `  - Toggle [${tCombo}] paddingHorizontal: left ${tIntended}, right ${otherSpacing} (intended ${tIntended} everywhere)`,
    `  - Badge [${badgeCombo}] radius: Figma has a typed value (13) (intended ${rec("Badge", badgeCombo, "radius").variable})`,
    `  - Tooltip: no component set by that name in the Figma file (${tooltip} binding(s) not checked)`,
    `  - Alert: layer "PrimaryText" not found in 1 variant(s) (${alertPrimary} binding(s) not checked)`,
    `  - Alert: layer "Heading" in 1 variant(s)`,
  ];
  const got = out.split("\n").filter((l) => l.startsWith("  - "));
  check(out.includes(`${matched} of ${total} intended component bindings match Figma exactly.`), `(b) expected ${matched} of ${total} matched`);
  for (const line of expected) check(got.includes(line), `(b) missing report line: ${line}`);
  for (const line of got) check(expected.includes(line), `(b) unexpected report line: ${line}`);
  check(out.includes("re-push the components"), "(b) expected the re-push hint for a missing layer");
  check(out.includes(`3 binding(s) differ from the push's intent and ${alertPrimary + tooltip} couldn't be checked.`), "(b) expected the summary line");
  console.log(`(b) faulty mock: ${failures.length === before ? "PASS" : "FAIL"}`);
  if (failures.length !== before) console.log(out);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nComponent baseline check passed.");
