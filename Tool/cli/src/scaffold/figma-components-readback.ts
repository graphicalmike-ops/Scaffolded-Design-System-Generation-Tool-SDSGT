// Component pull, step 2 (2026-10-19): the FIXED read-back script the SDSGT-figma-push skill
// runs in Figma (via `figma_execute` / `use_figma`) at the end of the component push, once per
// component set. It copies what is really bound on every pushed layer into a compact JSON
// object, without interpreting anything; `figma-components-pull.ts` does the comparing.
// Printed by `node src/cli.ts figma-components-readback-script --component <Name>` so the agent
// never improvises it. See docs/component-pull-step2-progress.md for the output shape.
//
// Output (the script's return value):
//   { v: 1, set, id, also?, missing?, vars: [variable names], axes: [[axis, [values]]],
//     parts: [layer names], c: [[combo, componentId, rootProps, [[partIdx, nodeId, props]]]] }
//   combo: value indexes into `axes` (-1 = axis absent), or the raw name when unparseable.
//   props keys: f fill, s stroke, k ring colour, r radii (tl,tr,br,bl), x padding (l,r),
//     y padding (t,b), g itemSpacing, w width, h height, t text colour, l inline-link colour,
//     z font size, n font family.
//   value: integer = bound variable (vars[i]); string = unbound raw value; array = sides or text
//     segments that differ (null = none). Unbound empty values are omitted.

export interface ReadbackProps {
  f?: ReadbackValue;
  s?: ReadbackValue;
  k?: ReadbackValue;
  r?: ReadbackValue;
  x?: ReadbackValue;
  y?: ReadbackValue;
  g?: ReadbackValue;
  w?: ReadbackValue;
  h?: ReadbackValue;
  t?: ReadbackValue;
  l?: ReadbackValue;
  z?: ReadbackValue;
  n?: ReadbackValue;
}

export type ReadbackScalar = number | string | null;
export type ReadbackValue = ReadbackScalar | ReadbackScalar[];

export interface ComponentsReadback {
  v: 1;
  set: string;
  id?: string;
  also?: string[];
  missing?: true;
  vars?: string[];
  axes?: Array<[string, string[]]>;
  parts?: string[];
  c?: Array<[number[] | string, string, ReadbackProps, Array<[number, string, ReadbackProps]>]>;
}

// Layer names the push gives bound layers (SKILL.md step 7; the `part` values of
// figma-components-sources.ts). Sections lines are TEXT layers, picked up by type.
export const READBACK_PART_NAMES = ["PrimaryText", "SecondaryText", "CenterLabelText", "Line", "FlankLine", "Indicator", "Thumb", "Icon", "CenterDot"];

