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
// against, and its follow-ups for Badge/Toggle/Alert/Input/Textarea/Card,
// plus figma-remaining-components-plan.md for the full batch sequence
// covering shadcn/ui's remaining ~54 components): shadcn/ui's Button,
// Badge, Toggle, Alert (2026-09-17), Input and Textarea (2026-09-17, same
// day), Card (2026-09-17, first real compound component), plus Kbd,
// NativeSelect, and Avatar's own AvatarFallback (2026-09-18, "Batch 1" of
// the remaining-components plan), Label (2026-09-18, "Batch 2," first
// component with no box styling at all), and Skeleton (2026-09-18,
// "Batch 3," first component with no text at all) — one size each
// ("default" — the only Tailwind height, h-8, that matches an SDSGT
// spacing token exactly, for the components that have more than one real
// size), rest states only (no hover:/aria-*: pseudo-states — those aren't
// separate Figma variants in this pass), one text label each except Alert,
// which now also carries a real second line for its own AlertDescription
// (see `secondaryTextVariable` on `FigmaComponentPlanItem`, and
// buildAlertPlan's own comment for the one real, disclosed simplification:
// always text.secondary, not destructive-tinted on the destructive
// variant, since that class sits behind a `*:data-[slot=...]:` selector
// prefix this parser doesn't parse), and except Skeleton, which has NO
// text label at all (see buildSkeletonPlan's own comment and
// `FigmaComponentVariantPlanItem.textVariable`'s). Input/Textarea show
// their PLACEHOLDER text, not typed content — see buildInputPlan's own
// comment. Three real component shapes, all proven: `cva()`-based
// multi-variant components (Button/Badge/Toggle/Alert, via
// `buildVariantsFromCva`), single-state components with no `cva()` at all
// (Input/Textarea/Kbd/NativeSelect/Avatar/Label/Skeleton, via
// `scanClassesForColors` — same underlying class-to-variable mapping,
// applied to one class string instead of a parsed variant axis, wrapped in
// a plan with exactly one variant so `SDSGT-figma-push`'s own replay
// mechanism needs zero shape-specific branching for those), and Card's own
// real compound/`sections`-based structure (a vertical stack of
// horizontally-padded text sections, see buildCardPlan's own comment). The
// optional second-text-line addition (`secondaryTextVariable` etc., proven
// against Alert) is a real, minimal step toward the harder "compound
// component" bucket, NOT the same thing as actually supporting one — it
// adds one more text line under a single frame, not multiple named
// sub-parts, nested frames, or nested auto-layout; Card's own `sections`
// mechanism is the real thing. Skeleton proves a fourth real finding — a
// component can have NO text at all — via
// `FigmaComponentVariantPlanItem.textVariable` going optional; see that
// field's own comment for why this is purely additive to every earlier
// component. Confirmed to actually generalize — not just Button-shaped
// code with the names changed — by checking EVERY real component in a
// fully-vendored (`shadcn add --all`) project before picking any of
// these: components with a size-independent color "variant" axis went
// through `buildVariantsFromCva`; single-state box-shaped components
// (Input, Textarea, Kbd, NativeSelect, Avatar, Label, Skeleton) went
// through `scanClassesForColors`; compound/multi-part components needing
// more structure than Card's own two-section, text-only shape (Dialog,
// Sheet, Table, Sidebar, ...) — real, separate, larger work, not attempted
// here.
// Extending to more components/sizes/frameworks is a matter of adding a
// `build<X>Plan` function reusing one of these mechanisms plus a row in
// `COMPONENT_BUILDERS` below, not rewriting this file's own mechanism.
//
// Breadcrumb (2026-09-21, "Batch 6" of the remaining-components plan) is
// the first `sections` consumer whose items lay out HORIZONTALLY instead
// of Card's own vertical Header/Content stack — see
// `FigmaComponentSectionPlanItem.textLineDirection`'s own comment, and
// `buildBreadcrumbPlan`'s own comment for the real, disclosed decorative
// text-glyph stand-in used for its real separator icon.
//
// "Batch 9" of the remaining-components plan (2026-09-21) is pure parser
// infrastructure, not a new component — no new row in `COMPONENT_BUILDERS`.
// Two additions to `classToFigmaVariable`/`buildVariantsFromCva`, the most
// reused code in this file: (1) `classToFigmaVariable` now strips a known
// `*:data-[slot=...]:`/`data-[key=value]:` selector prefix before its real
// match, a pure preprocessing step (see that function's own comment); (2)
// `buildVariantsFromCva`'s existing `bg-secondary`/`text-secondary-
// foreground` skip special case is now followed by a GENERAL rule: any
// `bg-`/`text-`/`border-` class using Tailwind's arbitrary-value bracket
// syntax gets skipped with a generated reason, rather than silently
// falling through `classToFigmaVariable` as an unmatched null (see that
// function's own comment). Both are strict supersets of prior behavior —
// verified against every real class string already being parsed correctly
// by Button/Badge/Toggle/Alert/Item (this file's own real `cva()`
// consumers) before landing, per the plan's own "high relative risk"
// callout for this batch. Nothing consumes the new capability yet;
// Batch 10 (`bubble.tsx`) is the first real consumer, next.
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
  // Optional as of 2026-09-18, for Skeleton — the first real component with
  // NO text at all (a plain animated gray box; shadcn's own real
  // `animate-pulse` shimmer isn't reproduced here — see buildSkeletonPlan's
  // own comment, and the plan's own `notes` entry). Purely additive: every
  // component built before Skeleton always sets this on every variant, and
  // nothing about their own plan computation changes — only `SDSGT-figma-
  // push`'s step 2/4 replay logic gained an `if (variant.textVariable)`/
  // `if (component.labelPropertyName)` guard so a text-less component
  // creates a frame with no text child at all, instead of a crash or an
  // empty-string label.
  textVariable?: string;
  strokeVariable?: string;
  underline?: boolean;
}

