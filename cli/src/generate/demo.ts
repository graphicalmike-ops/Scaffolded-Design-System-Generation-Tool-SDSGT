// Generate-stage proof-of-work pages — one self-contained
// "<platform>-design-system-demo.html" per platform flag Generate actually
// ran, written alongside that platform's real code-token files. Same visual
// system as Promote's report.html (see report/html-utils.ts,
// "buildPageStyleCss" — literally the same style block), but every value is
// labeled with the REAL identifier that platform's generator wrote, not the
// DTCG spec's own naming — e.g. Tailwind shows `--color-primitive-brand-50`
// (its relabeled CSS custom property), MUI shows `colors.brand[50]` /
// `palette.primary.main` (its TS export shape), MD3 shows
// `LightColorScheme.primary` (its Kotlin ColorScheme field), SwiftUI shows
// `DesignTokens.Light.backgroundPrimary` (its Swift enum property) — so this
// page is an accurate preview of what a developer actually imports for this
// project, not a re-skinned copy of the token spec.
//
// Deliberately reads the DTCG token spec directly (like bootstrap.ts/
// md2.ts/md3.ts/swiftui.ts do) rather than taking a SeedConfig — Generate
// never receives the original seed, only tokensDir/outDir plus explicit
// opt-in flags, same architecture as every other generator here.
//
// Scope note: each platform's demo only shows what that platform's own
// generator actually produces. Typography/spacing/radius/shadow/opacity/
// fixed-defaults ARE shown for Tailwind/Bootstrap/MUI because the base CSS
// platform (index.ts's generateCodeTokens, which always runs regardless of
// flags) emits real CSS custom properties for every one of those groups
// under the exact same names shown here. MD3 and SwiftUI generators don't
// touch those groups at all (see md3.ts/swiftui.ts file headers) — their
// demos say so plainly instead of fabricating Kotlin/Swift constants that
// don't exist.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { argbFromHex, hexFromArgb } from "@material/material-color-utilities";

import { escapeHtml, textOn, shadowDisplay, buildPageStyleCss, stageBannerHtml } from "../report/html-utils.ts";
import type { TypographySpecimen } from "../report/index.ts";
import { LIGHT_FILE, DARK_FILE, type GenerateResult } from "./index.ts";
import { readJson, resolveAlias, type ColorPrimitivesFile, type RadiusFile, type SemanticFile } from "./read-tokens.ts";
import { STEP_RELABEL as TAILWIND_STEP_RELABEL } from "./tailwind.ts";
import { STEP_RELABEL as MUI_STEP_RELABEL, STATUS_ROLE_TO_MUI } from "./md2.ts";
import { STATUS_ROLE_TO_BOOTSTRAP, RADIUS_KEY_TO_BOOTSTRAP, pxToRem } from "./bootstrap.ts";
import { buildScheme, COLOR_SCHEME_ROLES, surfaceColorAtElevation, SHADOW_KEYS, type ShadowFile } from "./md3.ts";
import { augmentColor } from "./mui-color.ts";
import { toSwiftPropertyName } from "./swiftui.ts";
import { resolveShadcnVars } from "./shadcn.ts";
import { hexToHslTriplet } from "./rnr.ts";
import { PAPER_SCHEME_ROLES } from "./rn-paper.ts";
import { STATUS_ROLE_TO_VUETIFY, resolveSemanticPath } from "./vuetify.ts";

type Primitives = ColorPrimitivesFile["color"]["primitive"];
type StatusRoleNum = "1" | "2" | "3" | "4" | "5";
const RAMP_STEPS = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "1000", "1100"] as const;

// Fixed by "Boilerplate status-color formula" (contracts-and-seeds.md) —
// role 1..5 always maps to this order. Not exported anywhere as a
// standalone table today, so restated here for display purposes only.
const STATUS_ROLE_NAMES: Record<StatusRoleNum, string> = {
  "1": "error",
  "2": "success",
  "3": "warning",
  "4": "info",
  "5": "promo",
};

function textOnAny(raw: string): string {
  if (raw.startsWith("#")) return textOn(raw);
  const m = raw.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s.trim()));
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#1F201D" : "#FFFFFF";
  }
  return "#FFFFFF";
}

// --- Reading the rest of the token spec directly (typography/spacing/etc,
// same DTCG shapes promote/report/index.ts's ReportData already documents) ---

interface TypographyPrimitiveFile {
  typography: {
    primitive: {
      fontFamily: Record<string, { $value: string }>;
      fontWeight: Record<string, { $value: number }>;
      fontSize: Record<string, { $value: string }>;
      lineHeight: Record<string, { $value: string }>;
    };
  };
}
interface TypographySemanticFile {
  typography: {
    semantic: Record<string, { $value: { fontFamily: string; fontWeight: string; fontSize: string; lineHeight: string } }>;
  };
}
interface SpacingFile {
  spacing: Record<string, { $value: string }>;
}
interface OpacityFile {
  opacity: Record<string, { $value: number }>;
}
interface BorderWidthFile {
  "border-width": Record<string, { $value: string }>;
}
interface BreakpointFile {
  breakpoint: Record<string, { $value: string }>;
}
interface GridFile {
  grid: Record<string, { columns: { $value: number }; margin: { $value: string }; gutter: { $value: string } }>;
}

function tryReadJson<T>(path: string): T | undefined {
  try {
    return readJson<T>(path);
  } catch {
    return undefined;
  }
}

function resolveTypographyRef(ref: string, primitive: TypographyPrimitiveFile["typography"]["primitive"]): string | number {
  const [, group, key] = ref.replace(/[{}]/g, "").split(".").slice(1); // drop leading "typography"
  const node = (primitive as any)[group]?.[key];
  return node?.$value;
}

interface CommonGroups {
  headingFont: string;
  bodyFont: string;
  typeSpecimens: TypographySpecimen[];
  spacing?: SpacingFile["spacing"];
  radius?: RadiusFile["radius"];
  shadow?: ShadowFile["shadow"];
  opacity?: OpacityFile["opacity"];
  borderWidth?: BorderWidthFile["border-width"];
  breakpoint?: BreakpointFile["breakpoint"];
  grid?: GridFile["grid"];
}

