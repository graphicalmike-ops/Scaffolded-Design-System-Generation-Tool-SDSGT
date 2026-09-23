// Boilerplate status-color formula from contracts-and-seeds.md, "Color primitives".
// The only status-color formula (a brand-derived variant was considered and
// dropped — see contracts-proposals.md). `.200` (the saturated/dark tone) is
// sourced directly from real frameworks rather than an invented hue, per
// role: error/success/info from MUI's default palette, warning from
// Bootstrap 5.3's $warning, promo from a supplied brand swatch (no framework
// defines an equivalent 5th role). `.100` is derived, not sourced — same
// hue/saturation as `.200`, lightness raised to 95% for a pale tint.
//
// `.100` and `.200` are NOT required to pass contrast against each other —
// they aren't assumed to render stacked (a `.200` badge/icon/border might
// sit on a neutral surface instead of its own `.100` tint), and warm hues
// like warning/promo structurally can't hit 3:1 against any pale tint of
// themselves regardless of source. See "Accessibility checks are advisory,
// not a gate" in pipeline-plan.md.

import { hexToHsl, hslToHex } from "./hsl.ts";

const ROLE_ORDER = ["error", "success", "warning", "info", "promo"] as const;
type StatusRole = (typeof ROLE_ORDER)[number];

const BASE_HEX: Record<StatusRole, string> = {
  error: "#D32F2F", // MUI error.main (red[700])
  success: "#2E7D32", // MUI success.main (green[800])
  warning: "#FFC107", // Bootstrap 5.3 $warning
  info: "#0288D1", // MUI info.main (lightBlue[700])
  promo: "#FFA445", // supplied brand swatch, not framework-sourced
};

export interface StatusTone {
  role: StatusRole;
  "100": string;
  "200": string;
}

export function generateBoilerplateStatusPalette(): Record<"1" | "2" | "3" | "4" | "5", StatusTone> {
  const result = {} as Record<"1" | "2" | "3" | "4" | "5", StatusTone>;
  ROLE_ORDER.forEach((role, idx) => {
    const n = String(idx + 1) as "1" | "2" | "3" | "4" | "5";
    const base = BASE_HEX[role];
    const hsl = hexToHsl(base);
    result[n] = {
      role,
      "100": hslToHex({ h: hsl.h, s: hsl.s, l: 95 }),
      "200": base,
    };
  });
  return result;
}