// One section of a real compound component's own layout — e.g. Card's
// Header or Content. Added 2026-09-17, alongside `sections` below. Each
// section is its own horizontally-padded vertical text stack; sections
// themselves stack vertically inside the component's outer frame.
export interface FigmaComponentSectionPlanItem {
  paddingHorizontalVariable: string;
  // Both optional, added 2026-09-21 for Breadcrumb ("Batch 6" of
  // figma-remaining-components-plan.md) — the first `sections` consumer
  // whose items lay out side by side instead of Card's own vertical
  // Header/Content stack. Purely additive: every section built before
  // Breadcrumb (Card's own two) leaves both absent, and
  // `SDSGT-figma-push`'s own replay defaults absent `textLineDirection` to
  // today's vertical behavior — Card's existing replay is unchanged code,
  // not just unchanged output.
  //
  // `textLineDirection`: "horizontal" flips how this component's own
  // sections stack against each other (a row of items, Breadcrumb's real
  // shape) instead of Card's vertical Header-then-Content stack. Set to
  // the SAME value on every section within one component — it describes
  // the component's own overall section-stacking axis, not a genuinely
  // per-item choice, but lives here (rather than on
  // `FigmaComponentPlanItem`) since it only ever has meaning alongside
  // `sections` itself.
  //
  // `separatorGlyph`: a real, disclosed decorative stand-in for
  // Breadcrumb's actual separator, which is an SVG `<ChevronRightIcon>`
  // (lucide-react) — icons aren't drawn by this pipeline (see
  // figma-remaining-components-plan.md's NEEDS-ICON bucket). When present,
  // this glyph is rendered as its own plain text node immediately after
  // this section in the replay, purely to show WHERE a separator sits.
  // Explicitly NOT wired to any component property — editing an
  // instance's item labels never touches it, and it is not a faithful
  // reproduction of the real chevron shape. Left unset on a section with
  // no following separator (e.g. a trail's last item), matching real
  // markup, where a separator only ever sits BETWEEN items.
  textLineDirection?: "vertical" | "horizontal";
  separatorGlyph?: string;
  textLines: Array<{
    textVariable: string;
    fontSizeVariable: string;
    weight: "Medium" | "Regular";
    labelPropertyName: string;
    defaultLabel: string;
  }>;
}
// A single, real non-"hug contents" shape, added 2026-09-21 ("Batch 5" of
// figma-remaining-components-plan.md) — the first component in this file
// that isn't box-shaped at all. A 1px divider line has no auto-layout
// equivalent (an auto-layout frame always needs at least one real child to
// "hug" around; a bare line has no content). Represents shadcn's own
// `Separator` (a `bg-<color> h-px w-full` / `w-px h-full` rule, real source
// confirmed against a `shadcn add --all` vendor) as a FIXED-size,
// non-auto-layout rectangle instead — real geometry, not squeezed into a
// box shape that doesn't apply here. See `buildSeparatorPlan`'s own
// comment for the full real-source derivation.
//
// `thicknessPx` is a raw, UNBOUND pixel literal, not a Figma variable name
// — a real, deliberate departure from every other numeric measurement in
// this file (always bound via `nearestToken` against a real spacing/radius
// scale). Confirmed by reading every real `presets/spacing.*.json` file
// directly: the smallest real spacing token is `spacing/1` (4px in the
// tailwind preset) — nothing close to a real 1px hairline (`h-px`/`w-px`).
// Running 1px through `nearestToken` would bind to `spacing/0` (0px, since
// |0-1|=1 is numerically closer than |4-1|=3) — an INVISIBLE
// zero-thickness line, a worse, silent failure, not a disclosed
// approximation. A literal `1` (px) is used directly instead.
//
// `representativeLengthPx` is a real, disclosed stand-in for shadcn's own
// `w-full`/`self-stretch` — a real Separator has no intrinsic length of
// its own (it always fills whatever container width/height its caller
// gives it, which this parser has no access to — the same "caller-supplied
// JSX, not the component's own definition" gap `buildSkeletonPlan`'s own
// comment already documents for its own sizing). Chosen purely to give the
// pushed line a visible, plausible footprint, not a claim that either
// component has this as a real default length.
//
// `centerLabel`, optional: real support for `FieldSeparator`'s own
// centered text (confirmed against real vendored `field.tsx` source —
// passing `children` renders a `<span className="... bg-background ...
// text-muted-foreground ...">` centered over the line via absolute
// positioning + a background-color mask, e.g. a login form's "OR
// CONTINUE WITH" divider). Bare `Separator` itself NEVER supports this —
// confirmed against its own real source (`@base-ui/react/separator`, no
// `children` prop at all, purely a line) — `centerLabel` is only ever set
// on `FieldSeparator`'s own plan item, see `buildFieldSeparatorPlan`. The
// real implementation OVERLAPS the label span on top of one continuous
// line and masks it with a matching background fill; this plan instead
// represents it as three side-by-side segments (`[line, text, line]`, each
// `representativeLengthPx` wide) — a real, disclosed simplification:
// Figma auto-layout has no direct "absolutely position and
// background-mask" equivalent, and a non-overlapping row reads visually
// the same as the real masked version without needing a background-fill
// patch behind the text. `gapVariable` is real and derived (`px-2` on the
// real label span, the gap between each line segment and the text), not a
// guess. Orientation is not modeled anywhere in this interface — every
// `line` in this file is a horizontal (`representativeLengthPx` wide ×
// `thicknessPx` tall) rule only, the same "one shape only" scope this
// file's every other component already carries (e.g. Button's own "one
// size" cut).
export interface FigmaComponentLinePlanItem {
  colorVariable: string;
  thicknessPx: number;
  representativeLengthPx: number;
  centerLabel?: {
    textVariable: string;
    fontSizeVariable: string;
    gapVariable: string;
    labelPropertyName: string;
    defaultLabel: string;
  };
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
  // Real, genuinely new shape, added 2026-09-21 ("Batch 5" of
  // figma-remaining-components-plan.md) — a fixed-size, non-"hug contents"
  // line (Separator/FieldSeparator; see `FigmaComponentLinePlanItem`'s own
  // comment for the full reasoning). MUTUALLY EXCLUSIVE with BOTH
  // `variants`'s real per-variant fill/text/stroke content AND `sections`
  // above — a `line`-based component has no color-variant axis and no
  // compound text-section body; its whole visible appearance lives on this
  // field instead. `variantPropertyName`/`variants`/`skippedVariants`
  // themselves stay REQUIRED and still get set (a single "Default" entry
  // with no fill/text/stroke of its own) purely for interface-shape
  // parity with every other component — same precedent `buildCardPlan`
  // already established (it keeps a real "Default" variant entry even
  // though `sections` is what actually drives its body). `radiusVariable`
  // also stays required/set (bound to a real 0px token — a bare line has
  // no corner radius of its own) for the same reason.
  // `SKILL.md` step 7 branches on `line` FIRST, before ever falling
  // through to `sections` or the normal box-building logic — a line
  // component never reaches either of those code paths.
  line?: FigmaComponentLinePlanItem;
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
//
// Selector-prefix stripping added 2026-09-21 ("Batch 9" of
// figma-remaining-components-plan.md, infrastructure only — no new
// component consumes this yet). Real vendored shadcn source repeatedly
// gates an otherwise-ordinary bg-/text-/border- class behind a conditional
// data-attribute selector this parser never used to see past — two real
// shapes already named elsewhere in this file's own comments:
// `*:data-[slot=alert-description]:text-destructive/90` (Alert's own
// AlertDescription, see `FigmaComponentPlanItem.secondaryTextVariable`'s
// comment) and `data-[invalid=true]:text-destructive` (Field's own root,
// see `buildFieldPlan`'s comment). Both match one pattern: an optional
// leading `*:`, then a bare `data-[key=value]:` block. Stripping it before
// the real match below is a PURE preprocessing step — the class that
// remains is matched exactly the same way an unprefixed class always was,
// and the function's own return contract (kind/variable shape, or null)
// is completely unchanged. Real classes with no such prefix (every
// existing caller's own already-working input — Button/Badge/Toggle/
// Alert/Item's real `cva()` variant strings, none of which start with
// `data-[` or `*:`) pass through this `.replace()` as a no-op, so this is
// a strict superset of prior behavior, not a rewrite of it.
const SELECTOR_PREFIX_PATTERN = /^\*?:?data-\[[a-z-]+=[a-z-]+\]:/;

function classToFigmaVariable(className: string): { kind: "fill" | "text" | "border"; variable: string } | null {
  const stripped = className.replace(SELECTOR_PREFIX_PATTERN, "");
  const match = stripped.match(/^(bg|text|border)-([a-z-]+?)(\/\d+)?$/);
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

    // Generalized arbitrary-value skip rule, added 2026-09-21 ("Batch 9" of
    // figma-remaining-components-plan.md). The check above is a specific,
    // more-informative special case (a MISSING optional brand color) that
    // still fires first and is left untouched; this is the general rule
    // for the different, unfixable case a class matching this shape can
    // never resolve to any token, regardless of what the seed supplied:
    // Tailwind's own arbitrary-value bracket syntax (`bg-[oklch(...)]`,
    // `text-[#fff]`, `border-[3px_solid_red]`, ...) names a literal,
    // caller-supplied value with no semantic token behind it at all. Real
    // trigger this rule exists for (figma-remaining-components-plan.md,
    // Batch 10): bubble.tsx's own real `tinted` variant
    // (`bg-[oklch(0.94_0.03_255)]` or similar) is permanently skipped by
    // this rule alone, with no Bubble-specific carve-out needed — before
    // this change, `classToFigmaVariable`'s own regex would have just
    // returned null for it (arbitrary bracket contents don't match
    // `[a-z-]+`), silently producing a variant with no fill and a
    // fallback text color instead of disclosing the real gap. Checked
    // against each real class in the variant's own list (not the whole
    // classString at once) so the skip reason can name the exact
    // offending class, the same specificity the check above already has.
    //
    // Real bug found building Bubble (Batch 10, 2026-09-21) and fixed
    // here rather than papered over with a Bubble-specific carve-out, per
    // figma-remaining-components-plan.md's own instruction for this case:
    // Batch 9's rule above tested each RAW class token, but Bubble's real
    // `tinted` variant's arbitrary classes are never raw — every one of
    // them sits behind the exact same `*:data-[slot=bubble-content]:`
    // selector prefix Batch 9's OWN stripping logic was built for
    // (`*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.93_
    // calc(c*0.4)_h)]`, confirmed against real vendored bubble.tsx) — so
    // `/^(bg|text|border)-\[/` never matched (the string starts with
    // `*:data-[slot=...`, not `bg-[`), and this rule silently failed to
    // fire. Without this fix, `tinted` would fall through to a normal
    // built variant with fillVariable left undefined (the arbitrary class
    // returns null from `classToFigmaVariable`, same as it always did)
    // and textVariable falling back to text.primary — exactly Ghost's own
    // shape, misrepresenting a real (if unrepresentable) tinted
    // background as an intentionally transparent one. Fixed by testing
    // the PREFIX-STRIPPED class, the same string `classToFigmaVariable`
    // itself would test — a strict superset for every existing caller
    // (Button/Badge/Toggle/Alert/Item have no such prefixes at all, so
    // `.replace()` is a no-op and this change is invisible to them).
    const arbitraryValueClass = classes.find((cls) => /^(bg|text|border)-\[/.test(cls.replace(SELECTOR_PREFIX_PATTERN, "")));
    if (arbitraryValueClass) {
      skippedVariants.push({
        name,
        reason: `real class '${arbitraryValueClass}' uses an arbitrary Tailwind value with no possible design token to bind to`,
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
//
// `fallbackTextPath` added 2026-09-18, for Label — real current source
// (`flex items-center gap-2 text-sm leading-none font-medium select-none
// group-data-[disabled=true]:... peer-disabled:...`) has no `text-*`
// class at all, a genuinely different case from Input/Textarea's own
// missing text color: theirs is a real color that's simply never spelled
// out in the scanned string (shadcn's `placeholder:text-muted-foreground`
// sits behind a `placeholder:` prefix this parser's plain-class regex was
// never built to match), so both callers patched it at their own call
// site via `?? sdsgtPathToFigmaName("text.secondary")` for their own
// specific representational reason (showing PLACEHOLDER text color, not
// "no class found"). Label has no hidden text class to miss — it's real
// base-layer INHERITANCE, the same class of finding as Alert's own
// border.default fallback (confirmed the same way: reading a real
// compiled globals.css) — shadcn's generated `body { @apply
// text-foreground }` rule means an unstyled Label really does render in
// `text.primary`. Rather than making every future no-`text-*` caller
// keep re-deriving its own inline `?? sdsgtPathToFigmaName(...)` patch,
// this fallback now lives inside the shared function itself, defaulting
// to `"text.primary"` (Label's own real target, and the more common of
// the two real reasons a text class might be absent) — Input/Textarea now
// pass `"text.secondary"` explicitly instead, a pure visibility change,
// not a new choice: they always meant their own placeholder-color
// exception, this just makes it a real function argument instead of a
// same-line patch a reader could miss. `textVariable` is now always
// returned as a real, defined string, never left undefined for the
// caller to patch — narrower, more accurate return type reflects that.
function scanClassesForColors(classString: string, fallbackTextPath: string = "text.primary"): { fillVariable?: string; textVariable: string; strokeVariable?: string } {
  let fillVariable: string | undefined;
  let textVariable: string | undefined;
  let strokeVariable: string | undefined;
  for (const cls of classString.split(" ").filter(Boolean)) {
    const parsed = classToFigmaVariable(cls);
    if (!parsed) continue;
    if (parsed.kind === "fill") fillVariable = parsed.variable;
    else if (parsed.kind === "text") textVariable = parsed.variable;
    else if (parsed.kind === "border") strokeVariable = parsed.variable;
  }
  return { fillVariable, textVariable: textVariable ?? sdsgtPathToFigmaName(fallbackTextPath), strokeVariable };
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
  // "text.secondary" made explicit here 2026-09-18 — see scanClassesForColors's
  // own comment. Same real value this call site always meant (Input's own
  // PLACEHOLDER text color); no behavior change, just no longer hidden in a
  // same-line `?? sdsgtPathToFigmaName(...)` patch below.
  const colors = scanClassesForColors(classMatch[1], "text.secondary");

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
  // "text.secondary" made explicit here 2026-09-18 — see scanClassesForColors's
  // own comment and buildInputPlan's identical note above; same real reason.
  const colors = scanClassesForColors(classMatch[1], "text.secondary");

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

// Eighth real component, added 2026-09-18 — "Batch 1" of
// figma-remaining-components-plan.md, picked as the lowest-risk possible
// next slice: identical shape to Input/Textarea (one plain class string,
// no `cva()`), zero changes to shared code. Real current source:
// `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center
// justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs
// font-medium text-muted-foreground select-none in-data-
// [slot=tooltip-content]:bg-background/20 ...`. The `in-data-
// [slot=tooltip-content]:*` classes are a real, disclosed omission — they
// only apply when a Kbd sits INSIDE a Tooltip's own content box (a second,
// visually distinct at-rest state), a selector-prefixed variant this
// parser's plain `bg-/text-/border-` regex was never built to see, same
// class of gap as Input's own `placeholder:` prefix and Alert's `*:data-
// [slot=...]:` prefix — this plan represents Kbd's normal (non-tooltip)
// rest state only.
//
// `rounded-sm` is a genuine MULTIPLIER, not a direct alias — confirmed
// against this project's own real generated `globals.css`
// (`--radius-sm: calc(var(--radius) * 0.6)`, same `@theme inline` block
// `exactRadiusMd`'s own comment already documents for `--radius-lg`) — so
// this uses `nearestToken` against `radius.md`'s own real resolved value
// times 0.6, the same discipline `buildCardPlan`'s own `rounded-xl`
// handling already established, not a hardcoded guess.
//
// No explicit vertical-padding class at all — Kbd's real height comes
// from a fixed `h-5` (20px), same disclosed approximation Toggle's own
// `h-8` already uses: target vertical padding is derived as
// `(20 − fontSize) ÷ 2`, not read from a real Tailwind class, since none
// exists.
function buildKbdPlan(tokensCss: string, kbdSource: string, notes: string[]): FigmaComponentPlanItem {
  // Real source defines `function Kbd` before `function KbdGroup` — the
  // FIRST `className={cn(...)}` in the file is always Kbd's own (KbdGroup's
  // own className has no color classes anyway, but relying on match order
  // rather than that is still worth flagging), confirmed against real
  // vendored source, not assumed.
  const classMatch = kbdSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Kbd's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMdPx = radius["md"];
  if (radiusMdPx === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  const radiusTarget = radiusMdPx * 0.6;
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Kbd radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.md × 0.6 = ${radiusTarget.toFixed(1)}px).`);
  }

  const fontSizeMatch = nearestToken(12, fontSize, "typography/primitive/fontSize");
  const paddingHMatch = nearestToken(4, spacing, "spacing");
  const paddingVTarget = (20 - 12) / 2; // real h-5 (20px) minus text-xs (12px), halved — no real vertical-padding class to read
  const paddingVMatch = nearestToken(paddingVTarget, spacing, "spacing");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Kbd ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }
  notes.push("Kbd: its real in-data-[slot=tooltip-content]: variant (a visually distinct look when nested inside a Tooltip) isn't represented — this parser's plain class regex doesn't see selector-prefixed classes; only the normal, non-tooltip rest state is modeled.");

  return {
    name: "Kbd",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "⌘",
  };
}

// Ninth real component, added 2026-09-18, same batch as Kbd/Avatar. Real
// current source for the actual `<select>` element (not the outer wrapper
// `<div>`, which only carries layout classes): `h-8 w-full min-w-0
// appearance-none rounded-lg border border-input bg-transparent py-1
// pr-8 pl-2.5 text-sm ... placeholder:text-muted-foreground ...` —
// structurally the same "bordered/filled box" shape Input/Textarea already
// proved, but with one real, new-to-this-file wrinkle: the `<select>`
// element's own className is a BARE string literal (`className="..."`),
// not wrapped in `cn(...)` the way every other component's own root
// element is — confirmed against real source, not assumed — so this
// function's own extraction regex is necessarily different from
// `buildInputPlan`'s (`className=\{cn\(...\)` would never match here). The
// wrapper `<div>` around it DOES use `cn(...)`, but only carries
// `group/native-select relative w-fit has-[select:disabled]:opacity-50` —
// no color/spacing information — so matching the FIRST `cn(` call, Input's
// own approach, would silently bind to the wrong element here. A
// component-local extraction difference, not a shared-parser change.
//
// Real, disclosed simplification: horizontal padding is asymmetric
// (`pr-8`=32px, reserved for the chevron icon; `pl-2.5`=10px, the actual
// text-side inset) — this schema has only one shared
// `paddingHorizontalVariable`, so `pl-2.5` (the real text-side value, and
// the same real target Input's own horizontal padding already uses) is
// used for both sides, same "one flat frame" shape every box component
// uses; the chevron icon itself isn't drawn (icons are out of scope, same
// as every other component).
//
// Real, disclosed difference from Input/Textarea's own placeholder
// choice: NativeSelect's class list has no `placeholder:*` variant at all
// (a native `<select>` always shows a chosen OPTION's real text, never an
// empty placeholder state the way a text `<input>` can) — so its default
// represented text isn't `text.secondary` (Input/Textarea's own
// placeholder-specific choice), it falls back to `text.primary`, the same
// base-layer-inheritance reasoning documented for Label's own fallback
// (figma-remaining-components-plan.md, Batch 2) and Alert's own
// `border.default` post-process below.
function buildNativeSelectPlan(tokensCss: string, nativeSelectSource: string, notes: string[]): FigmaComponentPlanItem {
  const classMatch = nativeSelectSource.match(/<select[\s\S]*?className="([^"]+)"/);
  if (!classMatch) throw new Error("Could not find NativeSelect's own <select> className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius);
  const paddingHMatch = nearestToken(10, spacing, "spacing"); // pl-2.5 — same real target as Input's own horizontal padding
  const paddingVMatch = nearestToken(4, spacing, "spacing"); // py-1
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize");

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`NativeSelect ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }
  notes.push("NativeSelect: real horizontal padding is asymmetric (pl-2.5 text-side, pr-8 reserved for its chevron icon, which isn't drawn) — this plan uses the text-side value (pl-2.5) for both sides, the same single-shared-padding shape every other box component in this file uses.");
  notes.push("NativeSelect: represented in color/semantic/text/primary, not text/secondary — unlike Input/Textarea's own placeholder representation, a native <select> always shows a real selected option's text (no placeholder state exists for this element), inheriting shadcn's own base `text-foreground` layer.");

  return {
    name: "NativeSelect",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.primary") }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Select an option",
  };
}

// A real, always-exact alias — confirmed by reading every one of the four
// real preset files (`presets/radius.{tailwind,bootstrap,md3,md2}.json`)
// directly, not assumed: `radius.full` is `9999px` in EVERY preset,
// unconditionally, unlike `radius.md`/`radius.lg`/etc., which vary by
// preset. Tailwind's own `rounded-full` utility is a fixed literal too
// (not derived from `--radius` via any `calc()` formula the way
// `rounded-lg`/`rounded-sm`/`rounded-xl` are) — so this binds directly,
// the same "guaranteed real alias, never a nearest-guess" treatment
// `exactRadiusMd` already established for `rounded-lg`.
function exactRadiusFull(radius: Record<string, number>): { figmaName: string; deltaPx: number } {
  if (radius["full"] === undefined) throw new Error("radius.json has no 'full' entry — was css/tokens.css written by this pipeline's `generate`?");
  return { figmaName: "radius/full", deltaPx: 0 };
}

// Tenth real component, added 2026-09-18, and the first real per-batch
// "extra check" this plan's own remaining-components plan called for:
// verify Avatar's real box-height-vs-radius PILL look actually holds
// under every real radius preset, the same live check Badge's own header
// comment already did for its shape. Real current source (only its
// `AvatarFallback` sub-part is modeled — see below): `flex size-full
// items-center justify-center rounded-full bg-muted text-sm
// text-muted-foreground group-data-[size=sm]/avatar:text-xs`.
// `AvatarFallback` itself has NO size/padding classes at all (`size-full`
// inherits from its parent) — its real fixed dimensions (`size-8`, 32px
// for the "default" size, this file's usual "one size" scope) live on the
// OUTER `Avatar` root instead, read here ONLY to compute a representative
// padding target, not because `AvatarFallback`'s own scope is being
// silently widened to cover `Avatar` generally (`AvatarImage`, a real
// photo, is still NOT modeled — the same disclosed scope cut
// `figma-remaining-components-plan.md`'s own Batch 1 description names,
// parallel to how `buildCardPlan`'s own comment discloses CardFooter).
//
// This schema has no "fixed size, no padding" shape yet (that's real,
// separate, later work — see figma-remaining-components-plan.md's own
// Batch 11 for the first genuinely fixed-size frame) — represented here
// as a hug-content box with EQUAL horizontal/vertical padding, targeted so
// `2 × padding + fontSize ≈ 32px` (the real default box height), a
// disclosed approximation of the real fixed square, not a precise
// reproduction (a longer fallback label than the real 1-2 initial
// characters this component is meant for would visibly widen the box
// beyond a true circle — the same "hug-content approximates a fixed size"
// caveat as every other component in this file that has no exact
// Tailwind height match).
//
// The PILL/CIRCLE check itself: `rounded-full` binds to `radius/full`
// directly via `exactRadiusFull` (9999px, confirmed identical across all
// four real presets — see that function's own comment) rather than a
// nearest-guess — meaning, UNLIKE Badge's own coincidental "every real
// preset happens to be ≥ half the height" finding, Avatar's own circular
// look is trivially guaranteed for any real preset, by construction, not
// by checking specific preset values against a threshold. This closes the
// batch's own named risk more strongly than the precedent it was modeled
// on.
//
// Real, disclosed post-process, same reasoning as Alert's own
// `border.default` fallback: `AvatarFallback`'s own class list has no
// border/stroke class at all — the real visible ring comes from the OUTER
// `Avatar` root's own `after:border after:border-border` pseudo-element
// (a decorative ::after layer, not a real box-model border), which this
// parser's plain-class regex can't see (an `after:`-prefixed selector, the
// same class of gap as Alert's own `*:data-[slot=...]:` prefix, and the
// exact gap Batch 9 of figma-remaining-components-plan.md is planned to
// close generally via selector-prefix stripping). `border-border` itself
// maps directly to `border.default` per the existing table — this is a
// real, confirmed color, just applied via a hardcoded post-process rather
// than a parsed match, the same treatment `buildAlertPlan` already uses
// for its own `border.default` case.
function buildAvatarPlan(tokensCss: string, avatarSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["group/avatar", "size-8", "function AvatarFallback", "rounded-full", "bg-muted"]) {
    if (!avatarSource.includes(marker)) {
      throw new Error(`Avatar's real source no longer contains "${marker}" — shadcn/ui's real Avatar has likely changed shape since buildAvatarPlan was written. Re-verify against the current vendored avatar.tsx before trusting this plan.`);
    }
  }
  const fallbackMatch = avatarSource.match(/function AvatarFallback[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!fallbackMatch) throw new Error("Could not find AvatarFallback's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(fallbackMatch[1]);
  colors.strokeVariable = sdsgtPathToFigmaName("border.default"); // see file header — real ring lives on Avatar's own after:border-border pseudo-element, not AvatarFallback's own class list

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusFull(radius);
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // text-sm, the "default" size's real font size
  const paddingTarget = (32 - 14) / 2; // real size-8 (32px) minus text-sm (14px), halved — Avatar has no real padding class of its own to read (see file header)
  const paddingMatch = nearestToken(paddingTarget, spacing, "spacing");

  if (paddingMatch.deltaPx > 0) {
    notes.push(`Avatar padding: nearest real spacing token is ${paddingMatch.deltaPx}px off the computed target (${paddingTarget}px) — see file header for why this is a computed target, not a real Tailwind class value.`);
  }
  notes.push("Avatar: only its real AvatarFallback is modeled, and represented as a hug-content box with symmetric padding approximating its real fixed 32×32px (\"default\" size) square — AvatarImage (a real photo) isn't modeled, the same disclosed scope cut as Card's own CardFooter.");
  notes.push("Avatar: its real visible ring comes from the outer Avatar root's own after:border-border pseudo-element, not a class on AvatarFallback itself — bound to border/default via a hardcoded post-process, the same treatment Alert's own border.default fallback already uses, since this parser's plain-class regex can't see an after:-prefixed selector.");

  return {
    name: "Avatar",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingMatch.figmaName,
    paddingVerticalVariable: paddingMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "JD",
  };
}

// Eleventh real component, added 2026-09-18 — "Batch 2" of
// figma-remaining-components-plan.md, and the first component with NO box
// styling at all in its own real source. Real current source:
// `flex items-center gap-2 text-sm leading-none font-medium select-none
// group-data-[disabled=true]:pointer-events-none group-data-
// [disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-
// disabled:opacity-50` — no `bg-*`/`border-*`/`rounded-*`/`px-*`/`py-*`
// class anywhere, unlike every component built before it (even Input/
// Textarea have an explicit border/radius/padding). `scanClassesForColors`
// correctly finds no fill/stroke here — there genuinely isn't one, not a
// parse miss — but does need its new `fallbackTextPath` default
// (`"text.primary"`, see that function's own comment) for the text color,
// since Label has no `text-*` class of its own at all; called here with no
// second argument for exactly that reason.
//
// Padding and radius are both genuinely zero, not omitted or
// approximated — a real, disclosed choice, not a gap: since Label has no
// padding/radius class of its own, both targets are computed as a real
// 0px through the SAME `nearestToken` mechanism every other component
// uses (rather than hardcoding "radius/none"/"spacing/0" as string
// literals), which correctly lands on those exact real 0px tokens
// (confirmed present in a real generated tokens.css) with zero delta —
// same discipline as every other numeric target in this file, not a
// special case. The resulting Figma component is a bare text node with
// no visible frame styling — an accurate representation of a bare text
// label, not a placeholder box for a box that doesn't exist.
function buildLabelPlan(tokensCss: string, labelSource: string, notes: string[]): FigmaComponentPlanItem {
  const classMatch = labelSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Label's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(0, radius, "radius");
  const paddingHMatch = nearestToken(0, spacing, "spacing");
  const paddingVMatch = nearestToken(0, spacing, "spacing");
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize");

  notes.push("Label: has no padding/radius/fill/border class of its own at all in its real source — represented as a bare text node (0px padding, radius/none, no fill, no stroke), not approximated into a box that doesn't exist.");
  notes.push("Label: its real text color isn't set by any class of its own — inherited from shadcn's own generated `body { @apply text-foreground }` base rule, the same class of finding as Alert's own border.default fallback — bound to text.primary via scanClassesForColors's new fallbackTextPath default.");

  return {
    name: "Label",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Label",
  };
}

// Twelfth real component, added 2026-09-18 — "Batch 3" of
// figma-remaining-components-plan.md, and the first with NO text at all.
// Real current source (verified against a real vendored `shadcn add
// --all` project): `<div data-slot="skeleton" className={cn("animate-
// pulse rounded-md bg-muted", className)} {...props} />` — no `cva()`,
// exactly one plain class string (`scanClassesForColors`'s own existing
// shape, same as Input/Textarea), `bg-muted` → `background.secondary` via
// the existing table, no border class at all (unlike Input/Textarea's
// explicit `border border-input`, so no stroke, and no invisible-width
// base-layer border either — that only activates for elements that DO
// carry a bare `border` utility, see `buildAlertPlan`'s own comment;
// Skeleton has none).
//
// Real, disclosed, deliberate scope cut #1: `animate-pulse`'s real
// shimmer (a CSS keyframe opacity animation) is NOT reproduced — Figma
// has no token-bound equivalent for a running opacity keyframe, and this
// pipeline's own plan format has no animation concept at all yet. Pushed
// as a static gray box, not an animated one.
//
// Real, disclosed, deliberate scope cut #2, genuinely new to this file:
// Skeleton's own real source carries NO padding/sizing class of any kind
// — every component built before it always had SOME real padding class
// to bind (even Input/Textarea's smallest). A bare, real, unstyled
// Skeleton renders as a block-level div with no intrinsic height at all;
// every real usage supplies its own explicit `h-*`/`w-*` override
// (`<Skeleton className="h-4 w-[250px]" />`), which is caller-supplied
// JSX this parser has no access to (it only ever reads the component's
// OWN definition file). An empty hug-contents auto-layout frame with zero
// children and zero padding collapses to a literal 0x0 node — invisible,
// not a usable library component. Rather than ship that, this binds
// `paddingHorizontalVariable`/`paddingVerticalVariable` to representative
// spacing tokens chosen purely to give the pushed frame a visible,
// legible footprint (~96x24px, a plausible "skeleton line" shape) — a
// real, disclosed departure from every other component's padding, which
// is always read from the component's own real class list. Not a claim
// that Skeleton has a real default size; it doesn't. `radiusVariable`
// still comes from a real class (`rounded-md`): unlike `rounded-lg`'s
// direct 1:1 alias (`exactRadiusMd`) or `rounded-xl`'s ×1.4 multiplier
// (Card), shadcn's real `@theme inline` maps `--radius-md: calc(var(
// --radius) * 0.8)` — confirmed against this same vendored project's
// real compiled `globals.css` — so this uses `nearestToken` against
// `radius.md`'s own real resolved value times 0.8, the same discipline
// Card's own `rounded-xl` binding already established.
function buildSkeletonPlan(tokensCss: string, skeletonSource: string, notes: string[]): FigmaComponentPlanItem {
  const classMatch = skeletonSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Skeleton's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");

  const radiusMdPx = radius["md"];
  if (radiusMdPx === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  const radiusTarget = radiusMdPx * 0.8;
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Skeleton radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.md × 0.8 = ${radiusTarget.toFixed(1)}px).`);
  }

  // Representative placeholder size — see this function's own comment
  // above for why: Skeleton's real source has no padding/sizing class of
  // its own to bind, and an unpadded, childless auto-layout frame would
  // otherwise be a literal 0x0 invisible node.
  const paddingHMatch = nearestToken(48, spacing, "spacing");
  const paddingVMatch = nearestToken(12, spacing, "spacing");
  notes.push("Skeleton: its real source has no padding or sizing class at all — every real usage supplies its own explicit width/height override this parser can't see (caller JSX, not the component's own definition). Represented as a representative ~96x24px placeholder box (via padding on an empty frame) purely so the pushed component is visible in Figma, not a real default size — see file header for the same real, disclosed reasoning as Input's own placeholder-text choice.");
  notes.push("Skeleton: its real `animate-pulse` shimmer animation is not reproduced — pushed as a static gray box. Figma has no token-bound equivalent for a running CSS keyframe opacity pulse, and this pipeline's plan format has no animation concept yet.");

  return {
    name: "Skeleton",
    variantPropertyName: "Variant",
    // No textVariable — Skeleton has no text at all (see
    // FigmaComponentVariantPlanItem.textVariable's own comment). No
    // labelPropertyName/defaultLabel/fontSizeVariable at the top level
    // either — there's no label to bind.
    variants: [{ name: "Default", fillVariable: colors.fillVariable, underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    // Required by the interface but never actually read — SDSGT-figma-
    // push's own text-creation code (the only place that consults it) is
    // now gated on `variant.textVariable`/`labelPropertyName` being
    // present, neither of which Skeleton sets. Kept as a real, valid
    // variable name (not a dummy string) purely for interface parity with
    // every other component, not because anything binds to it.
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
  };
}

// Thirteenth real component, added 2026-09-21 — "Batch 6" of
// figma-remaining-components-plan.md, and the first real consumer of
// `sections` whose items lay out HORIZONTALLY (a row) instead of Card's
// own vertical Header-then-Content stack. Real current source (verified
// against a real vendored `breadcrumb.tsx`, current registry, using
// `@base-ui/react` not Radix — same library this registry already uses
// for Badge): a 7-part API (`Breadcrumb`/
// `BreadcrumbList`/`BreadcrumbItem`/`BreadcrumbLink`/`BreadcrumbPage`/
// `BreadcrumbSeparator`/`BreadcrumbEllipsis`).
//
// Real, disclosed, narrower scope than the actual component: this models
// a FIXED three-item trail (two links + one current page) — the real
// component supports any number of items, and its real
// `BreadcrumbEllipsis` (a collapsed-items affordance, its own icon) isn't
// modeled at all, the same "not attempted" treatment `chart.tsx`'s own
// per-series content gets.
//
// Real, load-bearing finding this batch exists to prove: the real
// separator between items (`BreadcrumbSeparator`'s own default child,
// confirmed by reading the real source) is `<ChevronRightIcon />` from
// `lucide-react` — a real SVG icon, NOT a text character. Icons aren't
// drawn by this pipeline (figma-remaining-components-plan.md's own
// NEEDS-ICON bucket) — but unlike Checkbox/Switch/etc. (where the icon
// IS the entire component, so skipping it would mean skipping the whole
// component), Breadcrumb's own primary content is real, bindable text;
// only the separator between items is an icon. Rather than decline the
// whole component over one decorative glyph, this represents the
// separator as a plain "›" text character — explicitly disclosed (see
// `notes` below and `FigmaComponentSectionPlanItem.separatorGlyph`'s own
// comment) as decorative only, wired to NO component property, not a
// faithful reproduction of the real chevron's shape.
//
// Real color sourcing: `BreadcrumbList`'s own `text-muted-foreground`
// (text.secondary) is the REST color for every item by default —
// `BreadcrumbLink` itself sets no color of its own (only a
// `hover:text-foreground` pseudo-state, out of this pipeline's own
// documented "rest states only" scope, same as every other component).
// `BreadcrumbPage` (the real current/active item) explicitly overrides to
// `text-foreground` (text.primary) with `font-normal` — a real, confirmed
// second color within the same component, not assumed. Real shared font
// size: `BreadcrumbList`'s own `text-sm` (14px) — no item overrides its
// own size.
//
// Real, disclosed, deliberate zero: `BreadcrumbItem` itself
// (`inline-flex items-center gap-1`) and the root `<nav>`
// (`className={cn(className)}`, no default classes AT ALL) have no
// padding/radius/fill/border class of their own anywhere in real source —
// represented with real 0px padding and radius/none, not approximated
// into styling that doesn't exist, the same treatment Label's own bare-
// text shape already established. The one real spacing value that DOES
// exist is `BreadcrumbList`'s own `gap-1.5` (6px, the real gap between
// items) — reused as `sectionGapVariable`, the same field Card's own
// itemSpacing-between-sections already binds, applied here as the real
// gap BETWEEN horizontally-laid-out items instead.
function buildBreadcrumbPlan(tokensCss: string, breadcrumbSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function BreadcrumbList", "function BreadcrumbItem", "function BreadcrumbLink", "function BreadcrumbPage", "function BreadcrumbSeparator", "ChevronRightIcon"]) {
    if (!breadcrumbSource.includes(marker)) {
      throw new Error(`Breadcrumb's real source no longer contains "${marker}" — shadcn/ui's real Breadcrumb has likely changed shape since buildBreadcrumbPlan was written. Re-verify against the current vendored breadcrumb.tsx before trusting this plan.`);
    }
  }

  const listMatch = breadcrumbSource.match(/function BreadcrumbList[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!listMatch) throw new Error("Could not find BreadcrumbList's own className string — real vendored source may have changed shape since this parser was written.");
  const listColors = scanClassesForColors(listMatch[1]); // text-muted-foreground -> text.secondary, the real rest color for every item by default

  const pageMatch = breadcrumbSource.match(/function BreadcrumbPage[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!pageMatch) throw new Error("Could not find BreadcrumbPage's own className string — real vendored source may have changed shape since this parser was written.");
  const pageColors = scanClassesForColors(pageMatch[1]); // text-foreground -> text.primary, the real CURRENT-page override

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(0, radius, "radius"); // real <nav> has no radius class of its own at all
  const itemGapMatch = nearestToken(6, spacing, "spacing"); // BreadcrumbList's real gap-1.5
  const itemPaddingMatch = nearestToken(0, spacing, "spacing"); // BreadcrumbItem has no horizontal padding of its own (inline-flex items-center gap-1 — a gap, not a padding)
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // BreadcrumbList's real text-sm, shared by every item — no item overrides its own font size

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["item gap", itemGapMatch],
    ["item padding", itemPaddingMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Breadcrumb ${label}: nearest real token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }

  notes.push('Breadcrumb: its real separator between items is a <ChevronRightIcon> SVG (lucide-react), not a text character — icons aren\'t drawn by this pipeline (see figma-remaining-components-plan.md\'s NEEDS-ICON bucket). Represented as a decorative "›" text glyph baked directly into the design instead, purely to show WHERE a separator sits — it is explicitly NOT wired to any component property, so editing an instance\'s item labels never moves or changes it, and it is not a faithful reproduction of the real chevron icon\'s shape.');
  notes.push("Breadcrumb: represented as a fixed three-item trail (two links + one current page) — its real BreadcrumbEllipsis (a collapsed-items affordance, with its own icon) isn't modeled, and the real component supports any number of items, not a fixed three.");
  notes.push("Breadcrumb: its real <nav> root and BreadcrumbItem have no fill/stroke/radius/padding class of their own at all — represented with none of its own (radius/none, no fill, no stroke, 0px item padding), not approximated into styling that doesn't exist, the same treatment Label's own bare-text shape already established.");

  return {
    name: "Breadcrumb",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: itemGapMatch.figmaName,
    sections: [
      {
        paddingHorizontalVariable: itemPaddingMatch.figmaName,
        textLineDirection: "horizontal",
        separatorGlyph: "›",
        textLines: [
          { textVariable: listColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Item1", defaultLabel: "Home" },
        ],
      },
      {
        paddingHorizontalVariable: itemPaddingMatch.figmaName,
        textLineDirection: "horizontal",
        separatorGlyph: "›",
        textLines: [
          { textVariable: listColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Item2", defaultLabel: "Category" },
        ],
      },
      {
        paddingHorizontalVariable: itemPaddingMatch.figmaName,
        textLineDirection: "horizontal",
        // Last item — the real current BreadcrumbPage — has no trailing
        // separator: no `separatorGlyph` set, matching real markup, where
        // a separator only ever sits BETWEEN items, never after the last.
        textLines: [
          { textVariable: pageColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "CurrentPage", defaultLabel: "Current Page" },
        ],
      },
    ],
  };
}

// Fourteenth real component, added 2026-09-21 — "Batch 4" of
// figma-remaining-components-plan.md, and the first `sections`-based
// component since Card itself (2026-09-17) to reuse that exact mechanism
// with zero schema changes. Real current source (verified against a real
// vendored `shadcn add --all` project): a 6-part API (`Empty`/
// `EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/
// `EmptyContent`) — only `EmptyHeader` (Title + Description) and
// `EmptyContent` are modeled here, the exact same disclosed scope cut
// Card's own `CardFooter` already established (`EmptyMedia`, an icon
// slot, is excluded for the same real, separate NEEDS-ICON reason named
// in figma-remaining-components-plan.md's own permanently-out-of-scope
// list — not attempted here).
//
// `Empty`'s own real root: `flex w-full min-w-0 flex-1 flex-col
// items-center justify-center gap-4 rounded-xl border-dashed p-6
// text-center text-balance`. `border-dashed` sets a border STYLE only —
// there's no accompanying `border`/`border-2`/etc. WIDTH utility anywhere
// in this class list, and Tailwind's own preflight reset leaves every
// element's border-width at 0 unless a width utility sets it — so a real,
// unstyled Empty renders with NO visible border at all despite
// `border-dashed` being present (confirmed live via a real rendered
// page's own computed `border-width: 0px`, not assumed from the class
// name alone). Represented here with no stroke, for that real reason, not
// a parser miss. No `bg-*` class either — CSS `background-color` isn't an
// inherited property the way `color` is, so this is a real, plain
// transparent fill, not a base-layer-inheritance case the way the text
// findings below are.
//
// `EmptyTitle` has no `text-*` class of its own (`font-heading text-sm
// font-medium tracking-tight`) — the same real base-layer-inheritance
// finding as Label's own fallback (figma-remaining-components-plan.md,
// Batch 2) and Alert's own `border.default` fallback: shadcn's generated
// `body { @apply text-foreground }` rule means it really does render in
// `text.primary`, hardcoded directly here (this `sections`-based builder
// sets each line's color directly, the same way `buildCardPlan` hardcodes
// `text.on-surface` rather than calling `scanClassesForColors` — no
// dependency on Batch 2's `fallbackTextPath` parameter). `EmptyContent`
// (`flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm
// text-balance`) has the exact same real gap — no `text-*` class of its
// own either — so it gets the same `text.primary` fallback, not
// `text.secondary`: unlike Card's own `CardContent`, which sits inside a
// real `bg-card`-filled surface (making `text.on-surface` a meaningfully
// different color from plain body text), Empty's own root has no fill of
// its own at all (see above), so there's nothing for `text.on-surface` to
// mean here beyond the plain base-layer `text.primary`. `EmptyDescription`
// (`text-sm/relaxed text-muted-foreground ...`) maps directly via the
// existing table (`text-muted-foreground` -> `text.secondary`) — an
// already-tabled path, no fallback needed, exactly like `buildCardPlan`'s
// own `CardDescription` line.
//
// `rounded-xl`: the exact same real ×1.4 multiplier as Card's own radius
// (both use `--radius-xl: calc(var(--radius) * 1.4)`), computed the same
// way (`radius.md`'s own real resolved value × 1.4, via `nearestToken`,
// never a hardcoded guess) — not re-derived as a new formula.
//
// Real, disclosed schema limitation, genuinely new to this batch: Empty's
// real vertical rhythm has TWO different values — a 24px outer `p-6`
// (also its own real horizontal inset, since neither `EmptyHeader` nor
// `EmptyContent` carry any padding of their own) and a smaller, real 16px
// `gap-4` between the two sections — but `sectionGapVariable` is ONE
// shared value serving both the inter-section gap AND the outer frame's
// own top/bottom padding (see that field's own interface comment). Unlike
// Card, where `--card-spacing` really is the exact same value for both
// roles (confirmed by reading its own real source — `gap-(--card-spacing)`
// and `py-(--card-spacing)` are the SAME custom property), Empty's two
// real values genuinely differ. Bound here to the OUTER padding's real
// value (`spacing/6`, 24px) — preserving Empty's own defining
// generous-whitespace look — at the cost of the real, smaller 16px gap
// between Header and Content being approximated up to 24px; disclosed via
// `notes`, not silently picked.
function buildEmptyPlan(tokensCss: string, emptySource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["rounded-xl", "border-dashed", "function EmptyHeader", "function EmptyTitle", "function EmptyDescription", "function EmptyContent"]) {
    if (!emptySource.includes(marker)) {
      throw new Error(`Empty's real source no longer contains "${marker}" — shadcn/ui's real Empty has likely changed shape since buildEmptyPlan was written. Re-verify against the current vendored empty.tsx before trusting this plan.`);
    }
  }

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMdPx = radius["md"];
  if (radiusMdPx === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  const radiusTarget = radiusMdPx * 1.4;
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Empty radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.md × 1.4 = ${radiusTarget.toFixed(1)}px) — same real rounded-xl formula as Card's own radius.`);
  }

  const paddingHMatch = nearestToken(24, spacing, "spacing"); // real p-6, the only horizontal inset Empty actually has (neither section carries its own)
  const sectionGapMatch = nearestToken(24, spacing, "spacing"); // see file header — bound to the real OUTER padding value, not the real (smaller) inter-section gap-4
  const titleFontSize = nearestToken(14, fontSize, "typography/primitive/fontSize"); // EmptyTitle's real text-sm
  const bodyFontSize = nearestToken(14, fontSize, "typography/primitive/fontSize"); // EmptyDescription/EmptyContent's real text-sm

  notes.push("Empty: only its real Header (Title + Description) and Content sections are modeled — EmptyMedia (an icon slot) isn't, the same declared-out-of-scope NEEDS-ICON reason as Checkbox/Switch/etc. (figma-remaining-components-plan.md).");
  notes.push("Empty: its real border-dashed class has no accompanying border-width utility of its own — Tailwind's own preflight reset leaves border-width at 0 absent one, so a real unstyled Empty has NO visible border despite border-dashed being present. Represented with no stroke.");
  notes.push("Empty: two different real vertical-spacing values (a 24px outer p-6 and a 16px inter-section gap-4) collapse onto this schema's one shared sectionGapVariable — bound to the larger, outer-padding value (spacing/6, 24px) to preserve Empty's own defining generous-whitespace look; its real, smaller 16px inter-section gap is approximated up to 24px as a result.");

  return {
    name: "Empty",
    variantPropertyName: "Variant",
    variants: [
      { name: "Default", textVariable: sdsgtPathToFigmaName("text.primary"), underline: false },
    ],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: sectionGapMatch.figmaName,
    sections: [
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: sdsgtPathToFigmaName("text.primary"), fontSizeVariable: titleFontSize.figmaName, weight: "Medium", labelPropertyName: "Title", defaultLabel: "No results found" },
          { textVariable: sdsgtPathToFigmaName("text.secondary"), fontSizeVariable: bodyFontSize.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "Try adjusting your search or filters." },
        ],
      },
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: sdsgtPathToFigmaName("text.primary"), fontSizeVariable: bodyFontSize.figmaName, weight: "Regular", labelPropertyName: "Content", defaultLabel: "This is the empty state's main content." },
        ],
      },
    ],
  };
}

// Fifteenth real component, added 2026-09-21, same batch as Empty. Real
// current source (`field.tsx`) is a large, mostly-structural API
// (`FieldSet`/`FieldLegend`/`FieldGroup`/`Field`/`FieldContent`/
// `FieldLabel`/`FieldTitle`/`FieldDescription`/`FieldSeparator`/
// `FieldError`) — only `FieldLabel`, `FieldDescription`, and `FieldError`
// are modeled, per the user's own scope decision (`FieldSeparator` is
// Batch 5's own job, being built in a parallel worktree, adding a
// genuinely new `line` shape this batch must not touch or anticipate).
//
// Modeled via the SIMPLE one-line-per-section pattern `sections` already
// allowed but nothing had exercised yet — three independent sections, one
// text line each — not Card's own two-lines-in-one-Header shape.
//
// `FieldLabel` wraps a real `<Label>` (`import { Label } from
// "@/components/ui/label"`) — its own className only ADDS structural/
// conditional classes on top (`group/field-label ...`,
// `has-data-checked:border-primary/30`, `dark:has-data-checked:...`,
// etc. — every one of these is either a bare layout utility or sits
// behind a `has-`/`group-`/`dark:` selector prefix `scanClassesForColors`'s
// plain regex was never built to match), no plain, unconditional
// `text-*`/`bg-*`/`border-*` class of its own anywhere. Its real rendered
// color is exactly Label's own (`text.primary`, via base-layer
// inheritance — see `buildLabelPlan`'s own comment) —
// `scanClassesForColors` called here with no second argument, reusing
// that same default, not a new path.
//
// `FieldDescription` (`text-left text-sm leading-normal font-normal
// text-muted-foreground ...`) maps directly via the existing table
// (`text-muted-foreground` -> `text.secondary`) — an already-tabled path,
// no fallback needed.
//
// `FieldError` (`text-sm font-normal text-destructive`) — confirmed here
// against real vendored source, per this batch's own required check
// (figma-remaining-components-plan.md never quoted this file's exact
// string): a PLAIN, unconditional `text-destructive` class, not hidden
// behind a data-attribute or selector prefix. Maps directly via the
// existing table (`destructive` -> `status.error`) — the ordinary path,
// not the `destructive-foreground` same-tone-trap special case
// `classToFigmaVariable` carves out (that only fires for the literal
// `-foreground` suffix; plain `destructive` was always meant to resolve
// here), and no same-tone risk the way Button/Badge's own destructive
// FILL variants have — FieldError is plain text with no fill of its own
// to collide with.
//
// None of the three sub-parts, nor `Field` itself, carry any real padding
// or radius class. `Field`'s own root (`group/field flex w-full gap-2
// data-[invalid=true]:text-destructive`, via a real `cva()` `orientation`
// axis this batch does NOT model — only the default "vertical" shape's
// base classes, which carry no color of their own, are represented, the
// same "one shape only" disclosed scope every single-state component in
// this file already uses) has no padding class either. Padding/radius are
// computed as real 0px through the same `nearestToken` mechanism as every
// other numeric target in this file (landing exactly on
// `spacing/0`/`radius/none`), the same "bare text node, not an
// approximated box" treatment `buildLabelPlan` already established, not a
// new special case.
//
// `Field`'s own real `gap-2` (8px, its real inter-row gap in the default
// vertical orientation) is the only real spacing value on this component
// at all — bound to `sectionGapVariable`, for the same real reason
// Empty's own larger value was (see that function's own comment): this
// schema's one shared field forces the same 8px onto the outer frame's
// own top/bottom padding too, which Field's real root doesn't have (0px)
// — a real, disclosed, smaller version of Empty's own trade-off, in this
// same batch.
function buildFieldPlan(tokensCss: string, fieldSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Field(", "function FieldLabel", "function FieldDescription", "function FieldError"]) {
    if (!fieldSource.includes(marker)) {
      throw new Error(`Field's real source no longer contains "${marker}" — shadcn/ui's real Field has likely changed shape since buildFieldPlan was written. Re-verify against the current vendored field.tsx before trusting this plan.`);
    }
  }

  // Each sub-part's own className is extracted separately, scoped to its
  // own function body (same "function <X>[\s\S]*?className=\{cn\(" shape
  // `buildAvatarPlan` already uses for `AvatarFallback`) — field.tsx has
  // several OTHER `className={cn(...)}` calls (FieldSet, FieldGroup,
  // Field, FieldContent, FieldTitle, FieldSeparator's inner span) that
  // would wrongly match a plain, unscoped `cn(\s*"..."` regex.
  const labelMatch = fieldSource.match(/function FieldLabel[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!labelMatch) throw new Error("Could not find FieldLabel's own className string — real vendored source may have changed shape since this parser was written.");
  const descriptionMatch = fieldSource.match(/function FieldDescription[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!descriptionMatch) throw new Error("Could not find FieldDescription's own className string — real vendored source may have changed shape since this parser was written.");
  const errorMatch = fieldSource.match(/function FieldError[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!errorMatch) throw new Error("Could not find FieldError's own className string — real vendored source may have changed shape since this parser was written.");

  const labelColors = scanClassesForColors(labelMatch[1]);
  const descriptionColors = scanClassesForColors(descriptionMatch[1]);
  const errorColors = scanClassesForColors(errorMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const paddingHMatch = nearestToken(0, spacing, "spacing"); // real, genuine zero — see file header
  const radiusMatch = nearestToken(0, radius, "radius"); // real, genuine zero — see file header
  const sectionGapMatch = nearestToken(8, spacing, "spacing"); // real gap-2 — see file header for its dual role
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // all three sub-parts are real text-sm

  notes.push("Field: only its real FieldLabel/FieldDescription/FieldError are modeled — FieldSeparator isn't (a genuinely new shape, tracked as its own later batch), and Field's own real orientation axis (vertical/horizontal/responsive) isn't modeled — always its default vertical shape, whose base classes carry no color of their own.");
  notes.push("Field: FieldLabel/Field/FieldError/FieldDescription have no real padding or radius class of their own at all — represented as bare text rows (0px padding, radius/none, no fill, no stroke), the same 'bare text node' treatment buildLabelPlan already established, not approximated into boxes that don't exist.");
  notes.push("Field: its real gap-2 (8px) inter-row gap is the only real spacing value present — bound to sectionGapVariable, which this schema also applies to the outer frame's own top/bottom padding (Field's real root has none) — the same real, disclosed schema trade-off as Empty's own, in this same batch, just an 8px version.");

  return {
    name: "Field",
    variantPropertyName: "Variant",
    variants: [
      { name: "Default", textVariable: sdsgtPathToFigmaName("text.primary"), underline: false },
    ],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: sectionGapMatch.figmaName,
    sections: [
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: labelColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Medium", labelPropertyName: "Label", defaultLabel: "Email address" },
        ],
      },
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: descriptionColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "We'll never share your email." },
        ],
      },
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: errorColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Error", defaultLabel: "This field is required." },
        ],
      },
    ],
  };
}