function loadCommonGroups(tokensDir: string): CommonGroups {
  const typoPrimitiveFile = tryReadJson<TypographyPrimitiveFile>(join(tokensDir, "typography.primitive.json"));
  const typoSemanticFile = tryReadJson<TypographySemanticFile>(join(tokensDir, "typography.semantic.json"));
  const primitive = typoPrimitiveFile?.typography.primitive;
  const headingFont = primitive?.fontFamily.primary?.$value ?? "system-ui";
  const bodyFont = primitive?.fontFamily.secondary?.$value ?? headingFont;

  const typeSpecimens: TypographySpecimen[] = [];
  if (primitive && typoSemanticFile) {
    for (const [token, entry] of Object.entries(typoSemanticFile.typography.semantic)) {
      const family = String(resolveTypographyRef(entry.$value.fontFamily, primitive));
      const weight = Number(resolveTypographyRef(entry.$value.fontWeight, primitive));
      const size = parseInt(String(resolveTypographyRef(entry.$value.fontSize, primitive)), 10);
      const lineHeight = parseInt(String(resolveTypographyRef(entry.$value.lineHeight, primitive)), 10);
      typeSpecimens.push({ token, family, weight, size, lineHeight });
    }
  }

  return {
    headingFont,
    bodyFont,
    typeSpecimens,
    spacing: tryReadJson<SpacingFile>(join(tokensDir, "spacing.json"))?.spacing,
    radius: tryReadJson<RadiusFile>(join(tokensDir, "radius.json"))?.radius,
    shadow: tryReadJson<ShadowFile>(join(tokensDir, "shadow.json"))?.shadow,
    opacity: tryReadJson<OpacityFile>(join(tokensDir, "opacity.json"))?.opacity,
    borderWidth: tryReadJson<BorderWidthFile>(join(tokensDir, "border-width.json"))?.["border-width"],
    breakpoint: tryReadJson<BreakpointFile>(join(tokensDir, "breakpoint.json"))?.breakpoint,
    grid: tryReadJson<GridFile>(join(tokensDir, "grid.json"))?.grid,
  };
}

// --- Generic value-group renderers, all using the base CSS platform's own
// `--<kebab-path>` naming (identical across every target, since the base
// CSS platform always runs regardless of which platform flag was passed) ---

function typographySectionHtml(specimens: TypographySpecimen[]): string {
  return specimens
    .map(
      (t) => `<div class="type-row">
        <div class="type-meta"><code>--typography-semantic-${escapeHtml(t.token)}</code><span>${escapeHtml(t.family)} ${t.weight} · ${t.size}/${t.lineHeight}px</span></div>
        <div class="type-sample" style="font-family:'${escapeHtml(t.family)}',var(--font-fallback);font-weight:${t.weight};font-size:${t.size}px;line-height:${t.lineHeight}px">The quick brown fox jumps over the lazy dog</div>
      </div>`,
    )
    .join("\n");
}

function spacingSectionHtml(spacing: SpacingFile["spacing"]): string {
  const maxPx = Math.max(...Object.values(spacing).map((v) => parseInt(v.$value, 10)));
  return Object.entries(spacing)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => {
      const px = parseInt(v.$value, 10);
      const barPx = Math.max(2, Math.round((px / Math.max(maxPx, 1)) * 160));
      return `<div class="spacing-row"><code class="spacing-key">--spacing-${escapeHtml(key)}</code><div class="spacing-track"><div class="spacing-bar" style="width:${barPx}px"></div></div><span class="spacing-px">${v.$value}</span></div>`;
    })
    .join("\n");
}

function radiusSectionHtml(radius: RadiusFile["radius"]): string {
  return Object.entries(radius)
    .map(([key, v]) => {
      const px = Math.min(parseInt(v.$value, 10), 28);
      return `<div class="radius-item"><div class="radius-box" style="border-radius:${px}px"></div><code>--radius-${escapeHtml(key)}</code><span>${v.$value}</span></div>`;
    })
    .join("\n");
}

function shadowSectionHtml(shadow: ShadowFile["shadow"]): string {
  return Object.entries(shadow)
    .map(([key, v]) => {
      const { css, label } = shadowDisplay(v);
      return `<div class="shadow-item"><div class="shadow-box" style="box-shadow:${css}"></div><code>--shadow-${escapeHtml(key)}</code><span>${escapeHtml(label)}</span></div>`;
    })
    .join("\n");
}

function opacitySectionHtml(opacity: OpacityFile["opacity"]): string {
  return Object.entries(opacity)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => `<div class="opacity-item"><div class="opacity-box"><div style="background:rgba(31,32,29,${v.$value})"></div></div><code>--opacity-${escapeHtml(key)}</code></div>`)
    .join("\n");
}

function borderWidthSectionHtml(borderWidth: BorderWidthFile["border-width"]): string {
  return Object.entries(borderWidth)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => `<div class="bw-item"><div class="bw-line" style="border-bottom-width:${v.$value}"></div><code>--border-width-${escapeHtml(key)}</code><span>${v.$value}</span></div>`)
    .join("\n");
}

function breakpointSectionHtml(breakpoint: BreakpointFile["breakpoint"]): string {
  return Object.entries(breakpoint)
    .map(([key, v]) => `<div class="spec-row"><code>--breakpoint-${escapeHtml(key)}</code><span>${v.$value}</span></div>`)
    .join("\n");
}

function gridSectionHtml(grid: GridFile["grid"]): string {
  return Object.entries(grid)
    .map(([tier, g]) => `<div class="grid-tier"><code>--grid-${escapeHtml(tier)}-*</code><span>${g.columns.$value} columns · ${g.margin.$value} margin · ${g.gutter.$value} gutter</span></div>`)
    .join("\n");
}

function commonValueSections(groups: CommonGroups): string {
  return `
  <section>
    <h2>Typography</h2>
    ${typographySectionHtml(groups.typeSpecimens)}
  </section>

  <section>
    <h2>Spacing</h2>
    ${groups.spacing ? spacingSectionHtml(groups.spacing) : "<p>Not generated for this token spec.</p>"}
  </section>

  <section>
    <h2>Radius</h2>
    <div class="radius-strip">${groups.radius ? radiusSectionHtml(groups.radius) : ""}</div>
  </section>

  <section>
    <h2>Shadow</h2>
    <div class="shadow-strip">${groups.shadow ? shadowSectionHtml(groups.shadow) : ""}</div>
  </section>

  <section>
    <h2>Opacity</h2>
    <div class="opacity-strip">${groups.opacity ? opacitySectionHtml(groups.opacity) : ""}</div>
  </section>

  <section>
    <h2>Fixed defaults</h2>
    <h3>Border width</h3>
    <div class="bw-strip">${groups.borderWidth ? borderWidthSectionHtml(groups.borderWidth) : ""}</div>
    <h3>Breakpoints</h3>
    ${groups.breakpoint ? breakpointSectionHtml(groups.breakpoint) : ""}
    <h3>Grid</h3>
    ${groups.grid ? gridSectionHtml(groups.grid) : ""}
  </section>`;
}

// --- Color primitives ramp + status, relabeled per platform ---

interface RampLabels {
  ramp: (group: "brand" | "brand-secondary" | "neutral") => string;
  staticColor: () => string;
  status: (roleNum: StatusRoleNum, tone: "100" | "200") => string;
}

function rampRowHtml(label: string, cells: ReadonlyArray<readonly [string, string]>): string {
  const cellsHtml = cells
    .map(([step, hex]) => {
      const fg = textOn(hex);
      const baseAttr = step === "600" || step === "500" ? ' data-base="true"' : "";
      return `<div class="swatch"${baseAttr} style="background:${hex};color:${fg}"><span class="swatch-step">${escapeHtml(step)}</span><span class="swatch-hex">${hex}</span></div>`;
    })
    .join("");
  return `<div class="ramp-row"><div class="ramp-label">${escapeHtml(label)}</div><div class="ramp-cells">${cellsHtml}</div></div>`;
}

