// Builds design.md — the per-project guide an AI agent reads before building
// a new page. Contract: contracts-and-seeds.md, "design.md (contract decided —
// not built)." Key rules it follows:
//
// - Describes only what's in the project's current files (token files,
//   components folder, flags the step already receives). Never a saved copy
//   of the setup-form choices; never hex values.
// - Deterministic: same files in, same bytes out.
// - Facts only (user decision 2026-10-21): no "what it's for" descriptions
//   of tokens, type roles or component variants. Semantic token names
//   already say what they're for, and fixed wording would clash with the
//   components' own conventions and go stale once a designer customizes
//   them. Meaning comes from the designer, in the designer-owned blocks.
// - Refreshed, not frozen: `generate` writes it into the code-tokens folder;
//   `scaffold` / `scaffold --update` fill in the parts only a scaffolded
//   project can know (components, final paths) and carry the designer-owned
//   blocks over unchanged.
//
// Two kinds of marked block:
//   designer-owned  — the designer's own text; copied through on every refresh.
//   tool-filled     — sections `generate` can't know; `scaffold` replaces them.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { computeTextPairings } from "./contrast-pairs.ts";
import { readComponentInventory, VENDORED_MANIFEST, type ComponentInventory } from "./components.ts";
import { DARK_FILE, LIGHT_FILE } from "../index.ts";
import type { AgentRulesOptions } from "../project-docs.ts";
import { readJson, type ColorPrimitivesFile, type SemanticFile, type SemanticTree, isSemanticToken } from "../read-tokens.ts";

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

export const DESIGNER_BLOCKS = ["team-conventions", "spacing", "page-patterns"] as const;
export type DesignerBlock = (typeof DESIGNER_BLOCKS)[number];

const designerStart = (name: string) => `<!-- SDSGT designer-owned: ${name} — the tool never changes this block -->`;
const designerEnd = (name: string) => `<!-- SDSGT designer-owned end: ${name} -->`;

const TOOL_SLOTS = ["components", "paths"] as const;
type ToolSlot = (typeof TOOL_SLOTS)[number];

const slotStart = (name: string) => `<!-- SDSGT tool-filled: ${name} -->`;
const slotEnd = (name: string) => `<!-- SDSGT tool-filled end: ${name} -->`;

const DESIGNER_DEFAULTS: Record<DesignerBlock, string> = {
  "team-conventions": "(Your own rules for this project. When these disagree with anything below, these win.)",
  spacing:
    "(For the team to fill in. Until then, agents pick steps from the scale above and the designer reviews them. Once filled in — typically with rules taken from approved pages — agents follow it.)",
  "page-patterns":
    "(For the team to fill in. Record page structures approved on real pages here — e.g. which backgrounds, components and type roles a settings page or a form uses. Until then, agents build each page from the tokens and components in this file, for the designer to review. Once filled in, agents follow it.)",
};

function designerBlock(name: DesignerBlock, content: string): string {
  return [designerStart(name), content.trim(), designerEnd(name)].join("\n");
}

function toolSlot(name: ToolSlot, content: string): string {
  return [slotStart(name), content.trim(), slotEnd(name)].join("\n");
}

// Inner text of a marked block, or null when either marker is missing or out of order.
function extractBetween(text: string, start: string, end: string): string | null {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s < 0 || e < 0 || e < s) return null;
  return text.slice(s + start.length, e).trim();
}

function replaceBetween(text: string, start: string, end: string, inner: string): string {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s < 0 || e < 0 || e < s) return text;
  return `${text.slice(0, s + start.length)}\n${inner.trim()}\n${text.slice(e)}`;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

// AGENTS.md's switches plus the few extra facts design.md's summary and the
// known-limit rules need (each from a flag `generate` already receives).
export interface DesignMdOptions extends AgentRulesOptions {
  framework?: string; // from --framework, when passed
  hasBootstrap: boolean;
  hasMd2: boolean;
  hasMd3: boolean;
  hasSwiftui: boolean;
}

const FRAMEWORK_NAMES: Record<string, string> = {
  nextjs: "Next.js",
  vuejs: "Vue.js",
  "react-native": "React Native (Expo)",
};