// Sixteenth real component, added 2026-09-21 — "Batch 5" of
// figma-remaining-components-plan.md, and the first genuinely non-box
// shape in this file (see `FigmaComponentLinePlanItem`'s own comment for
// the full reasoning behind the new `line` field this introduces). Real
// current source (`@base-ui/react/separator`, confirmed against a real
// `shadcn add --all` vendor):
//   data-slot="separator"
//   className: "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full
//               data-vertical:w-px data-vertical:self-stretch"
// `bg-border` maps directly to `border.default` via the existing
// `SHADCN_VAR_TO_SDSGT_PATH` table — a real, ordinary fill-class match
// (the line's "fill" IS its visible color, there's no separate stroke
// concept for a solid rectangle), not a special case. The
// `data-horizontal:`/`data-vertical:` prefixed classes are real
// orientation-conditional Tailwind data-attribute variants this parser's
// plain-class regex was never built to parse — same class of gap as the
// `placeholder:`/`*:data-[slot=...]:`/`after:` prefixes already documented
// elsewhere in this file. Orientation itself isn't modeled (see
// `FigmaComponentLinePlanItem`'s own comment) — only the real horizontal,
// 1px-thick line.
function buildSeparatorPlan(tokensCss: string, separatorSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ['data-slot="separator"', "bg-border", "data-horizontal:h-px"]) {
    if (!separatorSource.includes(marker)) {
      throw new Error(`Separator's real source no longer contains "${marker}" — shadcn/ui's real Separator has likely changed shape since buildSeparatorPlan was written. Re-verify against the current vendored separator.tsx before trusting this plan.`);
    }
  }
  const classMatch = separatorSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Separator's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);
  if (!colors.fillVariable) throw new Error("Separator's own bg-border class didn't resolve to a fill variable — real vendored source may have changed shape since this parser was written.");

  const radius = readCssScale(tokensCss, "radius");
  const radiusMatch = nearestToken(0, radius, "radius"); // a bare line has no real corner radius of its own — lands on the real exact 0px token, same discipline as buildLabelPlan's own zero targets

  notes.push("Separator: represented as a fixed 1px-thick line at a representative 200px length — its real source has no intrinsic length of its own (shadcn's own w-full/self-stretch always fills whatever container the caller supplies, which this parser can't see), and its real thickness (a bare Tailwind h-px) has no matching spacing token to bind (the smallest real spacing token is 4px) — see FigmaComponentLinePlanItem's own comment for why thicknessPx is a raw, unbound pixel literal instead of a nearest-token approximation that would round it to either an invisible 0px or an oversized 4px line.");
  notes.push("Separator: orientation (horizontal vs vertical) isn't modeled — only the real horizontal line is represented, the same 'one shape only' scope this file's every other component already carries.");

  return {
    name: "Separator",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", underline: false }], // no real fill/text/stroke of its own here — the line's own color lives on `line.colorVariable` instead, see that field's own comment
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    line: {
      colorVariable: colors.fillVariable,
      thicknessPx: 1,
      representativeLengthPx: 200,
    },
  };
}