const SCRIPT_BODY = String.raw`
const KNOWN = new Set(__PARTS__);
await figma.loadAllPagesAsync();
const sets = figma.root.findAll((n) => n.type === "COMPONENT_SET" && n.name === SET_NAME);
if (sets.length === 0) return { v: 1, set: SET_NAME, missing: true };
const set = sets[0];
const vars = [], varIdx = new Map(), parts = [], partIdx = new Map(), axes = [], axisIdx = new Map();
async function bound(alias) {
  if (Array.isArray(alias)) return fold(await Promise.all(alias.map(bound)));
  if (!alias || !alias.id) return undefined;
  if (!varIdx.has(alias.id)) {
    const v = await figma.variables.getVariableByIdAsync(alias.id);
    varIdx.set(alias.id, vars.length);
    vars.push(v ? v.name : "?" + alias.id);
  }
  return varIdx.get(alias.id);
}
function fold(list) {
  const norm = list.map((x) => (x === undefined ? null : x));
  if (norm.every((x) => x === null)) return undefined;
  return norm.every((x) => JSON.stringify(x) === JSON.stringify(norm[0])) ? norm[0] : norm;
}
const num = (n) => String(Math.round(n * 100) / 100);
const hex2 = (c) => Math.round(c * 255).toString(16).padStart(2, "0");
async function paint(p) {
  if (!p || p.visible === false) return undefined;
  if (p.boundVariables && p.boundVariables.color) return bound(p.boundVariables.color);
  if (p.type !== "SOLID") return p.type;
  const a = (p.opacity === undefined ? 1 : p.opacity) * (p.color.a === undefined ? 1 : p.color.a);
  if (a < 0.01) return undefined;
  return "#" + hex2(p.color.r) + hex2(p.color.g) + hex2(p.color.b) + (a < 0.995 ? hex2(a) : "");
}
async function firstPaint(paints) {
  if (!Array.isArray(paints)) return undefined;
  for (const p of paints) { const v = await paint(p); if (v !== undefined) return v; }
  return undefined;
}
async function field(node, key) {
  const b = node.boundVariables && node.boundVariables[key];
  if (b) return bound(b);
  const v = node[key];
  return typeof v === "number" && v !== 0 ? num(v) : undefined;
}
async function sides(node, keys) {
  if (!(keys[0] in node)) return undefined;
  const list = [];
  for (const k of keys) list.push(await field(node, k));
  return fold(list);
}
function sizeIsFixed(node, axis) {
  if (node.type === "TEXT") return false;
  if (!("layoutMode" in node) || node.layoutMode === "NONE") return true;
  const primary = (node.layoutMode === "HORIZONTAL") === (axis === "width");
  return (primary ? node.primaryAxisSizingMode : node.counterAxisSizingMode) === "FIXED";
}
async function props(node) {
  const o = {};
  const put = (k, v) => { if (v !== undefined) o[k] = v; };
  if (node.type === "TEXT") {
    const segs = node.getStyledTextSegments(["fills", "textDecoration"]);
    const last = segs[segs.length - 1];
    if (segs.length > 1 && last.textDecoration === "UNDERLINE" && segs[0].textDecoration !== "UNDERLINE") {
      put("t", await firstPaint(segs[0].fills));
      put("l", await firstPaint(last.fills));
    } else if (node.fills === figma.mixed) {
      const list = [];
      for (const s of segs) list.push(await firstPaint(s.fills));
      put("t", fold(list));
    } else put("t", await firstPaint(node.fills));
    const bv = node.boundVariables || {};
    put("z", bv.fontSize ? await bound(bv.fontSize) : node.fontSize === figma.mixed ? fold(node.getStyledTextSegments(["fontSize"]).map((s) => num(s.fontSize))) : num(node.fontSize));
    put("n", bv.fontFamily ? await bound(bv.fontFamily) : node.fontName === figma.mixed ? fold(node.getStyledTextSegments(["fontName"]).map((s) => s.fontName.family)) : node.fontName.family);
  } else {
    if ("fills" in node) put("f", await firstPaint(node.fills));
    if ("strokes" in node) put("s", await firstPaint(node.strokes));
    if ("effects" in node) {
      const e = node.effects.find((x) => x.type === "DROP_SHADOW" && x.visible !== false);
      if (e) put("k", e.boundVariables && e.boundVariables.color ? await bound(e.boundVariables.color) : "#" + hex2(e.color.r) + hex2(e.color.g) + hex2(e.color.b) + (e.color.a < 0.995 ? hex2(e.color.a) : ""));
    }
    put("r", await sides(node, ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]));
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      put("x", await sides(node, ["paddingLeft", "paddingRight"]));
      put("y", await sides(node, ["paddingTop", "paddingBottom"]));
      put("g", await field(node, "itemSpacing"));
    }
  }
  for (const [key, axis] of [["w", "width"], ["h", "height"]]) {
    const b = node.boundVariables && node.boundVariables[axis];
    if (b) put(key, await bound(b));
    else if (sizeIsFixed(node, axis)) put(key, num(node[axis]));
  }
  return o;
}
function hasBinding(node) {
  if (node.boundVariables && Object.keys(node.boundVariables).length > 0) return true;
  const paints = [].concat(Array.isArray(node.fills) ? node.fills : [], Array.isArray(node.strokes) ? node.strokes : []);
  return paints.some((p) => p.boundVariables && p.boundVariables.color) || (Array.isArray(node.effects) && node.effects.some((e) => e.boundVariables && e.boundVariables.color));
}
function combo(name) {
  const pairs = name.split(", ").map((p) => p.split("="));
  if (pairs.some((p) => p.length !== 2)) return name;
  const out = axes.map(() => -1);
  for (const [k, v] of pairs) {
    if (!axisIdx.has(k)) { axisIdx.set(k, axes.length); axes.push([k, []]); out.push(-1); }
    const values = axes[axisIdx.get(k)][1];
    if (!values.includes(v)) values.push(v);
    out[axisIdx.get(k)] = values.indexOf(v);
  }
  return out;
}
const c = [];
for (const comp of set.children) {
  if (comp.type !== "COMPONENT") continue;
  const list = [];
  for (const node of comp.findAll((n) => n.type === "TEXT" || KNOWN.has(n.name) || n.name.startsWith("Section:") || hasBinding(n))) {
    if (!partIdx.has(node.name)) { partIdx.set(node.name, parts.length); parts.push(node.name); }
    list.push([partIdx.get(node.name), node.id, await props(node)]);
  }
  c.push([combo(comp.name), comp.id, await props(comp), list]);
}
const width = axes.length;
for (const entry of c) if (Array.isArray(entry[0])) while (entry[0].length < width) entry[0].push(-1);
const out = { v: 1, set: SET_NAME, id: set.id, vars, axes, parts, c };
if (sets.length > 1) out.also = sets.slice(1).map((s) => s.id);
return out;
`;

// The script for one component set, ready to paste into `figma_execute` / `use_figma`.
export function buildComponentsReadbackScript(componentName: string): string {
  return [
    `// SDSGT component pull baseline: read-back for component set ${JSON.stringify(componentName)}. Generated by`,
    "// `node src/cli.ts figma-components-readback-script` — paste verbatim, don't edit. Read-only.",
    `const SET_NAME = ${JSON.stringify(componentName)};`,
    SCRIPT_BODY.replace("__PARTS__", JSON.stringify(READBACK_PART_NAMES)).trim(),
    "",
  ].join("\n");
}
