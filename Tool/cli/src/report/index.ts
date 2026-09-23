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
import { escapeHtml, textOn, shadowDisplay, buildPageStyleCss, stageBannerHtml } from "./html-utils.ts";

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
              .map(([name, hex]) => `<div class="token-item"><div class="token-label"><span class="swab" style="background:${hex}"></span>${name}</div><code class="token-hex">${hex}</code></div>`)
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
${buildPageStyleCss({ fontFacesCss, brandHex: brandRamp["600"], bodyFont: escapeHtml(seed.secondaryFont ?? seed.primaryFont), headingFont: escapeHtml(seed.primaryFont) })}
</head>
<body>
<div class="page">
  <header class="run">
    <p class="eyebrow">SDSGT · promote output</p>
    <h1>Token report</h1>
    ${stageBannerHtml(
      "agnostic",
      "Platform-agnostic token spec",
      ` These values are identical regardless of framework or design language — nothing here is adapted yet. This file is a record of the raw token spec, not the one to look at for how your project's tokens actually turned out; see the Generate step's <code>&lt;platform&gt;-design-system-demo.html</code> for that.`,
    )}
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
