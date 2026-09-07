// The ramp-interpolation formula from contracts-and-seeds.md, "Color primitives":
// hold hue and saturation constant, interpolate lightness in 5 equal steps
// toward a fixed near-white (97%) / near-black (12%) target on each side.

import { type HSL, hslToHex } from "./hsl.ts";

const LIGHT_TARGET = 97;
const DARK_TARGET = 12;
const LIGHT_STEPS = [500, 400, 300, 200, 100] as const;
const DARK_STEPS = [700, 800, 900, 1000, 1100] as const;

export type Ramp = Record<
  "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "1000" | "1100",
  string
>;

export function generateRamp(base: HSL): Ramp {
  const { h, s, l } = base;
  const ramp: Partial<Ramp> = { "600": hslToHex(base) };

  LIGHT_STEPS.forEach((step, idx) => {
    const i = idx + 1;
    const newL = l + (LIGHT_TARGET - l) * (i / 5);
    ramp[String(step) as keyof Ramp] = hslToHex({ h, s, l: newL });
  });

  DARK_STEPS.forEach((step, idx) => {
    const i = idx + 1;
    const newL = l - (l - DARK_TARGET) * (i / 5);
    ramp[String(step) as keyof Ramp] = hslToHex({ h, s, l: newL });
  });

  return ramp as Ramp;
}