function componentLibraryName(o: DesignMdOptions): string | null {
  if (o.hasShadcn) return o.framework === "vuejs" ? "shadcn-vue" : "shadcn/ui";
  if (o.hasRnr) return "React Native Reusables";
  if (o.hasRnPaper) return "React Native Paper";
  if (o.hasVuetify) return "Vuetify";
  if (o.hasBootstrap) return o.framework === "vuejs" ? "bootstrap-vue-next" : "React-Bootstrap";
  if (o.hasMd2) return "MUI";
  if (o.hasMd3) return "Jetpack Compose Material 3";
  if (o.hasSwiftui) return "SwiftUI";
  return null;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

const code = (s: string) => `\`${s}\``;
const px = (v: string) => v.replace(/px$/, "") + "px";

function sectionSummary(tokensDir: string, o: DesignMdOptions): string {
  const rows: string[][] = [];
  if (o.framework && FRAMEWORK_NAMES[o.framework]) rows.push(["Framework", FRAMEWORK_NAMES[o.framework]]);
  const lib = componentLibraryName(o);
  if (lib) rows.push(["Component library", lib]);

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  rows.push([
    "Modes",
    hasLight && hasDark
      ? "light and dark"
      : hasLight
        ? "light only — no dark mode file was generated; don't assume one exists"
        : "dark only — no light mode file was generated; don't assume one exists",
  ]);

  const primitives = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json")).color.primitive;
  rows.push(["Brand color ramps", ["brand", ...(primitives["brand-secondary"] ? ["brand-secondary"] : [])].map(code).join(", ")]);

  const typePrim = readTypographyPrimitives(tokensDir);
  const roles = readTypeRoles(tokensDir);
  const fontRows = Object.entries(typePrim.fontFamily).map(([slot, token]) => {
    const used = roles.filter((r) => r.familySlot === slot).map((r) => r.role);
    return `${token.$value} (${used.length ? used.join(", ") : "not used by any type role"})`;
  });
  rows.push(["Fonts", fontRows.join("; ")]);

  return ["## 1. Summary", "", table(["", ""], rows)].join("\n");
}

// Related tokens share one row: a token joins the row of the longest other
// token in its group whose name it extends with "-" (action.primary-hover ->
// action.primary; status.error-bg -> status.error). Decided 2026-10-21.
function groupColorTokens(names: string[]): Array<{ group: string; base: string; members: string[] }> {
  const rows = new Map<string, { group: string; base: string; members: string[] }>();
  for (const name of names) {
    const [group, ...rest] = name.split(".");
    const leaf = rest.join(".");
    const siblings = names.filter((n) => n.startsWith(`${group}.`)).map((n) => n.slice(group.length + 1));
    const base = siblings.filter((s) => s !== leaf && leaf.startsWith(`${s}-`)).sort((a, b) => b.length - a.length)[0] ?? leaf;
    // Walk to the root base so chains (a -> a-b -> a-b-c) all join a's row.
    let root = base;
    for (;;) {
      const parent = siblings.filter((s) => s !== root && root.startsWith(`${s}-`)).sort((a, b) => b.length - a.length)[0];
      if (!parent) break;
      root = parent;
    }
    const key = `${group}.${root}`;
    if (!rows.has(key)) rows.set(key, { group, base: key, members: [] });
    if (name !== key) rows.get(key)!.members.push(name);
  }
  return [...rows.values()];
}

function semanticNames(tree: SemanticTree, path: string[] = []): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    if (isSemanticToken(v)) out.push([...path, k].join("."));
    else out.push(...semanticNames(v, [...path, k]));
  }
  return out;
}

const GROUP_ORDER = ["background", "text", "action", "border", "status", "overlay"];

