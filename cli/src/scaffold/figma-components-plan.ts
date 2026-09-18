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
// against, and its follow-ups for Badge/Toggle/Alert/Input/Textarea):
// shadcn/ui's Button, Badge, Toggle, Alert (2026-09-17), plus Input and
// Textarea (2026-09-17, same day) — one size each ("default" — the only
// Tailwind height, h-8, that matches an SDSGT spacing token exactly, for
// the components that have more than one real size), rest states only (no
// hover:/aria-*: pseudo-states — those aren't separate Figma variants in
// this pass), one text label each except Alert, which now also carries a
// real second line for its own AlertDescription (see
// `secondaryTextVariable` on `FigmaComponentPlanItem`, and buildAlertPlan's
// own comment for the one real, disclosed simplification: always
// text.secondary, not destructive-tinted on the destructive variant, since
// that class sits behind a `*:data-[slot=...]:` selector prefix this
// parser doesn't parse). Input/Textarea show their PLACEHOLDER text, not
// typed content — see buildInputPlan's own comment. Two real component
// shapes, both proven: `cva()`-based multi-variant components (Button/
// Badge/Toggle/Alert, via `buildVariantsFromCva`) and single-state
// components with no `cva()` at all (Input/Textarea, via
// `scanClassesForColors` — same underlying class-to-variable mapping,
// applied to one class string instead of a parsed variant axis, wrapped in
// a plan with exactly one variant so `SDSGT-figma-push`'s own replay
// mechanism needs zero shape-specific branching for those). The optional
// second-text-line addition (`secondaryTextVariable` etc., proven against
// Alert) is a real, minimal step toward the harder "compound component"
// bucket below, NOT the same thing as actually supporting one — it adds
// one more text line under a single frame, not multiple named sub-parts,
// nested frames, or nested auto-layout. Confirmed to actually generalize —
// not just Button-shaped code with the names changed — by checking EVERY
// real component in a fully-vendored (`shadcn add --all`) project before
// picking any of these: components with a size-independent color
// "variant" axis went through `buildVariantsFromCva`; single-state
// box-shaped components (Input, Textarea) went through
// `scanClassesForColors`; compound/multi-part components that need actual
// new structure beyond one extra text line (Card, Dialog, Sheet, Table,
// Sidebar, ...) — real, separate, larger work, not attempted here.
// Extending to more components/sizes/frameworks is a matter of adding a
// `build<X>Plan` function reusing one of these mechanisms plus a row in
// `COMPONENT_BUILDERS` below, not rewriting this file's own mechanism.
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

// One section of a real compound component's own layout — e.g. Card's
// Header or Content. Added 2026-09-17, alongside `sections` below. Each
// section is its own horizontally-padded vertical text stack; sections
// themselves stack vertically inside the component's outer frame.
export interface FigmaComponentSectionPlanItem {
  paddingHorizontalVariable: string;
  textLines: Array<{
    textVariable: string;
    fontSizeVariable: string;
    weight: "Medium" | "Regular";
    labelPropertyName: string;
    defaultLabel: string;
  }>;
}

