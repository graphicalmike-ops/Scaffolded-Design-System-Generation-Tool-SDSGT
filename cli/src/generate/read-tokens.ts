// Shared by every generator that reads the DTCG token spec directly rather
// than running it through Style Dictionary (bootstrap.ts, md2.ts, and
// others as they're built) — these generators pull a curated set of
// specific values rather than transforming the whole token tree, so a
// plain JSON read is simpler and more direct than Style Dictionary's
// tree-walking machinery (see bootstrap.ts's file header for why).

import { readFileSync } from "node:fs";

export interface DtcgColorToken {
  $type: "color";
  $value: string;
}

export interface DtcgDimensionToken {
  $type: "dimension";
  $value: string;
}

export interface ColorPrimitivesFile {
  color: {
    primitive: {
      brand: Record<string, DtcgColorToken>;
      "brand-secondary"?: Record<string, DtcgColorToken>;
      neutral: Record<string, DtcgColorToken>;
      static: Record<string, DtcgColorToken>;
      status: Record<string, Record<string, DtcgColorToken>>;
    };
  };
}

export interface RadiusFile {
  radius: Record<string, DtcgDimensionToken>;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
