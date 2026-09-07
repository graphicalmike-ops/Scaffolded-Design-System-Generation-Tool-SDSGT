// Minimal DTCG token shapes + constructor helpers, per contracts-and-seeds.md's
// "DTCG type mapping" table. Deliberately small — just enough structure to
// build the token files Promote emits, not a full DTCG-spec implementation.

export interface ColorToken {
  $type: "color";
  $value: string;
}

export interface DimensionToken {
  $type: "dimension";
  $value: string; // e.g. "16px"
}

export interface NumberToken {
  $type: "number";
  $value: number;
}

export interface AliasToken {
  $value: string; // "{dot.path}"
}

export interface ShadowLayer {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

export interface ShadowToken {
  $type: "shadow";
  $value: ShadowLayer | ShadowLayer[];
}

export interface TypographyToken {
  $type: "typography";
  $value: {
    fontFamily: string;
    fontWeight: string;
    fontSize: string;
    lineHeight: string;
  };
}

export type TokenNode = { [key: string]: TokenNode } | Record<string, unknown>;

export const color = (hex: string): ColorToken => ({ $type: "color", $value: hex });
export const dimension = (px: number): DimensionToken => ({ $type: "dimension", $value: `${px}px` });
export const number = (n: number): NumberToken => ({ $type: "number", $value: n });
export const alias = (path: string): AliasToken => ({ $value: `{${path}}` });