function primitivesSectionHtml(primitives: Primitives, labels: RampLabels, stepRelabel: Record<string, string> | null): string {
  const rampCells = (group: Record<string, { $value: string }>) =>
    RAMP_STEPS.map((step) => {
      const displayStep = stepRelabel ? stepRelabel[step] : step;
      if (!displayStep) return null; // dropped step (MUI has no 1100 slot)
      return [displayStep, group[step].$value] as const;
    }).filter((c): c is readonly [string, string] => c !== null);

  const rows = [rampRowHtml(labels.ramp("brand"), rampCells(primitives.brand))];
  if (primitives["brand-secondary"]) {
    rows.push(rampRowHtml(labels.ramp("brand-secondary"), rampCells(primitives["brand-secondary"])));
  }
  rows.push(rampRowHtml(labels.ramp("neutral"), rampCells(primitives.neutral)));

  const staticRow = rampRowHtml(labels.staticColor(), [
    ["100", primitives.static["100"].$value],
    ["200", primitives.static["200"].$value],
  ]);

  const statusHtml = (["1", "2", "3", "4", "5"] as StatusRoleNum[])
    .map((n) => {
      const tone = primitives.status[n];
      const t100 = tone["100"].$value;
      const t200 = tone["200"].$value;
      const fgDark = textOn(t200);
      return `<div class="status-card">
        <div class="status-chip" style="background:${t100};color:${t200}">${escapeHtml(STATUS_ROLE_NAMES[n])}</div>
        <div class="status-tone" style="background:${t100}"><span>${escapeHtml(labels.status(n, "100"))}</span><code>${t100}</code></div>
        <div class="status-tone" style="background:${t200};color:${fgDark}"><span>${escapeHtml(labels.status(n, "200"))}</span><code>${t200}</code></div>
      </div>`;
    })
    .join("\n");

  return `${rows.join("\n")}\n${staticRow}\n<div class="ramp-label">status</div><div class="status-strip">${statusHtml}</div>`;
}

// --- Semantic color, relabeled per platform (css var name or Swift property) ---

interface SemVal {
  $value: string;
}
type SemTree = { [key: string]: SemVal | SemTree };

