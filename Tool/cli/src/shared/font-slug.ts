// Shared between promote's font-embedding (`--fonts-dir`, see cli.ts) and
// Layer 3's Next.js scaffold (same already-fetched files, same convention)
// — a single source of truth for the naming rule, since both consumers
// must agree on it exactly or a font lookup silently misses.
//
// Convention: <fonts-dir>/<slugified family name>-<weight>.woff2 — e.g.
// "Source Sans Pro" weight 600 -> "source-sans-pro-600.woff2". These files
// are never fetched by this CLI itself — network access stays in the
// agent/adapter layer (see pipeline-plan.md, "Tool architecture") — see
// "Fetching fonts" in the SDSGT-start skill for how they get created.

export function slugFont(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// typography.primitive.fontWeight never generates any other value (see
// contracts-and-seeds.md, "Fetching fonts") — these are the only weights
// ever worth looking up.
export const FONT_WEIGHTS = [400, 600, 700] as const;