// Seventeenth real component, added 2026-09-21 — same batch as Separator,
// built as its second real consumer per this project's own "extract once a
// second consumer needs it" discipline (figma-remaining-components-plan.md
// deliberately scheduled both in the same batch, rather than a
// Separator-only special case). Real current source (`field.tsx`,
// confirmed against the same real vendor):
//   <div data-slot="field-separator" data-content={!!children}
//     className="relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2">
//     <Separator className="absolute inset-0 top-1/2" />
//     {children && (
//       <span className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
//         data-slot="field-separator-content">
//         {children}
//       </span>
//     )}
//   </div>
// Confirms, against real source rather than assumption, that a centered
// label IS a real, supported feature here (e.g. a login form's "OR
// CONTINUE WITH" divider) — genuinely different from bare `Separator`,
// whose own real source (`@base-ui/react/separator`) has no `children`
// prop at all. This plan represents FieldSeparator WITH its label present
// (not the label-less default) specifically to exercise the new
// `centerLabel` path this batch introduces — an empty FieldSeparator would
// be visually indistinguishable from bare Separator and wouldn't
// demonstrate the one real thing that makes this a second, genuinely
// different consumer, not a duplicate of the first.
//
// The nested `<Separator>`'s own real color (`bg-border` → `border.default`)
// is hardcoded here, not re-derived from a second source file —
// `COMPONENT_BUILDERS` passes this function only `field.tsx`'s own source,
// never `separator.tsx`'s, so there's no file-driven way to re-confirm it
// from here. Reusing the exact real value `buildSeparatorPlan` derives
// from `separator.tsx` directly, the same "real, confirmed value, applied
// via a hardcoded post-process rather than a parsed match" treatment
// `buildAvatarPlan`'s own `border.default` case already uses for the same
// underlying reason (a color living on a DIFFERENT real element than the
// one this function's own source string can see).
//
// The label span's own real classes (confirmed by matching the actual
// string, not assumed): `bg-background px-2 text-muted-foreground`.
// `text-muted-foreground` → `text.secondary` via the existing table.
// `bg-background` (the real background-COLOR MASK the label sits on, so
// it visually "cuts" the continuous line underneath) is NOT modeled as a
// separate fill here — see `FigmaComponentLinePlanItem.centerLabel`'s own
// comment: this plan's `[line, text, line]` row uses three
// NON-overlapping segments instead of the real absolute-position overlap,
// so there is no line running underneath the text to mask in the first
// place. `px-2` (8px) IS modeled — it's the real gap between the label and
// each flanking line segment — bound to `gapVariable` via `nearestToken`,
// landing on a real exact match (`spacing/2` = 8px in the tailwind
// preset).
function buildFieldSeparatorPlan(tokensCss: string, fieldSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ['data-slot="field-separator"', 'data-slot="field-separator-content"', "bg-background", "text-muted-foreground"]) {
    if (!fieldSource.includes(marker)) {
      throw new Error(`FieldSeparator's real source no longer contains "${marker}" — shadcn/ui's real field.tsx has likely changed shape since buildFieldSeparatorPlan was written. Re-verify against the current vendored field.tsx before trusting this plan.`);
    }
  }
  const labelClassMatch = fieldSource.match(/className="([^"]*bg-background[^"]*)"/);
  if (!labelClassMatch) throw new Error("Could not find FieldSeparator's own label <span> className string — real vendored source may have changed shape since this parser was written.");
  const labelColors = scanClassesForColors(labelClassMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(0, radius, "radius"); // a bare line has no real corner radius of its own
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // text-sm, the label span's own real size
  const gapMatch = nearestToken(8, spacing, "spacing"); // px-2, the label span's own real horizontal padding — the gap between it and each flanking line segment
  if (gapMatch.deltaPx > 0) {
    notes.push(`FieldSeparator gap: nearest real spacing token is ${gapMatch.deltaPx}px off shadcn's own exact Tailwind value (px-2, 8px).`);
  }

  notes.push("FieldSeparator: pushed WITH its optional centered label present (a real, confirmed feature of this component — passing children renders a centered span over the line, e.g. a login form's 'OR CONTINUE WITH' divider), not its label-less default state, specifically to exercise this batch's new centerLabel path. Bare Separator itself never supports a label at all — confirmed against its own real source, not assumed.");
  notes.push("FieldSeparator: its real implementation absolutely-positions the label span OVER one continuous line and masks it with a bg-background fill; this plan instead represents it as three non-overlapping segments ([line, text, line]) — a disclosed simplification, not a parse failure. The label's own real bg-background masking fill isn't modeled, since the non-overlapping row has no line running underneath the text to mask in the first place.");
  notes.push("FieldSeparator: its inner Separator's own real border.default color is reused directly from buildSeparatorPlan's own derivation (this function only ever sees field.tsx's own source, not separator.tsx's) — a real, confirmed value applied via a hardcoded post-process, the same treatment buildAvatarPlan's own border.default case already uses.");

  return {
    name: "FieldSeparator",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    line: {
      colorVariable: sdsgtPathToFigmaName("border.default"), // see this function's own header comment — reused from Separator's own real derivation, not re-parsed here
      thicknessPx: 1,
      representativeLengthPx: 80, // each flanking segment — shorter than bare Separator's own 200px, a plausible footprint for a divider flanking a short label rather than a full-width rule
      centerLabel: {
        textVariable: labelColors.textVariable,
        fontSizeVariable: fontSizeMatch.figmaName,
        gapVariable: gapMatch.figmaName,
        labelPropertyName: "Label",
        defaultLabel: "OR",
      },
    },
  };
}