function isSemToken(node: SemVal | SemTree): node is SemVal {
  return typeof (node as SemVal).$value === "string";
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

function resolveSemanticValue(raw: string, primitives: Primitives): string {
  return raw.startsWith("{") ? resolveAlias(raw, primitives) : raw;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function semanticSectionHtml(
  primitives: Primitives,
  tokensDir: string,
  modes: Array<"light" | "dark">,
  labelFor: (path: string[], mode: "light" | "dark") => string,
): string {
  const panels = modes
    .map((mode) => {
      const file = mode === "light" ? LIGHT_FILE : DARK_FILE;
      const { color } = readJson<{ color: { semantic: SemTree } }>(join(tokensDir, file));
      const flat = flattenSemantic(color.semantic);

      const groups = new Map<string, Array<{ path: string[]; raw: string }>>();
      for (const item of flat) {
        const groupName = item.path[0];
        if (!groups.has(groupName)) groups.set(groupName, []);
        groups.get(groupName)!.push(item);
      }

      const groupsHtml = [...groups.entries()]
        .map(([groupName, items]) => {
          const itemsHtml = items
            .map(({ path, raw }) => {
              const hex = resolveSemanticValue(raw, primitives);
              return `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${escapeHtml(labelFor(path, mode))}</div><code class="token-hex">${escapeHtml(hex)}</code></div>`;
            })
            .join("");
          return `<div class="token-group"><div class="token-group-title">${escapeHtml(capitalize(groupName))}</div><div class="token-grid">${itemsHtml}</div></div>`;
        })
        .join("\n");

      const primaryRaw = flat.find((f) => f.path.join(".") === "action.primary")?.raw;
      const primaryHex = primaryRaw ? resolveSemanticValue(primaryRaw, primitives) : "#000000";
      const hasSecondary = flat.some((f) => f.path.join(".") === "action.secondary");
      const isDark = mode === "dark";

      return `<div class="semantic-panel${isDark ? " dark" : ""}" data-mode="${mode}">
        <div class="demo-row">
          <button class="demo-btn" style="background:${primaryHex};color:${textOnAny(primaryHex)}" disabled>${escapeHtml(labelFor(["action", "primary"], mode))}</button>
          ${hasSecondary ? `<button class="demo-btn secondary" disabled>${escapeHtml(labelFor(["action", "secondary"], mode))}</button>` : ""}
        </div>
        ${groupsHtml}
      </div>`;
    })
    .join("\n");

  const toggleHtml =
    modes.length > 1
      ? `<div class="mode-toggle" role="group" aria-label="Preview mode">
          <button type="button" class="mode-btn" data-target="light" aria-pressed="true" onclick="setMode('light')">Light</button>
          <button type="button" class="mode-btn" data-target="dark" aria-pressed="false" onclick="setMode('dark')">Dark</button>
        </div>`
      : `<p class="single-mode-note">Generated for ${modes[0]} mode only.</p>`;

  return `${toggleHtml}\n${panels}`;
}

const MODE_SCRIPT = (hasBoth: boolean) => `<script>
  document.querySelectorAll('.semantic-panel').forEach(function (p) {
    p.setAttribute('data-active', p.dataset.mode === 'light' ? 'true' : ${hasBoth ? "'false'" : "'true'"});
  });
  function setMode(mode) {
    document.querySelectorAll('.semantic-panel').forEach(function (p) {
      p.setAttribute('data-active', p.dataset.mode === mode ? 'true' : 'false');
    });
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.target === mode));
    });
  }
</script>`;

// --- Page shell ---

function renderDemoPage(opts: {
  platformTitle: string;
  // Short, plain-language description of how these tokens were adapted for
  // this platform — shown at the top of the page (see report/html-utils.ts,
  // "stageBannerHtml") so it's the first thing a human reads, distinct from
  // Promote's report.html which flags itself as platform-agnostic instead.
  adaptedSummary: string;
  brandHex: string;
  headingFont: string;
  bodyFont: string;
  runFields: Array<[string, string]>;
  bodyHtml: string;
  generatedFiles: string[];
  hasBothModes: boolean;
}): string {
  const runFieldsHtml = opts.runFields.map(([label, value]) => `<div class="run-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n");
  const fileListHtml = opts.generatedFiles.map((f) => `<li>${escapeHtml(f)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.platformTitle)} design system demo</title>
${buildPageStyleCss({ fontFacesCss: "", brandHex: opts.brandHex, bodyFont: escapeHtml(opts.bodyFont), headingFont: escapeHtml(opts.headingFont) })}
</head>
<body>
<div class="page">
  <header class="run">
    <p class="eyebrow">SDSGT · generate output</p>
    <h1>${escapeHtml(opts.platformTitle)} design system demo</h1>
    ${stageBannerHtml("adapted", `Adapted to ${opts.platformTitle}`, ` ${opts.adaptedSummary}`)}
    <dl class="run-grid">
      ${runFieldsHtml}
    </dl>
  </header>

  ${opts.bodyHtml}

  <footer>
    <p>Files generated for this target:</p>
    <ul>${fileListHtml}</ul>
  </footer>
</div>
${MODE_SCRIPT(opts.hasBothModes)}
</body>
</html>
`;
}

function baseCssFiles(hasLight: boolean, hasDark: boolean): string[] {
  return ["css/tokens.css", ...(hasLight ? ["css/light.css"] : []), ...(hasDark ? ["css/dark.css"] : [])];
}

function writeDemo(outDir: string, filename: string, html: string): GenerateResult {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, filename), html, "utf-8");
  return { filesWritten: [filename] };
}

const STATUS_BADGE_ROLES = ["destructive", "success", "warning", "info", "promo"] as const;

// Shared by every Layer 2 demo page (shadcn/RNR/RN Paper/Vuetify) — hand-built
// HTML/CSS previews of common UI patterns (button, card, field, status
// badges, alert), NOT real installed library component code (that's
// separate, not-yet-built work — see each page's own "Not yet built for
// this target" section). Colors are resolved uniformly via
// resolveShadcnVars for every caller, not each platform's own native color
// computation (RN Paper's HCT roles, Vuetify's base-color set) — this
// section is illustrative, not a claim about any one library's exact
// runtime output, and resolveShadcnVars is already the tested, bug-fixed
// full semantic resolution this project has (see shadcn.ts's
// --destructive-foreground fix) rather than three more per-platform color
// mappings for a section that doesn't need per-platform exactness.
function componentsSectionHtml(tokensDir: string, platformLabel: string): string {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const radiusToken = tryReadJson<RadiusFile>(join(tokensDir, "radius.json"))?.radius.md;
  const radiusPx = radiusToken ? parseFloat(String(radiusToken.$value)) : 6;

  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];

  const panelHtml = (mode: "light" | "dark") => {
    const file = mode === "light" ? LIGHT_FILE : DARK_FILE;
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, file));
    const vars = resolveShadcnVars(semanticRoot.semantic, primitives);
    const byVar = new Map(vars.map((v) => [v.cssVar, v.hex]));
    const get = (k: string) => byVar.get(k) ?? "#000000";
    const hasSecondary = byVar.has("--secondary");

    const badgesHtml = STATUS_BADGE_ROLES.map(
      (role) =>
        `<span class="comp-badge" style="background:${get(`--${role}`)};color:${get(`--${role}-foreground`)}">${role}</span>`,
    ).join("");

    return `<div class="semantic-panel${mode === "dark" ? " dark" : ""}" data-mode="${mode}">
        <div class="demo-row">
          <button class="demo-btn" style="background:${get("--primary")};color:${get("--primary-foreground")};border-radius:${radiusPx}px">Primary</button>
          ${hasSecondary ? `<button class="demo-btn" style="background:${get("--secondary")};color:${get("--secondary-foreground")};border-radius:${radiusPx}px">Secondary</button>` : ""}
          <button class="demo-btn comp-btn-outline" style="color:${get("--foreground")};border-color:${get("--border")};border-radius:${radiusPx}px">Outline</button>
          <button class="demo-btn" style="background:${get("--muted")};color:${get("--muted-foreground")};border-radius:${radiusPx}px" disabled>Disabled</button>
        </div>

        <div class="comp-card" style="background:${get("--card")};color:${get("--card-foreground")};border-color:${get("--border")};border-radius:${radiusPx + 4}px">
          <div class="comp-card-title">Card title</div>
          <div class="comp-card-body" style="color:${get("--muted-foreground")}">A short description of this card's contents, styled with the generated design system.</div>
          <button class="demo-btn" style="background:${get("--primary")};color:${get("--primary-foreground")};border-radius:${radiusPx}px">Action</button>
        </div>

        <label class="comp-field" style="color:${get("--foreground")}">
          Label
          <input class="comp-input" type="text" placeholder="Placeholder text" disabled style="background:${get("--background")};color:${get("--foreground")};border-color:${get("--border")};border-radius:${radiusPx}px" />
        </label>

        <div class="demo-row" style="margin-bottom:12px">${badgesHtml}</div>

        <div class="comp-alert" style="background:${get("--info")};color:${get("--info-foreground")};border-radius:${radiusPx}px">This is an informational alert, styled with the <code>info</code> status token.</div>
      </div>`;
  };

  const toggleHtml =
    modes.length > 1
      ? `<div class="mode-toggle" role="group" aria-label="Preview mode">
          <button type="button" class="mode-btn" data-target="light" aria-pressed="true" onclick="setMode('light')">Light</button>
          <button type="button" class="mode-btn" data-target="dark" aria-pressed="false" onclick="setMode('dark')">Dark</button>
        </div>`
      : `<p class="single-mode-note">Generated for ${modes[0]} mode only.</p>`;

  return `<section>
    <h2>Components preview</h2>
    ${stageBannerHtml(
      "agnostic",
      "Not real components",
      ` Everything below is a plain HTML/CSS mockup (button, card, form field, status badges, alert) styled from this project's own resolved semantic tokens — <strong>not</strong> real installed ${escapeHtml(platformLabel)} component code. This report has no pipeline for installing, building, or rendering an actual ${escapeHtml(platformLabel)} component yet (see "Not yet built for this target" below), so this preview approximates the look using the same colors shown in the mapping above, not ${escapeHtml(platformLabel)}'s own exact rendered output.`,
    )}
    ${toggleHtml}
    ${modes.map((m) => panelHtml(m)).join("\n")}
  </section>`;
}

// ============================================================
// Tailwind v4
// ============================================================

export function buildTailwindDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  const groups = loadCommonGroups(tokensDir);

  const labels: RampLabels = {
    ramp: (group) => `--color-primitive-${group}-{50..950}`,
    staticColor: () => "--color-primitive-static-{100,200}",
    status: (n, tone) => `--color-primitive-status-${n}-${tone}`,
  };

  const bodyHtml = `
  <section>
    <h2>Color primitives</h2>
    <p class="single-mode-note">Positional relabel onto Tailwind's own 50-950 keys (contracts-and-seeds.md, "Positional relabel") — our step numbering never appears in the generated CSS.</p>
    ${primitivesSectionHtml(primitives, labels, TAILWIND_STEP_RELABEL)}
  </section>

  <section>
    <h2>Semantic color</h2>
    ${semanticSectionHtml(primitives, tokensDir, modes, (path) => `--color-semantic-${path.join("-")}`)}
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "Tailwind v4",
    adaptedSummary:
      "The primitive color ramp is relabeled onto Tailwind's native 50–950 keys, and every value is exposed as a CSS custom property under an <code>@theme</code> block — not the DTCG spec's own <code>100</code>–<code>1100</code> naming.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "Tailwind v4"],
      ["Naming", "CSS @theme custom properties"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "tailwind-v4-design-system-demo.html", html);
}

// ============================================================
// Bootstrap 5.3
// ============================================================

export function buildBootstrapDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const { radius } = readJson<RadiusFile>(join(tokensDir, "radius.json"));
  const primitives = color.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  const groups = loadCommonGroups(tokensDir);

  const labels: RampLabels = {
    ramp: (group) => `--color-primitive-${group}-{100..1100} (full ramp — Bootstrap's own Sass only overrides the base step below)`,
    staticColor: () => "--color-primitive-static-{100,200}",
    status: (n, tone) => `--color-primitive-status-${n}-${tone}`,
  };

  const sassLines: string[] = [`$primary: ${primitives.brand["600"].$value};`];
  if (primitives["brand-secondary"]) sassLines.push(`$secondary: ${primitives["brand-secondary"]["600"].$value};`);
  for (const [role, name] of Object.entries(STATUS_ROLE_TO_BOOTSTRAP)) {
    const token = primitives.status[role as StatusRoleNum]?.["200"];
    if (token) sassLines.push(`$${name}: ${token.$value};`);
  }
  for (const [key, name] of Object.entries(RADIUS_KEY_TO_BOOTSTRAP)) {
    const token = radius[key];
    if (token) sassLines.push(`$${name}: ${pxToRem(token.$value)};`);
  }
  sassLines.push("$border-radius-pill: 50rem;");

  const sassSwatches = [
    { name: "$primary", hex: primitives.brand["600"].$value },
    ...(primitives["brand-secondary"] ? [{ name: "$secondary", hex: primitives["brand-secondary"]["600"].$value }] : []),
    ...Object.entries(STATUS_ROLE_TO_BOOTSTRAP)
      .map(([role, name]) => ({ name: `$${name}`, hex: primitives.status[role as StatusRoleNum]?.["200"].$value }))
      .filter((x): x is { name: string; hex: string } => Boolean(x.hex)),
  ]
    .map((s) => `<div class="status-card"><div class="status-tone" style="background:${s.hex};color:${textOn(s.hex)}"><span>${escapeHtml(s.name)}</span><code>${s.hex}</code></div></div>`)
    .join("\n");

  const bodyHtml = `
  <section>
    <h2>Bootstrap Sass variables</h2>
    <p class="single-mode-note">Written to <code>_variables.scss</code> — import this before <code>@import "bootstrap/scss/bootstrap"</code>. Bootstrap's own <code>tint-color()</code>/<code>shade-color()</code> derive every tint/shade from these.</p>
    <div class="status-strip">${sassSwatches}</div>
    <h3>Radius overrides</h3>
    <div class="spec-row"><code>${escapeHtml(sassLines.slice(-4).join(" "))}</code></div>
  </section>

  <section>
    <h2>Color primitives</h2>
    <p class="single-mode-note">Everything below the Sass overrides above stays available as base CSS custom properties (Bootstrap's own generator only curates the handful of variables shown above).</p>
    ${primitivesSectionHtml(primitives, labels, null)}
  </section>

  <section>
    <h2>Semantic color</h2>
    ${semanticSectionHtml(primitives, tokensDir, modes, (path) => `--color-semantic-${path.join("-")}`)}
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "Bootstrap 5.3",
    adaptedSummary:
      "The base brand/status colors and a few radius values are written as Bootstrap's own Sass variables (<code>$primary</code>, <code>$border-radius-*</code>, etc.) — everything else stays available as plain CSS custom properties, same names as the base target.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "Bootstrap 5.3"],
      ["Naming", "Sass variables + CSS custom properties"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "bootstrap-5.3-design-system-demo.html", html);
}

// ============================================================
// MUI 9.x (MD2)
// ============================================================

export function buildMuiDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const white = primitives.static["100"].$value;
  const black = primitives.static["200"].$value;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  const groups = loadCommonGroups(tokensDir);

  const rampExportName: Record<string, string> = { brand: "brand", "brand-secondary": "brandSecondary", neutral: "neutral" };
  const labels: RampLabels = {
    ramp: (group) => `colors.${rampExportName[group]}[{50..900}]`,
    staticColor: () => "(used internally to derive contrastText — not exported as a named token)",
    status: (n, tone) => (STATUS_ROLE_TO_MUI[n] && tone === "200" ? `used as palette.${STATUS_ROLE_TO_MUI[n]}.main below` : "(not exported)"),
  };

  const paletteGroups: Array<{ name: string; hex: string }> = [
    { name: "palette.primary", hex: primitives.brand["600"].$value },
    ...(primitives["brand-secondary"] ? [{ name: "palette.secondary", hex: primitives["brand-secondary"]["600"].$value }] : []),
    ...Object.entries(STATUS_ROLE_TO_MUI)
      .map(([role, name]) => ({ name: `palette.${name}`, hex: primitives.status[role as StatusRoleNum]?.["200"].$value }))
      .filter((x): x is { name: string; hex: string } => Boolean(x.hex)),
  ];

  const paletteHtml = paletteGroups
    .map(({ name, hex }) => {
      const group = augmentColor(hex, white, black);
      const cells = (["main", "light", "dark"] as const)
        .map((key) => {
          const c = group[key];
          return `<div class="swatch" style="background:${c};color:${textOn(c)}"><span class="swatch-step">${key}</span><span class="swatch-hex">${c}</span></div>`;
        })
        .join("");
      return `<div class="ramp-row"><div class="ramp-label">${escapeHtml(name)} (contrastText: ${group.contrastText})</div><div class="ramp-cells">${cells}</div></div>`;
    })
    .join("\n");

  const bodyHtml = `
  <section>
    <h2>Color primitives</h2>
    <p class="single-mode-note">Positional relabel onto MUI's native 50-900 keys (our 1100 step has no MUI slot and is dropped) — exported from <code>colors.ts</code>.</p>
    ${primitivesSectionHtml(primitives, labels, MUI_STEP_RELABEL)}
  </section>

  <section>
    <h2>Derived palette</h2>
    <p class="single-mode-note">From <code>palette.ts</code> — <code>main</code>/<code>light</code>/<code>dark</code>/<code>contrastText</code> per group, computed with MUI's own real formula (verified against MUI 9.x source). Spread into <code>createTheme({ palette })</code>.</p>
    ${paletteHtml}
  </section>

  <section>
    <h2>Semantic color</h2>
    <p class="single-mode-note">MUI's generator doesn't produce its own semantic-color file yet — these come from the base CSS custom properties, always generated alongside any platform target.</p>
    ${semanticSectionHtml(primitives, tokensDir, modes, (path) => `--color-semantic-${path.join("-")}`)}
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "MUI 9.x",
    adaptedSummary:
      "The primitive color ramp is relabeled onto MUI's native 50–900 keys and exported as TypeScript (<code>colors.ts</code>), plus a derived <code>main</code>/<code>light</code>/<code>dark</code>/<code>contrastText</code> palette (<code>palette.ts</code>) computed with MUI's own real formula — not the DTCG spec's own naming or a plain hex list.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "MUI 9.x"],
      ["Naming", "TypeScript exports (colors.ts / palette.ts)"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "mui-9-design-system-demo.html", html);
}

// ============================================================
// Jetpack Compose Material3 1.4
// ============================================================

export function buildMd3Demo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const primaryHex = primitives.brand["600"].$value;
  const secondaryHex = primitives["brand-secondary"]?.["600"].$value;
  const neutralHex = primitives.neutral["600"].$value;
  const errorHex = primitives.status["1"]["200"].$value;

  const lightScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, false);
  const darkScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, true);

  const schemeRowsHtml = (scheme: typeof lightScheme, valName: string) =>
    COLOR_SCHEME_ROLES.map((role) => {
      const hex = hexFromArgb((scheme as unknown as Record<string, number>)[role]).toUpperCase();
      return `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${valName}.${role}</div><code class="token-hex">${hex}</code></div>`;
    }).join("");

  const shadowFile = tryReadJson<ShadowFile>(join(tokensDir, "shadow.json"))?.shadow;
  const elevationEligible = shadowFile && SHADOW_KEYS.every((k) => shadowFile[k]?.$type === "dimension");
  const elevationHtml = elevationEligible
    ? SHADOW_KEYS.map((key) => {
        const dp = parseFloat(String(shadowFile![key].$value));
        const light = surfaceColorAtElevation(hexFromArgb(lightScheme.surface), hexFromArgb(lightScheme.surfaceTint), dp);
        const dark = surfaceColorAtElevation(hexFromArgb(darkScheme.surface), hexFromArgb(darkScheme.surfaceTint), dp);
        const label = key.replace("2xl", "xxl");
        return `<div class="grid-tier"><code>ElevationOverlay.Light/Dark.${label}</code><span>${light} (light) · ${dark} (dark) · ${dp}dp</span></div>`;
      }).join("\n")
    : null;

  const bodyHtml = `
  <section>
    <h2>Color scheme</h2>
    <p class="single-mode-note">Real HCT tonal palette + <code>androidx.compose.material3.ColorScheme</code> (Google's Material Color Utilities), seeded from this project's own brand/secondary/neutral/error colors — not a slice of a shared ramp, MD3 has no ramp concept. Written to <code>Color.kt</code>.</p>
    <div class="token-group"><div class="token-group-title">LightColorScheme</div><div class="token-grid">${schemeRowsHtml(lightScheme, "LightColorScheme")}</div></div>
    <div class="token-group"><div class="token-group-title">DarkColorScheme</div><div class="token-grid">${schemeRowsHtml(darkScheme, "DarkColorScheme")}</div></div>
  </section>
  ${
    elevationHtml
      ? `<section><h2>Elevation overlay</h2><p class="single-mode-note">Compose's own real <code>surfaceColorAtElevation()</code> formula, precomputed per shadow role.</p>${elevationHtml}</section>`
      : ""
  }

  <section>
    <h2>Not yet generated for this target</h2>
    <p class="single-mode-note">Typography, spacing, radius, and shadow (elevation aside) aren't generated as native Compose values yet — only available via base CSS custom properties in <code>code/css/tokens.css</code>, which isn't idiomatic for a Compose project. Flagged as a gap, not fabricated here.</p>
  </section>`;

  const html = renderDemoPage({
    platformTitle: "Jetpack Compose Material3 1.4",
    adaptedSummary:
      "A real HCT tonal palette and <code>ColorScheme</code> is computed via Google's Material Color Utilities and written as Kotlin (<code>Color.kt</code>) — not a slice of a shared ramp, since MD3 has no ramp concept at all.",
    brandHex: primaryHex,
    headingFont: "system-ui",
    bodyFont: "system-ui",
    runFields: [
      ["Platform", "Jetpack Compose Material3 1.4.0"],
      ["Naming", "Kotlin ColorScheme fields"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, "css/tokens.css (not idiomatic for this target — see note above)"],
    hasBothModes: false,
  });

  return writeDemo(outDir, "compose-material3-1.4-design-system-demo.html", html);
}

// ============================================================
// SwiftUI (no version pin — see swiftui.ts)
// ============================================================

export function buildSwiftUIDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color: primitivesRoot } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = primitivesRoot.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];

  const bodyHtml = `
  <section>
    <h2>Semantic color</h2>
    <p class="single-mode-note">Resolved directly from <code>color.semantic.&lt;mode&gt;.json</code> into native <code>Color(red:green:blue:opacity:)</code> values, split into <code>DesignTokens.Light</code>/<code>DesignTokens.Dark</code>. No ramp relabel or derived palette math — SwiftUI reads semantic tokens directly, and this target doesn't export primitives at all.</p>
    ${semanticSectionHtml(primitives, tokensDir, modes, (path, mode) => `DesignTokens.${capitalize(mode)}.${toSwiftPropertyName(path)}`)}
  </section>

  <section>
    <h2>Not yet generated for this target</h2>
    <p class="single-mode-note">Typography, spacing, radius, shadow, and opacity aren't generated as native Swift constants yet — only available via base CSS custom properties in <code>code/css/tokens.css</code>, which isn't idiomatic for a SwiftUI project. Flagged as a gap, not fabricated here.</p>
  </section>`;

  const html = renderDemoPage({
    platformTitle: "SwiftUI",
    adaptedSummary:
      "Semantic color tokens are resolved directly into native <code>Color(red:green:blue:opacity:)</code> values and written as Swift (<code>DesignTokens.swift</code>), split into <code>DesignTokens.Light</code>/<code>DesignTokens.Dark</code>.",
    brandHex: primitives.brand["600"].$value,
    headingFont: "system-ui",
    bodyFont: "system-ui",
    runFields: [
      ["Platform", "SwiftUI (no version pin — see swiftui.ts)"],
      ["Naming", "Swift enum properties"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, "css/tokens.css (not idiomatic for this target — see note above)"],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "swiftui-design-system-demo.html", html);
}

// ============================================================
// shadcn/ui (Layer 2, slice 1 — see generate/shadcn.ts)
// ============================================================

export function buildShadcnDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  const groups = loadCommonGroups(tokensDir);

  const varsPanelHtml = (mode: "light" | "dark") => {
    const file = mode === "light" ? LIGHT_FILE : DARK_FILE;
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, file));
    const vars = resolveShadcnVars(semanticRoot.semantic, primitives);
    const itemsHtml = vars
      .map(
        ({ cssVar, hex }) =>
          `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${escapeHtml(cssVar)}</div><code class="token-hex">${escapeHtml(hex)}</code></div>`,
      )
      .join("");
    const primaryHex = vars.find((v) => v.cssVar === "--primary")?.hex ?? "#000000";
    const hasSecondary = vars.some((v) => v.cssVar === "--secondary");
    return `<div class="semantic-panel${mode === "dark" ? " dark" : ""}" data-mode="${mode}">
        <div class="demo-row">
          <button class="demo-btn" style="background:${primaryHex};color:${textOnAny(primaryHex)}" disabled>--primary</button>
          ${hasSecondary ? `<button class="demo-btn secondary" disabled>--secondary</button>` : ""}
        </div>
        <div class="token-group"><div class="token-group-title">CSS variables</div><div class="token-grid">${itemsHtml}</div></div>
      </div>`;
  };

  const toggleHtml =
    modes.length > 1
      ? `<div class="mode-toggle" role="group" aria-label="Preview mode">
          <button type="button" class="mode-btn" data-target="light" aria-pressed="true" onclick="setMode('light')">Light</button>
          <button type="button" class="mode-btn" data-target="dark" aria-pressed="false" onclick="setMode('dark')">Dark</button>
        </div>`
      : `<p class="single-mode-note">Generated for ${modes[0]} mode only.</p>`;

  const bodyHtml = `
  <section>
    <h2>shadcn/ui CSS variables</h2>
    <p class="single-mode-note">SDSGT's semantic tokens resolved onto shadcn/ui's own variable contract (<code>--primary</code>, <code>--card</code>, <code>--muted</code>, etc.), written to <code>theme.css</code> under shadcn's own <code>.dark</code> class selector — not this project's usual <code>[data-theme="dark"]</code>. <code>--success</code>/<code>--warning</code>/<code>--info</code>/<code>--promo</code> (+ <code>-foreground</code> pairs) are SDSGT additions — shadcn only defines <code>--destructive</code> natively. See contracts-and-seeds.md, "shadcn/ui theming."</p>
    ${toggleHtml}
    ${modes.map((m) => varsPanelHtml(m)).join("\n")}
  </section>

  ${componentsSectionHtml(tokensDir, "shadcn/ui")}

  <section>
    <h2>Not yet built for this target</h2>
    <p class="single-mode-note">This is the theme-variable mapping only. Actually running <code>shadcn init</code>/<code>shadcn add &lt;component&gt;</code>, choosing a curated component list, and marking vendored files as customized is separate, not-yet-built work — flagged as a gap, not fabricated here.</p>
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "shadcn/ui",
    adaptedSummary:
      "Semantic color tokens are resolved onto shadcn/ui's own CSS variable names (<code>--primary</code>, <code>--card</code>, etc.) and written to <code>theme.css</code>, meant to be this project's actual <code>globals.css</code> — plus SDSGT extensions (<code>--success</code>/<code>--warning</code>/<code>--info</code>/<code>--promo</code>) for the status roles shadcn has no native slot for.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "shadcn/ui (CLI v4, verified 2026-09-10)"],
      ["Naming", "CSS custom properties (shadcn's own variable contract)"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "shadcn-design-system-demo.html", html);
}

