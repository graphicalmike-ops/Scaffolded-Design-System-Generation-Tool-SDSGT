// Builds a deterministic, pure-data plan describing exactly what component
// (variants, bindings, structure) to create in Figma from a scaffolded
// project's REAL vendored component source — same "CLI computes the plan,
// the push procedure only replays it" split promote/figma-plan.ts already
// uses for tokens (see that file's own header for the full reasoning: the
// actual figma_* tool calls can't live here, since Figma's write surface is
// only reachable from inside a live agent session with the Desktop Bridge
// connected, but everything upstream of those calls has no such
// dependency).
//
// Scope, deliberate (see docs/layer2-layer3-plan.md, "components must also
// push to Figma," 2026-09-15 entry, for the full session this was proven
// against): shadcn/ui's Button only, one size ("default" — the only
// Tailwind height, h-8, that matches an SDSGT spacing token exactly), rest
// states only (no hover:/aria-*: pseudo-states — those aren't separate
// Figma variants in this pass). A real, generalizable parser (CVA variant
// extraction, Tailwind-class-to-Figma-variable mapping, nearest-real-token
// resolution for values with no exact match), not a one-off script for
// Button specifically — extending to more components/sizes later is a
// matter of adding to CVA_AXIS/CLASS_PREFIX_TO_SDSGT_PATH, not rewriting
// this file's mechanism.
//
// The shadcn CSS-var -> SDSGT semantic path table below is the exact
// mapping contracts-and-seeds.md's "shadcn/ui theming" section documents
// for generate/shadcn.ts, applied in the OPPOSITE direction (there: SDSGT
// token -> shadcn var, for writing theme.css; here: shadcn var, as it
// appears in real vendored component source, -> SDSGT token, for finding
// which already-pushed Figma variable a component's own color should bind
// to). One real, deliberate departure from that table, found live by
// actually screenshotting the result: `--destructive-foreground` is NOT
// bound to `status.error-text` here, even though that's the nominal
// semantic match — contracts-and-seeds.md already documents that
// `status.error-text` aliases to the exact same variable as `status.error`
// itself (a real, same-tone trap, not usable as a contrasting foreground).
// Bound to `text.on-primary` instead (real white, already correct for text
// sitting on a filled/colored background) — same fix `generate/shadcn.ts`
// itself applies via `contrastText()`, just reusing an already-pushed
// variable here instead of computing a new one.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface FigmaComponentVariantPlanItem {
  name: string; // Figma-safe variant value, e.g. "Default", "Outline"
  fillVariable?: string; // Figma variable name, e.g. "color/semantic/action/primary" — absent means transparent
  textVariable: string;
  strokeVariable?: string;
  underline?: boolean;
}

export interface FigmaComponentPlanItem {
  name: string; // "Button"
  variantPropertyName: string; // "Variant"
  variants: FigmaComponentVariantPlanItem[];
  skippedVariants: Array<{ name: string; reason: string }>;
  radiusVariable: string;
  paddingHorizontalVariable: string;
  paddingVerticalVariable: string;
  fontSizeVariable: string;
  fontFamilyVariable: string;
  labelPropertyName: string;
  defaultLabel: string;
}

export interface FigmaComponentsPushPlan {
  components: FigmaComponentPlanItem[];
  notes: string[];
}

// contracts-and-seeds.md, "shadcn/ui theming" — the exact mapping table,
// applied in reverse (see file header). `destructive-foreground` is the one
// deliberate departure, handled as a special case below rather than through
// this table.
const SHADCN_VAR_TO_SDSGT_PATH: Record<string, string> = {
  background: "background.primary",
  foreground: "text.primary",
  card: "background.surface",
  "card-foreground": "text.on-surface",
  popover: "background.surface",
  "popover-foreground": "text.on-surface",
  primary: "action.primary",
  "primary-foreground": "text.on-primary",
  secondary: "action.secondary",
  "secondary-foreground": "text.on-primary",
  muted: "background.secondary",
  "muted-foreground": "text.secondary",
  destructive: "status.error",
  border: "border.default",
  input: "border.default",
  ring: "border.focus",
};

function sdsgtPathToFigmaName(path: string): string {
  return `color/semantic/${path.replace(/\./g, "/")}`;
}