export interface FigmaComponentPlanItem {
  name: string; // "Button"
  variantPropertyName: string; // "Variant"
  variants: FigmaComponentVariantPlanItem[];
  skippedVariants: Array<{ name: string; reason: string }>;
  radiusVariable: string;
  // Optional as of 2026-09-17 — a `sections`-based compound component
  // (Card) has no single flat padding/font/label the way every earlier
  // component does, so these are genuinely inapplicable rather than
  // omitted by oversight. Every non-compound component still always sets
  // them; only `buildCardPlan` (and any future `sections`-based
  // component) leaves them unset.
  paddingHorizontalVariable?: string;
  paddingVerticalVariable?: string;
  fontSizeVariable?: string;
  fontFamilyVariable: string;
  labelPropertyName?: string;
  defaultLabel?: string;
  // A second, smaller text line stacked below the primary label — added
  // 2026-09-17 for Alert's real AlertDescription, which every component
  // built before it didn't have. Deliberately a SINGLE shared color/size
  // across every variant, not per-variant like `textVariable` — Alert's
  // own real description does turn a translucent destructive red on the
  // destructive variant (`*:data-[slot=alert-description]:text-
  // destructive/90`), but that class is nested behind a `*:data-[slot=...]:`
  // selector prefix this parser's simple `bg-/text-/border-` regex was
  // never built to match — a real, disclosed simplification (always
  // `text.secondary`), not a parse failure silently producing the wrong
  // value. Optional — every component built before this stays a single
  // text line, unaffected.
  secondaryTextVariable?: string;
  secondaryFontSizeVariable?: string;
  secondaryLabelPropertyName?: string;
  defaultSecondaryLabel?: string;
  // Real compound-component support, added 2026-09-17 for Card — an
  // ordered list of sections (Header, Content, ...) stacked vertically
  // inside the component's own outer frame, each its own horizontally-
  // padded text stack. When present, this REPLACES the normal flat
  // single/double text-line body entirely (the fields above are unused);
  // the outer frame's own fill/stroke/radius still come from `variants`
  // as usual. `sectionGapVariable` is the vertical gap BETWEEN stacked
  // sections, and also the outer frame's own top/bottom padding (Card's
  // real root has no horizontal padding of its own — only vertical,
  // `py-(--card-spacing)` — each section supplies its own horizontal
  // inset instead, matching Card's real Tailwind structure exactly, not
  // approximated). Real, disclosed, narrower than the actual component:
  // only Header (Title + Description) and Content are modeled — Card's
  // real Footer (a separate background/border treatment) isn't, see
  // `buildCardPlan`'s own comment.
  sections?: FigmaComponentSectionPlanItem[];
  sectionGapVariable?: string;
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

// A real bug, caught 2026-09-17 while investigating Card's own radius
// class: every component built so far bound `rounded-lg` via
// `nearestToken(8, radius, "radius")` — a NEAREST-VALUE search against a
// hardcoded guess. But shadcn's own real `@theme inline` mapping makes
// `--radius-lg` a DIRECT, EXACT alias to `var(--radius)` — which this
// pipeline itself sets to `radius.md`'s own resolved value (`generate/
// shadcn.ts`'s `--radius: ${radius.md.$value}`), not a nearest-match
// target at all. For the "tailwind" preset specifically, radius.md is
// 6px and radius.lg is 8px — so the old code's "nearest to 8" search
// found `radius/lg` (8px) as a coincidentally exact numeric match, while
// a real rendered Button's computed `border-radius` is actually 6px
// (confirmed live via a real browser check) — a genuine 2px mismatch
// that the old delta-check (`if (match.deltaPx > 0)`) never caught,
// since it was checking distance from the WRONG target, not the real
// one. Fixed by binding directly to `radius/md` — a guaranteed real
// alias, never a "nearest guess" — for every `rounded-lg` class. Radius
// classes that AREN'T a direct `var(--radius)` alias (Badge's
// `rounded-4xl`, a real, separate Tailwind constant unrelated to
// `--radius`) are unaffected and still correctly use `nearestToken`.
function exactRadiusMd(radius: Record<string, number>): { figmaName: string; deltaPx: number } {
  if (radius["md"] === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  return { figmaName: "radius/md", deltaPx: 0 };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Shared CVA-variant → Figma-variant-plan logic — extracted 2026-09-16
// once Badge needed the exact identical handling Button already had,
// rather than a second near-duplicate copy (same "extract once a second
// real consumer needs it" discipline this pipeline uses everywhere —
// scaffold-common.ts's readCssScale/nearestScalePx, read-tokens.ts's
// nearestDimensionPx). Real, verified precondition for reuse: every
// shadcn/ui component checked so far (Button, Badge) uses the exact same
// six real variant names (default/secondary/destructive/outline/ghost/
// link) with the exact same three real handling needs below — not
// assumed to generalize to every future component without re-checking.
function buildVariantsFromCva(
  source: string,
  axisName: string,
): { variants: FigmaComponentVariantPlanItem[]; skippedVariants: Array<{ name: string; reason: string }> } {
  const variantEntries = parseCvaAxis(source, axisName);

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
    // on a status.error-derived FILL is exactly the invisible-text bug
    // this was caught by, live, building the first version of Button).
    // Confirmed this same trap re-occurs for Badge too, for a DIFFERENT
    // underlying reason: Badge's own real destructive fill is
    // `bg-destructive/10` (a translucent 10% tint, genuinely readable
    // against destructive text in real Tailwind) — but this parser's own
    // `classToFigmaVariable` deliberately drops the opacity modifier (see
    // that function's own comment), turning the simplified Figma fill
    // into a SOLID destructive color, which recreates the exact same
    // invisible-text risk even though the original design was fine.
    //
    // Gated on the FILL actually being destructive-colored, not just on
    // the variant being NAMED "destructive" — a real bug caught while
    // adding Alert (2026-09-17): this used to fire unconditionally for
    // any variant named "destructive", which was correct for Button/Badge
    // (both really do have a destructive-colored fill) but silently wrong
    // for Alert, whose real `destructive` variant keeps a NEUTRAL `bg-card`
    // fill and only changes the TEXT color — rebinding to text.on-primary
    // (white) there would have produced white-on-light-card text, an
    // actually-invisible combination the fix was supposed to PREVENT, not
    // cause. Caught by inspecting the real generated plan JSON before any
    // live push, not assumed safe from the code alone.
    if (name === "destructive" && fillVariable === sdsgtPathToFigmaName("status.error")) {
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

  return { variants, skippedVariants };
}

function buildButtonPlan(tokensCss: string, buttonSource: string, notes: string[]): FigmaComponentPlanItem {
  const { variants, skippedVariants } = buildVariantsFromCva(buttonSource, "variant");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  // Real values from shadcn's own current source (see file header for the
  // "one size, exact-token-match only" scope decision): rounded-lg (an
  // EXACT `radius.md` alias, real value 6px for the tailwind preset — see
  // `exactRadiusMd`'s own comment for the real bug this replaced),
  // size.default's h-8 (32px, the one height with an exact spacing-token
  // match), px-2.5 (10px) and implied ~4-6px vertical padding (no exact
  // token for either — nearest real token used, deltaPx noted below).
  const radiusMatch = exactRadiusMd(radius);
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

// Second real component, added 2026-09-16 — proves `buildVariantsFromCva`
// actually generalizes rather than being Button-shaped code with the
// names changed. Real values from shadcn's own current `badge.tsx`
// source (verified against a real vendored file, current registry, using
// `@base-ui/react` not Radix): `rounded-4xl` (confirmed against the real
// npm-published `tailwindcss@^4` package's own `theme.css` —
// `--radius-4xl: 2rem`, 32px), `px-2` (8px), `py-0.5` (2px), `text-xs`
// (12px). Badge's own real height (`h-5`, 20px) means ANY radius >= 10px
// (half the height) renders as a full pill — checked this holds for the
// nearest-match result under all four real radius presets (tailwind=12,
// bootstrap=16, md3=28, md2=16 — every one >= 10), so the real "pill"
// look survives the nearest-token approximation without needing a special
// "always bind to radius.full" rule.
function buildBadgePlan(tokensCss: string, badgeSource: string, notes: string[]): FigmaComponentPlanItem {
  const { variants, skippedVariants } = buildVariantsFromCva(badgeSource, "variant");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(32, radius, "radius");
  const paddingHMatch = nearestToken(8, spacing, "spacing");
  const paddingVMatch = nearestToken(2, spacing, "spacing");
  const fontSizeMatch = nearestToken(12, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Badge ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }

  return {
    name: "Badge",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "New",
  };
}

// Third real component, added 2026-09-17 — picked after checking every
// `cva()`-based component in a real, fully-vendored (`shadcn add --all`)
// project: most either have no size-independent color "variant" axis at
// all (Input, Checkbox, Switch, Label, Separator, ...), or are compound/
// multi-part components that don't fit this plan's "one flat frame + one
// text label" shape (Card, Dialog, Sheet, Table, Sidebar, ...) — a
// separate, larger effort, not attempted here. Toggle fits the EXISTING
// mechanism with ZERO new special-casing: real current source (`h-8
// min-w-8 px-2.5`, `rounded-lg`, `text-sm` — identical shape to Button's
// own current default size) has an explicit `border-input` class on its
// `outline` variant (unlike Badge's destructive fill, there's no same-
// tone trap here — `default`'s only color class is `bg-transparent`,
// which `classToFigmaVariable` correctly ignores since "transparent" has
// no SDSGT mapping, falling back to `text.primary` the same way Button's
// own Ghost variant does). Toggle's real `cva()` ALSO has a `size` axis
// (default/sm/lg) — ignored here, same "one size only" disclosed scope
// Button itself already has, not a new gap.
function buildTogglePlan(tokensCss: string, toggleSource: string, notes: string[]): FigmaComponentPlanItem {
  const { variants, skippedVariants } = buildVariantsFromCva(toggleSource, "variant");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius);
  const paddingHMatch = nearestToken(10, spacing, "spacing");
  const paddingVMatch = nearestToken(5, spacing, "spacing");
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Toggle ${label}: nearest real spacing token is ${match.deltaPx}px off shadcn's own exact Tailwind value — same real cause as Button's own padding note (no exact token for Tailwind's half-step classes, and no explicit vertical-padding class at all — Toggle's real height comes from a fixed \`h-8\`, approximated here the same way Button's own vertical padding target is).`);
    }
  }

  return {
    name: "Toggle",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Toggle",
  };
}

// Fourth real component, added 2026-09-17 — a genuinely different real
// finding from Button/Badge/Toggle, not a copy-paste addition. Alert's
// real current source (`rounded-lg border px-2.5 py-2 text-sm`) has a
// bare `border` utility class with NO explicit color (`border-input`/
// `border-border`/etc.) anywhere in either variant string — unlike every
// component checked before it, which always named an explicit border
// class when a variant needed a visible stroke. Confirmed via a real
// scaffolded project's own compiled `globals.css` that shadcn's own
// generated base layer (`@layer base { * { @apply border-border ...} }`)
// applies `border-color: var(--border)` to EVERY element unconditionally
// — so Alert's real, rendered border IS `border.default`, just never
// spelled out in its own `cva()` string the way every other component
// checked so far does. `classToFigmaVariable`'s own class-by-class scan
// has no way to see this (it only reads the variant's OWN class string,
// never the project's global base layer), so this is handled as a
// deliberate post-process below — not a gap in the shared parser, a real
// case the parser was never meant to catch on its own.
//
// Real, disclosed scope narrower than Alert's actual structure: shadcn's
// own `Alert` is a compound component (`Alert` + `AlertTitle` +
// `AlertDescription` + `AlertAction`) — this plan represents only the
// TITLE as this model's single text label, same "one flat frame, one
// text child" shape every component built so far uses. `AlertDescription`
// (a second, smaller line of body text) isn't represented — building a
// real two-line compound text model is separate, larger work, not
// attempted here. No same-tone trap on `destructive` this time, checked
// rather than assumed safe: its fill stays `bg-card` (neutral) in both
// variants — only the TEXT turns `text-destructive` — so there's no
// destructive-on-destructive collision to fix, unlike Button/Badge.
function buildAlertPlan(tokensCss: string, alertSource: string, notes: string[]): FigmaComponentPlanItem {
  const { variants, skippedVariants } = buildVariantsFromCva(alertSource, "variant");
  for (const variant of variants) {
    if (!variant.strokeVariable) variant.strokeVariable = sdsgtPathToFigmaName("border.default");
  }
  notes.push("Alert: its real AlertDescription is modeled as a second, fixed text line (see file header) — real destructive-only translucent-red tint on the description isn't bound, since that class sits behind a `*:data-[slot=...]:` selector prefix this parser doesn't parse; always shown in text.secondary instead.");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius);
  const paddingHMatch = nearestToken(10, spacing, "spacing");
  const paddingVMatch = nearestToken(8, spacing, "spacing");
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Alert ${label}: nearest real spacing token is ${match.deltaPx}px off shadcn's own exact Tailwind value — see file header for why (no exact token for Tailwind's half-step classes).`);
    }
  }

  return {
    name: "Alert",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Heads up!",
    secondaryTextVariable: sdsgtPathToFigmaName("text.secondary"),
    secondaryFontSizeVariable: fontSizeMatch.figmaName,
    secondaryLabelPropertyName: "Description",
    defaultSecondaryLabel: "This is an alert description.",
  };
}

// Fifth and sixth real components, added 2026-09-17 — the first two from
// the "no size-independent color variant axis at all" bucket the file
// header already named (Input, Checkbox, Switch, Label, Separator, ...).
// Real current source for Input/Textarea has no `cva()` call at all — a
// single className string, one visual (rest) state — so there's no
// `parseCvaAxis` to run. Reuses `classToFigmaVariable` directly on the
// whole class list instead, then wraps the result in a plan shape with
// exactly ONE variant ("Default") — deliberately NOT a new parallel plan
// schema. A single-value "Variant" property is a legitimate, common real
// pattern in real design systems (room to grow into a second state later,
// e.g. Input's own real `aria-invalid:` error styling), not a hack to
// avoid writing a second schema, and it means `SDSGT-figma-push`'s own
// replay mechanism needs zero changes to handle these two components —
// still `for each item in plan.components`, no branching on shape.
//
// Real, deliberate scope split from the file header's other bucket
// (Card, Dialog, Sheet, Table, Sidebar, ...): those need actual new
// structure (multiple text children, nested frames) this "one flat
// frame + one label" shape can't represent at all — a real schema
// change, not attempted this round. Input/Textarea don't need that; they
// fit the EXISTING box shape (radius/padding/fill/stroke/text) exactly,
// just with no variant axis to extract.
function scanClassesForColors(classString: string): { fillVariable?: string; textVariable?: string; strokeVariable?: string } {
  const result: { fillVariable?: string; textVariable?: string; strokeVariable?: string } = {};
  for (const cls of classString.split(" ").filter(Boolean)) {
    const parsed = classToFigmaVariable(cls);
    if (!parsed) continue;
    if (parsed.kind === "fill") result.fillVariable = parsed.variable;
    else if (parsed.kind === "text") result.textVariable = parsed.variable;
    else if (parsed.kind === "border") result.strokeVariable = parsed.variable;
  }
  return result;
}

// Real current source: `h-8 w-full min-w-0 rounded-lg border border-input
// bg-transparent px-2.5 py-1 text-base ... placeholder:text-muted-
// foreground ...`. `bg-transparent` correctly parses to no fill (same
// "transparent" non-match as Toggle's own default variant).
// `border-input` is explicit, no fallback needed (unlike Alert). Real
// TYPED text would inherit `text.primary` from shadcn's own `body {
// @apply ... text-foreground }` base rule (confirmed the same way
// Alert's border-fallback was — reading a real compiled `globals.css`),
// but an at-rest Input shows its PLACEHOLDER, not typed text — bound
// here to `text.secondary` (`placeholder:text-muted-foreground`'s real
// target), a deliberate representational choice, not a class the parser
// found unprompted (the `placeholder:` prefix means `classToFigmaVariable`
// never matches it — this pipeline's own class regex only recognizes
// bare `bg-`/`text-`/`border-`, not pseudo-prefixed variants). `text-base`
// (16px) is a real, new-to-this-file target — every component built
// before this used `text-sm` (14px).
function buildInputPlan(tokensCss: string, inputSource: string, notes: string[]): FigmaComponentPlanItem {
  const classMatch = inputSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Input's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius);
  const paddingHMatch = nearestToken(10, spacing, "spacing");
  const paddingVMatch = nearestToken(4, spacing, "spacing");
  const fontSizeMatch = nearestToken(16, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
    ["font size", fontSizeMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Input ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }
  notes.push("Input: represented showing its placeholder text (color/semantic/text/secondary), not typed content — an at-rest Input has no typed value to show, and this is the real color shadcn's own `placeholder:text-muted-foreground` class targets.");

  return {
    name: "Input",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Placeholder",
  };
}

// Real current source: `flex field-sizing-content min-h-16 w-full
// rounded-lg border border-input bg-transparent px-2.5 py-2 text-base
// ...` — structurally identical to Input (same radius/border/fill/font-
// size classes), only vertical padding differs (`py-2` vs Input's
// `py-1`). Same placeholder-representation choice as Input, same reason.
function buildTextareaPlan(tokensCss: string, textareaSource: string, notes: string[]): FigmaComponentPlanItem {
  const classMatch = textareaSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Textarea's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius);
  const paddingHMatch = nearestToken(10, spacing, "spacing");
  const paddingVMatch = nearestToken(8, spacing, "spacing");
  const fontSizeMatch = nearestToken(16, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
    ["font size", fontSizeMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Textarea ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }
  notes.push("Textarea: represented showing its placeholder text (color/semantic/text/secondary), not typed content — same real reason as Input's own note.");

  return {
    name: "Textarea",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Placeholder",
  };
}

// Seventh real component, and the first real compound one, added
// 2026-09-17. Real current source is a 6-part API (`Card`/`CardHeader`/
// `CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter`)
// using a dynamic `--card-spacing` CSS custom property
// (`[--card-spacing:--spacing(4)]`) and a `ring-1 ring-foreground/10`
// border instead of a standard `border-*` class — genuinely different
// from every component built before it, not just a bigger version of the
// same shape.
//
// Real, disclosed, narrower scope than the actual component: only
// `CardHeader` (Title + Description, reusing the exact same "second text
// line" mechanism Alert's own AlertDescription proved) and `CardContent`
// (one body text line) are modeled. `CardFooter` (its own separate
// `bg-muted/50 border-t` treatment) and `CardAction` (pure positioning,
// no color) aren't — a real, deliberate scope cut, not an oversight;
// adding Footer later is a matter of one more `sections` entry with its
// own `fillVariable`/`strokeVariable`, once `FigmaComponentSectionPlanItem`
// grows those optional fields.
//
// `rounded-xl`: unlike Button/Toggle/Alert/Input/Textarea's `rounded-lg`
// (a real, EXACT 1:1 alias to `radius.md` — see `exactRadiusMd`'s own
// comment for the bug this fixed), shadcn's real `--radius-xl: calc(
// var(--radius) * 1.4)` is a genuine MULTIPLIER, not a direct alias — so
// this one correctly uses `nearestToken`, computed from radius.md's own
// REAL resolved value (not a hardcoded guess), same discipline the
// radius bug fix above re-established.
//
// `--card-spacing: --spacing(4)`: Tailwind v4's own arbitrary-value
// function syntax for "4 units of the base spacing scale" — the exact
// same real quantity this pipeline's own `spacing/4` token already
// represents, so this binds to it DIRECTLY (an exact conceptual match,
// not a nearest-guess), the same "real alias, not an approximation"
// treatment as `exactRadiusMd`. Confirmed `spacing.json` has a `"4"` key
// under every preset (bootstrap included, despite its narrower 0-5 key
// range) before relying on this.
//
// `ring-1 ring-foreground/10`: not a standard `border-*` class at all —
// Figma has no native "ring" concept, and this parser has no way to bind
// a partially-transparent color (opacity modifiers are dropped, per
// `classToFigmaVariable`'s own documented simplification). Approximated
// as `border.subtle`, the nearest real semantic token for "a faint,
// low-contrast outline" — disclosed, not a parse failure.
function buildCardPlan(tokensCss: string, cardSource: string, notes: string[]): FigmaComponentPlanItem {
  // Unlike every earlier builder, the values below are read from real
  // source ONCE (verified against a real vendored card.tsx while writing
  // this function) rather than parsed dynamically from `cardSource` on
  // every run — there's no `cva()` axis or plain class regex that could
  // extract "rounded-xl"/"bg-card"/"ring-1"/a 6-part sub-component API.
  // That's a real, deliberate gap versus the other six components: if
  // shadcn's own Card source drifts (exactly the kind of real, live
  // upstream change Button's own default size already went through once
  // this session), this function would keep silently producing a plan
  // that no longer matches reality. Guarded here with a structural sanity
  // check instead of trusting the hardcoded values blindly — fails
  // loudly, doesn't silently drift.
  for (const marker of ["rounded-xl", "bg-card", "ring-1", "function CardHeader", "function CardTitle", "function CardDescription", "function CardContent"]) {
    if (!cardSource.includes(marker)) {
      throw new Error(`Card's real source no longer contains "${marker}" — shadcn/ui's real Card has likely changed shape since buildCardPlan was written. Re-verify against the current vendored card.tsx before trusting this plan.`);
    }
  }

  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMdPx = radius["md"];
  if (radiusMdPx === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  const radiusTarget = radiusMdPx * 1.4;
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Card radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.md × 1.4 = ${radiusTarget.toFixed(1)}px).`);
  }

  const titleFontSize = nearestToken(16, fontSize, "typography/primitive/fontSize");
  const bodyFontSize = nearestToken(14, fontSize, "typography/primitive/fontSize");

  notes.push("Card: only its real Header (Title + Description) and Content sections are modeled — its real Footer (a separate background/border treatment) isn't, a real, narrower scope than the actual 6-part compound component.");
  notes.push("Card: its real `ring-1 ring-foreground/10` border is approximated as border.subtle, the nearest real semantic token — this parser can't bind a partially-transparent ring effect.");

  return {
    name: "Card",
    variantPropertyName: "Variant",
    variants: [
      { name: "Default", fillVariable: sdsgtPathToFigmaName("background.surface"), textVariable: sdsgtPathToFigmaName("text.on-surface"), strokeVariable: sdsgtPathToFigmaName("border.subtle"), underline: false },
    ],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: "spacing/4",
    sections: [
      {
        paddingHorizontalVariable: "spacing/4",
        textLines: [
          { textVariable: sdsgtPathToFigmaName("text.on-surface"), fontSizeVariable: titleFontSize.figmaName, weight: "Medium", labelPropertyName: "Title", defaultLabel: "Card Title" },
          { textVariable: sdsgtPathToFigmaName("text.secondary"), fontSizeVariable: bodyFontSize.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "Card description goes here." },
        ],
      },
      {
        paddingHorizontalVariable: "spacing/4",
        textLines: [
          { textVariable: sdsgtPathToFigmaName("text.on-surface"), fontSizeVariable: bodyFontSize.figmaName, weight: "Regular", labelPropertyName: "Content", defaultLabel: "This is the card's main content." },
        ],
      },
    ],
  };
}

// One entry per component this parser knows how to build a plan for —
// filename it expects in the vendored components directory, and the
// builder function for it. Extracted into a table (2026-09-17, once a
// third and fourth component needed the exact same "read file if it
// exists, else note its absence" shape Button/Badge already had) so
// adding a new component is one line here, not a new copy-pasted
// if/else block.
const COMPONENT_BUILDERS: ReadonlyArray<{
  filename: string;
  name: string;
  build: (tokensCss: string, source: string, notes: string[]) => FigmaComponentPlanItem;
}> = [
  { filename: "button.tsx", name: "Button", build: buildButtonPlan },
  { filename: "badge.tsx", name: "Badge", build: buildBadgePlan },
  { filename: "toggle.tsx", name: "Toggle", build: buildTogglePlan },
  { filename: "alert.tsx", name: "Alert", build: buildAlertPlan },
  { filename: "input.tsx", name: "Input", build: buildInputPlan },
  { filename: "textarea.tsx", name: "Textarea", build: buildTextareaPlan },
  { filename: "card.tsx", name: "Card", build: buildCardPlan },
];

// codeDir: the matching `generate` run's --out directory (needed only for
// its always-written css/tokens.css — see readCssScale above, no separate
// --tokens-dir plumbing required). vendoredComponentsDir: the scaffolded
// project's real component directory (e.g. "<outDir>/src/components/ui"
// for Next.js+shadcn/ui). Button, Badge, Toggle, and Alert are built today
// (see file header) — a component with no recognized file at this path is
// silently absent from the plan, not an error, since not every scaffold
// vendors every component this parser knows about yet.
export function buildFigmaComponentsPushPlan(codeDir: string, vendoredComponentsDir: string): FigmaComponentsPushPlan {
  const notes: string[] = [];
  const components: FigmaComponentPlanItem[] = [];
  const tokensCss = readFileSync(join(codeDir, "css", "tokens.css"), "utf-8");

  for (const { filename, name, build } of COMPONENT_BUILDERS) {
    const path = join(vendoredComponentsDir, filename);
    if (existsSync(path)) {
      components.push(build(tokensCss, readFileSync(path, "utf-8"), notes));
    } else {
      notes.push(`No ${filename} found at ${vendoredComponentsDir} — this project doesn't have ${name} vendored at the expected path.`);
    }
  }

  return { components, notes };
}
