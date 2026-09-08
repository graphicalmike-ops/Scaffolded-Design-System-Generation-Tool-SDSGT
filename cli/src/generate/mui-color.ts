// MUI's own color-manipulation math, reimplemented from source (not
// approximated) so palette.ts's derived light/dark/contrastText values
// match what @mui/material's createPalette.js would actually produce for
// the same main color. Verified against the real MUI source:
// - lighten/darken: packages/mui-system/src/colorManipulator/colorManipulator.js
// - tonal offset (0.2 light / 0.3 dark) + contrastThreshold (3):
//   packages/mui-material/src/styles/createPalette.js, augmentColor()
//
// Verified against MUI 9.x (decided 2026-09-08, checked against the real
// npm-published @mui/material@9.4.0 and @mui/system@9.4.0 tarballs, the
// current latest — not just GitHub's unpinned default branch). This exact
// formula (same constants, same per-channel math) has been unchanged across
// MUI's 4/5/6/7/8/9 majors, so this isn't a fragile version-specific target
// the way Bootstrap's radius variable names are — still worth re-checking
// against real source if MUI ever changes it, rather than assuming it holds
// forever.
//
// One deliberate departure from MUI's own literal defaults: contrastText
// picks between OUR static.100/static.200 primitives (passed in by the
// caller), not MUI's hardcoded '#fff' / 'rgba(0, 0, 0, 0.87)' — this stays
// inside our own token system rather than injecting a foreign literal, per
// pipeline-plan.md's "derive ... from the semantic layer plus the static
// white/black primitives." The contrast-ratio math itself (and the >= 3
// threshold) is unchanged from MUI's real algorithm.

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// MUI's recomposeColor uses `parseInt(n, 10)` on the computed channel value,
// i.e. truncation toward zero, not rounding — replicated here with
// Math.trunc rather than Math.round to match MUI's real output exactly.
const clampChannel = (v: number) => Math.trunc(Math.min(255, Math.max(0, v)));

export function lighten(hex: string, coefficient: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r, g, b].map((v) => clampChannel(v + (255 - v) * coefficient)) as Rgb);
}

export function darken(hex: string, coefficient: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r, g, b].map((v) => clampChannel(v * (1 - coefficient))) as Rgb);
}

// WCAG relative luminance — same formula and 3-decimal truncation as MUI's
// getLuminance().
function luminance(hex: string): number {
  const channels = hexToRgb(hex).map((v) => {
    const normalized = v / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  return Number((0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(3));
}

function contrastRatio(foreground: string, background: string): number {
  const lumA = luminance(foreground);
  const lumB = luminance(background);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

// MUI's own contrastThreshold default.
const CONTRAST_THRESHOLD = 3;

export function contrastText(main: string, white: string, black: string): string {
  return contrastRatio(main, white) >= CONTRAST_THRESHOLD ? white : black;
}

export interface MuiColorGroup {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

// MUI's own tonal offsets: light = lighten(main, 0.2), dark = darken(main,
// tonalOffset * 1.5 = 0.3) — see createPalette.js, addLightOrDark().
export function augmentColor(main: string, white: string, black: string): MuiColorGroup {
  return {
    main,
    light: lighten(main, 0.2),
    dark: darken(main, 0.3),
    contrastText: contrastText(main, white, black),
  };
}