function sectionColors(tokensDir: string): string {
  const file = existsSync(join(tokensDir, LIGHT_FILE)) ? LIGHT_FILE : DARK_FILE;
  const names = semanticNames(readJson<SemanticFile>(join(tokensDir, file)).color.semantic);
  const rows = groupColorTokens(names).sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb) || names.indexOf(a.base) - names.indexOf(b.base);
  });

  const groups = [...new Set(rows.map((r) => r.group))];
  const groupLines = groups.map((g) => {
    const tokens = rows
      .filter((r) => r.group === g)
      .map((r) => code(r.base) + (r.members.length ? ` (also ${r.members.map((m) => code(m.slice(r.base.length))).join(", ")})` : ""));
    return `- **${g.charAt(0).toUpperCase() + g.slice(1)}:** ${tokens.join(", ")}`;
  });

  const parts = [
    "## 2. Color roles",
    "",
    "Always use these semantic token names, never raw color values. Exact values live in the generated theme files (see section 8).",
    "",
    ...groupLines,
  ];

  for (const { mode, pairs } of computeTextPairings(tokensDir)) {
    parts.push(
      "",
      `Text-on-background pairings (${mode} mode)`,
      "",
      table(
        ["Text", "On", "Contrast", "Note"],
        pairs.map((p) => [code(p.text), code(p.on), p.ratio === null ? "—" : `${p.ratio.toFixed(1)}:1`, p.note]),
      ),
    );
  }
  parts.push(
    "",
    "Colors here were chosen by the designer. If a pairing is below AA, don't swap tokens to fix it — that decision belongs to the designer.",
  );
  return parts.join("\n");
}

interface TypographyPrimitives {
  fontFamily: Record<string, { $value: string }>;
  fontSize: Record<string, { $value: string }>;
  lineHeight: Record<string, { $value: string }>;
}

function readTypographyPrimitives(tokensDir: string): TypographyPrimitives {
  return readJson<{ typography: { primitive: TypographyPrimitives } }>(join(tokensDir, "typography.primitive.json")).typography.primitive;
}

const TYPE_ROLE_ORDER = ["caption", "body-sm", "body", "body-lg", "heading-sm", "heading-md", "heading-lg", "display"];
const WEIGHT_SUFFIX = /-(regular|medium|semibold|bold|light)$/;

interface TypeRole {
  role: string;
  styles: string[];
  familySlot: string;
  size: string;
  lineHeight: string;
}