// Only plain, unmodified Tailwind utility classes are recognized — no
// pseudo-state prefixes (hover:/aria-*:/dark:), no arbitrary bracket
// values, no opacity modifiers (bg-destructive/10 resolves to the same
// variable as bg-destructive, the /10 itself is dropped — a real,
// disclosed simplification, not a parse failure). Returns null for
// anything unrecognized so the caller can record what got skipped, rather
// than silently guessing.
function classToFigmaVariable(className: string): { kind: "fill" | "text" | "border"; variable: string } | null {
  const match = className.match(/^(bg|text|border)-([a-z-]+?)(\/\d+)?$/);
  if (!match) return null;
  const [, prefix, varName] = match;
  const sdsgtPath = varName === "destructive-foreground" ? null : SHADCN_VAR_TO_SDSGT_PATH[varName];
  if (!sdsgtPath) return null;
  const kind = prefix === "bg" ? "fill" : prefix === "text" ? "text" : "border";
  return { kind, variable: sdsgtPathToFigmaName(sdsgtPath) };
}

// Extracts a named axis's variant map from a real `cva(...)` call's source
// text via a targeted regex, not a full TS/JS parser — real, pragmatic
// scope for shadcn's own consistent generated formatting (verified against
// a real vendored button.tsx). Returns an ordered array of [variantName,
// classString] pairs; throws with a clear message if the expected
// `variants: { <axisName>: { ... } }` shape isn't found, rather than
// silently returning nothing.
function parseCvaAxis(source: string, axisName: string): Array<[string, string]> {
  const axisMatch = source.match(new RegExp(`${axisName}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`));
  if (!axisMatch) {
    throw new Error(`Could not find a "${axisName}: { ... }" block in the component source — real vendored shadcn source may have changed shape since this parser was written.`);
  }
  const body = axisMatch[1];
  const entries: Array<[string, string]> = [];
  const entryPattern = /(["']?)([a-zA-Z0-9-]+)\1:\s*(?:"([^"]*)"|`([^`]*)`)/g;
  let m: RegExpExecArray | null;
  while ((m = entryPattern.exec(body)) !== null) {
    const [, , key, dq, backtick] = m;
    entries.push([key, (dq ?? backtick ?? "").replace(/\s+/g, " ").trim()]);
  }
  return entries;
}

// Reads every `--<cssPrefix>-<key>: <N>px;` custom property out of the base
// plain-CSS platform's own `css/tokens.css` (always written by `generate`,
// regardless of platform flag — see generate/index.ts — so this needs no
// new CLI plumbing to reach the raw DTCG spec directory separately). Same
// resolved values the DTCG JSON has, just already flattened to real px
// numbers keyed by the token's own key segment.
function readCssScale(tokensCss: string, cssPrefix: string): Record<string, number> {
  const pattern = new RegExp(`--${cssPrefix}-([a-z0-9-]+):\\s*([\\d.]+)px;`, "g");
  const scale: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(tokensCss)) !== null) {
    scale[m[1]] = parseFloat(m[2]);
  }
  return scale;
}

// Picks the real spacing/radius token whose pixel value is numerically
// closest to a raw target — real, disclosed approximation for the Tailwind
// half-step values (px-2.5, gap-1.5) this pipeline's own integer-step
// scale has no exact match for (see file header). Returns both the token's
// Figma name and how far off the match was, so callers can decide whether
// to note the gap.
function nearestToken(targetPx: number, scale: Record<string, number>, figmaPrefix: string): { figmaName: string; deltaPx: number } {
  let best: { key: string; px: number } | null = null;
  for (const [key, px] of Object.entries(scale)) {
    if (best === null || Math.abs(px - targetPx) < Math.abs(best.px - targetPx)) best = { key, px };
  }
  if (!best) throw new Error(`Scale for ${figmaPrefix} has no entries — was css/tokens.css written by this pipeline's \`generate\`?`);
  return { figmaName: `${figmaPrefix}/${best.key}`, deltaPx: Math.abs(best.px - targetPx) };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildButtonPlan(tokensCss: string, buttonSource: string, notes: string[]): FigmaComponentPlanItem {
  const variantEntries = parseCvaAxis(buttonSource, "variant");

  const variants: FigmaComponentVariantPlanItem[] = [];
  const skippedVariants: Array<{ name: string; reason: string }> = [];

  for (const [name, classString] of variantEntries) {
    const classes = classString.split(" ").filter(Boolean);
    let fillVariable: string | undefined;
    let textVariable: string | undefined;
    let strokeVariable: string | undefined;

    for (const cls of classes) {
      const parsed = classToFigmaVariable(cls);
      if (!parsed) continue;
      if (parsed.kind === "fill") fillVariable = parsed.variable;
      else if (parsed.kind === "text") textVariable = parsed.variable;
      else if (parsed.kind === "border") strokeVariable = parsed.variable;
    }

    // The one deliberate departure from a mechanical class->variable
    // lookup — see file header. Real vendored source uses
    // `text-destructive` for the REST-state text color, which correctly
    // resolves to status.error above; but contracts-and-seeds.md's own
    // caution about the SAME-tone trap applies here too (status.error text
    // on a status.error-derived fill is exactly the invisible-text bug
    // this was caught by, live, building the first version of this
    // component) — reused text.on-primary (real white) for the fill/text
    // pairing this parser builds, same fix applied live.
    if (name === "destructive") {
      textVariable = sdsgtPathToFigmaName("text.on-primary");
    }
    // No recognized color classes at all (e.g. "ghost"/"link" — genuinely
    // no bg-*/border-* in shadcn's own real source, real transparent
    // variants, not a parse failure) still needs a real text fallback.
    if (!textVariable) textVariable = sdsgtPathToFigmaName(name === "link" ? "action.primary" : "text.primary");

    if (classString.includes("bg-secondary") || classString.includes("text-secondary-foreground")) {
      skippedVariants.push({
        name,
        reason: "requires color/semantic/action/secondary, which only exists when the original seed supplied a secondary brand color — not fabricated when it doesn't.",
      });
      continue;
    }

    variants.push({
      name: capitalize(name),
      fillVariable,
      textVariable,
      strokeVariable,
      underline: name === "link",
    });
  }

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  // Real values from shadcn's own current source (see file header for the
  // "one size, exact-token-match only" scope decision): rounded-lg (8px),
  // size.default's h-8 (32px, the one height with an exact spacing-token
  // match), px-2.5 (10px) and implied ~4-6px vertical padding (no exact
  // token for either — nearest real token used, deltaPx noted below).
  const radiusMatch = nearestToken(8, radius, "radius");
  const paddingHMatch = nearestToken(10, spacing, "spacing");
  const paddingVMatch = nearestToken(5, spacing, "spacing");
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Button ${label}: nearest real spacing token is ${match.deltaPx}px off shadcn's own exact Tailwind value — see file header for why (no exact token for Tailwind's half-step classes).`);
    }
  }

  return {
    name: "Button",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Primary button",
  };
}

// codeDir: the matching `generate` run's --out directory (needed only for
// its always-written css/tokens.css — see readCssScale above, no separate
// --tokens-dir plumbing required). vendoredComponentsDir: the scaffolded
// project's real component directory (e.g. "<outDir>/src/components/ui"
// for Next.js+shadcn/ui). Only Button is built today (see file header) — a
// component with no recognized file at this path is silently absent from
// the plan, not an error, since not every scaffold vendors every component
// this parser knows about yet.
export function buildFigmaComponentsPushPlan(codeDir: string, vendoredComponentsDir: string): FigmaComponentsPushPlan {
  const notes: string[] = [];
  const components: FigmaComponentPlanItem[] = [];

  const buttonPath = join(vendoredComponentsDir, "button.tsx");
  if (existsSync(buttonPath)) {
    const tokensCss = readFileSync(join(codeDir, "css", "tokens.css"), "utf-8");
    const buttonSource = readFileSync(buttonPath, "utf-8");
    components.push(buildButtonPlan(tokensCss, buttonSource, notes));
  } else {
    notes.push(`No button.tsx found at ${vendoredComponentsDir} — this plan only covers Button today, and this project doesn't have one vendored at the expected path.`);
  }

  return { components, notes };
}
