// Generates a single self-contained report.html alongside the token JSON
// files on every `promote` run — a quick visual "proof of work" a human can
// open without reading JSON. Deliberately lightweight: `promote` itself never
// touches the network. Type specimens use the seed's real font names in a
// system-font stack by default (renders in the actual font if it happens to
// be installed locally, a clean fallback otherwise) — callers that DO have
// real font files on disk (e.g. the SDSGT-start skill, which can fetch them)
// can pass `fontFiles` to embed real `@font-face` data and guarantee exact
// rendering. Fetching those files is deliberately not this module's job —
// see SKILL.md, "Fetching fonts" — keeps this a pure, offline function.

import type { SeedConfig } from "../types/seed-config.ts";
import type { Ramp } from "../color/ramp.ts";
import type { StatusTone } from "../color/status.ts";

export interface ReportWarning {
  token: string;
  ratio: number;
  required: number;
}

export interface TypographySpecimen {
  token: string;
  family: string;
  weight: number;
  size: number;
  lineHeight: number;
}

// Keyed by exact font family name (matches seed.primaryFont / secondaryFont),
// then by weight (400/600/700 — the only weights typography.primitive ever
// uses), value is the raw base64 of a .woff2 file (no "data:" prefix).
export type FontFilesMap = Record<string, Partial<Record<400 | 600 | 700, string>>>;

export interface ReportData {
  brandRamp: Ramp;
  brandSecondaryRamp?: Ramp;
  neutralRamp: Ramp;
  status: Record<"1" | "2" | "3" | "4" | "5", StatusTone>;
  modes: Array<"light" | "dark">;
  typography: TypographySpecimen[];
  spacing: Record<string, { $value: string }>;
  radius: Record<string, { $value: string }>;
  shadow: Record<string, { $type: string; $value: unknown }>;
  opacity: Record<string, { $value: number }>;
  borderWidth: Record<string, { $value: string }>;
  breakpoint: Record<string, { $value: string }>;
  grid: Record<string, { columns: { $value: number }; margin: { $value: string }; gutter: { $value: string } }>;
  fileNames: string[];
  warnings: ReportWarning[];
  fontFiles?: FontFilesMap;
}

const RAMP_STEPS = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "1000", "1100"] as const;

function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1F201D" : "#FFFFFF";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rampRow(label: string, steps: ReadonlyArray<readonly [string, string]>): string {
  const cells = steps
    .map(([step, hex]) => {
      const fg = textOn(hex);
      const baseAttr = step === "600" ? ' data-base="true"' : "";
      return `<div class="swatch"${baseAttr} style="background:${hex};color:${fg}"><span class="swatch-step">${step}</span><span class="swatch-hex">${hex}</span></div>`;
    })
    .join("");
  return `<div class="ramp-row"><div class="ramp-label">${escapeHtml(label)}</div><div class="ramp-cells">${cells}</div></div>`;
}

// Mirrors the fixed Background/Text/Border mapping table in
// contracts-and-seeds.md ("Color semantic roles") — same rule
// `buildSemanticColor` in promote/index.ts applies, resolved to a hex here
// instead of a DTCG alias string. Keep both in sync if that table changes.
// Grouped by category (rather than one flat list) so the layout stays a
// clean, fixed 2-column grid per group at any viewport width — a flat list
// re-flowed via auto-fill produced a different, ragged column count at wide
// widths, since 10 items don't divide evenly into 3+ columns.
function semanticGroups(mode: "light" | "dark", brandRamp: Ramp, neutralRamp: Ramp): Array<{ title: string; tokens: Array<[string, string]> }> {
  const isLight = mode === "light";
  return [
    {
      title: "Background",
      tokens: [
        ["background.primary", isLight ? neutralRamp["100"] : neutralRamp["1100"]],
        ["background.secondary", isLight ? neutralRamp["200"] : neutralRamp["1000"]],
        ["background.surface", isLight ? "#FFFFFF" : neutralRamp["1000"]],
        ["background.inverse", isLight ? neutralRamp["1100"] : neutralRamp["100"]],
      ],
    },
    {
      title: "Text",
      tokens: [
        ["text.primary", isLight ? neutralRamp["1100"] : neutralRamp["100"]],
        ["text.secondary", isLight ? neutralRamp["900"] : neutralRamp["200"]],
        ["text.disabled", isLight ? neutralRamp["700"] : neutralRamp["400"]],
      ],
    },
    {
      title: "Border",
      tokens: [
        ["border.default", isLight ? neutralRamp["400"] : neutralRamp["800"]],
        ["border.subtle", isLight ? neutralRamp["300"] : neutralRamp["900"]],
        ["border.focus", brandRamp["600"]],
      ],
    },
  ];
}