// ============================================================
// React Native Reusables (RNR) (Layer 2, slice 2 — see generate/rnr.ts)
// ============================================================

export function buildRnrDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const modes: Array<"light" | "dark"> = [...(hasLight ? (["light"] as const) : []), ...(hasDark ? (["dark"] as const) : [])];
  const groups = loadCommonGroups(tokensDir);

  const varsPanelHtml = (mode: "light" | "dark") => {
    const file = mode === "light" ? LIGHT_FILE : DARK_FILE;
    const { color: semanticRoot } = readJson<SemanticFile>(join(tokensDir, file));
    const vars = resolveShadcnVars(semanticRoot.semantic, primitives).filter((v) => v.cssVar !== "--destructive-foreground");
    const itemsHtml = vars
      .map(
        ({ cssVar, hex }) =>
          `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${escapeHtml(cssVar)}</div><code class="token-hex">${escapeHtml(hexToHslTriplet(hex))}</code></div>`,
      )
      .join("");
    const primaryHex = vars.find((v) => v.cssVar === "--primary")?.hex ?? "#000000";
    const hasSecondary = vars.some((v) => v.cssVar === "--secondary");
    return `<div class="semantic-panel${mode === "dark" ? " dark" : ""}" data-mode="${mode}">
        <div class="demo-row">
          <button class="demo-btn" style="background:${primaryHex};color:${textOnAny(primaryHex)}" disabled>--primary</button>
          ${hasSecondary ? `<button class="demo-btn secondary" disabled>--secondary</button>` : ""}
        </div>
        <div class="token-group"><div class="token-group-title">global.css variables (raw "H S% L%" triplet)</div><div class="token-grid">${itemsHtml}</div></div>
      </div>`;
  };

  const toggleHtml =
    modes.length > 1
      ? `<div class="mode-toggle" role="group" aria-label="Preview mode">
          <button type="button" class="mode-btn" data-target="light" aria-pressed="true" onclick="setMode('light')">Light</button>
          <button type="button" class="mode-btn" data-target="dark" aria-pressed="false" onclick="setMode('dark')">Dark</button>
        </div>`
      : `<p class="single-mode-note">Generated for ${modes[0]} mode only.</p>`;

  const bodyHtml = `
  <section>
    <h2>RNR (React Native Reusables) theme</h2>
    <p class="single-mode-note">Same semantic mapping as shadcn/ui — RNR is explicitly "shadcn for React Native" — but written as raw <code>H S% L%</code> triplets in <code>global.css</code>, not hex: NativeWind's <code>tailwind.config.js</code> wraps these in <code>hsl(var(--x))</code> itself, and a hex string there would be invalid CSS. See contracts-and-seeds.md, "React Native Reusables (RNR) theming."</p>
    ${toggleHtml}
    ${modes.map((m) => varsPanelHtml(m)).join("\n")}
  </section>

  <section>
    <h2>constants.ts — NAV_THEME</h2>
    <p class="single-mode-note">React Navigation's own <code>Theme.colors</code> shape (<code>primary</code>/<code>background</code>/<code>card</code>/<code>text</code>/<code>border</code>/<code>notification</code>) — spread into <code>DefaultTheme</code>/<code>DarkTheme</code>'s own <code>colors</code>, not a full replacement <code>Theme</code>.</p>
  </section>

  ${componentsSectionHtml(tokensDir, "RNR")}

  <section>
    <h2>Not yet built for this target</h2>
    <p class="single-mode-note">This is the theme-variable mapping only. Actually running RNR's own component-add command, choosing a curated component list, and marking vendored files as customized is separate, not-yet-built work — flagged as a gap, not fabricated here.</p>
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "React Native Reusables",
    adaptedSummary:
      "Semantic color tokens are resolved onto the same variable names shadcn/ui uses, written as raw <code>H S% L%</code> triplets to <code>global.css</code> (NativeWind's own requirement), plus a <code>NAV_THEME</code> object in <code>constants.ts</code> matching React Navigation's own <code>Theme.colors</code> shape.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "React Native Reusables (RNR)"],
      ["Naming", "CSS custom properties (raw HSL triplet) + NAV_THEME"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: modes.length > 1,
  });

  return writeDemo(outDir, "rnr-design-system-demo.html", html);
}

// ============================================================
// React Native Paper (Layer 2, slice 2 — see generate/rn-paper.ts)
// ============================================================

export function buildRnPaperDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const primaryHex = primitives.brand["600"].$value;
  const secondaryHex = primitives["brand-secondary"]?.["600"].$value;
  const neutralHex = primitives.neutral["600"].$value;
  const errorHex = primitives.status["1"]["200"].$value;

  const lightScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, false);
  const darkScheme = buildScheme(primaryHex, secondaryHex, neutralHex, errorHex, true);

  const schemeRowsHtml = (scheme: typeof lightScheme, valName: string) =>
    PAPER_SCHEME_ROLES.map((role) => {
      const hex = hexFromArgb((scheme as unknown as Record<string, number>)[role]).toUpperCase();
      return `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${valName}.colors.${role}</div><code class="token-hex">${hex}</code></div>`;
    }).join("");

  const bodyHtml = `
  <section>
    <h2>MD3Theme.colors (real HCT ColorScheme)</h2>
    <p class="single-mode-note">Same real HCT tonal palette + ColorScheme computation as the MD3/Jetpack Compose generator (<code>--md3</code>), reshaped onto Paper's own <code>MD3Theme.colors</code> role subset. Written to <code>theme.ts</code>, spreading Paper's own <code>MD3LightTheme</code>/<code>MD3DarkTheme</code> as the base.</p>
    <div class="token-group"><div class="token-group-title">LightTheme.colors</div><div class="token-grid">${schemeRowsHtml(lightScheme, "LightTheme")}</div></div>
    <div class="token-group"><div class="token-group-title">DarkTheme.colors</div><div class="token-grid">${schemeRowsHtml(darkScheme, "DarkTheme")}</div></div>
  </section>

  <section>
    <h2>Paper-only extras</h2>
    <p class="single-mode-note"><code>shadow</code>/<code>surfaceDisabled</code>/<code>onSurfaceDisabled</code>/<code>backdrop</code>/<code>elevation</code> aren't part of Compose's <code>ColorScheme</code> — verified against Paper's own real MD3LightTheme source (contracts-and-seeds.md, "React Native Paper theming"): <code>shadow</code> is fixed pure black, <code>surfaceDisabled</code>/<code>onSurfaceDisabled</code> are <code>onSurface</code> at 12%/38% alpha, <code>backdrop</code> reuses this project's own <code>overlay.scrim</code> token directly rather than a re-derived formula, and <code>elevation.level0-5</code> uses MD3's fixed dp scale (0/1/3/6/8/12) via the same <code>surfaceColorAtElevation()</code> formula the MD3/Compose generator uses.</p>
  </section>

  ${componentsSectionHtml(tokensDir, "React Native Paper")}

  <section>
    <h2>Not yet built for this target</h2>
    <p class="single-mode-note">This is the theme-variable mapping only. Actually installing React Native Paper components or choosing a curated component list is separate, not-yet-built work — flagged as a gap, not fabricated here.</p>
  </section>`;

  const html = renderDemoPage({
    platformTitle: "React Native Paper (MD3)",
    adaptedSummary:
      "A real HCT tonal palette and <code>ColorScheme</code> is computed via Google's Material Color Utilities (same computation as <code>--md3</code>) and reshaped onto React Native Paper's own <code>MD3Theme.colors</code> role set, written as TypeScript (<code>theme.ts</code>).",
    brandHex: primaryHex,
    headingFont: "system-ui",
    bodyFont: "system-ui",
    runFields: [
      ["Platform", "React Native Paper (npm 5.15.3, MD3)"],
      ["Naming", "MD3Theme.colors fields"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles],
    hasBothModes: false,
  });

  return writeDemo(outDir, "rn-paper-design-system-demo.html", html);
}

// ============================================================
// Vuetify 4 (Layer 2, slice 2 — see generate/vuetify.ts)
// ============================================================

export function buildVuetifyDemo(tokensDir: string, outDir: string, platformFiles: string[]): GenerateResult {
  const { color } = readJson<ColorPrimitivesFile>(join(tokensDir, "color.primitive.json"));
  const primitives = color.primitive;
  const hasLight = existsSync(join(tokensDir, LIGHT_FILE));
  const hasDark = existsSync(join(tokensDir, DARK_FILE));
  const groups = loadCommonGroups(tokensDir);

  const swatchesFor = (mode: "light" | "dark") => {
    const semanticFile = join(tokensDir, mode === "light" ? LIGHT_FILE : DARK_FILE);
    const entries: Array<{ name: string; hex: string }> = [
      { name: "primary", hex: primitives.brand["600"].$value },
      ...(primitives["brand-secondary"] ? [{ name: "secondary", hex: primitives["brand-secondary"]["600"].$value }] : []),
      { name: "background", hex: resolveSemanticPath(semanticFile, "background", "primary", primitives) },
      { name: "surface", hex: resolveSemanticPath(semanticFile, "background", "surface", primitives) },
      ...Object.entries(STATUS_ROLE_TO_VUETIFY)
        .map(([role, name]) => ({ name, hex: primitives.status[role]?.["200"].$value }))
        .filter((x): x is { name: string; hex: string } => Boolean(x.hex)),
    ];
    return `<div class="token-group"><div class="token-group-title">${mode}Theme.colors</div><div class="token-grid">${entries
      .map((e) => `<div class="token-item"><div class="token-label"><span class="swab" style="background:${e.hex}"></span>${e.name}</div><code class="token-hex">${e.hex}</code></div>`)
      .join("")}</div></div>`;
  };

  const bodyHtml = `
  <section>
    <h2>Vuetify theme colors</h2>
    <p class="single-mode-note">A small, curated base-color set — Vuetify's own runtime derives <code>on-*</code> contrast pairs and <code>lighten-N</code>/<code>darken-N</code> tint variants from these, same pattern as Bootstrap's own Sass deriving tints from just <code>$primary</code>. Written to <code>theme.ts</code> as <code>lightTheme</code>/<code>darkTheme</code>, each a real Vuetify <code>ThemeDefinition</code>.</p>
    ${hasLight ? swatchesFor("light") : ""}
    ${hasDark ? swatchesFor("dark") : ""}
  </section>

  ${componentsSectionHtml(tokensDir, "Vuetify")}

  <section>
    <h2>Not yet built for this target</h2>
    <p class="single-mode-note">This is the theme-variable mapping only. Actually installing Vuetify components or choosing a curated component list is separate, not-yet-built work — flagged as a gap, not fabricated here.</p>
  </section>
  ${commonValueSections(groups)}`;

  const html = renderDemoPage({
    platformTitle: "Vuetify 4",
    adaptedSummary:
      "This project's brand/background/surface/status colors are written as a Vuetify <code>ThemeDefinition</code> (<code>theme.ts</code>) — Vuetify's own runtime derives every <code>on-*</code>/lighten/darken variant from these base colors.",
    brandHex: primitives.brand["600"].$value,
    headingFont: groups.headingFont,
    bodyFont: groups.bodyFont,
    runFields: [
      ["Platform", "Vuetify 4 (current npm latest)"],
      ["Naming", "ThemeDefinition colors"],
    ],
    bodyHtml,
    generatedFiles: [...platformFiles, ...baseCssFiles(hasLight, hasDark)],
    hasBothModes: hasLight && hasDark,
  });

  return writeDemo(outDir, "vuetify-design-system-demo.html", html);
}