function readTypeRoles(tokensDir: string): TypeRole[] {
  type Composite = { $value: { fontFamily: string; fontSize: string; lineHeight: string } };
  const semantic = readJson<{ typography: { semantic: Record<string, Composite> } }>(join(tokensDir, "typography.semantic.json")).typography.semantic;
  const prim = readTypographyPrimitives(tokensDir);
  const lastStep = (ref: string) => ref.replace(/[{}]/g, "").split(".").pop()!;

  const byRole = new Map<string, TypeRole>();
  for (const [name, token] of Object.entries(semantic)) {
    const role = name.replace(WEIGHT_SUFFIX, "");
    if (!byRole.has(role)) {
      byRole.set(role, {
        role,
        styles: [],
        familySlot: lastStep(token.$value.fontFamily),
        size: prim.fontSize[lastStep(token.$value.fontSize)]?.$value ?? "?",
        lineHeight: prim.lineHeight[lastStep(token.$value.lineHeight)]?.$value ?? "?",
      });
    }
    byRole.get(role)!.styles.push(name);
  }
  const rank = (r: string) => (TYPE_ROLE_ORDER.includes(r) ? TYPE_ROLE_ORDER.indexOf(r) : TYPE_ROLE_ORDER.length);
  return [...byRole.values()].sort((a, b) => rank(a.role) - rank(b.role) || (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}

function sectionType(tokensDir: string): string {
  const prim = readTypographyPrimitives(tokensDir);
  const rows = readTypeRoles(tokensDir).map((r) => [
    code(r.role),
    `${px(r.size)} / ${px(r.lineHeight)}`,
    r.styles.map(code).join(", "),
    prim.fontFamily[r.familySlot]?.$value ?? r.familySlot,
  ]);
  return [
    "## 3. Type scale",
    "",
    "Pick a type role, not a raw font size.",
    "",
    table(["Role", "Size / line height", "Styles", "Font"], rows),
  ].join("\n");
}

function readDimensionFile(tokensDir: string, file: string, key: string): Array<[string, string]> {
  const path = join(tokensDir, file);
  if (!existsSync(path)) return [];
  const data = readJson<Record<string, Record<string, { $value: string }>>>(path)[key] ?? {};
  return Object.entries(data).map(([k, t]) => [k, String(t.$value)]);
}

function sectionSpacing(tokensDir: string, existingBlocks: Partial<Record<DesignerBlock, string>>): string {
  const spacing = readDimensionFile(tokensDir, "spacing.json", "spacing").sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
  const radius = readDimensionFile(tokensDir, "radius.json", "radius");
  const breakpoints = readDimensionFile(tokensDir, "breakpoint.json", "breakpoint");

  const parts = [
    "## 4. Spacing, corners and layout",
    "",
    `Spacing scale: ${spacing.map(([k, v]) => `${code(k)} = ${px(v)}`).join(" · ")}`,
    "",
    `Corner radius: ${radius.map(([k, v]) => `${code(k)} = ${k === "full" ? "fully round" : px(v)}`).join(" · ")}`,
  ];
  if (breakpoints.length) parts.push("", `Breakpoints: ${breakpoints.map(([k, v]) => `${code(k)} = ${px(v)}`).join(" · ")}`);

  const gridPath = join(tokensDir, "grid.json");
  if (existsSync(gridPath)) {
    const grid = readJson<{ grid: Record<string, { columns: { $value: number }; margin: { $value: string }; gutter: { $value: string } }> }>(gridPath).grid;
    parts.push(
      "",
      "Grid tiers:",
      "",
      table(
        ["Tier", "Columns", "Page margin", "Gutter"],
        Object.entries(grid).map(([tier, g]) => [code(tier), String(g.columns.$value), px(g.margin.$value), px(g.gutter.$value)]),
      ),
    );
    // Fixed rule (contracts-and-seeds.md, "Fixed defaults"): tiers switch at
    // breakpoint.md and breakpoint.lg. Read from this project's own tokens.
    const md = breakpoints.find(([k]) => k === "md")?.[1];
    const lg = breakpoints.find(([k]) => k === "lg")?.[1];
    if (md && lg && grid.compact && grid.medium && grid.expanded) {
      const mdPx = parseFloat(md);
      const lgPx = parseFloat(lg);
      parts.push("", `Tiers switch at the breakpoints: \`compact\` below ${mdPx}px (\`md\`), \`medium\` ${mdPx}–${lgPx - 1}px, \`expanded\` ${lgPx}px (\`lg\`) and up.`);
    }
  }

  parts.push(
    "",
    "Spacing inside components comes from the components themselves. Page layout spacing comes from the grid tiers above. Spacing between sections and elements is chosen per page — see below.",
    "",
    "### How this project uses spacing and corners",
    "",
    designerBlock("spacing", existingBlocks.spacing ?? DESIGNER_DEFAULTS.spacing),
  );
  return parts.join("\n");
}

export function buildComponentsSlot(inventory: ComponentInventory | null): string {
  if (!inventory) {
    return "No components have been installed in this folder. If this project uses a component library that isn't copied into the project (for example MUI or Vuetify), its components come from the library package and are themed by the generated theme file.";
  }
  const withVariants = inventory.components.filter((c) => c.cva.length || c.props.length);
  const without = inventory.components.filter((c) => !c.cva.length && !c.props.length);

  const rows: string[][] = [];
  for (const c of withVariants) {
    // The component's main cva group (e.g. `buttonVariants` in button.tsx) is
    // labelled by axis alone; any other group by its sub-part name too
    // (`codeBlockLineVariants` -> "CodeBlockLine variant").
    const mainGroup = `${c.name.replace(/-(\w)/g, (_, ch: string) => ch.toUpperCase())}Variants`;
    const partOf = (group: string) => {
      const base = group.replace(/(Variants|Style)$/, "");
      return base.charAt(0).toUpperCase() + base.slice(1);
    };
    const axes = [
      ...c.cva.flatMap((g) =>
        g.axes.map((a) => ({ label: g.name === mainGroup ? a.axis : `${partOf(g.name)} ${a.axis}`, options: a.options, def: a.defaultOption })),
      ),
      ...c.props.map((p) => ({ label: `${p.part} ${p.prop}`, options: p.options, def: p.defaultOption })),
    ];
    axes.forEach((a, i) => {
      rows.push([
        i === 0 ? code(c.name) : "",
        `${a.label}: ${a.options.map((o) => (o === a.def ? `${code(o)} (default)` : code(o))).join(", ")}`,
      ]);
    });
  }

  return [
    `These are the components in ${code(inventory.folder + "/")} as of the last refresh. That folder is always the current list.`,
    "",
    table(["Component", "Variants"], rows),
    "",
    `Also available (no variants): ${without.map((c) => code(c.name)).join(", ")}.`,
    "",
    `Some of these files may have been customized. Check ${code(VENDORED_MANIFEST)} before re-installing any of them (see AGENTS.md).`,
  ].join("\n");
}

function sectionComponents(slotContent: string): string {
  return ["## 5. Components", "", toolSlot("components", slotContent)].join("\n");
}

// Designer-owned (decided 2026-10-21) instead of tool-written recipes: once
// spacing is left to the designer, a fixed recipe adds little, and page
// structure is a design decision.
function sectionPagePatterns(existingBlocks: Partial<Record<DesignerBlock, string>>): string {
  return ["## 6. Page patterns", "", designerBlock("page-patterns", existingBlocks["page-patterns"] ?? DESIGNER_DEFAULTS["page-patterns"])].join("\n");
}

function sectionLimits(o: DesignMdOptions): string {
  // Only topics that exist as AGENTS.md rules today (generate/project-docs.ts).
  const topics: string[] = [];
  if (o.hasUnboundTailwindSpacing) topics.push("spacing utilities that fall back to Tailwind's default");
  if (o.hasShadcn) topics.push("Figma component names, snapped sizes and approximated states");
  if (o.hasRnr) topics.push("React Native Reusables spacing and type-scale binding");
  if (o.hasRnPaper) topics.push("React Native Paper components that must be imported from ./components/");
  if (o.isReactNative && (o.hasTailwind || o.hasRnr)) topics.push("NativeWind's inlineRem setting");
  if (o.hasTailwind || o.hasRnr) topics.push("tailwind-merge overrides across differently-shaped classes");
  if (o.isReactNative) topics.push("custom fonts not loaded on React Native");
  if ((o.hasMd2 && o.framework === "nextjs") || o.hasVuetify) topics.push("shadow tokens not connected to the library's elevation system");
  if (o.hasMd2 || o.hasMd3 || o.hasVuetify || o.hasRnPaper) topics.push("grid tiers switching at web breakpoints, not Material's window sizes");
  return [
    "## 7. Known limits",
    "",
    topics.length
      ? `Known limits are described in AGENTS.md. Topics that apply to this project: ${topics.join("; ")}.`
      : "No known limits apply to this project.",
  ].join("\n");
}

// Fixed candidate list (any stack), each listed only if it exists in `dir`.
const PATH_CANDIDATES: Array<[string, string]> = [
  ["AGENTS.md", "Rules for writing code against the tokens"],
  ["foundations-rules.md", "Accessibility and UX rules"],
  ["css/", "Plain CSS token variables"],
  ["tailwind/", "Tailwind theme files"],
  ["shadcn/", "shadcn/ui theme file"],
  ["src/app/theme.css", "Tailwind theme (tokens as CSS variables)"],
  ["src/app/theme-light.css", "Light mode color variables"],
  ["src/app/theme-dark.css", "Dark mode color variables"],
  ["src/app/globals.css", "Global styles, including the generated theme block"],
  ["src/components/ui/", "Components"],
  ["components/ui/", "Components"],
  [VENDORED_MANIFEST, "Original fingerprint of each installed component (detects customized files)"],
  ["sdsgt-theme-manifest.json", "Fingerprints of generated theme files"],
  ["figma-components-push-plan.json", "Figma component push plan"],
];

export function buildPathsSlot(dir: string): string {
  const rows = PATH_CANDIDATES.filter(([p]) => existsSync(join(dir, p))).map(([p, what]) => [code(p), what]);
  return table(["Path", "What it is"], rows);
}

function sectionPaths(slotContent: string): string {
  return ["## 8. Where things live", "", toolSlot("paths", slotContent)].join("\n");
}

// ---------------------------------------------------------------------------
// Assembly + refresh
// ---------------------------------------------------------------------------

const INTRO = [
  "# design.md",
  "",
  "How to build new pages in THIS project's design system. Rules for writing code live in `AGENTS.md`; accessibility rules live in `foundations-rules.md`.",
  "",
  "Most of this file is rebuilt by the tool from the project's current files whenever tokens are regenerated or the project is updated. Only the marked designer-owned blocks are kept — anything written outside them is replaced. Put your own notes in Team conventions.",
].join("\n");

export function buildDesignMd(tokensDir: string, outDir: string, o: DesignMdOptions, existingBlocks: Partial<Record<DesignerBlock, string>> = {}): string {
  return [
    INTRO,
    ["## Team conventions", "", designerBlock("team-conventions", existingBlocks["team-conventions"] ?? DESIGNER_DEFAULTS["team-conventions"])].join("\n"),
    sectionSummary(tokensDir, o),
    sectionColors(tokensDir),
    sectionType(tokensDir),
    sectionSpacing(tokensDir, existingBlocks),
    sectionComponents("No components have been installed yet. This section fills in when the project is scaffolded."),
    sectionPagePatterns(existingBlocks),
    sectionLimits(o),
    sectionPaths(buildPathsSlot(outDir)),
  ].join("\n\n") + "\n";
}

// The old placeholder written before this builder existed — safe to replace.
function isOldPlaceholder(text: string): boolean {
  return text.includes("isn't built yet") && text.includes("Its content contract is still undecided");
}

export interface DesignerBlocksRead {
  blocks: Partial<Record<DesignerBlock, string>>;
  // Set when an existing file has broken/missing markers: refreshing would lose its content.
  problem?: string;
}

// A block is broken when only one of its markers is there, or they're out of
// order. A block with neither marker counts as new (it gets its default
// text) — unless the file has no designer markers at all, which means it
// wasn't written by this tool (e.g. a hand-written design.md) and is left alone.
export function readDesignerBlocks(existing: string | null): DesignerBlocksRead {
  if (existing === null || isOldPlaceholder(existing)) return { blocks: {} };
  if (!existing.includes("<!-- SDSGT designer-owned:")) {
    return {
      blocks: {},
      problem: "design.md wasn't written by SDSGT (it has no designer-owned block markers) — left untouched so nothing you wrote is lost. Re-run with --force to replace it with the generated version.",
    };
  }
  const blocks: Partial<Record<DesignerBlock, string>> = {};
  const broken: string[] = [];
  for (const name of DESIGNER_BLOCKS) {
    const hasStart = existing.includes(designerStart(name));
    const hasEnd = existing.includes(designerEnd(name));
    if (!hasStart && !hasEnd) continue;
    const inner = extractBetween(existing, designerStart(name), designerEnd(name));
    if (inner === null) broken.push(name);
    else blocks[name] = inner;
  }
  if (broken.length) {
    return {
      blocks,
      problem: `design.md's designer-owned block markers are missing or edited (${broken.join(", ")}) — left untouched so nothing you wrote is lost. Restore the markers, or re-run with --force to rebuild it (any text in those blocks would be lost).`,
    };
  }
  return { blocks };
}

// Scaffold-time refresh: start from generate's fresh design.md, fill the
// tool slots for this project, and carry over the project's designer blocks.
// `force` rebuilds even when markers are broken, keeping whichever blocks
// could still be read.
export function refreshProjectDesignMd(generated: string, projectDir: string, existing: string | null, force = false): { content: string | null; warning?: string } {
  const { blocks, problem } = readDesignerBlocks(existing);
  if (problem && !force) return { content: null, warning: problem };

  let out = generated;
  for (const name of DESIGNER_BLOCKS) {
    if (blocks[name] !== undefined) out = replaceBetween(out, designerStart(name), designerEnd(name), blocks[name]!);
  }
  out = replaceBetween(out, slotStart("components"), slotEnd("components"), buildComponentsSlot(readComponentInventory(projectDir)));
  out = replaceBetween(out, slotStart("paths"), slotEnd("paths"), buildPathsSlot(projectDir));
  return { content: out };
}
