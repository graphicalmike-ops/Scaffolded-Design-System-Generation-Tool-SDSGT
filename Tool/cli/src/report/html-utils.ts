// Small pure HTML-rendering helpers shared by both report generators:
// report/index.ts (Promote's report.html) and generate/demo.ts (Generate's
// per-platform *-design-system-demo.html files). Kept tiny and dependency-free
// on purpose — anything with real per-tool logic (ramp relabeling, DTCG
// reading) stays local to whichever module actually needs it.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1F201D" : "#FFFFFF";
}

// Tailwind/Bootstrap shadow entries are $type "shadow" (real CSS layers).
// MD3/MD2 entries are $type "dimension" (an elevation dp/px number) — there's
// no real box-shadow to read yet, since the tonal-surface-overlay math that
// would turn elevation into an actual MD3 shadow is generator-layer work
// that isn't built (see contracts-and-seeds.md, "Shadow"). Synthesize a
// plausible-looking shadow from the elevation number just for this preview,
// and label it as elevation rather than claiming it's the real render.
export interface PageStyleOptions {
  // Raw @font-face CSS (already-built string, possibly empty) — see
  // report/index.ts's fontFaceCss.
  fontFacesCss: string;
  brandHex: string;
  // Already-escaped font-family names (caller runs escapeHtml first, same
  // as every other user-controlled string embedded in this page).
  bodyFont: string;
  headingFont: string;
}

// The shared visual chrome for every SDSGT-generated proof-of-work page —
// Promote's report.html and each Generate-stage *-design-system-demo.html —
// so both stages render as one consistent visual system rather than
// diverging designs. Pulled out of report/index.ts verbatim (no visual
// change), parameterized only by the handful of values that differ between
// callers (fonts, brand accent, embedded font-face data).
export function buildPageStyleCss({ fontFacesCss, brandHex, bodyFont, headingFont }: PageStyleOptions): string {
  return `<style>
  ${fontFacesCss}
  :root {
    --bg: #F8F8F7; --surface: #FFFFFF; --text: #1F201D; --text-secondary: #474A41;
    --text-disabled: #6F7366; --border: #C9CBC4; --brand: ${brandHex};
    --font-fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: '${bodyFont}', var(--font-fallback); line-height: 1.5; }
  code, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 24px 88px; }
  header.run { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 36px; }
  .eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 8px; }
  h1 { font-family: '${headingFont}', var(--font-fallback); font-weight: 700; font-size: 30px; line-height: 1.2; margin: 0 0 18px; text-wrap: balance; }
  .run-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
  .run-field dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-disabled); margin: 0 0 3px; }
  .run-field dd { margin: 0; font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.12); flex-shrink: 0; }
  section { margin-bottom: 44px; }
  h2 { font-family: '${headingFont}', var(--font-fallback); font-weight: 600; font-size: 12.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 16px; }
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
  .token-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; font-size: 11.5px; }
  .token-item { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .token-label { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .token-hex { font-size: 10.5px; opacity: 0.65; padding-left: 16px; }
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
  .stage-banner { border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin: 0 0 28px; font-size: 12.5px; line-height: 1.6; background: var(--surface); }
  .stage-banner strong { display: block; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 4px; }
  .stage-banner.agnostic { border-left: 4px solid var(--text-disabled); color: var(--text-secondary); }
  .stage-banner.adapted { border-left: 4px solid var(--brand); }
  .comp-btn-outline { background: transparent; border: 1px solid currentColor; }
  .comp-card { border: 1px solid var(--border); padding: 18px; margin-bottom: 20px; max-width: 320px; }
  .comp-card-title { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
  .comp-card-body { font-size: 12.5px; margin-bottom: 14px; line-height: 1.5; }
  .comp-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; max-width: 280px; margin-bottom: 20px; }
  .comp-input { padding: 8px 10px; border: 1px solid; font-size: 13px; font-family: inherit; font-weight: 400; }
  .comp-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-transform: capitalize; margin: 0 6px 6px 0; }
  .comp-alert { padding: 12px 14px; font-size: 12.5px; line-height: 1.5; max-width: 420px; }
  @media (max-width: 480px) {
    .run-grid, .token-grid { grid-template-columns: 1fr; }
  }
</style>`;
}

// A one-line callout at the top of every page, right under the <h1> —
// Promote's report.html says "platform-agnostic" (`kind: "agnostic"`),
// each Generate-stage demo says which real platform its values were
// adapted to (`kind: "adapted"`). `bodyHtml` may contain inline markup
// (e.g. <code>) — same convention as every other block-builder in this
// module and in report/index.ts/generate/demo.ts: callers escape any
// user-controlled leaf values themselves before interpolating.
export function stageBannerHtml(kind: "agnostic" | "adapted", title: string, bodyHtml: string): string {
  return `<div class="stage-banner ${kind}"><strong>${escapeHtml(title)}</strong>${bodyHtml}</div>`;
}

export function shadowDisplay(entry: { $type: string; $value: unknown }): { css: string; label: string } {
  if (entry.$type === "dimension") {
    const px = parseInt(String(entry.$value), 10);
    return { css: `0 ${px}px ${px * 2}px rgba(0,0,0,0.15)`, label: `${entry.$value} elevation (approximated)` };
  }
  const layers = Array.isArray(entry.$value) ? entry.$value : [entry.$value];
  const css = layers.map((l: any) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${l.color}`).join(", ");
  const label = `${layers.length} layer${layers.length > 1 ? "s" : ""}`;
  return { css, label };
}