// Tailwind/Bootstrap shadow entries are $type "shadow" (real CSS layers).
// MD3/MD2 entries are $type "dimension" (an elevation dp/px number) — there's
// no real box-shadow to read yet, since the tonal-surface-overlay math that
// would turn elevation into an actual MD3 shadow is generator-layer work
// that isn't built (see contracts-and-seeds.md, "Shadow"). Synthesize a
// plausible-looking shadow from the elevation number just for this preview,
// and label it as elevation rather than claiming it's the real render.
function shadowDisplay(entry: { $type: string; $value: unknown }): { css: string; label: string } {
  if (entry.$type === "dimension") {
    const px = parseInt(String(entry.$value), 10);
    return { css: `0 ${px}px ${px * 2}px rgba(0,0,0,0.15)`, label: `${entry.$value} elevation (approximated)` };
  }
  const layers = Array.isArray(entry.$value) ? entry.$value : [entry.$value];
  const css = layers.map((l: any) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${l.color}`).join(", ");
  const label = `${layers.length} layer${layers.length > 1 ? "s" : ""}`;
  return { css, label };
}

function fontFaceCss(fontFiles: FontFilesMap | undefined, family: string | undefined): string {
  if (!fontFiles || !family || !fontFiles[family]) return "";
  const weights = fontFiles[family]!;
  return (Object.entries(weights) as Array<[string, string]>)
    .map(
      ([weight, b64]) => `@font-face {
    font-family: '${escapeHtml(family)}'; font-weight: ${weight}; font-style: normal; font-display: swap;
    src: url(data:font/woff2;base64,${b64}) format('woff2');
  }`,
    )
    .join("\n  ");
}

export function buildReportHtml(seed: SeedConfig, data: ReportData): string {
  const {
    brandRamp,
    brandSecondaryRamp,
    neutralRamp,
    status,
    modes,
    typography,
    spacing,
    radius,
    shadow,
    opacity,
    borderWidth,
    breakpoint,
    grid,
    fileNames,
    warnings,
    fontFiles,
  } = data;

  const rampsHtml = [
    rampRow("brand", RAMP_STEPS.map((s) => [s, brandRamp[s]] as const)),
    ...(brandSecondaryRamp ? [rampRow("brand-secondary", RAMP_STEPS.map((s) => [s, brandSecondaryRamp[s]] as const))] : []),
    rampRow("neutral", RAMP_STEPS.map((s) => [s, neutralRamp[s]] as const)),
    rampRow("static", [
      ["100", "#FFFFFF"],
      ["200", "#000000"],
    ]),
  ].join("\n");

  const statusHtml = (["1", "2", "3", "4", "5"] as const)
    .map((n) => {
      const tone = status[n];
      const fgDark = textOn(tone["200"]);
      return `<div class="status-card">
        <div class="status-chip" style="background:${tone["100"]};color:${tone["200"]}">${escapeHtml(tone.role)}</div>
        <div class="status-tone" style="background:${tone["100"]}"><span>.100</span><code>${tone["100"]}</code></div>
        <div class="status-tone" style="background:${tone["200"]};color:${fgDark}"><span>.200</span><code>${tone["200"]}</code></div>
      </div>`;
    })
    .join("\n");

  const modePanels = modes
    .map((mode) => {
      const groups = semanticGroups(mode, brandRamp, neutralRamp);
      const groupsHtml = groups
        .map(
          (g) => `<div class="token-group">
            <div class="token-group-title">${escapeHtml(g.title)}</div>
            <div class="token-grid">${g.tokens
              .map(([name, hex]) => `<div><span><span class="swab" style="background:${hex}"></span>${name}</span><code>${hex}</code></div>`)
              .join("")}</div>
          </div>`,
        )
        .join("\n");
      const isDark = mode === "dark";
      return `<div class="semantic-panel${isDark ? " dark" : ""}" data-mode="${mode}">
        <div class="demo-row">
          <button class="demo-btn" style="background:${brandRamp["600"]};color:${textOn(brandRamp["600"])}" disabled>action.primary</button>
          ${brandSecondaryRamp ? `<button class="demo-btn secondary" disabled>action.secondary</button>` : ""}
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

  const typeHtml = typography
    .map(
      (t) => `<div class="type-row">
        <div class="type-meta"><code>${escapeHtml(t.token)}</code><span>${escapeHtml(t.family)} ${t.weight} · ${t.size}/${t.lineHeight}px</span></div>
        <div class="type-sample" style="font-family:'${escapeHtml(t.family)}',var(--font-fallback);font-weight:${t.weight};font-size:${t.size}px;line-height:${t.lineHeight}px">The quick brown fox jumps over the lazy dog</div>
      </div>`,
    )
    .join("\n");

  const maxSpacingPx = Math.max(...Object.values(spacing).map((v) => parseInt(v.$value, 10)));
  const spacingHtml = Object.entries(spacing)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => {
      const px = parseInt(v.$value, 10);
      const barPx = Math.max(2, Math.round((px / Math.max(maxSpacingPx, 1)) * 160));
      return `<div class="spacing-row"><code class="spacing-key">spacing.${escapeHtml(key)}</code><div class="spacing-track"><div class="spacing-bar" style="width:${barPx}px"></div></div><span class="spacing-px">${v.$value}</span></div>`;
    })
    .join("\n");

  const radiusHtml = Object.entries(radius)
    .map(([key, v]) => {
      const px = Math.min(parseInt(v.$value, 10), 28);
      return `<div class="radius-item"><div class="radius-box" style="border-radius:${px}px"></div><code>radius.${escapeHtml(key)}</code><span>${v.$value}</span></div>`;
    })
    .join("\n");

  const shadowHtml = Object.entries(shadow)
    .map(([key, v]) => {
      const { css, label } = shadowDisplay(v);
      return `<div class="shadow-item"><div class="shadow-box" style="box-shadow:${css}"></div><code>shadow.${escapeHtml(key)}</code><span>${escapeHtml(label)}</span></div>`;
    })
    .join("\n");

  const opacityHtml = Object.entries(opacity)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => {
      return `<div class="opacity-item"><div class="opacity-box"><div style="background:rgba(31,32,29,${v.$value})"></div></div><code>${escapeHtml(key)}%</code></div>`;
    })
    .join("\n");

  const borderWidthHtml = Object.entries(borderWidth)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([key, v]) => `<div class="bw-item"><div class="bw-line" style="border-bottom-width:${v.$value}"></div><code>border-width.${escapeHtml(key)}</code><span>${v.$value}</span></div>`)
    .join("\n");

  const breakpointHtml = Object.entries(breakpoint)
    .map(([key, v]) => `<div class="spec-row"><code>breakpoint.${escapeHtml(key)}</code><span>${v.$value}</span></div>`)
    .join("\n");

  const gridHtml = Object.entries(grid)
    .map(
      ([tier, g]) =>
        `<div class="grid-tier"><code>${escapeHtml(tier)}</code><span>${g.columns.$value} columns · ${g.margin.$value} margin · ${g.gutter.$value} gutter</span></div>`,
    )
    .join("\n");

  // Advisory only — see pipeline-plan.md, "Accessibility checks are
  // advisory, not a gate." No warnings here doesn't claim everything was
  // checked and passed, just that nothing got flagged.
  const warningsHtml =
    warnings.length > 0
      ? `<p class="check fail">${warnings.length} accessibility warning(s):</p><ul>${warnings
          .map((w) => `<li>${escapeHtml(w.token)} — contrast ${w.ratio.toFixed(2)}:1, needs ${w.required}:1</li>`)
          .join("")}</ul>`
      : `<p class="check pass">No accessibility warnings flagged for this run.</p>`;

  const fileListHtml = fileNames.map((f) => `<li>${escapeHtml(f)}</li>`).join("");

  const runFields: Array<[string, string]> = [
    ["Framework", seed.targetFramework],
    ["Design language", seed.targetDesignLanguage],
    ["Scaffold mode", seed.scaffoldMode],
    ["Figma", seed.figmaManaged ? "figma-managed (not wired up yet)" : "code-only"],
    ["Modes", seed.lightDarkMode],
    ["Neutral style", seed.neutralColorStyle],
    ["Heading font", seed.primaryFont],
    ...(seed.secondaryFont ? ([["Body font", seed.secondaryFont]] as Array<[string, string]>) : []),
  ];

  const runFieldsHtml = runFields
    .map(([label, value]) => `<div class="run-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("\n");

  const colorFieldsHtml = [
    `<div class="run-field"><dt>Primary color</dt><dd><span class="dot" style="background:${seed.primaryColor}"></span><code>${seed.primaryColor}</code></dd></div>`,
    ...(seed.secondaryColor
      ? [
          `<div class="run-field"><dt>Secondary color</dt><dd><span class="dot" style="background:${seed.secondaryColor}"></span><code>${seed.secondaryColor}</code></dd></div>`,
        ]
      : []),
  ].join("\n");

  const fontFacesCss = [fontFaceCss(fontFiles, seed.primaryFont), fontFaceCss(fontFiles, seed.secondaryFont)]
    .filter(Boolean)
    .join("\n  ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Token report</title>
<style>
  ${fontFacesCss}
  :root {
    --bg: #F8F8F7; --surface: #FFFFFF; --text: #1F201D; --text-secondary: #474A41;
    --text-disabled: #6F7366; --border: #C9CBC4; --brand: ${brandRamp["600"]};
    --font-fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: '${escapeHtml(seed.secondaryFont ?? seed.primaryFont)}', var(--font-fallback); line-height: 1.5; }
  code, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 24px 88px; }
  header.run { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 36px; }
  .eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 8px; }
  h1 { font-family: '${escapeHtml(seed.primaryFont)}', var(--font-fallback); font-weight: 700; font-size: 30px; line-height: 1.2; margin: 0 0 18px; text-wrap: balance; }
  .run-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
  .run-field dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-disabled); margin: 0 0 3px; }
  .run-field dd { margin: 0; font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.12); flex-shrink: 0; }
  section { margin-bottom: 44px; }
  h2 { font-family: '${escapeHtml(seed.primaryFont)}', var(--font-fallback); font-weight: 600; font-size: 12.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 16px; }
  h3 { font-family: var(--mono); font-weight: 600; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-disabled); margin: 22px 0 10px; }
  h3:first-child { margin-top: 0; }
  .ramp-row { margin-bottom: 14px; }
  .ramp-label { font-family: var(--mono); font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px; }
  .ramp-cells { display: inline-flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); max-width: 100%; }
  .swatch { width: 60px; flex-shrink: 0; aspect-ratio: 1; display: flex; flex-direction: column; justify-content: flex-end; padding: 5px 6px; position: relative; }
  .swatch[data-base="true"]::after { content: "base"; position: absolute; top: 5px; right: 6px; font-family: var(--mono); font-size: 8px; text-transform: uppercase; opacity: 0.65; }
  .swatch-step { font-family: var(--mono); font-size: 10px; opacity: 0.85; }
  .swatch-hex { font-family: var(--mono); font-size: 9px; opacity: 0.7; display: block; }
  .status-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 16px; }
  .status-card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
  .status-chip { font-family: var(--mono); font-size: 11px; padding: 8px 10px; text-transform: capitalize; }
  .status-tone { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; font-size: 11px; }
  .status-tone code { font-size: 10px; }
  .mode-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 2px; margin-bottom: 16px; background: var(--surface); }
  .mode-toggle button { font-size: 12px; font-weight: 600; border: none; background: transparent; padding: 6px 16px; border-radius: 999px; cursor: pointer; color: var(--text-secondary); font-family: inherit; }
  .mode-toggle button[aria-pressed="true"] { background: var(--text); color: var(--bg); }
  .single-mode-note { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 16px; }
  .semantic-panel { border: 1px solid var(--border); border-radius: 12px; padding: 22px; display: none; }
  .semantic-panel[data-active="true"] { display: block; }
  .semantic-panel.dark { background: #1F201D; color: #F8F8F7; border-color: #33352F; }
  .demo-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
  .demo-btn { font-weight: 600; font-size: 13px; border: none; border-radius: 6px; padding: 9px 16px; cursor: default; font-family: inherit; }
  .demo-btn.secondary { background: transparent; border: 1px solid currentColor; color: inherit; }
  .token-group { max-width: 340px; margin-bottom: 18px; }
  .token-group:last-child { margin-bottom: 0; }
  .token-group-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; margin-bottom: 8px; }
  .token-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 16px; font-size: 11.5px; }
  .token-grid div { display: flex; justify-content: space-between; gap: 8px; }
  .token-grid code { font-size: 10.5px; opacity: 0.65; }
  .swab { width: 11px; height: 11px; border-radius: 3px; display: inline-block; margin-right: 5px; border: 1px solid rgba(127,127,127,0.3); vertical-align: -1px; }
  .type-row { display: flex; gap: 22px; align-items: baseline; padding: 14px 0; border-top: 1px solid var(--border); }
  .type-row:first-of-type { border-top: none; }
  .type-meta { width: 168px; flex-shrink: 0; display: flex; flex-direction: column; gap: 3px; }
  .type-meta code { font-size: 11.5px; }
  .type-meta span { font-size: 10.5px; color: var(--text-secondary); font-family: var(--mono); }
  .type-sample { text-wrap: balance; }
  .spacing-row { display: grid; grid-template-columns: 90px 1fr 56px; align-items: center; gap: 12px; padding: 5px 0; font-size: 11.5px; }
  .spacing-key { color: var(--text-secondary); }
  .spacing-track { height: 12px; display: flex; align-items: center; }
  .spacing-bar { height: 9px; background: var(--brand); border-radius: 2px; }
  .spacing-px { text-align: right; color: var(--text-secondary); font-family: var(--mono); }
  .radius-strip, .shadow-strip, .opacity-strip, .bw-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 14px; }
  .radius-item, .shadow-item, .opacity-item, .bw-item { display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 10.5px; text-align: center; }
  .radius-box { width: 52px; height: 52px; background: var(--text-disabled); }
  .shadow-box { width: 52px; height: 52px; background: var(--surface); border-radius: 6px; }
  .opacity-box { width: 52px; height: 52px; border-radius: 6px; background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 10px 10px; background-position: 0 0, 0 5px, 5px -5px, -5px 0; }
  .opacity-box > div { width: 100%; height: 100%; border-radius: 6px; }
  .bw-line { width: 52px; border-bottom: 4px solid var(--text); margin-top: 24px; }
  .radius-item span, .shadow-item span, .bw-item span { color: var(--text-secondary); }
  .spec-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 11.5px; border-top: 1px solid var(--border); }
  .spec-row:first-of-type { border-top: none; }
  .spec-row span { color: var(--text-secondary); font-family: var(--mono); }
  .grid-tier { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 11.5px; border-top: 1px solid var(--border); }
  .grid-tier:first-of-type { border-top: none; }
  .grid-tier span { color: var(--text-secondary); font-family: var(--mono); font-size: 11px; }
  footer { border-top: 1px solid var(--border); padding-top: 22px; font-size: 11.5px; color: var(--text-secondary); }
  .check { font-weight: 600; font-size: 12.5px; }
  .check.pass { color: #117837; }
  .check.fail { color: #781111; }
  footer ul { margin: 8px 0; padding-left: 18px; }
  footer li { margin-bottom: 3px; font-family: var(--mono); font-size: 11px; }
  @media (max-width: 480px) {
    .run-grid, .token-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="run">
    <p class="eyebrow">SDSGT · promote output</p>
    <h1>Token report</h1>
    <dl class="run-grid">
      ${runFieldsHtml}
      ${colorFieldsHtml}
    </dl>
  </header>

  <section>
    <h2>Color primitives</h2>
    ${rampsHtml}
    <div class="ramp-label">status</div>
    <div class="status-strip">${statusHtml}</div>
  </section>

  <section>
    <h2>Semantic color</h2>
    ${toggleHtml}
    ${modePanels}
  </section>

  <section>
    <h2>Typography</h2>
    ${typeHtml}
  </section>

  <section>
    <h2>Spacing</h2>
    ${spacingHtml}
  </section>

  <section>
    <h2>Radius</h2>
    <div class="radius-strip">${radiusHtml}</div>
  </section>

  <section>
    <h2>Shadow</h2>
    <div class="shadow-strip">${shadowHtml}</div>
  </section>

  <section>
    <h2>Opacity</h2>
    <div class="opacity-strip">${opacityHtml}</div>
  </section>

  <section>
    <h2>Fixed defaults</h2>
    <h3>Border width</h3>
    <div class="bw-strip">${borderWidthHtml}</div>
    <h3>Breakpoints</h3>
    ${breakpointHtml}
    <h3>Grid</h3>
    ${gridHtml}
  </section>

  <footer>
    ${warningsHtml}
    <ul>${fileListHtml}</ul>
  </footer>
</div>
<script>
  document.querySelectorAll('.semantic-panel').forEach(function (p) {
    p.setAttribute('data-active', p.dataset.mode === 'light' ? 'true' : ${modes.length > 1 ? "'false'" : "'true'"});
  });
  function setMode(mode) {
    document.querySelectorAll('.semantic-panel').forEach(function (p) {
      p.setAttribute('data-active', p.dataset.mode === mode ? 'true' : 'false');
    });
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.target === mode));
    });
  }
</script>
</body>
</html>
`;
}