// Eighteenth real component, added 2026-09-21 — "Batch 7" of
// figma-remaining-components-plan.md, and the first component to combine
// TWO existing mechanisms that had only ever been used separately before:
// a real `cva()` color-variant axis (`buildVariantsFromCva`, the
// Button/Badge/Toggle/Alert shape) for the outer frame, plus `sections`
// (the Card/Breadcrumb/Empty/Field shape) for the body. No schema change
// was needed — `FigmaComponentPlanItem` already allowed `variants` and
// `sections` together, nothing had exercised it. Real current source
// (`item.tsx`, confirmed against a real vendored `shadcn add --all`
// project): an 8-part API (`Item`/`ItemMedia`/`ItemContent`/`ItemActions`/
// `ItemGroup`/`ItemSeparator`/`ItemHeader`/`ItemFooter`, plus `ItemTitle`/
// `ItemDescription`) — only the outer `Item` frame and `ItemTitle`/
// `ItemDescription` (as a single section, mirroring Card's own Header
// shape) are modeled. `ItemMedia` (an icon/image slot) and `ItemActions`
// (real interactive buttons) are excluded — the same declared NEEDS-ICON
// and NEEDS-INTERACTIVE-STRUCTURE reasons already named in
// figma-remaining-components-plan.md's own permanently-out-of-scope list.
//
// Real `variant` axis, via `parseCvaAxis(itemSource, "variant")`: three
// real options — `default` (`border-transparent` — no real border color,
// same "no recognized color class" null-fill/null-stroke path
// `classToFigmaVariable` already handles), `outline` (`border-border` —
// `border.default`, an ordinary match), and `muted` (`border-transparent
// bg-muted/50` — `background.secondary`, via the same "opacity modifier
// silently dropped" simplification already documented for Badge's own
// `bg-destructive/10` case: the real 50%-translucent muted background
// becomes a SOLID `background.secondary` fill here, a disclosed
// approximation, not a parser miss). Item's real `size` axis
// (`default`/`sm`/`xs`) is NOT modeled — only `size: "default"`'s own
// classes are read, the same "one size" scope every other component in
// this file already uses.
//
// Real, load-bearing finding this batch exists to confirm: `rounded-lg`
// is `item.tsx`'s own real base-class radius, exactly like Toggle/Badge/
// Input/Textarea/Card before it — bound via `exactRadiusMd`, a real EXACT
// alias to `radius.md` (see that function's own comment for the 2px
// mismatch bug this discipline already caught once), never a `nearestToken`
// guess against a hardcoded target.
//
// Real, disclosed schema limitation, genuinely new to this batch:
// `ItemContent`'s own real `gap-1` (4px, the real space between Title and
// Description) has no home in `FigmaComponentSectionPlanItem` — a
// section's own `textLines` stack directly adjacent in the replay, same
// as Card's own Title/Description pair, relying only on each line's own
// line-height for visual separation. Card's own real Header/Description
// gap happens to read as acceptable this way; Item's real 4px gap is
// disclosed explicitly here rather than silently inheriting the same
// unflagged treatment.
function buildItemPlan(tokensCss: string, itemSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Item(", "function ItemTitle", "function ItemDescription", "itemVariants"]) {
    if (!itemSource.includes(marker)) {
      throw new Error(`Item's real source no longer contains "${marker}" — shadcn/ui's real Item has likely changed shape since buildItemPlan was written. Re-verify against the current vendored item.tsx before trusting this plan.`);
    }
  }

  const { variants, skippedVariants } = buildVariantsFromCva(itemSource, "variant");
  if (variants.some((v) => v.fillVariable === sdsgtPathToFigmaName("background.secondary"))) {
    notes.push("Item: its real Muted variant's bg-muted/50 (a 50% translucent background) is represented as a SOLID background.secondary fill — this parser drops opacity modifiers on bg-*/text-*/border-* classes (same simplification already documented for Badge's own destructive/10 case), not a faithful reproduction of the real translucency.");
  }

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusMd(radius); // real rounded-lg -> a real EXACT alias to radius.md, not a nearest-value guess — see this function's own comment
  const paddingHMatch = nearestToken(12, spacing, "spacing"); // real px-3
  const paddingVMatch = nearestToken(10, spacing, "spacing"); // real py-2.5
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // ItemTitle/ItemDescription's real text-sm, shared

  for (const [label, match] of [
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0) {
      notes.push(`Item ${label}: nearest real spacing token is ${match.deltaPx}px off shadcn's own exact Tailwind value.`);
    }
  }

  notes.push("Item: only its real outer frame and ItemTitle/ItemDescription are modeled — ItemMedia (an icon/image slot) and ItemActions (real interactive buttons) aren't, the same declared NEEDS-ICON/NEEDS-INTERACTIVE-STRUCTURE reasons named in figma-remaining-components-plan.md. Its real size axis (default/sm/xs) isn't modeled either — always its default size's own classes.");
  notes.push("Item: ItemContent's real gap-1 (4px) between Title and Description has no home in this schema's sections/textLines shape — the two lines stack directly adjacent in the replay, relying only on each line's own line-height for visual separation, not a bound 4px gap.");

  return {
    name: "Item",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: paddingVMatch.figmaName,
    sections: [
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        textLines: [
          { textVariable: sdsgtPathToFigmaName("text.primary"), fontSizeVariable: fontSizeMatch.figmaName, weight: "Medium", labelPropertyName: "Title", defaultLabel: "Item title" },
          { textVariable: sdsgtPathToFigmaName("text.secondary"), fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "Item description goes here." },
        ],
      },
    ],
  };
}

// Nineteenth real component, added 2026-09-21 — "Batch 8" of
// figma-remaining-components-plan.md, and the first of the six real
// "chat/AI kit" registry files (a newer shadcn/ui registry extension, not
// the classic component set) to ship. Real current source (`marker.tsx`,
// confirmed against a real vendored `shadcn add --all` project) is a
// `cva()`-based component — same mechanism shape as Button/Badge/Toggle/
// Alert/Item — but per the user's own prior decision (this batch's own
// section in figma-remaining-components-plan.md) it's modeled the SAME
// way Input/Textarea/Kbd/Label are: a single colorless "Default" box via
// `scanClassesForColors`, with the real `cva()` axis ignored entirely
// rather than run through `buildVariantsFromCva`.
//
// Real `cva()` shape: `cva("group/marker relative flex min-h-4 w-full
// items-center gap-2 text-left text-sm text-muted-foreground
// [&_svg:not([class*='size-'])]:size-4 [a]:underline
// [a]:underline-offset-3 [a]:hover:text-foreground", { variants: {
// variant: { default: "", separator: "before:mr-1 before:h-px
// before:min-w-0 before:flex-1 before:bg-border after:ml-1 after:h-px
// after:min-w-0 after:flex-1 after:bg-border", border: "border-b
// border-border pb-2" } } })` — confirmed `default` is genuinely an empty
// no-op, so ALL of Marker's real styling lives on cva()'s own BASE class
// string, not on any per-variant entry (checked below at build time, not
// assumed — a future shadcn update moving real styling onto `default`
// itself would silently invalidate this whole reframing otherwise).
//
// Real, disclosed finding from this batch's own required verification
// pass (figma-remaining-components-plan.md's own Batch 8 section claims
// "none of its options differ in color" — checked against real source,
// not taken on faith): that claim is true in the sense that matters (no
// option ever resolves to a DIFFERENT color/hue than another — the only
// color either non-default option ever references is `border-border`,
// the exact same already-tabled `border.default` token used everywhere
// else in this file), but it understates one real detail — `border`'s own
// classes (`border-b border-border pb-2`) DO contain a real, parseable
// `border-border` match `classToFigmaVariable` would bind if this ran
// through `buildVariantsFromCva`, unlike `default` (empty) and
// `separator` (whose own `before:.../after:...bg-border` references sit
// behind a `before:`/`after:` pseudo-element selector prefix this
// parser's plain class regex was never built to match, so they're
// invisible to it regardless). This is presence-vs-absence of one
// already-correct token, not a same-tone-trap-style wrong value — but per
// this project's own disclosure policy, it's still surfaced explicitly
// here rather than silently building against the plan's own slightly
// looser framing. Ignoring the whole cva() axis (the user's own decision)
// means both `separator` (flanking hairlines) and `border` (a real bottom
// rule) go fully unrepresented, not just their color-bearing parts.
//
// Real, disclosed finding, genuinely new to this batch: Marker has NO
// `rounded-*` class anywhere in its real source — across all three real
// options, not just `default` — and NO padding class of its own either
// (only the ignored `border` option's own `pb-2` has one). This isn't a
// parser miss papered over with a guess: `nearestToken(0, ...)` is used
// for both radius and padding, landing on the real exact `radius/none`
// (0px) and `spacing/0` (0px) tokens, the same "genuinely zero, not
// hardcoded" discipline already established for Label's own padding/
// radius and bare Separator's own radius. Its real rendered height comes
// entirely from `text-sm`'s own line-height — `min-h-4` (16px) is a
// MINIMUM only, not a hard height this schema has any way to enforce, and
// in practice text-sm's own line-height already exceeds it.
function buildMarkerPlan(tokensCss: string, markerSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Marker(", "markerVariants = cva(", "text-muted-foreground"]) {
    if (!markerSource.includes(marker)) {
      throw new Error(`Marker's real source no longer contains "${marker}" — shadcn/ui's real marker.tsx has likely changed shape since buildMarkerPlan was written. Re-verify against the current vendored marker.tsx before trusting this plan.`);
    }
  }

  // Confirm `default` is genuinely a no-op before trusting the base-class
  // extraction below — see this function's own comment above.
  const variantEntries = parseCvaAxis(markerSource, "variant");
  const defaultEntry = variantEntries.find(([key]) => key === "default");
  if (!defaultEntry || defaultEntry[1] !== "") {
    throw new Error(`Marker's real "default" variant option is no longer an empty no-op (found "${defaultEntry?.[1] ?? "<missing>"}") — buildMarkerPlan's own base-class extraction is only valid when it is. Re-verify against the current vendored marker.tsx before trusting this plan.`);
  }

  const classMatch = markerSource.match(/cva\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Marker's own base cva() class string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(0, radius, "radius"); // genuinely no rounded-* class anywhere in real source — see this function's own comment
  const paddingHMatch = nearestToken(0, spacing, "spacing"); // genuinely no padding class of its own — see this function's own comment
  const paddingVMatch = nearestToken(0, spacing, "spacing");
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // real text-sm

  if (fontSizeMatch.deltaPx > 0) {
    notes.push(`Marker font size: nearest real token is ${fontSizeMatch.deltaPx}px off shadcn's own exact Tailwind value.`);
  }
  notes.push("Marker: modeled as a single colorless 'Default' box, per the user's own decision (figma-remaining-components-plan.md, Batch 8) — its real cva() variant axis (default/separator/border) is ignored entirely, not just its color-bearing parts. `border`'s own classes DO carry a real, parseable border.default match (the same already-tabled token used everywhere else in this file, not a new/different hue) that this reframing doesn't represent — see this function's own comment for the full finding.");
  notes.push("Marker: has no padding or radius class of its own in its real source (confirmed: no `rounded-*` class anywhere in the file, and no padding class outside the ignored `border` option's own `pb-2`) — represented as a bare text node (0px padding, radius/none), the same real finding and treatment already established for Label.");

  return {
    name: "Marker",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Marker",
  };
}
// Batch 10 of figma-remaining-components-plan.md ("chat/AI kit" registry
// extension), first real consumer of Batch 9's selector-prefix stripping.
// Real vendored bubble.tsx has a genuine multi-option color-variant axis
// (`bubbleVariants = cva(..., { variants: { variant: {...} } })`), unlike
// Marker's own single-option reframing — so this uses `buildVariantsFromCva`
// the normal way, not `scanClassesForColors`. All seven of its real
// variants' color classes live behind the exact same
// `*:data-[slot=bubble-content]:` selector prefix (they style the CHILD
// `BubbleContent` div, not the outer `Bubble` wrapper itself) — confirmed
// against real source before writing this, not assumed from Base UI
// convention:
//   default:     *:data-[slot=bubble-content]:bg-primary / text-primary-foreground
//   secondary:   *:data-[slot=bubble-content]:bg-secondary / text-secondary-foreground
//   muted:       *:data-[slot=bubble-content]:bg-muted (no text-* class at all)
//   tinted:      *:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.93_calc(c*0.4)_h)] / text-foreground
//   outline:     *:data-[slot=bubble-content]:border-border / bg-background
//   ghost:       *:data-[slot=bubble-content]:bg-transparent (plus border-none, unprefixed)
//   destructive: *:data-[slot=bubble-content]:bg-destructive/10 / text-destructive
// `secondary` is NOT actually buildable despite what the plan's own Batch
// 10 section predicted ("Default/secondary/muted/outline/ghost/destructive
// become buildable") — its real classString contains the literal substring
// `bg-secondary`, which trips the EXISTING, unconditional
// `classString.includes("bg-secondary")` skip in `buildVariantsFromCva`
// (the same one Button/Badge's own `secondary` variant already hits,
// verified live against this same test seed — see that skip's own
// comment). This isn't new Bubble-specific behavior; the plan's own text
// was simply optimistic about what "reuse already-tabled paths" would
// produce here. `tinted` is skipped by Batch 9's generalized
// arbitrary-value rule, but only after a real bug in that rule (it tested
// the raw, prefixed class instead of the stripped one) was found and fixed
// above — see that fix's own comment for the full real trace.
// `destructive` recreates Badge's own real same-tone trap for the same
// real reason (`bg-destructive/10` + `text-destructive` both resolve to
// status.error once the opacity modifier is dropped) — `buildVariantsFromCva`'s
// existing gated fix (checked on the resolved FILL, not just the variant's
// name) fires correctly here too, confirmed in the generated plan JSON,
// not assumed from the code alone.
// `muted` has no explicit text-* class at all — falls back to the shared
// `text.primary` default the same way Ghost's own colorless variants
// already do, a real, not a missing, finding.
// No universal `border.default` fallback the way `buildAlertPlan` adds
// one — Bubble's real BubbleContent explicitly sets `border-transparent`
// as its own DEFAULT border color (a real, intentional "no border" design
// choice confirmed in source), the opposite finding from Alert's own real
// global base-layer inheritance; forcing a border here would be wrong, not
// a gap.
function buildBubblePlan(tokensCss: string, bubbleSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Bubble(", "function BubbleContent", "bubbleVariants"]) {
    if (!bubbleSource.includes(marker)) {
      throw new Error(`Bubble's real source no longer contains "${marker}" — shadcn/ui's real Bubble has likely changed shape since buildBubblePlan was written. Re-verify against the current vendored bubble.tsx before trusting this plan.`);
    }
  }

  const { variants, skippedVariants } = buildVariantsFromCva(bubbleSource, "variant");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  // BubbleContent's own real classes: "rounded-xl border border-transparent
  // px-3 py-2 text-sm leading-relaxed ..." — rounded-xl is the same
  // MULTIPLIER (not a direct alias) already documented at buildCardPlan's
  // own comment (`--radius-xl: calc(var(--radius) * 1.4)`), computed from
  // radius.md's own real resolved value, not a hardcoded guess.
  const radiusMdPx = radius["md"];
  if (radiusMdPx === undefined) throw new Error("radius.json has no 'md' entry — was css/tokens.css written by this pipeline's `generate`?");
  const radiusTarget = radiusMdPx * 1.4;
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  const paddingHMatch = nearestToken(12, spacing, "spacing"); // real px-3
  const paddingVMatch = nearestToken(8, spacing, "spacing"); // real py-2
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // real text-sm

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0.01) {
      notes.push(`Bubble ${label}: nearest real token is ${match.deltaPx.toFixed(1)}px off shadcn's own exact Tailwind value.`);
    }
  }

  notes.push("Bubble: only the outer Bubble/BubbleContent color+shape is modeled — BubbleGroup (pure layout, no color) and BubbleReactions (a separate floating pill, real overlay-positioning structure) aren't. The `tinted` variant is permanently skipped (see the generalized arbitrary-value rule's own comment); `secondary` is skipped whenever the seed has no secondary brand color, same as Button/Badge's own `secondary` variant.");
  notes.push("Bubble: a real, new finding confirmed via a live browser check (2026-09-21) — unlike every earlier `cva()`-based component, Bubble's real `ghost` variant ALSO overrides geometry, not just color (`*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:p-0`, real computed border-radius/padding both 0px, vs. every other variant's shared 8.4px/12px/8px). This schema has no per-variant geometry — `radiusVariable`/`paddingHorizontalVariable`/`paddingVerticalVariable` are single, component-wide fields — so the Figma Ghost variant will show the SAME rounded, padded box as Default/Muted/Outline/Destructive, not its real flush, borderless, paddingless rendering. Disclosed, not modeled; a real per-variant-geometry schema change would be needed to close this, out of scope for this batch.");
  notes.push("Bubble: its real `destructive` variant's `bg-destructive/10` (a translucent 10% tint) is represented as a SOLID status.error fill, same opacity-drop simplification already documented for Badge's and Item's own destructive/muted variants — confirmed via a live browser check that the real rendered color is a light translucent tint, not the solid color this plan binds.");

  return {
    name: "Bubble",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Hi there! How can I help?",
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
  { filename: "kbd.tsx", name: "Kbd", build: buildKbdPlan },
  { filename: "native-select.tsx", name: "NativeSelect", build: buildNativeSelectPlan },
  { filename: "avatar.tsx", name: "Avatar", build: buildAvatarPlan },
  { filename: "label.tsx", name: "Label", build: buildLabelPlan },
  { filename: "skeleton.tsx", name: "Skeleton", build: buildSkeletonPlan },
  { filename: "breadcrumb.tsx", name: "Breadcrumb", build: buildBreadcrumbPlan },
  { filename: "empty.tsx", name: "Empty", build: buildEmptyPlan },
  { filename: "field.tsx", name: "Field", build: buildFieldPlan },
  { filename: "separator.tsx", name: "Separator", build: buildSeparatorPlan },
  { filename: "field.tsx", name: "FieldSeparator", build: buildFieldSeparatorPlan },
  { filename: "item.tsx", name: "Item", build: buildItemPlan },
  { filename: "marker.tsx", name: "Marker", build: buildMarkerPlan },
  { filename: "bubble.tsx", name: "Bubble", build: buildBubblePlan },
];

// codeDir: the matching `generate` run's --out directory (needed only for
// its always-written css/tokens.css — see readCssScale above, no separate
// --tokens-dir plumbing required). vendoredComponentsDir: the scaffolded
// project's real component directory (e.g. "<outDir>/src/components/ui"
// for Next.js+shadcn/ui). See the file header for the full list of
// components built today — a component with no recognized file at this
// path is silently absent from the plan, not an error, since not every
// scaffold vendors every component this parser knows about yet.
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
