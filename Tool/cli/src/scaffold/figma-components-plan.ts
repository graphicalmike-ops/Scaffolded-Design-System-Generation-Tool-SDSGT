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
// Component-variations plan (figma-component-variations-plan.md), Batch 1
// (2026-10-08): the "extra axis" mechanism (`FigmaComponentAxisPlanItem` /
// `FigmaComponentLayoutOverrides` / `extraAxes`) plus the shared helpers
// (`tailwindClassPx`, `resolveRadiusClass`, `describeIdenticalOptions`,
// `parseDataSizeClasses`), first consumed by Button's `Size` axis
// (default/xs/sm/lg, plus the four icon-only sizes added in Batch 2) via
// `buildCvaSizeAxis`. So
// "one size each" above is no longer true for Button (or, since Batch 3,
// Toggle and Item) — other components still are, until their own batch. Proven so far: plan computation,
// typecheck and a byte-identical plan-JSON diff for every other component.
// Proven live in Figma the same day (2026-10-08, "SDSGT test file"): the
// fixed `height` variable binding (reads back exactly the token value), the
// 20-variant replay (all fit in one execute call, well under a second),
// wrapped-grid layout, `componentSet.description`, and a `setProperties`
// test instance — see SKILL.md step 2c.
// Batch 2 (same day): Button's four icon-only sizes (`iconOnly`, a "plus"
// placeholder icon, square frame bound on width AND height) are proven live
// too: all 40 variants built in one execute call (~760ms), every frame read
// back its token size, `Label` set/unset on icon-only instances works, and
// the step 5 label binding needed a null guard for text-less variants.
// Batch 3 (same day): Toggle's Size axis (via the shared `buildCvaSizeAxis`)
// and Item's Size axis (`buildItemSizeAxis`, the first `sections` +
// `extraAxes` combination) are proven live too: 15 variants in one call
// (~390ms), every Toggle height read back 32/24/32, every Item size's
// Title/Description rendered and variable-bound, test instances took
// `setProperties` on every property, and SKILL.md's `sections` branch now
// reads `item.sections` so a size's own sections replace the default.
// Batch 4 (same day): Avatar's Size axis (`buildAvatarSizeAxis`, true fixed
// squares via the new `square` override) and Switch's Size axis (per-size
// `variantOverrides` carrying a complete `thumb` object, offsets recomputed by
// one shared formula) are proven live too: 7 variants in one call (~240ms),
// every Avatar frame read back 32/24/40 token-bound, Switch thumbs flush at
// x=1/15 (Default) and 1/11 (Sm), test instances took `setProperties`.
// Batch 5 (same day): Card's Size axis (`buildCardSizeAxis`: Sm swaps
// `--card-spacing` 16px -> 12px, so `sectionGapVariable` and every section's
// horizontal padding go spacing/4 -> spacing/3, Title 16 -> 14px) and
// NativeSelect's Size axis (`buildNativeSelectSizeAxis`: fixed height for
// every size, h-8 = spacing/8, Sm h-7 snaps to spacing/6) are proven live
// too: 4 variants in one call, Card Default reads back 243x106 (same as the
// old Card set), Sm 235x92 with 12px padding/gap, NativeSelect 32/24px high,
// all text/fill/stroke/size/padding bound, test instances took `setProperties`.
// Batch 6 (same day): Attachment's Size (default/sm/xs) and Orientation
// (horizontal/vertical) axes (`buildAttachmentAxes`, the first component with
// TWO extra axes; new `widthVariable` override and `combinationOverrides`)
// are proven live too: 6 variants named `Variant=Default, Size=Sm,
// Orientation=Vertical` in one call (~475ms), three VARIANT properties,
// Default + Horizontal reads back 93x51 (same as the old set), Vertical a
// fixed 96px with truncating text, all padding/radius/width/font-size
// variable-bound, test instance took `setProperties` on every property.
// Batch 7 (same day): Separator's Orientation axis (`buildSeparatorAxes`;
// Vertical swaps `line` for a 1px-wide, representative-length-tall one via
// the new `line.orientation: "vertical"`) and Field's Orientation axis
// (`buildFieldOrientationAxis`; Horizontal = the same sections with
// `textLineDirection: "horizontal"`, `responsive` skipped) are proven live
// too: 4 variants in one call, Separator 200x1 / 1x200 bound to
// `border.default`, Field Vertical 195x86 (same as the old set) and Horizontal
// 449x18, all text bound in both orientations, test instances took
// `setProperties` on every property.
// Batch 8 (same day): Tabs' Style axis (`buildTabsStyleAxis`; Line = a
// `variantOverrides` entry dropping Active's fill and adding a bottom-edge-only
// 2px stroke via the new `strokeSides`/`strokeWeightPx`) and Marker's Separator
// and Border variants (`buildMarkerStyleVariants`, on the existing `Variant`
// list; new `flankLines`, `paddingBottomVariable`, and component-level
// `disclosures`) are proven live too: 7 variants in two calls (~90ms each),
// Active/Line reads back fill none, stroke text.primary, weights [0,0,2,0];
// Marker Separator 234x18 with 12px gap, Border 50x27 with a bottom-only
// border.default stroke; all text bound; test instances took `setProperties`.
// Batch 9 (same day): the STATES mechanism (`statePropertyName`, per-variant
// `states`/`skippedStates`, `FigmaComponentStatePlanItem`; `classToFigmaVariable`
// now also returns `opacity` from a `/NN` modifier, `extractStateClasses`,
// `buildStatesForVariants`) and Button's Hover/Focus/Disabled/Invalid states
// (5 variants x 8 sizes x 5 states = 200) are proven live too (2026-10-09, after
// the plan side was verified: typecheck, plan diff vs Batch 8 only Button changes
// and its rest values are unchanged, qa:matrix cli 5/5): 200 variants in two calls
// (50 frames ~960ms, 150 frames ~3135ms, ~20ms per frame) plus ~830ms to combine,
// bind Label, describe and lay out a 5 x 40 grid. Live findings: paint opacity and
// the drop-shadow ring's spread/alpha are DROPPED if set before the variable binding
// and only stick as a second pass (read back, clone, set, reassign; binding kept);
// `strokesIncludedInLayout = false` keeps a state-added stroke from widening the
// frame; Disabled frame opacity, Hover fills and Link's hover underline read back as
// planned.
// 2026-10-09 amendment (user decisions, Button only, proven live): Destructive
// Hover is fill status/error-bg + text status/error, Destructive Focus is identical
// to its rest look, and Link has no rest underline (underline only on its Hover
// state); see `buildButtonPlan`.
// Batch 10 (2026-10-09): Toggle (Hover/Focus/Disabled/Invalid/Pressed; 2 variants x
// 3 sizes x 6 = 36) and Badge (Hover/Focus/Invalid; 5 variants x 4 = 20) get States
// through the same `buildStatesForVariants` (new: an `extraPrefixes` parameter for
// Badge's anchor-only `[a]:hover:`, and `ring-[3px]` read as a 3px ring width) and
// are proven live too (36 frames in ~870ms, 20 in ~490ms). Badge Link has no rest
// underline (Badge-only fix, same as Button). Live finding: Figma draws a drop
// shadow only for a frame WITH a fill, so the Focus ring did not render on
// fill-less variants (2026-10-14: FIXED, the replay gives them an invisible 0.01% fill and turns
// `showShadowBehindNode` off; see FILL_LESS_RING_DISCLOSURE).
// Batch 11 (2026-10-09): Input and Textarea (Focus/Disabled/Invalid, 1 variant x 4
// states = 4 variants each) get States through `buildFormFieldStates`, which feeds
// their one real `cn("...")` class string to `buildStatesForVariants` via its new
// optional `singleClassString` (they have no `cva()`), and are proven live too (4
// frames in ~150ms each). Both are transparent at rest, so their Focus and Invalid
// rings did not render in Figma at the time (fixed 2026-10-14, see above); Disabled adds the real bg-input/50 fill.
// Batch 12 (2026-10-09): NativeSelect (Hover/Focus/Disabled/Invalid; Size Default/Sm x 5
// states = 10 variants) and Item (Hover/Focus; Variant x Size x 3 states = 27) get
// States through the same builders and are proven live too (10 frames in ~840ms, 27 in
// ~1.9s). NativeSelect's Disabled opacity is a state override read from the wrapper's
// `has-[select:disabled]:opacity-50` (new optional `wrapperDisabledClass` option on
// `buildCommonStateDisclosures`); its real source has no non-dark `hover:` class, so Hover
// is built identical to Default (disclosed). Item's Hover is the anchor-only
// `[a]:hover:bg-muted` (the Batch 10 `extraPrefixes`); Muted's Hover is identical to rest
// (disclosed). Neither is filled at rest (Item Muted excepted), so Focus rings did not
// render on them (fixed 2026-10-14, see above).
// Batch 13 (2026-10-13): Checkbox and RadioGroup (Focus/Disabled/Invalid x Unchecked/Checked =
// 8 variants each) get States through `buildCheckableControlStates`. A Checked control keeps
// its primary border in Focus and Invalid (the real `data-checked:border-primary` is written
// after the Focus/Invalid border classes in the compiled CSS, so only the ring is added);
// Unchecked is fill-less at rest, so its rings did not render (fixed 2026-10-14). Proven live 2026-10-13
// (16 frames in ~370ms). Live finding: a ring's alpha and a fill's paint opacity are lost on
// INSTANCES (batches 9-13); FIXED 2026-10-13 with three tokens (`border.focus-ring`,
// `status.error-ring`, `action.primary-hover-soft`), swapped in by FADE_FILL_TOKENS /
// FADE_RING_TOKENS only when the project has them. The Disabled field fill is now decided too. See
// contracts-and-seeds.md, "Figma instances lose a fill's or ring's transparency". (Update, same
// day: the Disabled field of Input/Textarea was decided too, three solid tokens via
// DISABLED_FIELD_TOKENS, no whole-control fade; and Attachment Hover via ATTACHMENT_HOVER_TOKEN, a solid
// `background.surface-hover`; and the Tabs inactive text via TAB_INACTIVE_TOKEN, a solid
// `text.tab-inactive`; nothing transparency-based is left in the push.) Also (same day): Field Invalid via
// `textLineOverrides` and Bubble's `Clickable` axis + States via `buildBubbleClickable` (`ignoreStates`);
// both pending picks were then decided the same day: Field Disabled = the Label line takes the solid
// `text.label-disabled` (FIELD_LABEL_DISABLED_TOKEN, no opacity), and Bubble Muted's Hover stays identical to rest.
// Alert (same day): an inline link in the description + State Default/Hover (`inlineLink`, `linkTextVariable`); the
// Description is deliberately NOT a TEXT property there (Figma flattens a bound text node's range styling).
// Batch 14 (2026-10-13): Switch (Focus/Disabled/Invalid x Unchecked/Checked x Size = 16 variants) and
// Tabs (Hover/Focus/Disabled x Inactive/Active x Style = 16) get States through `buildSwitchStates` and
// `buildTabsStates`. Switch's Disabled is `data-disabled:opacity-50` (extra prefix); its state stroke, ring
// and opacity sit on the TRACK frame (the track is filled, so the rings render). Tabs' Hover is identical to
// Default (the rest 60% text is already drawn at full strength: open decision); Tabs Line / Active / Focus
// swaps the bottom bar for the all-sides focus border (`strokeSides: "all"` on the state). Proven live
// 2026-10-13 (32 frames in ~700ms).
// Batch 15 (2026-10-13): Accordion (Hover = `hover:underline`, Focus = border + 3px ring, Disabled =
// `aria-disabled:opacity-50`; 4 frames), Label (Disabled only, `peer-disabled:` / `group-data-[disabled=true]:`;
// 2 frames) and Attachment (Size x Orientation x Hover/Focus = 18 frames; Focus = `focus-within:ring-1` with the
// baked ring token, Hover is identical to rest because `has-[>a,>button]:hover:bg-muted/50` is a translucent
// tint with no solid token: open decision) get States through `buildAccordionStates`, `buildLabelStates` and
// `buildAttachmentStates`. Triage: Alert, Breadcrumb, Field, Marker and Bubble get NO State property (only
// `disclosures` + notes naming the exact classes: link/button children or element-conditional selectors the
// Figma component does not model). Proven live 2026-10-13 (24 frames in ~760ms, no replay change).
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

// A real, LUCIDE-specific icon shape, added 2026-09-22 (icon-support work,
// following on from `figma-remaining-components-plan.md`'s own NEEDS-ICON
// bucket). `pathData`/`viewBox` are raw, real SVG path strings — extracted
// directly from a real installed `lucide-react` package's own bundled
// source (its internal `__iconData$xx` object literals), NOT typed from
// memory or convention — see `LUCIDE_ICONS` below for the exact two
// entries this batch needs and their own provenance comment. `sizePx` is
// the real target render size (Checkbox's own real `[&>svg]:size-3.5`,
// 14px) — the SVG import always arrives at its native 24×24 lucide
// viewBox and must be uniformly RESCALED (via the Plugin API's own
// `node.rescale()`, never `resize()` — see `SKILL.md` step 7's own
// comment for the real, confirmed-live reason: `resize()` scales a
// vector's geometry but leaves `strokeWeight` a literal, unscaled 2,
// rendering disproportionately thick at any target smaller than 24px;
// `rescale()` correctly scales both together, confirmed live 2026-09-22
// via a real smoke test before this schema was written). `colorVariable`
// binds the imported vector's own `.strokes` (lucide icons are
// stroke-based line icons, `fill: none` — the same "bind strokes, not
// fills" pattern this file's `border`/`stroke` fields already use for
// frames, just applied to a VECTOR node's own stroke for the first time).
export interface FigmaComponentIconPlanItem {
  viewBox: string; // e.g. "0 0 24 24" — real, from lucide's own source
  pathData: string; // e.g. "M20 6 9 17l-5-5" — real, from lucide's own source
  sizePx: number;
  colorVariable: string;
}

// Component-variations plan, Batch 9 (2026-10-08): one interaction State of one
// variant (Hover, Focus, Disabled, Invalid; "Pressed" is reserved for later
// components). A SPARSE set of overrides layered on top of the variant's own
// rest look (the implicit "Default" state is the variant's rest values, so it
// is never listed): any field left out means "same as rest". SKILL.md step 2c
// merges every field except `name` into the variant (`name` would clobber the
// variant's own name) before running step 3's unchanged frame code, which
// additionally reads `fillOpacity`/`strokeOpacity` (paint opacity on the bound
// fill/stroke), `nodeOpacity` (whole-frame opacity) and `focusRing` (a
// DROP_SHADOW with spread = widthPx, blur 0, offset 0,0, whose colour is bound
// to the variable). Dark-mode (`dark:`) classes are never read: dark mode is a
// Figma variable MODE, not a separate state.
export interface FigmaComponentStatePlanItem {
  name: "Hover" | "Focus" | "Disabled" | "Invalid" | "Pressed";
  fillVariable?: string;
  fillOpacity?: number; // 0-1; absent = fully opaque. Not set when the rest fill already dropped its opacity (consistency rule)
  textVariable?: string;
  strokeVariable?: string;
  strokeOpacity?: number; // 0-1
  underline?: boolean;
  nodeOpacity?: number; // 0-1, whole frame (Disabled's `disabled:opacity-50`)
  focusRing?: { colorVariable: string; widthPx: number; opacity: number }; // Focus / Invalid ring (`ring-3` + `ring-<color>/NN`)
  // Batch 14, only on Tabs' Active / Focus: lays an all-sides 1px stroke over the Line style's
  // bottom-edge bar (the state is merged AFTER the Style override, so it wins).
  strokeSides?: "all";
  strokeWeightPx?: number;
  // 2026-10-13 (Field Invalid): recolours ONE named text line of a `sections` component while the
  // state is on, keyed by the line's `labelPropertyName` (e.g. Field's "Label"). Every other line
  // keeps its own colour. The replay reads it in step 3's `sections` loop.
  textLineOverrides?: Record<string, { textVariable: string }>;
  // 2026-10-13 (Alert Hover): recolours the component's inline link range (`inlineLink`) while the state is on.
  linkTextVariable?: string;
}

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
  // Batch 8 (component-variations plan, 2026-10-08), all optional and only set
  // by Tabs' Line style and Marker's Border/Separator variants. In a
  // `variantOverrides` entry (JSON can't carry `undefined`), an EMPTY STRING
  // for `fillVariable`/`strokeVariable` means "remove the base value", which the
  // replay already treats as transparent / no stroke (it tests truthiness).
  // `strokeSides: "bottom"` draws the stroke on the BOTTOM edge only (Figma's
  // per-side `strokeBottomWeight`; the other three sides get weight 0) instead of
  // all four; absent = all four, exactly as before. `strokeWeightPx` is the
  // stroke thickness as a raw literal (absent = 1, today's value).
  strokeSides?: "bottom" | "all"; // "all" (Batch 14) only appears on a STATE that must replace a bottom-edge bar with a normal all-sides border (Tabs Line / Active / Focus)
  strokeWeightPx?: number;
  // Bottom padding only, bound to a spacing token (Marker Border's real `pb-2`).
  // Applied AFTER the component's own vertical padding, so it replaces just the
  // bottom value for this variant.
  paddingBottomVariable?: string;
  // Marker Separator's two real hairlines (`before:`/`after:` pseudo-elements
  // with `h-px bg-border flex-1`) flanking the label: the frame becomes
  // [line, text, line] with `itemSpacing` bound to `gapVariable`. The real lines
  // stretch (`flex-1`) to fill the Marker's full width, which has no fixed value,
  // so `representativeLengthPx` is a disclosed stand-in (same idea as
  // `FigmaComponentLinePlanItem.representativeLengthPx`); `thicknessPx` is a raw
  // 1px literal for the same reason as there (no spacing token is that thin).
  flankLines?: { colorVariable: string; thicknessPx: number; representativeLengthPx: number; gapVariable: string };
  underline?: boolean;
  // Batch 9: this variant's interaction states (sparse overrides on top of its
  // rest values; "Default" is implicit), and the states that render identically
  // to Default (or are partly unrepresentable) with the reason, so the gap is
  // disclosed rather than silent. Replayed by SKILL.md step 2c when the
  // component has `statePropertyName`.
  states?: FigmaComponentStatePlanItem[];
  skippedStates?: Array<{ name: string; reason: string }>;
  // Real, added 2026-09-22 for Checkbox — an icon shown ONLY on this
  // specific variant (Checkbox's own real Indicator is conditionally
  // rendered only when checked; Unchecked has no icon at all, the same
  // "text-less variant" shape Skeleton already established, just for an
  // icon instead of text). Mutually exclusive with `textVariable` on the
  // SAME variant in every real case built so far (no component yet needs
  // both an icon AND a text label on one variant) but not schema-enforced
  // as such, since a future component legitimately combining both isn't
  // ruled out.
  icon?: FigmaComponentIconPlanItem;
  // Real, added 2026-09-22 for RadioGroup — a plain, small SOLID circle
  // shown ONLY on this specific variant (RadioGroupItem's own real
  // Indicator is conditionally rendered only when checked; Unchecked has
  // none). Deliberately NOT `icon` — RadioGroup's own real checked marker
  // is a plain `<span className="size-2 rounded-full bg-primary-foreground">`,
  // not an SVG (confirmed against real source, not assumed from
  // Checkbox's own shape) — genuinely cheaper to represent than an
  // imported vector, no `createNodeFromSvg`/`rescale` involved at all.
  centerDot?: { sizePx: number; colorVariable: string };
  // Real, added 2026-09-22 for Switch — a fixed TRACK containing a fixed,
  // DISCRETELY-POSITIONED thumb (unlike the top-level `bar`'s own
  // continuously-growing indicator, Progress's shape). Lives on the
  // VARIANT, not the top level, because Switch's own two real states
  // (Checked/Unchecked) each need their own track color AND thumb
  // position — `bar` only ever supports one shared shape across a
  // single "Default" variant, which doesn't fit here. `thumbOffsetXPx`
  // is a real, computed geometric equivalent of the real CSS
  // `translate-x-[calc(100%-2px)]` transform (checked) vs `translate-x-0`
  // (unchecked) — computed here as `trackWidthPx - thumbSizePx -
  // borderInsetPx` (checked) / `borderInsetPx` (unchecked), assuming a
  // symmetric inset from Tailwind's real bare `border` utility (1px) on
  // both sides — a disclosed simplification of the real transform math,
  // not a literal replication of it, since replicating Base UI's own
  // flex-plus-transform layout exactly isn't necessary to reach the same
  // visual result (thumb flush against whichever edge is active).
  thumb?: {
    trackColorVariable: string;
    thumbColorVariable: string;
    trackWidthPx: number;
    trackHeightPx: number;
    thumbSizePx: number;
    thumbOffsetXPx: number;
    radiusVariable: string; // real rounded-full, shared by both track and thumb
  };
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
// guess. Orientation: absent = horizontal (`representativeLengthPx` wide ×
// `thicknessPx` tall), the only shape every `line` had until Batch 7
// (component-variations plan, 2026-10-08). `orientation: "vertical"` swaps the
// geometry (`thicknessPx` wide × `representativeLengthPx` tall); only
// Separator's `Orientation` axis (a per-option `line` override) sets it.
export interface FigmaComponentLinePlanItem {
  colorVariable: string;
  thicknessPx: number;
  representativeLengthPx: number;
  orientation?: "vertical"; // absent = horizontal; see the comment above
  centerLabel?: {
    textVariable: string;
    fontSizeVariable: string;
    gapVariable: string;
    labelPropertyName: string;
    defaultLabel: string;
  };
}
// A second, genuinely new non-box shape, added 2026-09-22 ("Batch 11" of
// figma-remaining-components-plan.md) — the first NESTED fixed-size frame
// this file produces. `line` (above) is fixed-size too, but flat, a single
// rectangle (or a row of three, for `centerLabel`); `bar` is a two-layer
// TRACK containing a narrower, same-height INDICATOR, both fixed-size —
// real shadcn `Progress` shape (`ProgressTrack`/`ProgressIndicator`, via
// `@base-ui/react/progress` in the current registry), confirmed against a
// real vendored `progress.tsx`: `ProgressTrack` is `relative flex h-1
// w-full items-center overflow-x-hidden rounded-full bg-muted`;
// `ProgressIndicator` is `h-full bg-primary transition-all`, its real
// WIDTH set via an inline style keyed to `value`/`max` at runtime, not a
// class — invisible to this parser, and genuinely not a static default the
// way every other numeric target in this file is (compare `chart.tsx`'s
// own permanently-out-of-scope ruling for the same underlying reason: a
// runtime-computed visual with no fixed default state). `widthPx` and
// `representativeFillFraction` are both real, disclosed stand-ins for
// this, the same category as `line`'s own `representativeLengthPx` — a
// literal, chosen footprint, not a claim that either is a real default.
// `radiusVariable` here is the TRACK's own real `rounded-full` (bound via
// `exactRadiusFull`, the same real always-9999px alias Avatar's own case
// already established) — the INDICATOR itself has no `rounded-*` class of
// its own in real source at all; its rounded left edge in a real browser
// comes entirely from the track's own `overflow-x-hidden` clip, not a
// class the indicator carries. `SKILL.md` step 7 reproduces this with the
// track frame's own `clipsContent = true` plus a perfectly SQUARE
// indicator rectangle docked at its left edge — not a second
// `radiusVariable` on the indicator, which would visibly over-round its
// right edge whenever the fill is less than 100%, a real, avoidable
// mismatch a naive "just reuse the same radius everywhere" approach would
// introduce. `heightVariable` binds the track's real fixed `h-1` (4px) —
// a genuinely fixed, non-hug-content height (the indicator matches it via
// real `h-full`, not a second independent measurement) — via the same
// `spacing` scale every other pixel measurement in this file already
// uses (no separate "sizing" scale exists), landing on a real exact
// `spacing/1` match in the tailwind preset, per `buildProgressPlan`'s own
// check.
export interface FigmaComponentBarPlanItem {
  trackColorVariable: string;
  indicatorColorVariable: string;
  widthPx: number;
  representativeFillFraction: number; // 0..1, a disclosed stand-in — see this interface's own comment for why no real static default exists to read instead
  radiusVariable: string;
  heightVariable: string;
}
// Component-variations plan (figma-component-variations-plan.md), Batch 1,
// 2026-10-08 — the "extra axis" mechanism: a component can carry a second
// (third, ...) Figma variant property beside `Variant` (Size, Orientation,
// Style), each option of which is a bundle of OVERRIDES layered on top of
// the component's own fields for that one axis option. Everything below is
// optional and additive — a component that sets none of it produces
// byte-identical plan JSON to before. `SKILL.md` step 7 replays it by
// merging `{...component, ...overrides}` per variant x option combination
// and running the existing, unchanged frame-building code on the merged
// object.
export interface FigmaComponentLayoutOverrides {
  // 2026-10-13 (Bubble's Clickable axis): states this axis option does NOT apply. The replay builds those
  // State values identical to the rest look (so every combination still has the same State values), e.g.
  // Bubble Clickable=Default (a plain, non-interactive bubble) ignores Hover and Focus.
  ignoreStates?: Array<"Hover" | "Focus" | "Disabled" | "Invalid" | "Pressed">;
  // A FIXED frame height bound to a spacing token (Tailwind `h-N`/`size-N`).
  // When set, the frame is horizontal auto-layout with hugging width and a
  // FIXED height (content centered), so `paddingVerticalVariable` is ignored.
  heightVariable?: string;
  // Replayed since Batch 6 (Attachment's Orientation): a FIXED frame WIDTH
  // bound to a spacing token (Tailwind `w-N`), for a `sections`-based
  // (vertical-stack) component. The sections then stretch to the frame's width
  // and each text line fills it and truncates with an ellipsis, like the real
  // `truncate`. Only `sections` components read it.
  widthVariable?: string;
  paddingHorizontalVariable?: string;
  paddingVerticalVariable?: string; // ignored when heightVariable is set
  fontSizeVariable?: string;
  radiusVariable?: string;
  fixedSizePx?: number;
  // Replayed since Batch 2 (SKILL.md step 2c): iconOnly. The fields after it
  // are declared now (plan section A) but NOT replayed yet: line in Batch 7,
  // sections/sectionGapVariable in Batches 6-7, variantOverrides replayed since Batch 4 (Switch thumb dims; Batch 8's Tabs line style will reuse it).
  // `iconOnly` replaces the text label with a centered icon in a SQUARE frame
  // (heightVariable is used for both width and height). Its `colorVariable` is
  // only the fallback: the replay colors the icon with each variant's own
  // `textVariable` (Destructive/Ghost/Link/Outline/Default text colors differ).
  iconOnly?: FigmaComponentIconPlanItem; // replace the text label with an icon (Button icon sizes)
  // Replayed since Batch 4 (Avatar): with `heightVariable`, make the frame a
  // true square — BOTH width and height bound to `heightVariable`, zero
  // padding, content (the text label) centered — instead of the usual
  // hug-content width. Unlike `iconOnly` the text label stays.
  square?: boolean;
  line?: FigmaComponentLinePlanItem; // Separator orientation
  sections?: FigmaComponentSectionPlanItem[]; // Field/Attachment orientation
  sectionGapVariable?: string;
  variantOverrides?: Record<string, Partial<FigmaComponentVariantPlanItem>>; // per-variant tweaks (Switch thumb dims, Tabs line style)
}

export interface FigmaComponentAxisPlanItem {
  propertyName: string; // "Size" | "Orientation" | "Style"
  options: Array<{
    name: string;
    overrides: FigmaComponentLayoutOverrides;
    // Batch 6 (Attachment): extra overrides applied ONLY when this option is
    // combined with one specific option of ANOTHER axis, keyed
    // `"<otherAxis.propertyName>=<otherOption.name>"` (e.g. `"Size=Sm"`), for
    // real classes that depend on both axes at once (Attachment's vertical
    // content `px-1` adds to each size's own padding). Replayed after every
    // axis's own `overrides`, so it wins over them.
    combinationOverrides?: Record<string, FigmaComponentLayoutOverrides>;
  }>;
  skippedOptions: Array<{ name: string; reason: string }>;
  // Plain-language fidelity gaps for this axis (snapped sizes, options that
  // render identically after snapping, ...). The same lines also go into the
  // plan's top-level `notes`; SKILL.md step 7 writes THESE into the Figma
  // component set's own `description`, so the gap is disclosed in both places
  // (the project's "disclose twice" rule).
  disclosures?: string[];
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
  // 2026-10-13 (Alert): the secondary text line ENDS with an inline link, a styled range inside the same text
  // layer (underlined, and recolourable by a state via `linkTextVariable`). `text` is the trailing link text and
  // must be the end of `defaultSecondaryLabel`. A designer who replaces the description text restyles the link.
  inlineLink?: { text: string };
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
  // Real, genuinely new shape, added 2026-09-22 ("Batch 11" of
  // figma-remaining-components-plan.md) — a fixed-size, nested TRACK+
  // INDICATOR pair (Progress; see `FigmaComponentBarPlanItem`'s own
  // comment). MUTUALLY EXCLUSIVE with `variants`'s own per-variant fill/
  // text/stroke content, `sections`, AND `line` — a `bar`-based component's
  // whole visible appearance lives on this field instead.
  // `variantPropertyName`/`variants`/`skippedVariants`/`radiusVariable`
  // themselves stay REQUIRED and still get set (a single "Default" entry,
  // `radiusVariable` mirroring `bar.radiusVariable`'s own real value)
  // purely for interface-shape parity with every other component — same
  // precedent `line` already established for itself. `SKILL.md` step 7
  // branches on `bar` immediately after `line`, before ever falling
  // through to `sections` or the normal box-building logic — a bar
  // component never reaches either of those code paths.
  bar?: FigmaComponentBarPlanItem;
  // Real, genuinely new shape, added 2026-09-22 (icon-support work) — a
  // literal, FIXED pixel width/height for the outer box, real for
  // Checkbox (`size-4`, exactly 16×16px, unconditionally, regardless of
  // content) rather than the hug-content-plus-padding approximation every
  // earlier box-shaped component uses (Avatar's own comment already names
  // this exact gap — "this schema has no 'fixed size, no padding' shape
  // yet" — this is that shape, finally added once a real, EXACTLY-known
  // size existed to justify it, rather than Avatar's own approximated
  // target). When present, `paddingHorizontalVariable`/
  // `paddingVerticalVariable` are UNUSED (real, honest incompatibility —
  // a literal fixed size and hug-content padding are two different ways
  // of reaching a box's dimensions, never combined in real Tailwind
  // markup either) — `SKILL.md` step 7 builds a `FIXED`-sizing-mode frame
  // via `resize(fixedSizePx, fixedSizePx)` instead of the usual
  // `AUTO`-sizing-mode padded frame, with content centered via
  // `primaryAxisAlignItems`/`counterAxisAlignItems = "CENTER"` same as
  // always. Unlike `line`/`bar`/`sections`, this does NOT bypass the
  // normal per-variant fill/stroke/radius binding or the normal
  // `combineAsVariants` flow — it only changes ONE thing (how the frame's
  // own size is determined), so it composes normally with `variants` and
  // with a per-variant `icon` (below).
  fixedSizePx?: number;
  // Real, genuinely new shape, added 2026-09-22 (icon-support work) — the
  // WHOLE component IS a single icon, no frame/fill/stroke/padding/radius
  // at all (Spinner; its entire real source is one `<Loader2Icon
  // className="size-4 animate-spin" />`, nothing else). MUTUALLY
  // EXCLUSIVE with `variants`'s own per-variant fill/text/stroke content,
  // `sections`, `line`, AND `bar` — the same "whole visible appearance
  // lives on this field instead" precedent those three already
  // established. `variantPropertyName`/`variants`/`skippedVariants`/
  // `radiusVariable` stay required/set for interface-shape parity only
  // (a real 0px radius — a bare icon has no corners of its own), same
  // precedent as `line`. The real `animate-spin` rotation isn't
  // reproduced — a disclosed static icon, the same treatment Skeleton's
  // own `animate-pulse` already receives. NOT the same field as a
  // variant's own `icon` (`FigmaComponentVariantPlanItem.icon`, Checkbox's
  // shape) — that one sits INSIDE an otherwise-normal box; this one
  // REPLACES the box entirely. `SKILL.md` step 7 checks this field first,
  // before `line`/`bar`/`sections`, since it is the most extreme bypass
  // (not even a frame gets created).
  icon?: FigmaComponentIconPlanItem;
  // Component-variations plan, Batch 1 (2026-10-08) — see
  // `FigmaComponentLayoutOverrides`'s own comment. `heightVariable` here is
  // the merge target for an option's `overrides.heightVariable` (the plan
  // never sets it on the component itself yet); `extraAxes` lists the extra
  // Figma variant properties, replayed in order after `Variant`.
  heightVariable?: string;
  widthVariable?: string; // merge target for an option's `overrides.widthVariable` (Batch 6)
  extraAxes?: FigmaComponentAxisPlanItem[];
  // Batch 9: when present (only ever "State"), every variant's `states` becomes a
  // further Figma variant property, LAST in the component name:
  // `Variant=Default, Size=Sm, State=Hover` (variant property, then `extraAxes`
  // in order, then State). Its options are "Default" (the rest look) plus the
  // names in each variant's `states`, which are identical across all variants.
  statePropertyName?: "State";
  // Batch 8: plain-language fidelity gaps NOT tied to an extra axis (Marker's
  // Separator/Border variants live on the existing `Variant` list, not an axis).
  // SKILL.md writes these (plus every axis's `disclosures`) into the Figma
  // component set's own `description` — the second half of "disclose twice".
  disclosures?: string[];
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

// Real, curated icon path data, added 2026-09-22 (icon-support work,
// following on from figma-remaining-components-plan.md's own NEEDS-ICON
// bucket — a "real, separate icon-drawing-capability decision" that
// bucket's own closing note said was still pending). Hardcoded here
// rather than importing `lucide-react` into the CLI itself — this pipeline
// never needs the installed package's full ~1500-icon runtime, only the
// exact ~2 real icons these two components use, and hardcoding keeps plan
// computation dependency-free and deterministic regardless of which
// lucide-react version a given scaffolded project happens to have
// installed. Both entries extracted directly from a real installed
// `lucide-react` package's own bundled CJS source (its internal
// `__iconData$xx` object literals — e.g. `{ name: "check", size: 24,
// node: [["path", { d: "M20 6 9 17l-5-5" }]] }`), not typed from memory or
// guessed from convention. `loaderCircle` is real current lucide's actual
// internal name for what `lucide-react` still exports (and shadcn's own
// `spinner.tsx` still imports) as `Loader2`/`Loader2Icon` — a real,
// confirmed rename-with-alias found while extracting this, not assumed.
// `viewBox`/`strokeWidth`/`fill`/linecap/linejoin all match lucide's own
// real `defaultAttributes` (confirmed in the same bundled source): every
// lucide icon is `viewBox="0 0 24 24" fill="none" stroke="currentColor"
// stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` — the
// SAME wrapper for both icons below, only `pathData` differs.
const LUCIDE_ICONS: Record<string, { viewBox: string; pathData: string }> = {
  check: { viewBox: "0 0 24 24", pathData: "M20 6 9 17l-5-5" },
  loaderCircle: { viewBox: "0 0 24 24", pathData: "M21 12a9 9 0 1 1-6.219-8.56" },
  // Added 2026-10-08 (component-variations plan, Batch 2) for Button's icon-only
  // sizes. Extracted the same way, from the installed lucide-react v1.53.0's own
  // `dist/esm/icons/plus.mjs` (`__iconData`): `node: [["path", { d: "M5 12h14" }],
  // ["path", { d: "M12 5v14" }]]`. Unlike the two icons above, plus is TWO
  // <path> elements in lucide's source; this table holds a single path string, so
  // the two real `d` values are joined into one path with two sub-paths
  // ("M5 12h14" + "M12 5v14"), which strokes identically to two paths.
  plus: { viewBox: "0 0 24 24", pathData: "M5 12h14M12 5v14" },
};

// Builds the real SVG string `figma.createNodeFromSvg` (called from
// `SKILL.md` step 7) consumes — a pure string-assembly helper, no Figma
// API access here (that stays in the skill, same "CLI computes, skill
// replays" split as the rest of this file). `stroke="#000000"` is a
// REQUIRED placeholder, not a real color choice — `currentColor` (lucide's
// own real default) is a CSS keyword with no meaning in a static SVG
// import, confirmed live during this batch's own smoke test (the import
// succeeds either way, but a `currentColor` stroke resolves to nothing
// visible); the placeholder gets fully overwritten by a real
// `setBoundVariableForPaint` call on the imported vector's own `.strokes`
// immediately after import, so its exact value is arbitrary.
function buildLucideSvg(icon: { viewBox: string; pathData: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.pathData}"/></svg>`;
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

//
// Batch 9 (component-variations plan, 2026-10-08): the result now ALSO carries
// `opacity` (0-1, e.g. `bg-primary/80` -> 0.8) when the class has a `/NN`
// modifier. Strictly additive: `kind` and `variable` are unchanged, the key is
// ABSENT (not undefined) when there is no modifier, and every pre-existing
// caller reads only `kind`/`variable`, so their plans stay byte-identical. Only
// the new state builders (`buildStatesForVariants`) read `opacity`.
function classToFigmaVariable(className: string): { kind: "fill" | "text" | "border"; variable: string; opacity?: number } | null {
  const stripped = className.replace(SELECTOR_PREFIX_PATTERN, "");
  const match = stripped.match(/^(bg|text|border)-([a-z-]+?)(\/\d+)?$/);
  if (!match) return null;
  const [, prefix, varName, opacityModifier] = match;
  const sdsgtPath = varName === "destructive-foreground" ? null : SHADCN_VAR_TO_SDSGT_PATH[varName];
  if (!sdsgtPath) return null;
  const kind = prefix === "bg" ? "fill" : prefix === "text" ? "text" : "border";
  const result: { kind: "fill" | "text" | "border"; variable: string; opacity?: number } = { kind, variable: sdsgtPathToFigmaName(sdsgtPath) };
  if (opacityModifier) result.opacity = parseInt(opacityModifier.slice(1), 10) / 100;
  return result;
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
function exactRadiusLg(radius: Record<string, number>): { figmaName: string; deltaPx: number } {
  return exactRadiusStep(radius, "lg");
}

// Radius mapping, rewritten 2026-10-14 (bug 3): `generate/shadcn.ts` now binds every Tailwind radius class to the
// radius token of the SAME NAME (`--radius-sm/md/lg/xl` = radius.sm/md/lg/xl; 2xl, 3xl and 4xl have no token of
// their own and cap at xl; `--radius` = radius.lg). The comment above (written when `--radius` was radius.md and
// shadcn derived the other classes by multipliers) describes the OLD mapping: `rounded-lg` is now `radius/lg`,
// `rounded-md` is `radius/md`, `rounded-sm` is `radius/sm`, `rounded-xl` and `rounded-4xl` are `radius/xl`.
// Always an exact alias (deltaPx 0), never a nearest guess.
function exactRadiusStep(radius: Record<string, number>, step: "sm" | "md" | "lg" | "xl"): { figmaName: string; deltaPx: number } {
  if (radius[step] === undefined) throw new Error(`radius.json has no '${step}' entry — was css/tokens.css written by this pipeline's \`generate\`?`);
  return { figmaName: `radius/${step}`, deltaPx: 0 };
}

// The px of a radius step, for the few places that still start from a number.
function shadcnRadiusPx(radius: Record<string, number>, step: "sm" | "md" | "lg" | "xl"): number {
  if (radius[step] === undefined) throw new Error(`radius.json has no '${step}' entry — was css/tokens.css written by this pipeline's \`generate\`?`);
  return radius[step];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Shared helpers for the "extra axis" mechanism (component-variations plan,
// Batch 1, 2026-10-08 — see `FigmaComponentLayoutOverrides`). All pure and
// deterministic; none of them throw on an unfamiliar class (they return null
// so the caller can record a skipped option with a reason instead).
// ---------------------------------------------------------------------------

// Tailwind's spacing/size/type classes -> px. `h-N | size-N | px-N | py-N |
// p-N | gap-N` -> N*4 (N may be fractional, e.g. 2.5); `text-xs/sm/base/lg`
// -> 12/14/16/18; `text-[0.8rem]` -> 12.8 (rem = 16px). Anything else
// (colors, `text-[#fff]`, prefixed classes like `has-data-[icon=...]:pr-2`)
// returns null. Anchored on the whole token, so a prefixed class never
// matches.
function tailwindClassPx(cls: string): number | null {
  const spacing = cls.match(/^(?:h|size|px|py|p|gap)-(\d+(?:\.\d+)?)$/);
  if (spacing) return parseFloat(spacing[1]) * 4;
  const textNamed: Record<string, number> = { "text-xs": 12, "text-sm": 14, "text-base": 16, "text-lg": 18 };
  if (cls in textNamed) return textNamed[cls];
  const textRem = cls.match(/^text-\[(\d*\.?\d+)rem\]$/);
  if (textRem) return parseFloat(textRem[1]) * 16;
  return null;
}

// A real Tailwind radius class -> the radius token it should bind to.
// `rounded-lg` is an EXACT alias of `radius/lg` since 2026-10-14 (see `exactRadiusLg`'s own
// comment). `rounded-[min(var(--radius-md),Npx)]` (Button xs/sm) is the
// smaller of radius.md and N px, snapped with `nearestToken` — except when
// that minimum IS radius.md, which stays the exact alias rather than
// risking a different token that happens to share the value.
function resolveRadiusClass(cls: string, radius: Record<string, number>): { figmaName: string; deltaPx: number } | null {
  if (cls === "rounded-lg") return exactRadiusLg(radius);
  const m = cls.match(/^rounded-\[min\(var\(--radius-md\),(\d+(?:\.\d+)?)px\)\]$/);
  if (!m) return null;
  const md = exactRadiusStep(radius, "md"); // `--radius-md` is radius.md under the by-name mapping
  const targetPx = Math.min(radius["md"], parseFloat(m[1]));
  if (targetPx === radius["md"]) return md;
  return nearestToken(targetPx, radius, "radius");
}

// Lists Size-style axis options whose resolved overrides came out IDENTICAL
// to an earlier option (e.g. Button Sm == Xs and Lg == Default after
// snapping to the token scale). All of them are still created so Figma's
// property values match the code's `size=` values — this returns the plain
// "renders identical to X" lines to disclose that.
function describeIdenticalOptions(axisName: string, options: Array<{ name: string; overrides: FigmaComponentLayoutOverrides }>): string[] {
  const lines: string[] = [];
  const seen = new Map<string, string>(); // serialized overrides -> first option name that had them
  for (const option of options) {
    const key = JSON.stringify(option.overrides);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, option.name);
    else lines.push(`${axisName} ${option.name} renders identical to ${first} in Figma (both snap to the same tokens) — still created so the Figma property values match the code's own values.`);
  }
  return lines;
}

// `data-[size=X]:` / `group-data-[size=X]/name:` utility classes -> a map of
// size name to the bare utility classes it applies (Avatar, Card,
// NativeSelect, Switch use this instead of a `cva()` size axis). Not
// consumed until Batch 4; implemented now since the plan lists it with the
// other shared helpers. Classes without such a prefix are ignored.
function parseDataSizeClasses(classString: string): Record<string, string[]> {
  const bySize: Record<string, string[]> = {};
  for (const token of classString.split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(?:group-)?data-\[size=([a-z0-9-]+)\](?:\/[a-z0-9-]+)?:(.+)$/);
    if (!m) continue;
    (bySize[m[1]] ??= []).push(m[2]);
  }
  return bySize;
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
// Fade tokens (2026-10-13, see contracts-and-seeds.md, "Figma instances lose a fill's
// or ring's transparency"). A transparency applied to a variable-bound fill or ring
// colour is correct on the component set but lost on every INSTANCE (the instance takes
// the variable's own alpha). So a state's (colour, opacity) pair is swapped for a token
// that carries the fade itself, when the project has it:
//   - fills: `action.primary` at 0.8 (Button/Badge hover) -> `action.primary-hover-soft`, a
//     solid brand step per mode (a user-chosen approximation, not the exact 80% blend);
//   - rings: `border.focus` at 0.5 -> `border.focus-ring`, `status.error` at 0.2 ->
//     `status.error-ring` (baked rgba, so the ring keeps its alpha; the ring's own alpha
//     in the plan stays equal to the token's, so the component set and instances agree).
// A project generated before these tokens existed has no such CSS variable, so its pair
// falls through unchanged (the old behaviour). The Disabled field fill (`border.default`
// at 0.5, Input/Textarea) has no token yet: a pending user decision.
const FADE_FILL_TOKENS: Record<string, { token: string; cssVar: string; note: string }> = {
  "color/semantic/action/primary@0.8": {
    token: "action.primary-hover-soft",
    cssVar: "--color-semantic-action-primary-hover-soft",
    note: "drawn as the solid token color/semantic/action/primary-hover-soft (brand.400 in light mode, brand.700 in dark mode) instead of the real bg-primary/80, because a fill's transparency is lost on Figma instances. This is a deliberate approximation chosen by the user (2026-10-13), not the exact 80% blend: in light mode it is a lighter, more saturated pink than the real result",
  },
  "color/semantic/action/secondary@0.8": {
    token: "action.secondary-hover-soft",
    cssVar: "--color-semantic-action-secondary-hover-soft",
    note: "drawn as the solid token color/semantic/action/secondary-hover-soft (brand-secondary.400 in light mode, brand-secondary.700 in dark mode) instead of the real bg-secondary/80, because a fill's transparency is lost on Figma instances; a deliberate approximation, not the exact 80% blend",
  },
};
const FADE_RING_TOKENS: Record<string, { token: string; cssVar: string }> = {
  "color/semantic/border/focus@0.5": { token: "border.focus-ring", cssVar: "--color-semantic-border-focus-ring" },
  "color/semantic/status/error@0.2": { token: "status.error-ring", cssVar: "--color-semantic-status-error-ring" },
};
// Disabled FIELD tokens (2026-10-13, user decision; Input and Textarea): a field's Disabled state
// is drawn with three SOLID semantic tokens instead of the real `disabled:bg-input/50` fill
// inside a `disabled:opacity-50` control, because the fill's transparency is lost on Figma
// instances (see FADE_FILL_TOKENS). The control is therefore NOT dimmed to 50% in this state. The
// steps (light / dark) are the best single compromise across each mode's backgrounds, chosen by
// the user from comparison pages: stroke neutral.300 / neutral.900, fill neutral.200 /
// neutral.900, placeholder neutral.500 / neutral.600. In dark mode stroke and fill are the same
// step. A project without all three CSS variables keeps the old transparency-based Disabled.
const DISABLED_FIELD_TOKENS = {
  stroke: { token: "border.field-disabled", cssVar: "--color-semantic-border-field-disabled" },
  fill: { token: "background.field-disabled", cssVar: "--color-semantic-background-field-disabled" },
  text: { token: "text.field-disabled", cssVar: "--color-semantic-text-field-disabled" },
};
// Attachment HOVER (2026-10-13, user decision): the real `has-[>a,>button]:hover:bg-muted/50` is
// background.secondary at 50% over the page; its transparency is lost on Figma instances, so the
// hover fill is the solid token `background.surface-hover` (light neutral.200, dark neutral.1000, the
// best single step per mode). A project without the CSS variable keeps the old behaviour (Hover
// identical to Default, disclosed).
const ATTACHMENT_HOVER_TOKEN = { token: "background.surface-hover", cssVar: "--color-semantic-background-surface-hover" };
// Tabs INACTIVE text (2026-10-13, user decision): the real light-mode `text-foreground/60` is text.primary at
// 60%; its transparency is lost on Figma instances, so the Inactive tab's resting text is the solid token
// `text.tab-inactive` (light neutral.700, dark neutral.200 = the real `dark:text-muted-foreground`), and
// Hover (`hover:text-foreground` = text.primary) now visibly brightens it. A project without the CSS
// variable keeps the old behaviour (Inactive text at full text.primary, Hover identical to Default).
const TAB_INACTIVE_TOKEN = { token: "text.tab-inactive", cssVar: "--color-semantic-text-tab-inactive" };
// Field DISABLED (2026-10-13, user decision): the real `group-data-[disabled=true]/field:opacity-50` dims only the
// label (text.primary at 50%). Instead of any transparency, Disabled = the Label line takes the solid token
// `text.label-disabled` (light neutral.600, dark neutral.500: the best single step per mode across the
// backgrounds, RGB distance light 2 to 26, dark 4 to 21). A project without the CSS variable keeps Disabled unbuilt.
const FIELD_LABEL_DISABLED_TOKEN = { token: "text.label-disabled", cssVar: "--color-semantic-text-label-disabled" };
// Semantic CSS variable names the CURRENT project actually has (filled by
// `buildFigmaComponentsPushPlan` from the project's light.css / dark.css before any
// builder runs, and reset on every call so the plan stays deterministic).
let projectSemanticCssVars = new Set<string>();
const projectHasToken = (cssVar: string): boolean => projectSemanticCssVars.has(cssVar);

// Component-variations plan, Batch 9 (2026-10-08): the interaction-STATES
// helpers. Each State maps to the Tailwind prefixes the real vendored source
// uses for it. `Pressed` is declared for later components (Toggle's
// `aria-pressed:`/`data-pressed:`, an Accordion/menu trigger's `aria-expanded:`)
// and is not used by Button.
const STATE_PREFIXES: Record<FigmaComponentStatePlanItem["name"], string[]> = {
  Hover: ["hover:"],
  Focus: ["focus-visible:"],
  Disabled: ["disabled:"],
  Invalid: ["aria-invalid:"],
  Pressed: ["aria-pressed:", "data-pressed:", "aria-expanded:"],
};

// Returns the classes of `classString` that sit under `prefix` (e.g. "hover:"),
// with the prefix stripped, in source order. Two kinds of class are never
// returned, because neither can be a Figma token binding:
//   - anything combined with `dark:` (dark mode is a Figma variable MODE, not a
//     separate state), and
//   - anything containing an arbitrary-value bracket (`hover:bg-[color-mix(...)]`):
//     it names a literal value with no design token behind it. These come back in
//     `dropped` (the full original class) so the caller can DISCLOSE the exact
//     class instead of silently losing it.
function extractStateClassesDetailed(classString: string, prefix: string): { classes: string[]; dropped: string[] } {
  const classes: string[] = [];
  const dropped: string[] = [];
  for (const token of classString.split(/\s+/).filter(Boolean)) {
    if (!token.startsWith(prefix)) continue;
    if (token.includes("dark:")) continue;
    // The bracket test looks only at what FOLLOWS the prefix (a prefix such as
    // Badge's `[a]:hover:` legitimately contains one), and a plain pixel ring
    // width (`ring-[3px]`, Toggle/Badge's spelling of Button's `ring-3`) is a
    // literal width, not a colour or size that needs a design token.
    const rest = token.slice(prefix.length);
    if (rest.includes("[") && !/^ring-\[\d+px\]$/.test(rest)) {
      dropped.push(token);
      continue;
    }
    classes.push(rest);
  }
  return { classes, dropped };
}

// The plain form of the helper above (the shape the plan describes): just the
// classes under `prefix`, prefix stripped, with dark-mode and arbitrary-value
// classes left out.
function extractStateClasses(classString: string, prefix: string): string[] {
  return extractStateClassesDetailed(classString, prefix).classes;
}

// Reads a Tailwind ring class: `ring-3` -> a 3px width, `ring-ring/50` or
// `ring-destructive/20` -> a colour variable plus opacity. Anything else is null.
function parseRingClass(cls: string): { widthPx: number } | { variable: string; opacity?: number } | null {
  const width = cls.match(/^ring-(\d+)$/) ?? cls.match(/^ring-\[(\d+)px\]$/);
  if (width) return { widthPx: parseInt(width[1], 10) };
  const color = cls.match(/^ring-([a-z-]+?)(?:\/(\d+))?$/);
  if (!color) return null;
  const sdsgtPath = SHADCN_VAR_TO_SDSGT_PATH[color[1]];
  if (!sdsgtPath) return null;
  const result: { variable: string; opacity?: number } = { variable: sdsgtPathToFigmaName(sdsgtPath) };
  if (color[2]) result.opacity = parseInt(color[2], 10) / 100;
  return result;
}

// Builds `states` / `skippedStates` onto every variant of a `cva()` component
// from the REAL class strings: the cva BASE string (shared by all variants) and
// the variant's own string, base first so the variant's class wins on a clash
// (Destructive's `focus-visible:border-destructive/40` beats the base
// `focus-visible:border-ring`, like tailwind-merge does at runtime).
//
//   Hover    -> fill / text / stroke overrides (+ paint opacity from `/NN`)
//   Focus    -> `border-ring` = stroke border.focus; ring-N + ring-<colour>/NN = `focusRing`
//   Invalid  -> `aria-invalid:border-destructive` = stroke status.error, plus its ring
//   Disabled -> `disabled:opacity-N` = `nodeOpacity` (pointer-events is meaningless in Figma)
//
// Consistency rule (the user-facing one from the plan): this plan's REST state
// already drops a `/NN` modifier on the rest fill (Destructive's real
// `bg-destructive/10` is a solid status.error fill with white text, because a
// translucent tint can't carry the readable-text fix). A state's FILL opacity
// is therefore dropped too for such a variant, so e.g. Hover's `/20` never makes
// the fill look different from the simplified rest (it would otherwise look
// LIGHTER than rest, the opposite of the real hover). Stroke and ring opacities
// are kept: the rest state has no such simplification to stay consistent with.
// A state whose look comes out identical to the rest look is still built (so
// every variant has the same State values) and is listed in `skippedStates`
// with the reason. Never throws: an unreadable shape just leaves a state
// identical to Default with a `skippedStates` reason.
// Returns the plain-language disclosure lines (the caller writes them to the
// plan `notes` and to the component's `disclosures`, i.e. the Figma description).
function buildStatesForVariants(
  source: string,
  axisName: string,
  variants: FigmaComponentVariantPlanItem[],
  stateNames: Array<FigmaComponentStatePlanItem["name"]>,
  // Optional, caller-supplied USER-DECIDED replacement for one variant's one
  // state (keyed `"<Variant>/<State>"`, e.g. Button's `"Destructive/Hover"`).
  // The state is built from `item` instead of from the real classes' literal
  // reading, and `note` goes into the disclosures ONLY (not `skippedStates`,
  // since the state is a real, distinct look now, not a skipped one).
  stateOverrides?: Record<string, { item: Omit<FigmaComponentStatePlanItem, "name">; note: string }>,
  // Optional extra prefixes per State on top of STATE_PREFIXES (Badge's
  // anchor-only `[a]:hover:`). Absent for Button, whose output is unchanged.
  extraPrefixes?: Partial<Record<FigmaComponentStatePlanItem["name"], string[]>>,
  // Optional (Batch 11: Input and Textarea, which are plain `cn("...")`
  // components with no `cva()` and no variant axis): the component's one real
  // class string. When given, it is read as the shared "base" string for every
  // variant and the cva axis lookup is skipped. Absent for every other
  // component, whose output is therefore unchanged.
  singleClassString?: string,
): string[] {
  const disclosures: string[] = [];
  let entries: Array<[string, string]>;
  if (singleClassString !== undefined) {
    entries = variants.map((v) => [v.name, ""] as [string, string]);
  } else {
    try {
      entries = parseCvaAxis(source, axisName);
    } catch {
      return [`States: could not find the \`${axisName}\` axis in the vendored source, so no State property was built.`];
    }
  }
  const classStringByVariant = new Map(entries.map(([name, classString]) => [capitalize(name), classString]));
  const baseClassString = singleClassString ?? source.match(/cva\(\s*"([^"]*)"/)?.[1] ?? "";
  // Classes that change nothing a Figma frame can show (not a design token):
  // `pointer-events-none` and the mouse cursor (`cursor-not-allowed`).
  const nonVisual = new Set(["pointer-events-none", "cursor-not-allowed"]);

  for (const variant of variants) {
    const variantClassString = classStringByVariant.get(variant.name) ?? "";
    const restFillClass = variantClassString.split(/\s+/).map((c) => classToFigmaVariable(c)).find((r) => r !== null && r.kind === "fill");
    const restFillOpacityDropped = restFillClass?.opacity !== undefined;
    const states: FigmaComponentStatePlanItem[] = [];
    const skippedStates: Array<{ name: string; reason: string }> = [];

    for (const stateName of stateNames) {
      const used: string[] = [];
      const reasons: string[] = [];
      let fill: ReturnType<typeof classToFigmaVariable> = null;
      let fillClass = "";
      let text: ReturnType<typeof classToFigmaVariable> = null;
      let border: ReturnType<typeof classToFigmaVariable> = null;
      let ringWidth: number | undefined;
      let ringColor: { variable: string; opacity?: number } | undefined;
      let nodeOpacity: number | undefined;
      let underline: boolean | undefined;
      const unmodeled: string[] = [];

      const allPrefixes = [...STATE_PREFIXES[stateName], ...(extraPrefixes?.[stateName] ?? [])];
      for (const prefix of allPrefixes) {
        for (const classSource of [baseClassString, variantClassString]) {
          const { classes, dropped } = extractStateClassesDetailed(classSource, prefix);
          for (const d of dropped) {
            if (!reasons.some((r) => r.includes(d))) reasons.push(`real class '${d}' uses an arbitrary Tailwind value with no design token to bind to, so it was not applied (this state falls back to the rest look for it)`);
          }
          for (const cls of classes) {
            const full = prefix + cls;
            const parsed = classToFigmaVariable(cls);
            const ring = parseRingClass(cls);
            const opacityMatch = cls.match(/^opacity-(\d+)$/);
            if (parsed) {
              if (parsed.kind === "fill") { fill = parsed; fillClass = full; }
              else if (parsed.kind === "text") text = parsed;
              else border = parsed;
              used.push(full);
            } else if (ring && "widthPx" in ring) {
              ringWidth = ring.widthPx;
              used.push(full);
            } else if (ring) {
              ringColor = ring;
              used.push(full);
            } else if (opacityMatch) {
              nodeOpacity = parseInt(opacityMatch[1], 10) / 100;
              used.push(full);
            } else if (cls === "underline") {
              underline = true;
              used.push(full);
            } else if (cls === "no-underline") {
              underline = false;
              used.push(full);
            } else if (!nonVisual.has(cls)) {
              unmodeled.push(full);
            }
          }
        }
      }

      const item: FigmaComponentStatePlanItem = { name: stateName };
      if (fill) {
        item.fillVariable = fill.variable;
        if (fill.opacity !== undefined) {
          if (restFillOpacityDropped) reasons.push(`'${fillClass}' opacity /${Math.round(fill.opacity * 100)} not applied, because this variant's rest fill already drops its own opacity modifier (the plan's rest-state simplification), so applying it would make this state look different from the rest`);
          else item.fillOpacity = fill.opacity;
        }
      }
      if (text) {
        const effectiveFill = item.fillVariable ?? variant.fillVariable;
        if (effectiveFill && text.variable === effectiveFill) {
          reasons.push(`its text colour ${text.variable} would be the same as the fill (invisible text), so the rest text colour was kept`);
        } else {
          item.textVariable = text.variable;
          if (text.opacity !== undefined) reasons.push(`text opacity /${Math.round(text.opacity * 100)} is not modeled (text colour applied at full strength)`);
        }
      }
      if (border) {
        item.strokeVariable = border.variable;
        if (border.opacity !== undefined) item.strokeOpacity = border.opacity;
      }
      if (underline !== undefined) item.underline = underline;
      if (nodeOpacity !== undefined) item.nodeOpacity = nodeOpacity;
      if (ringWidth !== undefined && ringColor) {
        item.focusRing = { colorVariable: ringColor.variable, widthPx: ringWidth, opacity: ringColor.opacity ?? 1 };
      } else if (ringWidth !== undefined || ringColor) {
        reasons.push(
          ringWidth === undefined
            ? "the real source sets only a ring COLOUR for this state (a ring-<colour> class) and no ring width (ring-N), so the real component draws no ring of its own here (the colour only shows while another state supplies the width, e.g. while focused); no ring was drawn"
            : "a ring needs both a width (ring-N) and a colour (ring-<colour>) to be drawn; only the width was found, so no ring was drawn",
        );
      }
      if (unmodeled.length > 0) reasons.push(`classes not modeled: ${unmodeled.join(" ")}`);

      // Fade tokens (see FADE_FILL_TOKENS above): swap a (colour, opacity) pair for the
      // token that carries the fade itself, when this project has it.
      if (item.fillVariable && item.fillOpacity !== undefined) {
        const fade = FADE_FILL_TOKENS[`${item.fillVariable}@${item.fillOpacity}`];
        if (fade && projectHasToken(fade.cssVar)) {
          disclosures.push(`State ${variant.name} / ${stateName}: the fill (${fillClass}) is ${fade.note}.`);
          item.fillVariable = sdsgtPathToFigmaName(fade.token);
          delete item.fillOpacity;
        }
      }
      if (item.focusRing) {
        const fade = FADE_RING_TOKENS[`${item.focusRing.colorVariable}@${item.focusRing.opacity}`];
        if (fade && projectHasToken(fade.cssVar)) {
          item.focusRing = { ...item.focusRing, colorVariable: sdsgtPathToFigmaName(fade.token) }; // opacity stays equal to the token's alpha
        }
      }

      // A user-decided replacement (see the `stateOverrides` parameter): its
      // fields REPLACE the literal reading and its note replaces the reasons.
      const stateOverride = stateOverrides?.[`${variant.name}/${stateName}`];
      if (stateOverride) {
        for (const key of Object.keys(item)) if (key !== "name") delete (item as unknown as Record<string, unknown>)[key];
        Object.assign(item, stateOverride.item);
        reasons.length = 0;
        disclosures.push(`State ${variant.name} / ${stateName}: ${stateOverride.note}`);
      }

      // A stroke drawn in the very colour of the fill it sits on is invisible
      // against it (e.g. Destructive's red Focus/Invalid border on its solid red
      // rest fill, a consequence of the rest-state opacity simplification), so
      // only the ring can show. Flag it instead of leaving it silent.
      const effectiveFillForStroke = item.fillVariable ?? variant.fillVariable;
      if (item.strokeVariable && effectiveFillForStroke && item.strokeVariable === effectiveFillForStroke) {
        reasons.push(`its border colour (${item.strokeVariable}${item.strokeOpacity !== undefined ? ` at ${Math.round(item.strokeOpacity * 100)}%` : ""}) is the same colour as this variant's solid fill, so the border cannot be seen against the fill and ${item.focusRing ? "only the ring is visible" : "this state looks the same as Default (the real source draws no ring here either)"} (in the real component the rest fill is a translucent tint, which this plan draws solid)`);
      }

      // Does this state look exactly like the rest state? Then it is still
      // built (every variant gets the same State values) but flagged.
      const looksLikeRest =
        (item.fillVariable === undefined || (item.fillVariable === variant.fillVariable && item.fillOpacity === undefined)) &&
        (item.textVariable === undefined || item.textVariable === variant.textVariable) &&
        (item.strokeVariable === undefined || (item.strokeVariable === variant.strokeVariable && item.strokeOpacity === undefined)) &&
        (item.underline === undefined || item.underline === Boolean(variant.underline)) &&
        item.nodeOpacity === undefined &&
        item.focusRing === undefined;
      if (looksLikeRest) {
        reasons.unshift(
          stateOverride
            ? "renders identical to Default by the user's decision (see the State disclosure above)"
            : used.length > 0
            ? `renders identical to Default: the real classes (${used.join(" ")}) resolve to the rest look after this plan's own rest-state simplifications`
            : `renders identical to Default: the real source has no ${allPrefixes.join(" / ")} classes for this variant`,
        );
      }
      if (reasons.length > 0) skippedStates.push({ name: stateName, reason: reasons.join("; ") });
      states.push(item);
    }

    variant.states = states;
    if (skippedStates.length > 0) variant.skippedStates = skippedStates;
    const expanded = [...extractStateClasses(baseClassString, "aria-expanded:"), ...extractStateClasses(variantClassString, "aria-expanded:")];
    if (expanded.length > 0) {
      disclosures.push(`State ${variant.name}: the real \`aria-expanded:\` classes (${expanded.map((c) => `aria-expanded:${c}`).join(" ")}, the look while a menu it opens is showing) are not built; there is no Pressed state.`);
    }
    for (const skipped of skippedStates) disclosures.push(`State ${variant.name} / ${skipped.name}: ${skipped.reason}.`);
  }
  return disclosures;
}

// One disclosure line when any state's ring uses a baked ring token (see
// FADE_RING_TOKENS); null otherwise (an older project without the tokens).
function ringTokenDisclosure(variants: FigmaComponentVariantPlanItem[]): string | null {
  const used = new Set<string>();
  for (const v of variants) for (const st of v.states ?? []) if (st.focusRing && st.focusRing.colorVariable.endsWith("-ring")) used.add(`${st.focusRing.colorVariable} (${Math.round(st.focusRing.opacity * 100)}%)`);
  if (used.size === 0) return null;
  return `States: the ring colours are the baked tokens ${[...used].join(" and ")}: the real colour with the real transparency already inside the token, so the ring keeps its fade on instances placed in a design (a fade set on the ring effect itself is lost on instances). They are fixed values, not live aliases, so they do not follow later edits to border/focus or status/error.`;
}

// Ring on fill-less frames (fixed 2026-10-14, proven live on main components and instances): the push draws the ring
// as a drop shadow with "show shadow behind node" off, and gives a frame with no fill at rest an invisible fill (white,
// 0.01% opacity) so Figma draws the shadow at all. Shared by every component that has a ring.
export function FILL_LESS_RING_DISCLOSURE(names: string[], hasInvalid: boolean): string {
  return `States: the ${hasInvalid ? "Focus and Invalid rings DO" : "Focus ring DOES"} show in Figma on ${names.join(", ")} even though they have no fill at rest. Figma only draws a drop shadow for a frame with a fill, so these frames carry an invisible fill (white at 0.01% opacity, not a design token) and the shadow is drawn only outside the frame ("show shadow behind node" off), leaving the inside transparent. If you give one of these frames a real fill, the ring keeps working.`;
}

// The generic opening disclosure lines every States-bearing component shares
// (Batch 10: Toggle and Badge; Button writes its own equivalent lines inline).
// Returned lines are written to the plan `notes` (prefixed by the caller) and to
// the component's `disclosures` (the Figma description).
function buildCommonStateDisclosures(
  source: string,
  variants: FigmaComponentVariantPlanItem[],
  stateNames: Array<FigmaComponentStatePlanItem["name"]>,
  // `wrapperDisabledClass` (Batch 12, NativeSelect only): the real Disabled opacity
  // lives on the OUTER wrapper as `has-[select:disabled]:opacity-50`, not as a
  // `disabled:opacity-N` class on the element the plan reads, so the Disabled
  // line names that class instead. Absent for every other component.
  // `disabledAsTokens` (2026-10-13, Input/Textarea): Disabled is drawn with solid tokens, not the
  // real 50% whole-control fade, so the usual "Disabled is the real disabled:opacity-50" line is
  // replaced by one that says so.
  // `disabledPrefixes` (Batch 14): the real class prefixes that carry Disabled when they are not the plain
  // `disabled:` (Switch: `data-disabled:`; Tabs: `disabled:` and `aria-disabled:`). The first one is named
  // in the Disabled line, the others are named as identical. Absent = `["disabled:"]`, so every
  // earlier component's lines are unchanged.
  // `prefixLabels` (Batch 15, Attachment): the real class prefix to NAME in the opening line for a State
  // whose real prefix is not the usual one (Attachment's Focus is `focus-within:`). Absent = the usual names.
  options: { hasSizeAxis: boolean; singleClassString?: string; wrapperDisabledClass?: string; disabledAsTokens?: boolean; disabledPrefixes?: string[]; prefixLabels?: Partial<Record<FigmaComponentStatePlanItem["name"], string>> },
): string[] {
  const lines: string[] = [];
  const base = options.singleClassString ?? source.match(/cva\(\s*"([^"]*)"/)?.[1] ?? "";
  const prefixList: Record<FigmaComponentStatePlanItem["name"], string> = {
    Hover: options.prefixLabels?.Hover ?? "hover:",
    Focus: options.prefixLabels?.Focus ?? "focus-visible:",
    Disabled: (options.disabledPrefixes ?? ["disabled:"]).join(" / "),
    Invalid: "aria-invalid:",
    Pressed: "aria-pressed:",
  };
  lines.push(`States: every Variant${options.hasSizeAxis ? " and Size" : ""} also comes in Default (rest), ${stateNames.join(", ")}. Each state is the rest look plus only the changes the real source's ${stateNames.map((n) => prefixList[n]).join(", ")} classes make.`);
  const activeClasses = base.split(/\s+/).filter((c) => c.startsWith("active:"));
  if (activeClasses.length > 0) {
    lines.push(`States: there is no separate active: state; the only active: classes are ${activeClasses.join(" ")}, which this plan does not model.`);
  }
  const rings = variants.flatMap((v) => (v.states ?? []).map((st) => st.focusRing)).filter((r): r is NonNullable<typeof r> => r !== undefined);
  if (rings.length > 0) {
    lines.push(`States: the Focus ring (a ${rings[0].widthPx}px band outside the frame) is drawn as a drop shadow with ${rings[0].widthPx}px spread and 0 blur, colored with the real ring color variable and its real opacity. A real CSS ring is a box shadow too, so it looks the same, but it is an effect on the frame, not a stroke.`);
    const ringTokenLine = ringTokenDisclosure(variants);
    if (ringTokenLine) lines.push(ringTokenLine);
  }
  // Live finding (Batch 10, 2026-10-09): Figma draws NO drop shadow for a frame with no fill. FIXED 2026-10-14 (proven
  // live on main components AND instances): the replay turns `showShadowBehindNode` off on every ring and gives a
  // fill-less frame a near-invisible fill (white at 0.0001 opacity = 0.01%), which draws a clean ring band with the
  // inside left transparent. So the ring shows on these variants too; this line says how.
  const ringOnFillLess = variants.filter((v) => !v.fillVariable && !v.thumb && (v.states ?? []).some((st) => st.focusRing && !st.fillVariable)).map((v) => v.name);
  if (ringOnFillLess.length > 0) {
    lines.push(FILL_LESS_RING_DISCLOSURE(ringOnFillLess, stateNames.includes("Invalid")));
  }
  if (stateNames.includes("Disabled")) {
    // Which of the two non-visual disabled classes the real source actually has.
    const disabledPrefixes = options.disabledPrefixes ?? ["disabled:"];
    const nonVisualDisabled = ["pointer-events-none", "cursor-not-allowed"].filter((c) => base.split(/\s+/).some((t) => disabledPrefixes.some((p) => t === `${p}${c}`)));
    const nonVisualText = nonVisualDisabled.length === 0
      ? "pointer-events-none"
      : nonVisualDisabled.length === 1
      ? nonVisualDisabled[0] === "cursor-not-allowed" ? "cursor-not-allowed (the mouse cursor)" : nonVisualDisabled[0]
      : "pointer-events-none and the real cursor-not-allowed (the mouse cursor)";
    if (options.disabledAsTokens) {
      lines.push(`States: Disabled does NOT use the real disabled:opacity-50 whole-control fade (see the State Default / Disabled line below). The real ${nonVisualText} ${nonVisualDisabled.length > 1 ? "have" : "has"} no Figma meaning and ${nonVisualDisabled.length > 1 ? "are" : "is"} not modeled.`);
    } else
    lines.push(options.wrapperDisabledClass
      ? `States: Disabled is the real ${options.wrapperDisabledClass} (written on NativeSelect's outer wrapper, it applies while the inner select is disabled) drawn as that opacity on the whole frame. The real ${nonVisualText} on the select itself ${nonVisualDisabled.length > 1 ? "have" : "has"} no Figma meaning and ${nonVisualDisabled.length > 1 ? "are" : "is"} not modeled.`
      : `States: Disabled is the real ${disabledPrefixes[0]}opacity-50${disabledPrefixes.length > 1 ? ` (${disabledPrefixes.slice(1).map((p) => `${p}opacity-50`).join(" and ")} ${disabledPrefixes.length > 2 ? "are" : "is"} identical)` : ""} applied to the whole frame (50% opacity). The real ${nonVisualText} ${nonVisualDisabled.length > 1 ? "have" : "has"} no Figma meaning and ${nonVisualDisabled.length > 1 ? "are" : "is"} not modeled.`);
  }
  const hasTranslucentFill = variants.some((v) => (v.states ?? []).some((st) => st.fillOpacity !== undefined) || (v.skippedStates ?? []).some((sk) => sk.reason.includes("already drops its own opacity modifier")));
  // (Skipped for Input/Textarea, whose one translucent fill, the Disabled bg-input/50, gets its own exact line.)
  if (hasTranslucentFill && options.singleClassString === undefined) {
    lines.push("States: a state's translucent fill (for example hover:bg-primary/80) is drawn as the fill color at that opacity over whatever sits behind the frame. Where a variant's REST fill already drops its own opacity (a bg-destructive/10 rest fill is drawn solid, to keep white text readable), that variant's state fills drop theirs too, so a state never looks different from the simplified rest just because of an opacity; those cases are listed below.");
  }
  if (/dark:(hover|focus-visible|disabled|aria-invalid|aria-pressed|aria-expanded):/.test(source)) {
    // Input/Textarea: name the dark: state classes the real source actually has.
    const darkStateClasses = options.singleClassString !== undefined
      ? base.split(/\s+/).filter((c) => /^dark:(hover|focus-visible|disabled|aria-invalid|aria-pressed|aria-expanded):/.test(c) || /^dark:bg-/.test(c))
      : [];
    lines.push(darkStateClasses.length > 0
      ? `States: dark: classes (${darkStateClasses.join(" ")}) are not read as states; dark mode is handled by the Figma variable modes instead.`
      : "States: dark: classes (dark:hover:..., dark:aria-invalid:..., dark:focus-visible:...) are not read as states; dark mode is handled by the Figma variable modes instead.");
  }
  return lines;
}

// Batch 15 (2026-10-13), the triage of the minor components (Alert, Breadcrumb, Field, Marker, Bubble):
// a component whose only state-like classes sit on a child the Figma component does not model, or are
// conditional on a different element type, gets NO State property. The skip is disclosed twice (the
// project's disclosure policy): each line goes to the plan `notes` here (prefixed with the component
// name) and the same lines are returned for the caller to put on the component's `disclosures`, which
// the replay writes to the Figma component set's description. Rest values are not touched.
function skippedStatesDisclosure(componentName: string, lines: string[], notes: string[]): string[] {
  for (const line of lines) notes.push(`${componentName} ${line}`);
  return lines;
}

// The exact class names of `candidates` that the real vendored source still contains, so a triage
// disclosure only ever names a class that is really there (never an invented or stale one).
function classesInSource(source: string, candidates: string[]): string[] {
  const tokens = new Set(source.split(/[\s"'`]+/).filter(Boolean));
  return candidates.filter((c) => tokens.has(c));
}

function buildButtonPlan(tokensCss: string, buttonSource: string, notes: string[]): FigmaComponentPlanItem {
  const { variants, skippedVariants } = buildVariantsFromCva(buttonSource, "variant");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  // Real values from shadcn's own current source (see file header for the
  // "one size, exact-token-match only" scope decision): rounded-lg (an
  // EXACT `radius.md` alias, real value 6px for the tailwind preset — see
  // `exactRadiusLg`'s own comment for the real bug this replaced),
  // size.default's h-8 (32px, the one height with an exact spacing-token
  // match), px-2.5 (10px) and implied ~4-6px vertical padding (no exact
  // token for either — nearest real token used, deltaPx noted below).
  const radiusMatch = exactRadiusLg(radius);
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

  const sizeAxis = buildCvaSizeAxis("Button", buttonSource, variants, spacing, radius, fontSize, notes);

  // Batch 9: interaction states, read from the real class strings (see
  // `buildStatesForVariants`). Button has Hover / Focus / Disabled / Invalid;
  // there is no separate Pressed state (its only `active:` class is a 1px nudge).
  //
  // Two Button-only adjustments (user decisions 2026-10-09) happen first, so
  // `buildVariantsFromCva` (shared with Badge/Bubble/Toggle/Alert/Item) keeps its
  // output unchanged for everyone else:
  //   1. Link's REST underline. The real `link` string is
  //      `text-primary underline-offset-4 hover:underline`: no underline at rest,
  //      underline only on hover. The shared builder always sets `underline` for
  //      a variant named "link"; for Button it is corrected from the real class
  //      string (a `hover:underline` and no bare `underline` class).
  //   2. Destructive's Hover look. The real `hover:bg-destructive/20` is a 20%
  //      tint over a 10% tint rest; this plan draws the rest as a solid fill, so
  //      the literal reading renders identical to Default. By user decision it
  //      is drawn with existing tokens instead: fill status/error-bg (a pale
  //      tint) and text status/error.
  const buttonVariantClassStrings = new Map(parseCvaAxis(buttonSource, "variant").map(([n, c]) => [capitalize(n), c]));
  const adjustmentDisclosures: string[] = [];
  const linkClasses = (buttonVariantClassStrings.get("Link") ?? "").split(/\s+/).filter(Boolean);
  const linkVariant = variants.find((v) => v.name === "Link");
  if (linkVariant && linkVariant.underline && linkClasses.includes("hover:underline") && !linkClasses.includes("underline")) {
    linkVariant.underline = false;
    adjustmentDisclosures.push("Link: the real source is `text-primary underline-offset-4 hover:underline`, so Link has NO underline at rest and gains one only on hover. Link's rest look is therefore drawn without an underline (an intended change to the previous Button plan, which always underlined it); its Hover state adds the underline. `underline-offset-4` (the gap between text and line) is not modeled.");
  }
  const destructiveVariant = variants.find((v) => v.name === "Destructive");
  const destructiveHoverClass = (buttonVariantClassStrings.get("Destructive") ?? "").split(/\s+/).find((c) => /^hover:bg-destructive\/\d+$/.test(c));
  const stateOverrides: Record<string, { item: Omit<FigmaComponentStatePlanItem, "name">; note: string }> = {};
  if (destructiveVariant && destructiveHoverClass) {
    stateOverrides["Destructive/Hover"] = {
      item: { fillVariable: sdsgtPathToFigmaName("status.error-bg"), textVariable: sdsgtPathToFigmaName("status.error") },
      note: `drawn with the existing tokens ${sdsgtPathToFigmaName("status.error-bg")} (a pale red tint) as the fill and ${sdsgtPathToFigmaName("status.error")} (the saturated red) as the text colour, by the user's decision. The real class is ${destructiveHoverClass}: a 20% red tint laid over a 10% red tint rest, which this plan can't copy because the rest is drawn as a solid red fill (see the opacity note above) and no transparency modifier is used. So this is a deliberate token-based approximation: the pale error-bg tint is not the exact tint the browser shows, and going from the solid-red rest to this pale hover is a bigger change than the real subtle tint-to-tint step.`,
    };
  }
  // Destructive Focus (user decision, 2026-10-09): drawn exactly like the rest
  // look. Its real classes (focus-visible:border-destructive/40 plus a 20%
  // red ring) would draw a red border in the very colour of the solid red fill
  // (invisible) plus a faint ring, so the user chose to show no change at all.
  if (destructiveVariant) {
    stateOverrides["Destructive/Focus"] = {
      item: {},
      note: "drawn exactly like the Destructive rest look (no border change, no ring), by the user's decision. The real component shows a faint red ring (focus-visible:ring-destructive/20) and a 40% red border on focus, which this plan can't show meaningfully on the solid red rest fill. In the generated code the real focus ring is still there; only this Figma representation omits it.",
    };
  }
  const stateDisclosures = [
    ...adjustmentDisclosures,
    ...buildStatesForVariants(buttonSource, "variant", variants, ["Hover", "Focus", "Disabled", "Invalid"], stateOverrides),
  ];
  const hasStates = variants.some((v) => v.states && v.states.length > 0);
  const buttonDisclosures: string[] = [];
  if (hasStates) {
    const allButtonClasses = buttonSource.match(/cva\(\s*"([^"]*)"/)?.[1] ?? "";
    const activeClasses = allButtonClasses.split(/\s+/).filter((c) => c.startsWith("active:"));
    const hasDark = /dark:(hover|focus-visible|disabled|aria-invalid|aria-expanded):/.test(buttonSource);
    buttonDisclosures.push("States: every Variant and Size also comes in Default (rest), Hover, Focus, Disabled and Invalid. Each state is the rest look plus only the changes the real source's hover:, focus-visible:, disabled: and aria-invalid: classes make.");
    if (activeClasses.length > 0) {
      buttonDisclosures.push(`States: there is no Pressed state. The only active: class is ${activeClasses.join(" ")}, a 1px downward nudge that Figma variants can't represent, so it is not modeled.`);
    }
    buttonDisclosures.push("States: the Focus and Invalid rings (ring-3, a 3px band outside the button) are drawn as a drop shadow with 3px spread and 0 blur, colored with the real ring color variable and its real opacity (ring-ring/50, ring-destructive/20). A real CSS ring is a box shadow too, so it looks the same, but it is an effect on the frame, not a stroke.");
    buttonDisclosures.push("States: Disabled is the real disabled:opacity-50 applied to the whole button (50% opacity). The real pointer-events-none has no Figma meaning and is not modeled.");
    const ringTokenLine = ringTokenDisclosure(variants);
    if (ringTokenLine) buttonDisclosures.push(ringTokenLine);
    // Ghost and Link have no fill at rest; the push gives them the invisible ring fill (2026-10-14).
    const ringOnFillLess = variants.filter((v) => !v.fillVariable && (v.states ?? []).some((st) => st.focusRing && !st.fillVariable)).map((v) => v.name);
    if (ringOnFillLess.length > 0) buttonDisclosures.push(FILL_LESS_RING_DISCLOSURE(ringOnFillLess, variants.some((v) => (v.states ?? []).some((st) => st.name === "Invalid" && st.focusRing))));
    const buttonHasTranslucentFill = variants.some((v) => (v.states ?? []).some((st) => st.fillOpacity !== undefined));
    buttonDisclosures.push(`States: ${buttonHasTranslucentFill ? "a state's translucent fill (for example the Default variant's hover:bg-primary/80) is drawn as the fill color at that opacity over whatever sits behind the button. " : "no state fill is drawn translucent (the Default variant's hover:bg-primary/80 is drawn as a solid token instead, see the State Default / Hover line below). "}Where a variant's REST fill already drops its own opacity (Destructive's bg-destructive/10 is drawn solid, to keep white text readable), that variant's state fills drop theirs too, so a state never looks different from the simplified rest just because of an opacity; those cases are listed below.`);
    if (hasDark) {
      buttonDisclosures.push("States: dark: classes (dark:hover:..., dark:aria-invalid:..., dark:focus-visible:...) are not read as states; dark mode is handled by the Figma variable modes instead.");
    }
    buttonDisclosures.push(...stateDisclosures);
    for (const line of buttonDisclosures) notes.push(`Button ${line}`);
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
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
    ...(hasStates ? { statePropertyName: "State" as const, disclosures: buttonDisclosures } : {}),
  };
}

// The shared `Size` axis builder (component-variations plan, Batch 1,
// 2026-10-08; extracted from `buildButtonSizeAxis` in Batch 3 once Toggle
// became its second consumer). Reads the REAL `size` cva axis of `source`
// (for Button: default/xs/sm/lg are text sizes; the four `icon*` sizes,
// added in Batch 2, are square icon-only frames) and turns each class string
// into one option's overrides: h-N -> `heightVariable` (nearest spacing
// token), px-N -> horizontal padding (nearest spacing token), text-* -> font
// size (nearest type-scale token), rounded-* -> radius. A size's own class
// wins; a field the size doesn't set falls back to the cva BASE string
// (`text-sm`, `rounded-lg`). The Default option reproduces the component's
// pre-Size-axis values exactly (same padding/font/radius variables) and
// additionally gets the one intended new field, `heightVariable` (h-8 = 32px
// = spacing/8, exact), so the component's Default now has a fixed 32px height
// where it used to hug its content — disclosed below. Never throws on an
// unfamiliar source shape: a missing size axis returns undefined (no extra
// axis at all, plain pre-axis component), and an option whose height can't be
// read is skipped with a reason instead of dropped silently.
// `describeUnmodeled` (optional) lets a caller add plain-language
// disclosure lines for real classes in a size's string that this shared
// builder doesn't model (Toggle's `min-w-N`, icon-adjusted padding).
function buildCvaSizeAxis(
  componentName: string,
  source: string,
  variants: FigmaComponentVariantPlanItem[],
  spacing: Record<string, number>,
  radius: Record<string, number>,
  fontSize: Record<string, number>,
  notes: string[],
  describeUnmodeled?: (label: string, classes: string[]) => string[],
): FigmaComponentAxisPlanItem | undefined {
  let sizeEntries: Array<[string, string]>;
  try {
    sizeEntries = parseCvaAxis(source, "size");
  } catch {
    notes.push(`${componentName}: could not find a \`size\` axis in the vendored source, so no Size property was built — ${componentName} stays one size (real vendored source may have changed shape).`);
    return undefined;
  }
  if (sizeEntries.length === 0) return undefined;

  const baseMatch = source.match(/cva\(\s*"([^"]*)"/);
  const baseClasses = (baseMatch?.[1] ?? "").split(/\s+/).filter(Boolean);
  const firstTextPx = (classes: string[]): number | undefined => {
    for (const cls of classes) {
      if (!cls.startsWith("text-")) continue;
      const px = tailwindClassPx(cls);
      if (px !== null) return px;
    }
    return undefined;
  };
  const firstRadius = (classes: string[]) => {
    for (const cls of classes) {
      const match = resolveRadiusClass(cls, radius);
      if (match) return match;
    }
    return undefined;
  };
  const baseFontPx = firstTextPx(baseClasses);
  const baseRadius = firstRadius(baseClasses);

  // The icon px a size class string sets via `[&_svg:not([class*='size-'])]:size-N`
  // (xs: 12), else the base string's own (size-4 = 16). icon-sm / icon-lg set
  // none, so they inherit the base 16px (read from source, not assumed).
  const firstSvgPx = (classes: string[]): number | undefined => {
    for (const cls of classes) {
      const m = cls.match(/^\[&_svg:not\(\[class\*='size-'\]\)\]:(size-\d+(?:\.\d+)?)$/);
      if (m) return tailwindClassPx(m[1]) ?? undefined;
    }
    return undefined;
  };
  const baseSvgPx = firstSvgPx(baseClasses);
  // Fallback icon color only; the replay colors each variant's icon with that
  // variant's own text color (see FigmaComponentLayoutOverrides.iconOnly).
  const fallbackIconColor = variants.find((v) => v.textVariable)?.textVariable;

  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];

  for (const [sizeName, classString] of sizeEntries) {
    const classes = classString.split(/\s+/).filter(Boolean);
    const label = capitalize(sizeName);
    if (/^icon(-|$)/.test(sizeName)) {
      // Icon-only size (Batch 2): a square `size-N` frame with a centered icon.
      const sizeClass = classes.find((cls) => /^size-\d/.test(cls));
      const sizePx = sizeClass ? tailwindClassPx(sizeClass) : null;
      if (!sizeClass || sizePx === null) {
        skippedOptions.push({ name: sizeName, reason: "no readable `size-N` class in this size's real class string, so a square Figma frame can't be derived" });
        continue;
      }
      if (!fallbackIconColor) {
        skippedOptions.push({ name: sizeName, reason: "no Button variant has a text color variable, so the icon can't be colored" });
        continue;
      }
      const iconPx = firstSvgPx(classes) ?? baseSvgPx;
      if (iconPx === undefined) {
        skippedOptions.push({ name: sizeName, reason: "no readable `[&_svg…]:size-N` icon size in this size's class string or the base string, so the icon size can't be derived" });
        continue;
      }
      const sizeMatch = nearestToken(sizePx, spacing, "spacing");
      const iconOverrides: FigmaComponentLayoutOverrides = { heightVariable: sizeMatch.figmaName };
      if (sizeMatch.deltaPx > 0) {
        disclosures.push(`Size ${label}: ${sizeClass} (${sizePx}px square) snapped to ${sizeMatch.figmaName} (${tokenPx(sizeMatch.figmaName, spacing)}px), ${sizeMatch.deltaPx}px off — no exact spacing token.`);
      }
      const iconRadius = firstRadius(classes) ?? baseRadius;
      if (iconRadius) {
        iconOverrides.radiusVariable = iconRadius.figmaName;
        if (iconRadius.deltaPx > 0) {
          disclosures.push(`Size ${label}: corner radius snapped to ${iconRadius.figmaName}, ${iconRadius.deltaPx}px off — no exact radius token.`);
        }
      }
      iconOverrides.iconOnly = { viewBox: LUCIDE_ICONS.plus.viewBox, pathData: LUCIDE_ICONS.plus.pathData, sizePx: iconPx, colorVariable: fallbackIconColor };
      options.push({ name: label, overrides: iconOverrides });
      continue;
    }
    const heightClass = classes.find((cls) => /^h-\d/.test(cls));
    const heightPx = heightClass ? tailwindClassPx(heightClass) : null;
    if (!heightClass || heightPx === null) {
      skippedOptions.push({ name: sizeName, reason: "no readable `h-N` height class in this size's real class string, so a fixed Figma height can't be derived" });
      continue;
    }

    const overrides: FigmaComponentLayoutOverrides = {};
    const heightMatch = nearestToken(heightPx, spacing, "spacing");
    overrides.heightVariable = heightMatch.figmaName;
    if (sizeName !== "default" && heightMatch.deltaPx > 0) {
      disclosures.push(`Size ${label}: height ${heightClass} (${heightPx}px) snapped to ${heightMatch.figmaName} (${tokenPx(heightMatch.figmaName, spacing)}px), ${heightMatch.deltaPx}px off — no exact spacing token.`);
    }

    const padClass = classes.find((cls) => /^px-\d/.test(cls));
    const padPx = padClass ? tailwindClassPx(padClass) : null;
    if (padClass && padPx !== null) {
      const padMatch = nearestToken(padPx, spacing, "spacing");
      overrides.paddingHorizontalVariable = padMatch.figmaName;
      // Default's px-2.5 snap is already disclosed by the pre-existing
      // "Button horizontal padding" note, so it isn't repeated here.
      if (sizeName !== "default" && padMatch.deltaPx > 0) {
        disclosures.push(`Size ${label}: horizontal padding ${padClass} (${padPx}px) snapped to ${padMatch.figmaName} (${tokenPx(padMatch.figmaName, spacing)}px), ${padMatch.deltaPx}px off — no exact spacing token.`);
      }
    }

    const fontPx = firstTextPx(classes) ?? baseFontPx;
    if (fontPx !== undefined) {
      const fontMatch = nearestToken(fontPx, fontSize, "typography/primitive/fontSize");
      overrides.fontSizeVariable = fontMatch.figmaName;
      if (sizeName !== "default" && fontMatch.deltaPx > 0) {
        disclosures.push(`Size ${label}: text size ${fontPx}px snapped to ${fontMatch.figmaName} (${tokenPx(fontMatch.figmaName, fontSize)}px), ${Math.round(fontMatch.deltaPx * 100) / 100}px off — no exact type-scale token.`);
      }
    }

    const radiusMatch = firstRadius(classes) ?? baseRadius;
    if (radiusMatch) {
      overrides.radiusVariable = radiusMatch.figmaName;
      if (sizeName !== "default" && radiusMatch.deltaPx > 0) {
        disclosures.push(`Size ${label}: corner radius snapped to ${radiusMatch.figmaName}, ${radiusMatch.deltaPx}px off — no exact radius token.`);
      }
    }

    if (describeUnmodeled) disclosures.push(...describeUnmodeled(label, classes));
    options.push({ name: label, overrides });
  }

  if (options.length === 0) {
    notes.push(`${componentName}: no size in the vendored \`size\` axis had a readable height, so no Size property was built — ${componentName} stays one size.`);
    return undefined;
  }

  disclosures.push(...describeIdenticalOptions("Size", options));
  const defaultOption = options.find((o) => o.name === "Default");
  if (defaultOption?.overrides.heightVariable) {
    disclosures.push(`Size Default now has a fixed ${tokenPx(defaultOption.overrides.heightVariable, spacing)}px height, like every other Size; before the Size property existed, ${componentName} hugged its content instead.`);
  }
  if (options.some((o) => o.overrides.iconOnly)) {
    disclosures.push("Icon-only sizes (Icon, Icon-xs, Icon-sm, Icon-lg) show a representative \"plus\" icon as a placeholder, colored with each variant's text color; in real code the icon is whatever you pass as children. They have no text, so the Label property does nothing for them.");
  }
  if (skippedOptions.length > 0) {
    disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  }
  for (const line of disclosures) notes.push(`${componentName} ${line}`);

  return { propertyName: "Size", options, skippedOptions, disclosures };
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

  const radiusMatch = exactRadiusStep(radius, "xl"); // rounded-4xl: capped at radius.xl by the by-name mapping (2026-10-14); still a full pill at h-5, since every preset has xl >= 10px
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

  // Batch 10: interaction states, read from the real class strings (see
  // `buildStatesForVariants`). Badge has Hover, Focus and Invalid; no Disabled
  // (no `disabled:` classes) and no Pressed.
  //
  // Hover is written two ways in the real source: `[a]:hover:...` (Default,
  // Secondary, Destructive, Outline: applies ONLY when the Badge is rendered as
  // a link/anchor) and plain `hover:...` (Ghost, Link: applies always). Both are
  // read, and the anchor-only fact is disclosed below.
  //
  // Badge-only adjustments, mirroring the Button decisions of 2026-10-09 (done
  // after the shared `buildVariantsFromCva`, so its output stays unchanged for
  // every other component):
  //   1. Link's REST underline. The real `link` string is
  //      `text-primary underline-offset-4 hover:underline`: no underline at rest.
  //   2. Destructive Hover: the real `[a]:hover:bg-destructive/20` is a 20% tint
  //      over a 10% tint rest, which this plan can't copy (the rest is drawn solid
  //      red); by the user's Button decision it is drawn with status/error-bg
  //      (fill) and status/error (text).
  //   3. Destructive Focus: drawn identical to rest (no border change, no ring),
  //      by the same decision.
  const badgeVariantClassStrings = new Map(parseCvaAxis(badgeSource, "variant").map(([n, c]) => [capitalize(n), c]));
  const adjustmentDisclosures: string[] = [];
  const linkClasses = (badgeVariantClassStrings.get("Link") ?? "").split(/\s+/).filter(Boolean);
  const linkVariant = variants.find((v) => v.name === "Link");
  if (linkVariant && linkVariant.underline && linkClasses.includes("hover:underline") && !linkClasses.includes("underline")) {
    linkVariant.underline = false;
    adjustmentDisclosures.push("Link: the real source is `text-primary underline-offset-4 hover:underline`, so Link has NO underline at rest and gains one only on hover. Link's rest look is therefore drawn without an underline (an intended change to the previous Badge plan, which always underlined it; same decision as Button); its Hover state adds the underline. `underline-offset-4` (the gap between text and line) is not modeled.");
  }
  const destructiveVariant = variants.find((v) => v.name === "Destructive");
  const destructiveHoverClass = (badgeVariantClassStrings.get("Destructive") ?? "").split(/\s+/).find((c) => /hover:bg-destructive\/\d+$/.test(c));
  const stateOverrides: Record<string, { item: Omit<FigmaComponentStatePlanItem, "name">; note: string }> = {};
  if (destructiveVariant && destructiveHoverClass) {
    stateOverrides["Destructive/Hover"] = {
      item: { fillVariable: sdsgtPathToFigmaName("status.error-bg"), textVariable: sdsgtPathToFigmaName("status.error") },
      note: `drawn with the existing tokens ${sdsgtPathToFigmaName("status.error-bg")} (a pale red tint) as the fill and ${sdsgtPathToFigmaName("status.error")} (the saturated red) as the text colour, same decision as Button's Destructive Hover. The real class is ${destructiveHoverClass}: a 20% red tint laid over a 10% red tint rest, which this plan can't copy because the rest is drawn as a solid red fill (see the opacity note above) and no transparency modifier is used. So this is a deliberate token-based approximation: the pale error-bg tint is not the exact tint the browser shows, and going from the solid-red rest to this pale hover is a bigger change than the real subtle tint-to-tint step. Like the real class, it applies only when the Badge is rendered as a link.`,
    };
  }
  if (destructiveVariant) {
    stateOverrides["Destructive/Focus"] = {
      item: {},
      note: "drawn exactly like the Destructive rest look (no border change, no ring), same decision as Button's Destructive Focus. The real component shows a faint red ring (focus-visible:ring-destructive/20) on focus, which this plan can't show meaningfully on the solid red rest fill. In the generated code the real focus ring is still there; only this Figma representation omits it.",
    };
  }
  const badgeStateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus", "Invalid"];
  const stateDisclosures = buildStatesForVariants(badgeSource, "variant", variants, badgeStateNames, stateOverrides, { Hover: ["[a]:hover:"] });
  const hasStates = variants.some((v) => v.states && v.states.length > 0);
  const badgeDisclosures: string[] = [];
  if (hasStates) {
    badgeDisclosures.push(...adjustmentDisclosures);
    badgeDisclosures.push(...buildCommonStateDisclosures(badgeSource, variants, badgeStateNames, { hasSizeAxis: false }));
    badgeDisclosures.push("States: there is no Disabled state (the real Badge has no disabled: classes) and no Pressed state.");
    const anchorOnly = variants.filter((v) => (badgeVariantClassStrings.get(v.name) ?? "").split(/\s+/).some((c) => c.startsWith("[a]:hover:")));
    const alwaysHover = variants.filter((v) => (badgeVariantClassStrings.get(v.name) ?? "").split(/\s+/).some((c) => c.startsWith("hover:")));
    if (anchorOnly.length > 0) {
      badgeDisclosures.push(`States: Hover on ${anchorOnly.map((v) => v.name).join(", ")} is written \`[a]:hover:...\` in the real source, so it only applies when the Badge is rendered as a link (an anchor); a plain Badge never changes on hover.${alwaysHover.length > 0 ? ` Hover on ${alwaysHover.map((v) => v.name).join(", ")} is a plain \`hover:\` class and applies always.` : ""} Figma shows each Hover as the look for a link-rendered Badge.`);
    }
    badgeDisclosures.push(...stateDisclosures);
    for (const line of badgeDisclosures) notes.push(`Badge ${line}`);
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
    ...(hasStates ? { statePropertyName: "State" as const, disclosures: badgeDisclosures } : {}),
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

  const radiusMatch = exactRadiusLg(radius);
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

  // Real classes in a Toggle size string that the shared size builder doesn't
  // model: `min-w-N` (a minimum width) and the `has-data-[icon=...]:` /
  // `[&_svg...]:` classes that only matter when an icon child is present.
  const describeUnmodeled = (label: string, classes: string[]): string[] => {
    const lines: string[] = [];
    const minW = classes.find((cls) => /^min-w-\d/.test(cls));
    if (minW) {
      lines.push(`Size ${label}: ${minW} (a minimum width) isn't modeled — the Figma frame is as wide as its label plus padding, so a very short label could be narrower than the real component's minimum.`);
    }
    const iconClasses = classes.filter((cls) => cls.startsWith("has-data-[icon=") || cls.startsWith("[&_svg"));
    if (iconClasses.length > 0) {
      lines.push(`Size ${label}: icon-related classes (${iconClasses.join(" ")}) aren't modeled — this Figma Toggle has no icon, only a text label.`);
    }
    return lines;
  };
  const sizeAxis = buildCvaSizeAxis("Toggle", toggleSource, variants, spacing, radius, fontSize, notes, describeUnmodeled);

  // Batch 10: interaction states, read from the real class strings. Toggle has
  // all five: Hover, Focus, Disabled, Invalid and Pressed (the toggled-on look,
  // `aria-pressed:bg-muted`). See `buildStatesForVariants`.
  const toggleStateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus", "Disabled", "Invalid", "Pressed"];
  const stateDisclosures = buildStatesForVariants(toggleSource, "variant", variants, toggleStateNames);
  const hasStates = variants.some((v) => v.states && v.states.length > 0);
  const toggleDisclosures: string[] = [];
  if (hasStates) {
    toggleDisclosures.push(...buildCommonStateDisclosures(toggleSource, variants, toggleStateNames, { hasSizeAxis: Boolean(sizeAxis) }));
    // Pressed = the toggled-on look. Say exactly what it is, and that the same
    // look is also written under a second selector (`data-[state=on]:`) that is
    // not read separately.
    const toggleBase = toggleSource.match(/cva\(\s*"([^"]*)"/)?.[1] ?? "";
    const pressedClasses = extractStateClasses(toggleBase, "aria-pressed:");
    const stateOnClasses = toggleBase.split(/\s+/).filter((c) => c.startsWith("data-[state=on]:")).map((c) => c.slice("data-[state=on]:".length));
    if (pressedClasses.length > 0) {
      toggleDisclosures.push(`States: Pressed is the toggled-on look, built from the real aria-pressed: classes (${pressedClasses.map((c) => `aria-pressed:${c}`).join(" ")}).${stateOnClasses.length > 0 ? ` The real source also writes ${stateOnClasses.map((c) => `data-[state=on]:${c}`).join(" ")}, the same look under a second selector (for the library's own state attribute); it is not read separately, so nothing is lost.` : ""}`);
    }
    for (const variant of variants) {
      const hover = variant.states?.find((st) => st.name === "Hover");
      const pressed = variant.states?.find((st) => st.name === "Pressed");
      // Compare the EFFECTIVE look (a field a state leaves out means "as rest").
      const look = (st: FigmaComponentStatePlanItem) => JSON.stringify({
        fill: st.fillVariable ?? variant.fillVariable ?? null,
        fillOpacity: st.fillOpacity ?? null,
        text: st.textVariable ?? variant.textVariable ?? null,
        stroke: st.strokeVariable ?? variant.strokeVariable ?? null,
        strokeOpacity: st.strokeOpacity ?? null,
        underline: st.underline ?? Boolean(variant.underline),
        nodeOpacity: st.nodeOpacity ?? null,
        ring: st.focusRing ?? null,
      });
      if (hover && pressed && look(hover) === look(pressed)) {
        const reason = "Pressed renders identical to Hover: the real aria-pressed: look and hover: look change the same things (both a muted fill), so Figma shows no difference between them. Both are still built so every Variant has the same State values";
        (variant.skippedStates ??= []).push({ name: "Pressed", reason });
        stateDisclosures.push(`State ${variant.name} / Pressed: ${reason}.`);
      }
    }
    toggleDisclosures.push(...stateDisclosures);
    for (const line of toggleDisclosures) notes.push(`Toggle ${line}`);
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
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
    ...(hasStates ? { statePropertyName: "State" as const, disclosures: toggleDisclosures } : {}),
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

  const radiusMatch = exactRadiusLg(radius);
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

  // Inline link + Hover (2026-10-13, user decision). The real Alert underlines a link inside its title or
  // description (`[&_a]:underline [&_a]:underline-offset-3`) and turns it `text-foreground` on hover
  // (`[&_a]:hover:text-foreground`). The placeholder description therefore ENDS with an inline link ("Learn more"),
  // underlined in the description's colour, and Hover recolours only that link range to text.primary. A designer
  // who replaces the description text restyles the link in the same text box.
  const alertLinkHover = classesInSource(alertSource, ["[&_a]:hover:text-foreground"]);
  const alertLinkUnderline = classesInSource(alertSource, ["[&_a]:underline"]);
  const alertLinkColor = alertLinkHover.length > 0 ? classToFigmaVariable("text-foreground") : null;
  const alertLinkBuilt = alertLinkHover.length > 0 && alertLinkUnderline.length > 0 && alertLinkColor !== null && alertLinkColor.kind === "text";
  const ALERT_LINK_TEXT = "Learn more";
  if (alertLinkBuilt) {
    for (const v of variants) v.states = [{ name: "Hover", linkTextVariable: alertLinkColor!.variable }];
  }
  const alertLinkDisclosures: string[] = [];
  if (alertLinkBuilt) {
    alertLinkDisclosures.push(`Link: the real Alert underlines a link inside its title or description (${alertLinkUnderline[0]} [&_a]:underline-offset-3) and the link turns ${alertLinkColor!.variable} on hover (${alertLinkHover[0]}). The placeholder description therefore ends with an inline link ("${ALERT_LINK_TEXT}", underlined, in the description's own color) so the link look and its Hover are visible. This is an intended change to the placeholder text of the existing Alert. The link is styled text inside the description's one text layer: if a designer replaces the description text, they restyle the link in the same text box (underline plus color). Links inside the title are not drawn, and underline-offset-3 (the gap between text and line) is not modeled.`);
    alertLinkDisclosures.push(`States: Alert has a State property with Default and Hover. Hover recolours only the inline link to ${alertLinkColor!.variable} (the real ${alertLinkHover[0]}); the rest of the Alert is unchanged. The real Alert has no other state classes (no focus, disabled or invalid look), so none were built.`);
    alertLinkDisclosures.push("Description: the Alert's description is NOT a TEXT property in this component (the Title still is). Figma flattens a link's styling when its text layer is bound to a text property, and every instance would then share one styled default, so the link and its Hover colour could not differ per variant. This matches the real AlertDescription, a free-form container (a plain <div> with children, links written inline as <a>): edit the description by double-clicking its text in the instance, and restyle the link in the same text box (underline plus color).");
    for (const line of alertLinkDisclosures) notes.push(`Alert ${line}`);
  }
  const alertSkipDisclosures = !alertLinkBuilt && alertLinkHover.length > 0
    ? skippedStatesDisclosure("Alert", [
        `States (not built): no State property was built. The only hover or focus class in the real Alert is ${alertLinkHover[0]}, on AlertTitle and AlertDescription: it recolours a LINK placed inside the title or description text while that link is hovered, and the Figma Alert draws plain text lines with no link in them, so there is nothing to show hovered. Not built.`,
      ], notes)
    : [];

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
    // With the inline link the Description is NOT exposed as a TEXT property (Option A, user decision 2026-10-13):
    // binding the node to a property flattens the link's range styling and makes every instance share one styled
    // default, so a per-variant link colour (Hover) would not survive. The real AlertDescription is a free-form
    // container (a plain <div> with children), so designers edit the text in place and restyle the link.
    ...(alertLinkBuilt ? {} : { secondaryLabelPropertyName: "Description" }),
    defaultSecondaryLabel: alertLinkBuilt ? `This is an alert description. ${ALERT_LINK_TEXT}` : "This is an alert description.",
    ...(alertLinkBuilt ? { inlineLink: { text: ALERT_LINK_TEXT }, statePropertyName: "State" as const, disclosures: alertLinkDisclosures } : {}),
    ...(alertSkipDisclosures.length > 0 ? { disclosures: alertSkipDisclosures } : {}),
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

// Batch 11 (component-variations plan, 2026-10-09): interaction States for the
// two single-class-string form fields, Input and Textarea. They are plain
// `cn("...")` components with one "Default" variant and no `cva()`, so the class
// string is handed to `buildStatesForVariants` directly. Both have Focus,
// Disabled and Invalid (no Hover, no Pressed). Every value comes from the real
// class string: Focus = `focus-visible:border-ring focus-visible:ring-3
// focus-visible:ring-ring/50`; Disabled = `disabled:bg-input/50
// disabled:opacity-50`; Invalid = `aria-invalid:border-destructive
// aria-invalid:ring-3 aria-invalid:ring-destructive/20`.
//
// Writes the plan `notes` lines (prefixed with `label`) and returns the
// disclosure lines for the component's own Figma description. Returns an empty
// array (and sets no `states`) if the real source has none of these classes.
function buildFormFieldStates(
  label: "Input" | "Textarea",
  source: string,
  classString: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Focus", "Disabled", "Invalid"];
  // Disabled as three solid tokens (see DISABLED_FIELD_TOKENS), only when the project has all of them.
  const disabledTokens = Object.values(DISABLED_FIELD_TOKENS).every((t) => projectHasToken(t.cssVar));
  const stateOverrides = disabledTokens
    ? {
        [`${variants[0].name}/Disabled`]: {
          item: {
            fillVariable: sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.fill.token),
            strokeVariable: sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.stroke.token),
            textVariable: sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.text.token),
          },
          note: `drawn with three solid tokens instead of the real fade, by the user's decision (2026-10-13): stroke ${sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.stroke.token)} (light neutral.300, dark neutral.900), fill ${sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.fill.token)} (light neutral.200, dark neutral.900) and placeholder ${sdsgtPathToFigmaName(DISABLED_FIELD_TOKENS.text.token)} (light neutral.500, dark neutral.600). The real source is disabled:bg-input/50 (dark: dark:disabled:bg-input/80) inside a disabled:opacity-50 control; a fill's transparency is lost on Figma instances, so the control is NOT dimmed to 50% here and these solid steps are an approximation: each is the best single step across the light backgrounds (surface, primary, secondary; RGB distance 0 to 28) or the dark ones (primary, surface; 1 to 26), not an exact match on every background. In dark mode the stroke and the fill are the same step, so the field's edge does not stand out from its fill`,
        },
      }
    : undefined;
  const stateDisclosures = buildStatesForVariants(source, "variant", variants, stateNames, stateOverrides, undefined, classString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];
  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(source, variants, stateNames, { hasSizeAxis: false, singleClassString: classString, disabledAsTokens: disabledTokens }));
  disclosures.push(`States: there is no Hover state and no Pressed state (the real ${label} has no hover: or aria-pressed: classes).`);
  // The Disabled fill: say exactly what was drawn and how the opacity compounds.
  const disabled = variants[0].states?.find((st) => st.name === "Disabled");
  if (disabled?.fillVariable && disabled.fillOpacity !== undefined) {
    disclosures.push(`States: Disabled also gets the real disabled:bg-input/50 fill, drawn as ${disabled.fillVariable} (the color the real bg-input class maps to, the same token as the border) at ${Math.round((disabled.fillOpacity ?? 1) * 100)}% opacity, and the whole frame is then also at ${Math.round((disabled.nodeOpacity ?? 1) * 100)}% opacity (disabled:opacity-50). The two opacities multiply, exactly as they do in the real browser, so the fill is only faintly visible.`);
  }
  // Classes of the real source that do not change per state, so are not state looks.
  const unchanged = ["placeholder:text-muted-foreground"].filter((c) => classString.split(/\s+/).includes(c));
  if (unchanged.length > 0) {
    disclosures.push(`States: the placeholder text color (${unchanged.join(" ")}) is the same in every state in the real source, so every state shows the same placeholder text color as Default.`);
  }
  const fileClasses = classString.split(/\s+/).filter((c) => c.startsWith("file:"));
  if (fileClasses.length > 0) {
    disclosures.push(`States: the real file: classes (${fileClasses.join(" ")}) style the button of a file-type input and are not modeled in any state; Figma shows a plain text input.`);
  }
  const other = classString.split(/\s+/).filter((c) => ["transition-colors", "outline-none"].includes(c));
  if (other.length > 0) {
    disclosures.push(`States: ${other.join(" and ")} (the color fade and the removal of the browser's own focus outline) are not modeled: Figma has no transitions, and there is no browser outline to remove.`);
  }
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`${label} ${line}`);
  return disclosures;
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

  const radiusMatch = exactRadiusLg(radius);
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

  const variants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }];
  // Batch 11: interaction states (Focus, Disabled, Invalid) from the real classes.
  const stateDisclosures = buildFormFieldStates("Input", inputSource, classMatch[1], variants, notes);

  return {
    name: "Input",
    variantPropertyName: "Variant",
    variants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Placeholder",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
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

  const radiusMatch = exactRadiusLg(radius);
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

  const variants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.secondary") }];
  // Batch 11: interaction states (Focus, Disabled, Invalid) from the real classes.
  const stateDisclosures = buildFormFieldStates("Textarea", textareaSource, classMatch[1], variants, notes);

  return {
    name: "Textarea",
    variantPropertyName: "Variant",
    variants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Placeholder",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
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
// (a real, EXACT 1:1 alias to `radius.md` — see `exactRadiusLg`'s own
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
// treatment as `exactRadiusLg`. Confirmed `spacing.json` has a `"4"` key
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

  const radiusTarget = shadcnRadiusPx(radius, "xl");
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Card radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.xl = ${radiusTarget.toFixed(1)}px).`);
  }

  const titleFontSize = nearestToken(16, fontSize, "typography/primitive/fontSize");
  const bodyFontSize = nearestToken(14, fontSize, "typography/primitive/fontSize");

  notes.push("Card: only its real Header (Title + Description) and Content sections are modeled — its real Footer (a separate background/border treatment) isn't, a real, narrower scope than the actual 6-part compound component.");
  notes.push("Card: its real `ring-1 ring-foreground/10` border is approximated as border.subtle, the nearest real semantic token — this parser can't bind a partially-transparent ring effect.");

  // Component-variations plan, Batch 5 (2026-10-08): the `Size` axis. Default
  // is exactly the values above; each other size comes from the real
  // `data-[size=X]:` / `group-data-[size=X]/card:` classes.
  const buildSections = (spacingVar: string, titleFontVar: string, descriptionFontVar: string, contentFontVar: string): FigmaComponentSectionPlanItem[] => [
    {
      paddingHorizontalVariable: spacingVar,
      textLines: [
        { textVariable: sdsgtPathToFigmaName("text.on-surface"), fontSizeVariable: titleFontVar, weight: "Medium", labelPropertyName: "Title", defaultLabel: "Card Title" },
        { textVariable: sdsgtPathToFigmaName("text.secondary"), fontSizeVariable: descriptionFontVar, weight: "Regular", labelPropertyName: "Description", defaultLabel: "Card description goes here." },
      ],
    },
    {
      paddingHorizontalVariable: spacingVar,
      textLines: [
        { textVariable: sdsgtPathToFigmaName("text.on-surface"), fontSizeVariable: contentFontVar, weight: "Regular", labelPropertyName: "Content", defaultLabel: "This is the card's main content." },
      ],
    },
  ];
  const sizeAxis = buildCardSizeAxis(cardSource, buildSections, titleFontSize.figmaName, bodyFontSize.figmaName, readCssScale(tokensCss, "spacing"), fontSize, notes);

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
    sections: buildSections("spacing/4", titleFontSize.figmaName, bodyFontSize.figmaName, bodyFontSize.figmaName),
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
  };
}

// Card's `Size` axis (component-variations plan, Batch 5, 2026-10-08), read
// from the real `data-[size=X]:` / `group-data-[size=X]/card:` classes via
// `parseDataSizeClasses`. The one class that matters most is
// `data-[size=sm]:[--card-spacing:--spacing(3)]`: `--card-spacing` is the
// custom property the real Card uses for its root vertical padding, the gap
// between its parts and every part's horizontal padding, so changing it
// changes ALL of them at once — which in this plan are exactly
// `sectionGapVariable` (root top/bottom padding AND the gap between sections)
// and each section's `paddingHorizontalVariable`. `--spacing(N)` is N * 4px,
// snapped with `nearestToken` against the project's own scale (3 -> 12px ->
// spacing/3, exact here). `CardTitle` also carries a size-specific text class
// (`group-data-[size=sm]/card:text-sm`); CardDescription and the Content text
// (inherited from the root's `text-sm`) are checked the same way and fall back
// to their default size when a size sets none. The Default option is the
// plan's own pre-axis values, passed in, so Default is unchanged. Never
// throws: a size whose `--card-spacing` can't be read is skipped with a
// reason; missing root source returns no axis.
function buildCardSizeAxis(
  cardSource: string,
  buildSections: (spacingVar: string, titleFontVar: string, descriptionFontVar: string, contentFontVar: string) => FigmaComponentSectionPlanItem[],
  defaultTitleFontVar: string,
  defaultBodyFontVar: string,
  spacing: Record<string, number>,
  fontSize: Record<string, number>,
  notes: string[],
): FigmaComponentAxisPlanItem | undefined {
  const rootMatch = cardSource.match(/function Card\(\{[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!rootMatch) {
    notes.push("Card: could not find the Card root's className string, so no Size property was built — Card stays one size (real vendored source may have changed shape).");
    return undefined;
  }
  const slotClassString = (slot: string): string => cardSource.match(new RegExp(`data-slot="${slot}"[\\s\\S]*?cn\\(\\s*"([^"]*)"`))?.[1] ?? "";
  const titleClasses = slotClassString("card-title");
  const descriptionClasses = slotClassString("card-description");
  const rootBySize = parseDataSizeClasses(rootMatch[1]);
  const titleBySize = parseDataSizeClasses(titleClasses);
  const descriptionBySize = parseDataSizeClasses(descriptionClasses);
  const allBySize = parseDataSizeClasses(cardSource.replace(/["'`,]/g, " "));

  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];
  const spacingFn = (classes: string[]): number | null => {
    for (const cls of classes) {
      const m = cls.match(/^\[--card-spacing:--spacing\((\d+(?:\.\d+)?)\)\]$/);
      if (m) return parseFloat(m[1]) * 4;
    }
    return null;
  };
  const textPx = (classes: string[]): number | null => {
    for (const cls of classes) {
      if (!cls.startsWith("text-")) continue;
      const px = tailwindClassPx(cls);
      if (px !== null) return px;
    }
    return null;
  };

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];

  options.push({
    name: "Default",
    overrides: { sectionGapVariable: "spacing/4", sections: buildSections("spacing/4", defaultTitleFontVar, defaultBodyFontVar, defaultBodyFontVar) },
  });

  const consumed = new Map<string, Set<string>>(); // size -> classes this builder turned into overrides
  for (const sizeName of Object.keys(allBySize).filter((n) => n !== "default")) {
    const label = capitalize(sizeName);
    const spacingPx = spacingFn(rootBySize[sizeName] ?? []);
    if (spacingPx === null) {
      skippedOptions.push({ name: sizeName, reason: "no readable `[--card-spacing:--spacing(N)]` class on the Card root for this size, so its padding and gap can't be derived" });
      continue;
    }
    const spacingMatch = nearestToken(spacingPx, spacing, "spacing");
    if (spacingMatch.deltaPx > 0) {
      disclosures.push(`Size ${label}: --card-spacing ${spacingPx}px snapped to ${spacingMatch.figmaName} (${tokenPx(spacingMatch.figmaName, spacing)}px), ${spacingMatch.deltaPx}px off — no exact spacing token.`);
    }
    const used = new Set<string>((rootBySize[sizeName] ?? []).filter((cls) => spacingFn([cls]) !== null));

    const titlePx = textPx(titleBySize[sizeName] ?? []);
    const descriptionPx = textPx(descriptionBySize[sizeName] ?? []);
    const contentPx = textPx(rootBySize[sizeName] ?? []);
    for (const cls of [...(titleBySize[sizeName] ?? []), ...(descriptionBySize[sizeName] ?? [])]) if (cls.startsWith("text-") && tailwindClassPx(cls) !== null) used.add(cls);
    for (const cls of rootBySize[sizeName] ?? []) if (cls.startsWith("text-") && tailwindClassPx(cls) !== null) used.add(cls);
    consumed.set(sizeName, used);

    const fontVar = (px: number | null, fallback: string, what: string): string => {
      if (px === null) return fallback;
      const match = nearestToken(px, fontSize, "typography/primitive/fontSize");
      if (match.deltaPx > 0) disclosures.push(`Size ${label}: ${what} text size ${px}px snapped to ${match.figmaName} (${tokenPx(match.figmaName, fontSize)}px), ${Math.round(match.deltaPx * 100) / 100}px off — no exact type-scale token.`);
      return match.figmaName;
    };
    const titleVar = fontVar(titlePx, defaultTitleFontVar, "Title");
    const descriptionVar = fontVar(descriptionPx, defaultBodyFontVar, "Description");
    const contentVar = fontVar(contentPx, defaultBodyFontVar, "Content");

    options.push({
      name: label,
      overrides: { sectionGapVariable: spacingMatch.figmaName, sections: buildSections(spacingMatch.figmaName, titleVar, descriptionVar, contentVar) },
    });
  }

  if (options.length < 2) {
    if (skippedOptions.length > 0) notes.push(`Card: no non-default size had a readable \`--card-spacing\`, so no Size property was built — Card stays one size (${skippedOptions.map((o) => `${o.name}: ${o.reason}`).join("; ")}).`);
    return undefined;
  }

  for (const o of options) {
    if (o.name === "Default") continue;
    const sizeName = o.name.toLowerCase();
    if (titleBySize[sizeName] && textPx(titleBySize[sizeName]) !== null) continue;
    disclosures.push(`Size ${o.name}: the real Title has no ${sizeName}-specific text class, so its text stays at the default size.`);
  }
  disclosures.push(...describeIdenticalOptions("Size", options));
  disclosures.push("Size: Description and Content text sizes only change if the real source sets a size-specific text class for them (it does not for Description, and Content inherits the Card root's text-sm), so they stay at the Default sizes.");
  for (const [sizeName, used] of consumed) {
    const leftover = (allBySize[sizeName] ?? []).filter((cls) => !used.has(cls));
    if (leftover.length > 0) {
      disclosures.push(`Size ${capitalize(sizeName)}: ${leftover.join(", ")} isn't modeled — it only applies when the Card has a CardFooter, which this Figma Card doesn't include (see the existing Card footer note).`);
    }
  }
  if (skippedOptions.length > 0) {
    disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  }
  for (const line of disclosures) notes.push(`Card ${line}`);

  return { propertyName: "Size", options, skippedOptions, disclosures };
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
// `exactRadiusLg`'s own comment already documents for `--radius-lg`) — so
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

  const radiusTarget = shadcnRadiusPx(radius, "sm");
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Kbd radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.sm = ${radiusTarget.toFixed(1)}px).`);
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

  const radiusMatch = exactRadiusLg(radius);
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

  const sizeAxis = buildNativeSelectSizeAxis(classMatch[1], spacing, radius, notes);

  const variants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false, textVariable: colors.textVariable ?? sdsgtPathToFigmaName("text.primary") }];
  // Batch 12: interaction states (Hover, Focus, Disabled, Invalid), read from the
  // real <select> class string like Input/Textarea (a single class string, no
  // cva axis). Two NativeSelect-specific facts:
  //   - the real source has NO plain `hover:` class (only `dark:hover:bg-input/50`,
  //     which is never read), so Hover is built identical to Default and disclosed;
  //   - the real Disabled opacity is `has-[select:disabled]:opacity-50` on the OUTER
  //     WRAPPER <div>, not a `disabled:` class on the select, so it is supplied as a
  //     state override read from that real wrapper class.
  const nsStateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus", "Disabled", "Invalid"];
  const wrapperDisabled = nativeSelectSource.match(/has-\[select:disabled\]:opacity-(\d+)/);
  const nsOverrides: Record<string, { item: Omit<FigmaComponentStatePlanItem, "name">; note: string }> = {};
  if (wrapperDisabled) {
    nsOverrides["Default/Disabled"] = {
      item: { nodeOpacity: parseInt(wrapperDisabled[1], 10) / 100 },
      note: `${wrapperDisabled[1]}% opacity on the whole frame, read from the wrapper's real has-[select:disabled]:opacity-${wrapperDisabled[1]} class.`,
    };
  }
  const nsStateDisclosures = buildStatesForVariants(nativeSelectSource, "variant", variants, nsStateNames, nsOverrides, undefined, classMatch[1]);
  const nsHasStates = variants.some((v) => v.states && v.states.length > 0);
  const nsDisclosures: string[] = [];
  if (nsHasStates) {
    nsDisclosures.push(...buildCommonStateDisclosures(nativeSelectSource, variants, nsStateNames, {
      hasSizeAxis: Boolean(sizeAxis),
      singleClassString: classMatch[1],
      ...(wrapperDisabled ? { wrapperDisabledClass: `has-[select:disabled]:opacity-${wrapperDisabled[1]}` } : {}),
    }));
    const realHover = classMatch[1].split(/\s+/).filter((c) => c.startsWith("hover:"));
    if (realHover.length === 0) {
      const darkHover = classMatch[1].split(/\s+/).filter((c) => /^dark:.*hover:/.test(c));
      nsDisclosures.push(`States: the real NativeSelect has no plain hover: class${darkHover.length > 0 ? ` (its only hover class is ${darkHover.join(" ")}, which is dark mode only)` : ""}, so Hover is built identical to Default so every Variant and Size still has the same State values. There is no Pressed state.`);
    }
    nsDisclosures.push("States: the chevron icon is not modeled in any state, as for the rest look (this Figma NativeSelect is the box with its selected text only).");
    const otherUnmodeled = classMatch[1].split(/\s+/).filter((c) => ["transition-colors", "outline-none"].includes(c));
    if (otherUnmodeled.length > 0) {
      nsDisclosures.push(`States: ${otherUnmodeled.join(" and ")} (the color fade and the removal of the browser's own focus outline) are not modeled: Figma has no transitions, and there is no browser outline to remove.`);
    }
    nsDisclosures.push(...nsStateDisclosures);
    for (const line of nsDisclosures) notes.push(`NativeSelect ${line}`);
  }

  return {
    name: "NativeSelect",
    variantPropertyName: "Variant",
    variants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Select an option",
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
    ...(nsHasStates ? { statePropertyName: "State" as const, disclosures: nsDisclosures } : {}),
  };
}

// NativeSelect's `Size` axis (component-variations plan, Batch 5,
// 2026-10-08), read from the real `<select>` class string: the base `h-8`
// (Default) and the `data-[size=X]:` classes (`h-7`, `py-0.5`,
// `rounded-[min(var(--radius-md),10px)]` for sm) via `parseDataSizeClasses`.
// Like Button's Size, every option (Default included) gets a `heightVariable`
// because the real select has a fixed height; that is the one intended change
// to Default (it used to hug its text), disclosed below. With a fixed height
// the content is centered, so the vertical padding classes (`py-1`, `py-0.5`)
// have no separate effect and are not carried. Heights snap to the project's
// own spacing scale with `nearestToken` (ties go to the smaller token).
// Never throws: a size with no readable `h-N` is skipped with a reason.
function buildNativeSelectSizeAxis(
  selectClassString: string,
  spacing: Record<string, number>,
  radius: Record<string, number>,
  notes: string[],
): FigmaComponentAxisPlanItem | undefined {
  const baseClasses = selectClassString.split(/\s+/).filter(Boolean);
  const bySize = parseDataSizeClasses(selectClassString);
  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];
  const heightOf = (classes: string[]): { cls: string; px: number } | null => {
    for (const cls of classes) {
      if (!/^h-\d/.test(cls)) continue;
      const px = tailwindClassPx(cls);
      if (px !== null) return { cls, px };
    }
    return null;
  };
  const radiusOf = (classes: string[]) => {
    for (const cls of classes) {
      const match = resolveRadiusClass(cls, radius);
      if (match) return match;
    }
    return undefined;
  };
  const baseRadius = radiusOf(baseClasses);
  const baseHeight = heightOf(baseClasses);
  if (!baseHeight) {
    notes.push("NativeSelect: could not find a base `h-N` height class on the <select>, so no Size property was built — NativeSelect stays one size (real vendored source may have changed shape).");
    return undefined;
  }

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];
  const sizeNames = ["default", ...Object.keys(bySize).filter((n) => n !== "default")];
  for (const sizeName of sizeNames) {
    const label = capitalize(sizeName);
    const classes = sizeName === "default" ? baseClasses : bySize[sizeName];
    const height = sizeName === "default" ? baseHeight : heightOf(classes);
    if (!height) {
      skippedOptions.push({ name: sizeName, reason: "no readable `h-N` height class for this size on the <select>, so a fixed Figma height can't be derived" });
      continue;
    }
    const heightMatch = nearestToken(height.px, spacing, "spacing");
    const overrides: FigmaComponentLayoutOverrides = { heightVariable: heightMatch.figmaName };
    if (sizeName !== "default") {
      if (heightMatch.deltaPx > 0) {
        disclosures.push(`Size ${label}: height ${height.cls} (${height.px}px) snapped to ${heightMatch.figmaName} (${tokenPx(heightMatch.figmaName, spacing)}px), ${heightMatch.deltaPx}px off — no exact spacing token.`);
      }
      const ownRadius = radiusOf(classes) ?? baseRadius;
      if (ownRadius) {
        overrides.radiusVariable = ownRadius.figmaName;
        if (ownRadius.deltaPx > 0) {
          disclosures.push(`Size ${label}: corner radius snapped to ${ownRadius.figmaName}, ${ownRadius.deltaPx}px off — no exact radius token.`);
        } else if (baseRadius && ownRadius.figmaName === baseRadius.figmaName && classes.some((cls) => cls.startsWith("rounded-"))) {
          disclosures.push(`Size ${label}: its smaller corner radius (min of radius.md and the class's cap) resolves to ${ownRadius.figmaName} in this project, the same as Default.`);
        }
      }
      const padY = classes.find((cls) => /^py-\d/.test(cls));
      if (padY) {
        disclosures.push(`Size ${label}: vertical padding ${padY} isn't applied separately — the frame has a fixed height with its text centered, so it has no visible effect.`);
      }
    }
    options.push({ name: label, overrides });
  }

  if (options.length === 0) {
    notes.push("NativeSelect: no size had a readable `h-N` height, so no Size property was built — NativeSelect stays one size.");
    return undefined;
  }

  disclosures.push(...describeIdenticalOptions("Size", options));
  const defaultOption = options.find((o) => o.name === "Default");
  if (defaultOption?.overrides.heightVariable) {
    disclosures.push(`Size Default now has a fixed ${tokenPx(defaultOption.overrides.heightVariable, spacing)}px height (${baseHeight.cls}), like every other Size; before the Size property existed, NativeSelect hugged its content instead.`);
  }
  disclosures.push("Not modeled for any size: the chevron icon (and the right padding reserved for it) — this Figma NativeSelect is the box with its selected text only.");
  if (skippedOptions.length > 0) {
    disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  }
  for (const line of disclosures) notes.push(`NativeSelect ${line}`);

  return { propertyName: "Size", options, skippedOptions, disclosures };
}

// A real, always-exact alias — confirmed by reading every one of the four
// real preset files (`presets/radius.{tailwind,bootstrap,md3,md2}.json`)
// directly, not assumed: `radius.full` is `9999px` in EVERY preset,
// unconditionally, unlike `radius.md`/`radius.lg`/etc., which vary by
// preset. Tailwind's own `rounded-full` utility is a fixed literal too
// (not derived from `--radius` via any `calc()` formula the way
// `rounded-lg`/`rounded-sm`/`rounded-xl` are) — so this binds directly,
// the same "guaranteed real alias, never a nearest-guess" treatment
// `exactRadiusLg` already established for `rounded-lg`.
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

  const sizeAxis = buildAvatarSizeAxis(avatarSource, fallbackMatch[1], spacing, fontSize, notes);

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
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
  };
}

// Avatar's `Size` axis (component-variations plan, Batch 4, 2026-10-08) — the
// first consumer of `parseDataSizeClasses` for a component with no `cva()`
// size axis. Real source: the Avatar ROOT sets `size-8` (default) and
// overrides it per size with `data-[size=lg]:size-10` / `data-[size=sm]:size-6`;
// `AvatarFallback` sets `text-sm` and `group-data-[size=sm]/avatar:text-xs`
// (no lg-specific text class, so Lg keeps the base text-sm). Every size
// becomes a TRUE fixed square: `heightVariable` (the `size-N` px snapped to
// the project's own spacing scale with `nearestToken`) plus `square: true`
// (width bound to the same token), which replaces the old hug-content box
// with symmetric padding that only approximated the 32px default — an
// intended, disclosed change to Default, like Button's fixed 32px height.
// Options are ordered Default first, then ascending by size (Sm, Lg), not
// source order. Never throws: a size with no readable `size-N` is skipped
// with a reason, and a missing root/fallback class string returns no axis.
function buildAvatarSizeAxis(
  avatarSource: string,
  fallbackClassString: string,
  spacing: Record<string, number>,
  fontSize: Record<string, number>,
  notes: string[],
): FigmaComponentAxisPlanItem | undefined {
  const rootMatch = avatarSource.match(/function Avatar\(\{[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!rootMatch) {
    notes.push("Avatar: could not find the Avatar root's className string, so no Size property was built — Avatar stays one size (real vendored source may have changed shape).");
    return undefined;
  }
  const rootClasses = rootMatch[1].split(/\s+/).filter(Boolean);
  const rootBySize = parseDataSizeClasses(rootMatch[1]);
  const fallbackClasses = fallbackClassString.split(/\s+/).filter(Boolean);
  const fallbackBySize = parseDataSizeClasses(fallbackClassString);

  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];
  const baseSizeClass = rootClasses.find((cls) => /^size-\d/.test(cls));
  const baseFontClass = fallbackClasses.find((cls) => cls.startsWith("text-") && tailwindClassPx(cls) !== null);

  const specs: Array<{ sizeName: string; sizeClass: string | undefined; fontClass: string | undefined; fontInherited: boolean }> = [
    { sizeName: "default", sizeClass: baseSizeClass, fontClass: baseFontClass, fontInherited: false },
  ];
  for (const sizeName of Object.keys(rootBySize)) {
    if (sizeName === "default") continue;
    const ownFontClass = (fallbackBySize[sizeName] ?? []).find((cls) => cls.startsWith("text-") && tailwindClassPx(cls) !== null);
    specs.push({
      sizeName,
      sizeClass: rootBySize[sizeName].find((cls) => /^size-\d/.test(cls)),
      fontClass: ownFontClass ?? baseFontClass,
      fontInherited: ownFontClass === undefined,
    });
  }
  const readable = (cls: string | undefined) => (cls ? tailwindClassPx(cls) : null);
  specs.sort((a, b) => (a.sizeName === "default" ? -1 : b.sizeName === "default" ? 1 : (readable(a.sizeClass) ?? 0) - (readable(b.sizeClass) ?? 0)));

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];

  for (const spec of specs) {
    const label = capitalize(spec.sizeName);
    const sizePx = readable(spec.sizeClass);
    const fontPx = readable(spec.fontClass);
    if (!spec.sizeClass || sizePx === null) {
      skippedOptions.push({ name: spec.sizeName, reason: "no readable `size-N` class for this size on the Avatar root, so a fixed square can't be derived" });
      continue;
    }
    if (!spec.fontClass || fontPx === null) {
      skippedOptions.push({ name: spec.sizeName, reason: "no readable `text-*` class on AvatarFallback for this size, so the fallback text size can't be derived" });
      continue;
    }
    const sizeMatch = nearestToken(sizePx, spacing, "spacing");
    const fontMatch = nearestToken(fontPx, fontSize, "typography/primitive/fontSize");
    if (sizeMatch.deltaPx > 0) {
      disclosures.push(`Size ${label}: ${spec.sizeClass} (${sizePx}px square) snapped to ${sizeMatch.figmaName} (${tokenPx(sizeMatch.figmaName, spacing)}px), ${sizeMatch.deltaPx}px off — no exact spacing token.`);
    }
    if (fontMatch.deltaPx > 0) {
      disclosures.push(`Size ${label}: fallback text size ${fontPx}px snapped to ${fontMatch.figmaName} (${tokenPx(fontMatch.figmaName, fontSize)}px), ${Math.round(fontMatch.deltaPx * 100) / 100}px off — no exact type-scale token.`);
    }
    options.push({
      name: label,
      overrides: { heightVariable: sizeMatch.figmaName, square: true, fontSizeVariable: fontMatch.figmaName },
    });
  }

  if (options.length === 0) {
    notes.push("Avatar: no size had a readable `size-N` and fallback text size, so no Size property was built — Avatar stays one size.");
    return undefined;
  }

  disclosures.push(...describeIdenticalOptions("Size", options));
  const defaultOption = options.find((o) => o.name === "Default");
  if (defaultOption?.overrides.heightVariable) {
    disclosures.push(`Size Default is now a true fixed ${tokenPx(defaultOption.overrides.heightVariable, spacing)}px circle, like every other Size; before the Size property existed, Avatar was a hug-content box with symmetric padding that only approximated the real 32px square.`);
  }
  for (const spec of specs) {
    if (spec.fontInherited && options.some((o) => o.name === capitalize(spec.sizeName))) {
      disclosures.push(`Size ${capitalize(spec.sizeName)}: the real AvatarFallback has no ${spec.sizeName}-specific text class, so its text stays at the default ${baseFontClass} size.`);
    }
  }
  disclosures.push("Not modeled for any size: AvatarImage (a real photo), AvatarBadge's per-size dot (size-2 / size-2.5 / size-3, and its hidden or sized inner icon), and AvatarGroupCount's per-size circle and `[&>svg]` icon sizes — this Figma Avatar is only the fallback circle with initials.");
  if (skippedOptions.length > 0) {
    disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  }
  for (const line of disclosures) notes.push(`Avatar ${line}`);

  return { propertyName: "Size", options, skippedOptions, disclosures };
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

  const labelVariants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false }];
  // Batch 15: the Disabled state (the only state-like classes the real Label has).
  const stateDisclosures = buildLabelStates(labelSource, classMatch[1], labelVariants, notes);

  return {
    name: "Label",
    variantPropertyName: "Variant",
    variants: labelVariants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Label",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Batch 15 (component-variations plan, 2026-10-13): the Disabled State for Label. The real Label
// has exactly two state-like class pairs and both are "disabled by something else":
//   `peer-disabled:cursor-not-allowed peer-disabled:opacity-50`  (while a sibling marked `peer`,
//        typically the form control the label belongs to, is disabled)
//   `group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50`
//        (while a parent marked `group` carries data-disabled="true")
// Both set opacity-50, so Disabled = the whole Label frame at 50% (frame-level opacity, which
// Figma keeps on instances; the text colour itself stays bound and full-strength). The cursor and
// pointer-events classes have no Figma meaning. No Hover, Focus, Invalid or Pressed: the real
// Label has none. State = Default, Disabled (2 variants). Writes the plan `notes` lines (prefixed
// `Label`) and returns the disclosure lines for the Figma description. Never throws.
function buildLabelStates(
  labelSource: string,
  labelClassString: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Disabled"];
  const disabledPrefixes = ["peer-disabled:", "group-data-[disabled=true]:"];
  const stateDisclosures = buildStatesForVariants(labelSource, "variant", variants, stateNames, undefined, { Disabled: disabledPrefixes }, labelClassString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(labelSource, variants, stateNames, { hasSizeAxis: false, singleClassString: labelClassString, disabledPrefixes }));
  disclosures.push("States: Disabled is not a state of the label on its own. It is how the label looks while the form control it belongs to is disabled (peer-disabled:, the control sitting next to the label with the peer marker) or while a parent marked group has data-disabled=\"true\" (group-data-[disabled=true]:). Both classes set the same opacity-50.");
  disclosures.push("States: the real Label has no Hover, Focus, Invalid or Pressed classes, so none were built.");
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`Label ${line}`);
  return disclosures;
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
// direct 1:1 alias (`exactRadiusLg`) or `rounded-xl`'s ×1.4 multiplier
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

  const radiusTarget = shadcnRadiusPx(radius, "md");
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Skeleton radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.md = ${radiusTarget.toFixed(1)}px).`);
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

  // Batch 15 triage: no State property (see the disclosure line).
  const breadcrumbHover = classesInSource(breadcrumbSource, ["hover:text-foreground"]);
  const breadcrumbSkipDisclosures = breadcrumbHover.length > 0
    ? skippedStatesDisclosure("Breadcrumb", [
        "States (not built): no State property was built. The only hover or focus class in the real Breadcrumb is `hover:text-foreground` (with `transition-colors`) on BreadcrumbLink: it turns ONE link's text from the muted color (text.secondary) to the full color (text.primary) while that link is hovered. The Figma Breadcrumb is one fixed trail (two links and the current page), and hover belongs to a single link, so a whole-component Hover would have to pick one link arbitrarily; it is not built. BreadcrumbPage carries aria-disabled=\"true\" and aria-current=\"page\" attributes but no state classes, and the real source has no focus-visible:, disabled:, aria-invalid: or aria-pressed: class.",
      ], notes)
    : [];

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
    ...(breadcrumbSkipDisclosures.length > 0 ? { disclosures: breadcrumbSkipDisclosures } : {}),
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

  const radiusTarget = shadcnRadiusPx(radius, "xl");
  const radiusMatch = nearestToken(radiusTarget, radius, "radius");
  if (radiusMatch.deltaPx > 0.01) {
    notes.push(`Empty radius: nearest real token is ${radiusMatch.deltaPx.toFixed(1)}px off shadcn's own exact computed value (radius.xl = ${radiusTarget.toFixed(1)}px) — same real rounded-xl formula as Card's own radius.`);
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
// axis this ORIGINAL batch didn't model (modeled since component-variations
// Batch 7, see `buildFieldOrientationAxis`) — the base plan is the default "vertical" shape, whose
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

  notes.push("Field: only its real FieldLabel/FieldDescription/FieldError are modeled — FieldSeparator isn't (a genuinely new shape, tracked as its own later batch). Field's own real orientation axis (vertical/horizontal; responsive is skipped) is modeled as an Orientation property — see the `Field Orientation ...` notes below for what it does and doesn't change.");
  notes.push("Field: FieldLabel/Field/FieldError/FieldDescription have no real padding or radius class of their own at all — represented as bare text rows (0px padding, radius/none, no fill, no stroke), the same 'bare text node' treatment buildLabelPlan already established, not approximated into boxes that don't exist.");
  notes.push("Field: its real gap-2 (8px) inter-row gap is the only real spacing value present — bound to sectionGapVariable, which this schema also applies to the outer frame's own top/bottom padding (Field's real root has none) — the same real, disclosed schema trade-off as Empty's own, in this same batch, just an 8px version.");

  // The three sections, parameterized by the stacking direction an Orientation
  // option can change; the base plan (vertical, `textLineDirection` absent) and
  // every axis option build theirs through this function, so each text line's
  // `labelPropertyName` is identical in every orientation (step 5 binds by it).
  const buildSections = (direction?: "horizontal"): FigmaComponentSectionPlanItem[] => {
    const dir = direction ? { textLineDirection: direction } : {};
    return [
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        ...dir,
        textLines: [
          { textVariable: labelColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Medium", labelPropertyName: "Label", defaultLabel: "Email address" },
        ],
      },
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        ...dir,
        textLines: [
          { textVariable: descriptionColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "We'll never share your email." },
        ],
      },
      {
        paddingHorizontalVariable: paddingHMatch.figmaName,
        ...dir,
        textLines: [
          { textVariable: errorColors.textVariable, fontSizeVariable: fontSizeMatch.figmaName, weight: "Regular", labelPropertyName: "Error", defaultLabel: "This field is required." },
        ],
      },
    ];
  };

  const extraAxes = buildFieldOrientationAxis(fieldSource, buildSections, notes);

  // Batch 15 triage: no State property (see the disclosure lines). Each class is named only if the
  // real vendored source still contains it.
  const fieldInvalid = classesInSource(fieldSource, ["data-[invalid=true]:text-destructive"]);
  // Invalid (2026-10-13, user decision): the real root class `data-[invalid=true]:text-destructive` recolours
  // every text part that has NO colour class of its own. FieldLabel/FieldTitle have none (they inherit), the
  // description has its own `text-muted-foreground`, the error line is already `text-destructive`. So Invalid =
  // the Label line turns the destructive colour (status.error), via a per-line state override.
  const fieldLabelClassStrings = [...fieldSource.matchAll(/data-slot="field-(?:label|title)"[\s\S]*?className=\{cn\(([\s\S]*?)\)\}/g)].map((m) => m[1]).join(" ");
  const labelOwnColor = /text-(?:foreground|muted-foreground|destructive|primary|secondary|card-foreground)\b/.test(fieldLabelClassStrings);
  const invalidColor = classToFigmaVariable("text-destructive");
  const invalidBuilt = fieldInvalid.length > 0 && !labelOwnColor && invalidColor !== null && invalidColor.kind === "text";
  const fieldDisabled = classesInSource(fieldSource, ["group-data-[disabled=true]/field:opacity-50"]);
  const disabledBuilt = fieldDisabled.length > 0 && !labelOwnColor && projectHasToken(FIELD_LABEL_DISABLED_TOKEN.cssVar);
  const fieldStates: FigmaComponentStatePlanItem[] = [
    ...(invalidBuilt ? [{ name: "Invalid" as const, textLineOverrides: { Label: { textVariable: invalidColor!.variable } } }] : []),
    ...(disabledBuilt ? [{ name: "Disabled" as const, textLineOverrides: { Label: { textVariable: sdsgtPathToFigmaName(FIELD_LABEL_DISABLED_TOKEN.token) } } }] : []),
  ];
  const fieldCardLabel = classesInSource(fieldSource, [
    "has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50",
    "has-[>[data-slot=field]]:has-[:focus-visible]:border-ring",
    "has-[>[data-slot=field]]:has-[:focus-visible]:ring-3",
    "has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50",
    "has-data-checked:border-primary/30",
    "has-data-checked:bg-primary/5",
  ]);
  const fieldLinkHover = classesInSource(fieldSource, ["[&>a:hover]:text-primary"]);
  const fieldSkipLines: string[] = [];
  if (fieldInvalid.length > 0 || fieldDisabled.length > 0 || fieldCardLabel.length > 0 || fieldLinkHover.length > 0) {
    fieldSkipLines.push(invalidBuilt
      ? `States (partly built): Field has a State property with ${disabledBuilt ? "Default, Invalid and Disabled" : "Default and Invalid"} (see the State lines above). The real source has no hover: or focus-visible: class on the field's own boxes; what else it has, and is not built, is listed below.`
      : "States (not built): no State property was built for Field. The real source has no hover:, focus-visible:, disabled: or aria-invalid: class on the field's own boxes; what it has is listed below.");
    if (fieldInvalid.length > 0 && !invalidBuilt) {
      fieldSkipLines.push(`States (not built): Invalid is the real ${fieldInvalid[0]} on the Field root: the text the label inherits turns destructive (the description keeps its own muted color, and the error line is already destructive). The Figma Field binds each text line's color on its own, so showing it needs a state color on one specific text line, which the State mechanism cannot express yet; not built.`);
    }
    if (fieldDisabled.length > 0 && !disabledBuilt) {
      fieldSkipLines.push(`States (not built): Disabled is the real ${fieldDisabled[0]}, written on FieldLabel and FieldTitle only (while the Field has data-disabled="true"): it dims the label line alone, not the description or the error line. The State mechanism fades a whole frame, so a whole-frame Disabled would be wrong; not built.`);
    }
    if (fieldCardLabel.length > 0) {
      fieldSkipLines.push(`States (not built): ${fieldCardLabel.join(" ")} apply only when a FieldLabel wraps an entire Field to make a selectable card (the has-[>[data-slot=field]] condition); the Figma Field is the plain label + description + error stack, not that wrapper, and the hover and checked fills are translucent (/50, /30, /5), which a bound color cannot carry on Figma instances.`);
    }
    if (fieldLinkHover.length > 0) {
      fieldSkipLines.push(`States (not built): ${fieldLinkHover[0]} (on FieldDescription) recolours a link inside the description text; the Figma Field has no link in it.`);
    }
  }
  const fieldInvalidDisclosures: string[] = [];
  if (invalidBuilt) {
    fieldInvalidDisclosures.push(`States: Field has a State property: Default, Invalid${disabledBuilt ? " and Disabled" : ""} (both Orientations). Invalid is the real ${fieldInvalid[0]} on the Field root: the Label line turns ${invalidColor!.variable} (the destructive color); the description keeps its own color (text.secondary) and the error line is already status/error, so they are unchanged. The real component sets one inherited text color; the Figma Field binds each line's color on its own, so Invalid is a per-line override of the Label.`);
    if (disabledBuilt) {
      fieldInvalidDisclosures.push(`States: Disabled is the real ${fieldDisabled[0]}, written on FieldLabel and FieldTitle only (while the Field has data-disabled="true"): it dims the label line alone, not the description or the error line. Instead of that 50% opacity (the user chose no transparency, 2026-10-13) the Label line takes the solid token ${sdsgtPathToFigmaName(FIELD_LABEL_DISABLED_TOKEN.token)} (light neutral.600, dark neutral.500), the best single step per mode across the page backgrounds (RGB distance light 2 to 26, dark 4 to 21), so it is an approximation, not an exact match on every background. The description and the error line are unchanged.`);
    } else {
      fieldInvalidDisclosures.push("States: Disabled is not built: this project has no text.label-disabled token (it is generated for projects created on or after 2026-10-13).");
    }
    for (const line of fieldInvalidDisclosures) notes.push(`Field ${line}`);
  }
  const fieldSkipDisclosures = fieldSkipLines.length > 0 ? skippedStatesDisclosure("Field", fieldSkipLines, notes) : [];

  return {
    name: "Field",
    variantPropertyName: "Variant",
    variants: [
      { name: "Default", textVariable: sdsgtPathToFigmaName("text.primary"), underline: false, ...(fieldStates.length > 0 ? { states: fieldStates } : {}) },
    ],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: sectionGapMatch.figmaName,
    sections: buildSections(),
    ...(extraAxes.length > 0 ? { extraAxes } : {}),
    ...(fieldStates.length > 0 ? { statePropertyName: "State" as const } : {}),
    ...(fieldInvalidDisclosures.length + fieldSkipDisclosures.length > 0 ? { disclosures: [...fieldInvalidDisclosures, ...fieldSkipDisclosures] } : {}),
  };
}

// Field's `Orientation` axis (component-variations plan, Batch 7, 2026-10-08).
// Reads the real `fieldVariants` cva `orientation` axis (vertical / horizontal
// / responsive); never invents a value.
//
// What it changes for the modeled parts (Label, Description, Error): the
// stacking direction of Field's own children. `flex-col` (vertical) keeps the
// existing vertical stack, so Vertical's override is empty and Default +
// Vertical reproduces the pre-axis plan exactly. `flex-row` (horizontal) lays
// the same three sections out in a ROW (`textLineDirection: "horizontal"` on
// every section, the Breadcrumb mechanism); the root's `gap-2` is the row's
// item spacing, and `items-center` is how the replay already aligns them. The
// replay's horizontal branch also zeroes the frame's padding, which is closer
// to the real Field root (it has none) than the vertical stack's disclosed
// top/bottom padding trade-off.
//
// A class string with a container-query prefix (`@md/field-group:`, i.e.
// `responsive`) is a breakpoint-driven layout, which a Figma component
// (no viewport) can't express: it goes to `skippedOptions`. Any other class in
// an option's string the builder doesn't model is listed verbatim in that
// option's disclosures (computed from the source, not hard-coded).
function buildFieldOrientationAxis(
  fieldSource: string,
  buildSections: (direction?: "horizontal") => FigmaComponentSectionPlanItem[],
  notes: string[],
): FigmaComponentAxisPlanItem[] {
  let entries: Array<[string, string]> = [];
  try {
    entries = parseCvaAxis(fieldSource, "orientation");
  } catch {
    notes.push("Field: could not find an `orientation` axis in the vendored source, so no Orientation property was built — Field stays one orientation (real vendored source may have changed shape).");
    return [];
  }
  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];
  for (const [name, classString] of entries) {
    const label = capitalize(name);
    const classes = classString.split(/\s+/).filter(Boolean);
    if (classes.some((cls) => /(^|:)@[a-z0-9]+\//.test(cls))) {
      skippedOptions.push({ name, reason: "breakpoint-driven layout (container query); Figma components have no viewport" });
      continue;
    }
    const isRow = classes.includes("flex-row");
    const isCol = classes.includes("flex-col");
    if (!isRow && !isCol) {
      skippedOptions.push({ name, reason: "no flex-col / flex-row class in this orientation's real class string, so its stacking direction can't be derived" });
      continue;
    }
    options.push({ name: label, overrides: isRow ? { sections: buildSections("horizontal") } : {} });
    const modeled = new Set(["flex-col", "flex-row", "items-center"]);
    const unmodeled = classes.filter((cls) => !modeled.has(cls));
    if (isRow) {
      disclosures.push(`Orientation ${label}: flex-row lays Field's Label, Description and Error out side by side in one row (8px gap, vertically centered) instead of stacking them, with no top/bottom padding (the real Field root has none).`);
    }
    if (unmodeled.length > 0) {
      const why = isRow
        ? "they shape a label that grows to fill the row, top-aligned children and a nudged checkbox/radio when a FieldContent part is present"
        : "they make every child full-width and size screen-reader-only text";
      disclosures.push(`Orientation ${label}: these real classes aren't modeled: ${unmodeled.join(" ")} — ${why}, and this Figma Field has no control (checkbox/radio/input) or FieldContent part.`);
    }
  }
  if (options.length === 0) {
    notes.push("Field: no orientation in the vendored `orientation` axis was buildable, so no Orientation property was built — Field stays one orientation.");
    return [];
  }
  for (const skipped of skippedOptions) {
    disclosures.push(`Orientation ${capitalize(skipped.name)} was not built: ${skipped.reason}.`);
  }
  disclosures.push("Orientation: Vertical keeps the existing 8px top/bottom padding trade-off on Field's outer frame (Field's real root has none) so it renders exactly as before; Horizontal drops it.");
  disclosures.push(...describeIdenticalOptions("Orientation", options));
  for (const line of disclosures) notes.push(`Field ${line.startsWith("Orientation") ? "" : "Orientation "}${line}`.replace(/\s+/g, " "));
  return [{ propertyName: "Orientation", options, skippedOptions, disclosures }];
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
// elsewhere in this file. This base plan is the real horizontal,
// 1px-thick line; Batch 7 added the vertical one as an `Orientation` axis
// (see `buildSeparatorAxes`).
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
  const extraAxes = buildSeparatorAxes(classMatch[1], colors.fillVariable, 1, 200, notes);

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
    ...(extraAxes.length > 0 ? { extraAxes } : {}),
  };
}

// Separator's `Orientation` axis (component-variations plan, Batch 7,
// 2026-10-08). Separator has no `cva()`; its orientation lives in
// `data-horizontal:` / `data-vertical:` prefixed utility classes on one string
// (`data-horizontal:h-px data-horizontal:w-full data-vertical:w-px
// data-vertical:self-stretch`), so each option's classes are those with its
// own `data-<orientation>:` prefix. THICKNESS is `h-N` (horizontal) / `w-N`
// (vertical) — `px` = 1px, the same raw unbound literal the base plan already
// uses (see `FigmaComponentLinePlanItem`); LENGTH is `w-full` / `self-stretch`
// (fill the caller's container), which has no intrinsic value, so both
// orientations use the plan's existing `representativeLengthPx` as a disclosed
// stand-in. Horizontal's override is empty (the base `line` already is the
// horizontal line, so Horizontal reproduces today's plan exactly); Vertical
// carries a complete replacement `line` (the replay merge is a shallow
// Object.assign) with `orientation: "vertical"`. The color is the base line's
// own `bg-border` color, unchanged.
function buildSeparatorAxes(
  classString: string,
  colorVariable: string,
  baseThicknessPx: number,
  representativeLengthPx: number,
  notes: string[],
): FigmaComponentAxisPlanItem[] {
  const tokens = classString.split(/\s+/).filter(Boolean);
  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];

  for (const orientation of ["horizontal", "vertical"] as const) {
    const label = capitalize(orientation);
    const own = tokens.filter((t) => t.startsWith(`data-${orientation}:`)).map((t) => t.slice(`data-${orientation}:`.length));
    if (own.length === 0) continue; // this orientation isn't in the source at all
    const thicknessPrefix = orientation === "horizontal" ? "h-" : "w-";
    const thicknessClass = own.find((t) => t.startsWith(thicknessPrefix));
    let thicknessPx: number | null = null;
    if (thicknessClass === `${thicknessPrefix}px`) thicknessPx = 1;
    else if (thicknessClass) thicknessPx = tailwindClassPx(thicknessClass);
    if (thicknessClass === undefined || thicknessPx === null) {
      skippedOptions.push({ name: label, reason: `no readable \`${thicknessPrefix}px\`/\`${thicknessPrefix}N\` thickness class among this orientation's real \`data-${orientation}:\` classes, so the line's thickness can't be derived` });
      continue;
    }
    const lengthClass = own.find((t) => t === "w-full" || t === "h-full" || t === "self-stretch");
    if (lengthClass) disclosures.push(`Orientation ${label}: the real length class ${lengthClass} makes the line fill whatever container it sits in, which has no fixed value, so the Figma line uses a representative ${representativeLengthPx}px stand-in as its ${orientation === "horizontal" ? "width" : "height"} (not a real default length).`);
    else disclosures.push(`Orientation ${label}: no known fill-the-container length class (w-full / h-full / self-stretch) among this orientation's real classes, so the Figma line uses a representative ${representativeLengthPx}px stand-in length.`);
    const unmodeled = own.filter((t) => t !== thicknessClass && t !== lengthClass);
    if (unmodeled.length > 0) disclosures.push(`Orientation ${label}: ${unmodeled.join(", ")} isn't modeled.`);
    if (thicknessPx === baseThicknessPx && thicknessClass === `${thicknessPrefix}px`) {
      disclosures.push(`Orientation ${label}: the line is a raw 1px (${thicknessClass}), not bound to a spacing token — no spacing token is that thin (the smallest is 4px).`);
    }

    options.push({
      name: label,
      overrides: orientation === "horizontal"
        ? {} // the base `line` is already the horizontal line
        : { line: { colorVariable, thicknessPx, representativeLengthPx, orientation: "vertical" } },
    });
  }

  if (options.length === 0) {
    notes.push("Separator: no `data-horizontal:` / `data-vertical:` orientation classes were found in the vendored source, so no Orientation property was built — Separator stays the one horizontal line (real vendored source may have changed shape).");
    return [];
  }
  disclosures.push(...describeIdenticalOptions("Orientation", options));
  for (const line of disclosures) notes.push(`Separator ${line.startsWith("Orientation") ? "" : "Orientation "}${line}`.replace(/\s+/g, " "));
  return [{ propertyName: "Orientation", options, skippedOptions, disclosures }];
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
// (`default`/`sm`/`xs`) is modeled since Batch 3 of
// figma-component-variations-plan.md (2026-10-08) via `buildItemSizeAxis`
// — the first `sections` + `extraAxes` combination.
//
// Real, load-bearing finding this batch exists to confirm: `rounded-lg`
// is `item.tsx`'s own real base-class radius, exactly like Toggle/Badge/
// Input/Textarea/Card before it — bound via `exactRadiusLg`, a real EXACT
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

  const radiusMatch = exactRadiusLg(radius); // real rounded-lg -> a real EXACT alias to radius.md, not a nearest-value guess — see this function's own comment
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

  // The one Title + Description section, parameterized by the two values a
  // Size option can change (horizontal padding, Description font size); the
  // base plan and every Size option build theirs through this one function.
  const buildSections = (paddingHVar: string, descriptionFontVar: string): FigmaComponentSectionPlanItem[] => [
    {
      paddingHorizontalVariable: paddingHVar,
      textLines: [
        { textVariable: sdsgtPathToFigmaName("text.primary"), fontSizeVariable: fontSizeMatch.figmaName, weight: "Medium", labelPropertyName: "Title", defaultLabel: "Item title" },
        { textVariable: sdsgtPathToFigmaName("text.secondary"), fontSizeVariable: descriptionFontVar, weight: "Regular", labelPropertyName: "Description", defaultLabel: "Item description goes here." },
      ],
    },
  ];

  notes.push("Item: only its real outer frame and ItemTitle/ItemDescription are modeled — ItemMedia (an icon/image slot) and ItemActions (real interactive buttons) aren't, the same declared NEEDS-ICON/NEEDS-INTERACTIVE-STRUCTURE reasons named in figma-remaining-components-plan.md. Its real size axis (default/sm/xs) is modeled as a Size property — see the `Item Size ...` notes below for what it does and doesn't change.");
  notes.push("Item: ItemContent's real gap-1 (4px) between Title and Description has no home in this schema's sections/textLines shape — the two lines stack directly adjacent in the replay, relying only on each line's own line-height for visual separation, not a bound 4px gap.");

  const sizeAxis = buildItemSizeAxis(itemSource, spacing, fontSize, notes, buildSections);

  // Batch 12: interaction states, read from the real class strings. Item has
  // Hover (written `[a]:hover:bg-muted`, so only when the Item is rendered as a
  // link) and Focus (`focus-visible:border-ring focus-visible:ring-[3px]
  // focus-visible:ring-ring/50`); the real source has no Disabled, Invalid or
  // Pressed classes, so none are built. The state's fill / stroke / ring applies
  // to the OUTER frame; the Title/Description section is untouched.
  const itemStateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus"];
  const itemStateDisclosures = buildStatesForVariants(itemSource, "variant", variants, itemStateNames, undefined, { Hover: ["[a]:hover:"] });
  const itemHasStates = variants.some((v) => v.states && v.states.length > 0);
  const itemDisclosures: string[] = [];
  if (itemHasStates) {
    itemDisclosures.push(...buildCommonStateDisclosures(itemSource, variants, itemStateNames, { hasSizeAxis: Boolean(sizeAxis) }));
    itemDisclosures.push("States: there is no Disabled, Invalid or Pressed state (the real Item has no disabled:, aria-invalid: or aria-pressed: classes).");
    const itemBase = itemSource.match(/cva\(\s*"([^"]*)"/)?.[1] ?? "";
    const anchorHover = itemBase.split(/\s+/).filter((c) => c.startsWith("[a]:hover:"));
    if (anchorHover.length > 0) {
      itemDisclosures.push(`States: Hover is written \`${anchorHover.join(" ")}\` in the real source, so it only applies when the Item is rendered as a link (an anchor); a plain Item never changes on hover. Figma shows Hover as the look for a link-rendered Item.`);
    }
    itemDisclosures.push("States: a state's fill, border and ring are applied to Item's outer frame; the Title and Description text are the same in every state (the real source changes no text color for any state).");
    const descriptionLinkHover = (itemSource.match(/data-slot="item-description"[\s\S]*?cn\(\s*"([^"]*)"/)?.[1] ?? "").split(/\s+/).filter((c) => c.includes(":hover") && !c.startsWith("dark:"));
    if (descriptionLinkHover.length > 0) {
      itemDisclosures.push(`States: the real ItemDescription's ${descriptionLinkHover.join(" ")} (the color of a link placed inside the description while it is hovered) is not modeled: this Figma Item has plain Description text with no link inside it.`);
    }
    const itemOther = itemBase.split(/\s+/).filter((c) => ["transition-colors", "duration-100", "outline-none", "[a]:transition-colors"].includes(c));
    if (itemOther.length > 0) {
      itemDisclosures.push(`States: ${itemOther.join(", ")} (the color fade and the removal of the browser's own focus outline) are not modeled: Figma has no transitions, and there is no browser outline to remove.`);
    }
    if (variants.some((v) => v.name === "Muted" && v.fillVariable === sdsgtPathToFigmaName("background.secondary"))) {
      itemDisclosures.push("States: Muted's rest fill is the real bg-muted/50 drawn SOLID (see the opacity note above), so its link Hover (the real [a]:hover:bg-muted, a stronger muted fill) renders the same as Muted at rest in Figma; it is built anyway so every Variant has the same State values.");
    }
    itemDisclosures.push(...itemStateDisclosures);
    for (const line of itemDisclosures) notes.push(`Item ${line}`);
  }

  return {
    name: "Item",
    variantPropertyName: "Variant",
    variants,
    skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: paddingVMatch.figmaName,
    sections: buildSections(paddingHMatch.figmaName, fontSizeMatch.figmaName),
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
    ...(itemHasStates ? { statePropertyName: "State" as const, disclosures: itemDisclosures } : {}),
  };
}

// Item's `Size` axis (component-variations plan, Batch 3, 2026-10-08) — the
// first `sections` + `extraAxes` combination. Reads the real `size` cva axis
// (default/sm/xs): `py-N` -> `sectionGapVariable` (the outer frame's top/
// bottom padding, exactly how the base Item plan already uses it), `px-N` ->
// the single section's horizontal padding, and ItemDescription's own real
// `group-data-[size=X]/item:text-*` class -> the Description line's font size
// (via `parseDataSizeClasses`, its first consumer). An option's overrides
// carry a full replacement `sections` + `sectionGapVariable`, which the
// replay merges over the component's own. The Default option is computed the
// same way as the base plan (py-2.5 / px-3 / text-sm), so it reproduces
// Item's pre-axis values exactly. Never throws: an option with no readable
// `px-N`/`py-N` is skipped with a reason. Real classes this schema can't
// carry (the flex `gap-N` between Item's media/content/actions parts, the
// `in-data-[slot=...]` context rule, and the `group-data-[size=X]/item:`
// classes that resize ItemMedia/ItemContent) are disclosed, never dropped
// silently.
function buildItemSizeAxis(
  itemSource: string,
  spacing: Record<string, number>,
  fontSize: Record<string, number>,
  notes: string[],
  buildSections: (paddingHVar: string, descriptionFontVar: string) => FigmaComponentSectionPlanItem[],
): FigmaComponentAxisPlanItem | undefined {
  let sizeEntries: Array<[string, string]>;
  try {
    sizeEntries = parseCvaAxis(itemSource, "size");
  } catch {
    notes.push("Item: could not find a `size` axis in the vendored source, so no Size property was built — Item stays one size (real vendored source may have changed shape).");
    return undefined;
  }
  if (sizeEntries.length === 0) return undefined;

  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];
  const descriptionClasses = (itemSource.match(/data-slot="item-description"[\s\S]*?cn\(\s*"([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
  const descriptionBySize = parseDataSizeClasses(descriptionClasses.join(" "));
  const allBySize = parseDataSizeClasses(itemSource.replace(/["'`,]/g, " "));
  const baseFontPx = 14; // ItemTitle/ItemDescription's own real text-sm, same as the base plan

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];

  for (const [sizeName, classString] of sizeEntries) {
    const classes = classString.split(/\s+/).filter(Boolean);
    const label = capitalize(sizeName);
    const padXClass = classes.find((cls) => /^px-\d/.test(cls));
    const padYClass = classes.find((cls) => /^py-\d/.test(cls));
    const padXPx = padXClass ? tailwindClassPx(padXClass) : null;
    const padYPx = padYClass ? tailwindClassPx(padYClass) : null;
    if (!padXClass || padXPx === null || !padYClass || padYPx === null) {
      skippedOptions.push({ name: sizeName, reason: "no readable `px-N` and `py-N` classes in this size's real class string, so the padding can't be derived" });
      continue;
    }
    const padXMatch = nearestToken(padXPx, spacing, "spacing");
    const padYMatch = nearestToken(padYPx, spacing, "spacing");
    const descFontClass = (descriptionBySize[sizeName] ?? []).find((cls) => cls.startsWith("text-") && tailwindClassPx(cls) !== null);
    const descFontPx = descFontClass ? (tailwindClassPx(descFontClass) as number) : baseFontPx;
    const descFontMatch = nearestToken(descFontPx, fontSize, "typography/primitive/fontSize");

    // The base Item plan already discloses Default's own py-2.5 / px-3 snaps
    // (`Item horizontal/vertical padding` notes), so only the other sizes
    // repeat theirs here.
    if (sizeName !== "default") {
      if (padYMatch.deltaPx > 0) disclosures.push(`Size ${label}: vertical padding ${padYClass} (${padYPx}px) snapped to ${padYMatch.figmaName} (${tokenPx(padYMatch.figmaName, spacing)}px), ${padYMatch.deltaPx}px off — no exact spacing token.`);
      if (padXMatch.deltaPx > 0) disclosures.push(`Size ${label}: horizontal padding ${padXClass} (${padXPx}px) snapped to ${padXMatch.figmaName} (${tokenPx(padXMatch.figmaName, spacing)}px), ${padXMatch.deltaPx}px off — no exact spacing token.`);
      if (descFontMatch.deltaPx > 0) disclosures.push(`Size ${label}: Description text size ${descFontPx}px snapped to ${descFontMatch.figmaName} (${tokenPx(descFontMatch.figmaName, fontSize)}px), ${Math.round(descFontMatch.deltaPx * 100) / 100}px off — no exact type-scale token.`);
    }

    const gapClass = classes.find((cls) => /^gap-\d/.test(cls));
    if (gapClass) {
      disclosures.push(`Size ${label}: ${gapClass} (the space between Item's media, content and actions parts) isn't modeled — this Figma Item has only the one text section.`);
    }
    const contextual = classes.filter((cls) => cls.startsWith("in-data-"));
    if (contextual.length > 0) {
      disclosures.push(`Size ${label}: ${contextual.join(" ")} (a rule that only applies when the Item sits inside another component) isn't modeled.`);
    }
    const descSet = new Set(descriptionBySize[sizeName] ?? []);
    const otherSizeClasses = (allBySize[sizeName] ?? []).filter((cls) => !descSet.has(cls));
    if (otherSizeClasses.length > 0) {
      disclosures.push(`Size ${label}: this size also applies ${otherSizeClasses.join(", ")} to Item's inner parts (media image / content spacing) — not modeled, since this Figma Item has only the Title and Description text.`);
    }

    options.push({
      name: label,
      overrides: {
        sectionGapVariable: padYMatch.figmaName,
        sections: buildSections(padXMatch.figmaName, descFontMatch.figmaName),
      },
    });
  }

  if (options.length === 0) {
    notes.push("Item: no size in the vendored `size` axis had readable px/py padding, so no Size property was built — Item stays one size.");
    return undefined;
  }

  disclosures.push(...describeIdenticalOptions("Size", options));
  if (skippedOptions.length > 0) {
    disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  }
  for (const line of disclosures) notes.push(`Item ${line}`);

  return { propertyName: "Size", options, skippedOptions, disclosures };
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
// Marker's `separator` and `border` variants (component-variations plan,
// Batch 8, 2026-10-08), added to the EXISTING `Variant` list (the cva axis is
// named `variant`, so Figma's `Variant=Default/Separator/Border` is the natural
// fit; an extraAxes Style would have produced two competing "variant"
// properties). `Default` is built by the caller, byte-identical to before. The
// real classes (read below, never invented):
//   separator: `before:mr-1 before:h-px before:min-w-0 before:flex-1
//     before:bg-border after:ml-1 after:h-px after:min-w-0 after:flex-1
//     after:bg-border` — two 1px border.default hairlines (pseudo-elements that
//     are flex children, so the base `gap-2` applies too) flanking the label;
//     gap label-to-line = gap-2 + mr-1/ml-1 = 12px. -> `flankLines`.
//   border: `border-b border-border pb-2` — a 1px bottom rule in border.default
//     plus 8px bottom padding. -> `strokeVariable` + `strokeSides: "bottom"` +
//     `paddingBottomVariable`.
// An option whose classes don't fit either shape becomes a `skippedVariants`
// entry with the reason, never an approximation.
function buildMarkerStyleVariants(
  entries: Array<[string, string]>,
  baseClassString: string,
  baseColors: { textVariable: string },
  spacing: Record<string, number>,
  disclosures: string[],
): { variants: FigmaComponentVariantPlanItem[]; skippedVariants: Array<{ name: string; reason: string }> } {
  const variants: FigmaComponentVariantPlanItem[] = [];
  const skippedVariants: Array<{ name: string; reason: string }> = [];
  const baseGapClass = baseClassString.split(/\s+/).find((t) => /^gap-\d+(?:\.\d+)?$/.test(t));
  const baseGapPx = baseGapClass ? tailwindClassPx(baseGapClass) : 0;
  const marginPx = (cls: string | undefined): number | null => {
    const m = cls?.match(/^m[rl]-(\d+(?:\.\d+)?)$/);
    return m ? parseFloat(m[1]) * 4 : null;
  };

  for (const [name, classString] of entries) {
    if (classString === "") continue; // `default`: the caller builds it
    const label = capitalize(name);
    const tokens = classString.split(/\s+/).filter(Boolean);
    const before = tokens.filter((t) => t.startsWith("before:")).map((t) => t.slice("before:".length));
    const after = tokens.filter((t) => t.startsWith("after:")).map((t) => t.slice("after:".length));

    if (before.length > 0 || after.length > 0) {
      // Flanking-lines shape.
      const side = (classes: string[]) => ({
        color: classes.map((c) => classToFigmaVariable(c)).find((r) => r !== null && r.kind === "fill") ?? null,
        height: classes.find((c) => c === "h-px" || /^h-\d+(?:\.\d+)?$/.test(c)),
        margin: classes.find((c) => /^m[rl]-\d+(?:\.\d+)?$/.test(c)),
      });
      const b = side(before);
      const a = side(after);
      const thicknessOf = (h: string | undefined) => (h === "h-px" ? 1 : h ? tailwindClassPx(h) : null);
      const bThick = thicknessOf(b.height);
      const aThick = thicknessOf(a.height);
      const bMargin = marginPx(b.margin);
      const aMargin = marginPx(a.margin);
      if (!b.color || !a.color || bThick === null || aThick === null || bMargin === null || aMargin === null) {
        skippedVariants.push({ name: label, reason: "its before:/after: lines don't match the expected pair of `bg-<color>` + `h-px`/`h-N` + `mr-N`/`ml-N` classes, so the flanking lines can't be derived without guessing" });
        continue;
      }
      if (b.color.variable !== a.color.variable || bThick !== aThick || bMargin !== aMargin) {
        skippedVariants.push({ name: label, reason: "its before: and after: lines differ in colour, thickness or margin, but Figma's flanking pair is symmetrical, so it can't be represented without picking one side" });
        continue;
      }
      const gapMatch = nearestToken((baseGapPx ?? 0) + bMargin, spacing, "spacing");
      const isHandled = (c: string) => c === "flex-1" || c === "min-w-0" || c === "h-px" || /^h-\d+(?:\.\d+)?$/.test(c) || /^m[rl]-\d+(?:\.\d+)?$/.test(c) || classToFigmaVariable(c)?.kind === "fill";
      const unmodeled = [...before.filter((c) => !isHandled(c)).map((c) => `before:${c}`), ...after.filter((c) => !isHandled(c)).map((c) => `after:${c}`)];
      variants.push({
        name: label,
        textVariable: baseColors.textVariable,
        underline: false,
        flankLines: { colorVariable: b.color.variable, thicknessPx: bThick, representativeLengthPx: 80, gapVariable: gapMatch.figmaName },
      });
      disclosures.push(`Variant ${label}: the two real ${bThick}px ${b.color.variable} lines (before:/after: pseudo-elements) flank the label with a ${(baseGapPx ?? 0) + bMargin}px gap (gap-2 plus the line's own margin), bound to ${gapMatch.figmaName}${gapMatch.deltaPx > 0 ? ` (${gapMatch.deltaPx}px off the real value)` : ""}.`);
      disclosures.push(`Variant ${label}: the real lines have flex-1 and stretch to fill the Marker's full width, which has no fixed value, so Figma uses two 80px stand-in lines (not a real default length) and the Marker hugs its content instead of being full-width. The ${bThick}px thickness is a raw literal, not a spacing token (no spacing token is that thin).`);
      if (unmodeled.length > 0) disclosures.push(`Variant ${label}: these real classes aren't modeled: ${unmodeled.join(" ")}.`);
      continue;
    }

    // Bottom-rule shape.
    const hasBottomBorder = tokens.includes("border-b");
    const stroke = tokens.map((t) => classToFigmaVariable(t)).find((r) => r !== null && r.kind === "border") ?? null;
    if (!hasBottomBorder || !stroke) {
      skippedVariants.push({ name: label, reason: "its classes are neither the expected pair of before:/after: lines nor a `border-b` + `border-<color>` bottom rule, so how it differs from Default can't be derived without guessing" });
      continue;
    }
    const pbClass = tokens.find((t) => /^pb-\d+(?:\.\d+)?$/.test(t));
    const pbPx = pbClass ? parseFloat(pbClass.slice(3)) * 4 : null;
    const pbMatch = pbPx !== null ? nearestToken(pbPx, spacing, "spacing") : null;
    const unmodeled = tokens.filter((t) => t !== "border-b" && t !== pbClass && classToFigmaVariable(t)?.kind !== "border");
    variants.push({
      name: label,
      textVariable: baseColors.textVariable,
      strokeVariable: stroke.variable,
      strokeSides: "bottom",
      strokeWeightPx: 1,
      underline: false,
      ...(pbMatch ? { paddingBottomVariable: pbMatch.figmaName } : {}),
    });
    disclosures.push(`Variant ${label}: the real 1px bottom rule (border-b ${tokens.find((t) => classToFigmaVariable(t)?.kind === "border")} → ${stroke.variable}) is drawn as a 1px stroke on the bottom edge only${pbMatch ? `, with ${pbClass} (${pbPx}px) as bottom padding bound to ${pbMatch.figmaName}${pbMatch.deltaPx > 0 ? ` (${pbMatch.deltaPx}px off the real value)` : ""}` : ""}. The 1px weight is a raw literal, not a spacing token (no spacing token is that thin), and the Figma Marker hugs its text, so the rule is only as wide as the text (the real Marker is full-width). The stroke also adds 1px to this variant's height (a stroke counts toward an auto-layout frame's size).`);
    if (unmodeled.length > 0) disclosures.push(`Variant ${label}: these real classes aren't modeled: ${unmodeled.join(" ")}.`);
  }
  return { variants, skippedVariants };
}

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
  // Batch 8 (component-variations plan, 2026-10-08): the cva axis is no longer
  // ignored. `Default` stays the colorless box above (byte-identical); the
  // Separator and Border variants are built from their real classes (see
  // `buildMarkerStyleVariants`), anything unreadable lands in `skippedVariants`.
  const disclosures: string[] = [];
  const styled = buildMarkerStyleVariants(variantEntries, classMatch[1], colors, spacing, disclosures);
  for (const skipped of styled.skippedVariants) disclosures.push(`Variant ${skipped.name} was not built: ${skipped.reason}.`);
  disclosures.push("Variants (all): the real Marker is full-width (w-full, min-h-4); the Figma Marker hugs its text in every variant.");
  notes.push("Marker: the Default variant is a single colorless box (its real `default` option is an empty no-op); the real `separator` and `border` options are modeled as the Separator and Border variants (see buildMarkerStyleVariants), not ignored as before.");
  for (const line of disclosures) notes.push(`Marker ${line}`);
  // Batch 15 triage: no State property (see the disclosure line); appended to the existing disclosures.
  const markerLinkHover = classesInSource(markerSource, ["[a]:hover:text-foreground", "*:[a]:hover:text-foreground"]);
  if (markerLinkHover.length > 0) {
    disclosures.push(...skippedStatesDisclosure("Marker", [
      `States (not built): no State property was built. The only hover classes in the real Marker are ${markerLinkHover.join(" and ")}: they apply only when the Marker itself is rendered as a link (an <a>, which the real source also underlines at rest with [a]:underline) or when a link sits inside MarkerContent. The Figma Marker is plain text, not a link, so there is no state to change. The real Marker has no focus-visible:, disabled:, aria-invalid: or aria-pressed: class.`,
    ], notes));
  }
  notes.push("Marker: has no padding or radius class of its own in its real source (confirmed: no `rounded-*` class anywhere in the file, and no padding class outside the `border` option's own `pb-2`, which only the Border variant carries, as bottom padding) — Default is a bare text node (0px padding, radius/none), the same real finding and treatment already established for Label.");

  return {
    name: "Marker",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false }, ...styled.variants],
    skippedVariants: styled.skippedVariants,
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Marker",
    ...(disclosures.length > 0 ? { disclosures } : {}),
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
// Bubble's `Clickable` axis + States (2026-10-13, user decision). The real Bubble's hover and focus classes
// apply ONLY when BubbleContent is rendered as a <button> or an <a> (written `[&>[data-slot=bubble-content]:is(button,a):hover]:`
// in each variant and `[button,a]:focus-visible:` on BubbleContent), so a clickable bubble is not visibly different
// at rest: it only differs in its states. Clickable = Default (a plain bubble) / Clickable (button or link content);
// State = Default, Hover, Focus on every Variant; the plain bubble ignores Hover and Focus (built identical to rest).
// The shared reader (`buildStatesForVariants`) is fed a SYNTHETIC cva source in which those classes are rewritten as
// the ordinary `hover:` / `focus-visible:` prefixes, so every existing rule applies unchanged (fade-token swaps for
// `bg-primary/80` and the ring tokens, the arbitrary-value drop, the rest-fill consistency rule). Destructive's
// Hover uses the same user decision as Button and Badge. Muted's hover is an arbitrary `color-mix` value: it is
// dropped (Hover identical to rest) until the user picks a solid token from the comparison page.
function buildBubbleClickable(
  bubbleSource: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): { built: boolean; axes: FigmaComponentAxisPlanItem[]; disclosures: string[] } {
  const none = { built: false, axes: [], disclosures: [] as string[] };
  const HOVER_PREFIX = "[&>[data-slot=bubble-content]:is(button,a):hover]:";
  const FOCUS_PREFIX = "[button,a]:focus-visible:";
  let entries: Array<[string, string]>;
  try { entries = parseCvaAxis(bubbleSource, "variant"); } catch { return none; }
  const contentClasses = bubbleSource.match(/function BubbleContent[\s\S]*?cn\(\s*"([^"]+)"/)?.[1] ?? "";
  const focusTokens = contentClasses.split(/\s+/).filter((t) => t.startsWith(FOCUS_PREFIX));
  const hoverCount = entries.reduce((n, [, cls]) => n + cls.split(/\s+/).filter((t) => t.startsWith(HOVER_PREFIX)).length, 0);
  if (hoverCount === 0 && focusTokens.length === 0) return none;

  const synthEntries = entries.map(([key, cls]) => `        ${key}: "${cls.split(/\s+/).filter((t) => t.startsWith(HOVER_PREFIX)).map((t) => "hover:" + t.slice(HOVER_PREFIX.length)).join(" ")}",`).join("\n");
  const synth = `cva("${focusTokens.map((t) => "focus-visible:" + t.slice(FOCUS_PREFIX.length)).join(" ")}", {\n  variants: {\n    variant: {\n${synthEntries}\n    },\n  },\n})`;

  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus"];
  // Destructive Hover: the same user decision as Button and Badge (the real /20 tint over a /10 rest is drawn with
  // the existing tokens status/error-bg + status/error), applied only when the real class is there.
  const destructiveHover = entries.find(([k]) => k === "destructive")?.[1].split(/\s+/).find((t) => t.startsWith(HOVER_PREFIX) && /bg-destructive\/\d+$/.test(t));
  const stateOverrides: Record<string, { item: Omit<FigmaComponentStatePlanItem, "name">; note: string }> = {};
  if (variants.some((v) => v.name === "Destructive") && destructiveHover) {
    stateOverrides["Destructive/Hover"] = {
      item: { fillVariable: sdsgtPathToFigmaName("status.error-bg"), textVariable: sdsgtPathToFigmaName("status.error") },
      note: `drawn with the existing tokens ${sdsgtPathToFigmaName("status.error-bg")} (a pale red tint) as the fill and ${sdsgtPathToFigmaName("status.error")} (the saturated red) as the text colour, same decision as Button's and Badge's Destructive Hover. The real class is ${destructiveHover.slice(HOVER_PREFIX.length)}: a 20% red tint over the 10% red tint of the rest look, which this plan cannot copy because the rest is drawn as a solid red fill; so this is a deliberate token-based approximation, not the exact browser colour`,
    };
  }
  const stateDisclosures = buildStatesForVariants(synth, "variant", variants, stateNames, Object.keys(stateOverrides).length > 0 ? stateOverrides : undefined);
  if (!variants.some((v) => v.states && v.states.length > 0)) return none;

  // Muted's arbitrary-value hover: say plainly that it is pending, not that "the source has no hover classes".
  for (const v of variants) {
    for (const sk of v.skippedStates ?? []) {
      if (sk.name === "Hover" && sk.reason.includes("arbitrary Tailwind value")) {
        const cls = sk.reason.match(/real class '([^']+)'/)?.[1] ?? "its hover class";
        sk.reason = `renders identical to Default by the user's decision (2026-10-13): the real hover is ${cls} (a color-mix of the rest fill with 5% of the text color), an arbitrary value with no design token to bind to; the nearest solid token to it is the rest step itself (neutral.200 in light mode, neutral.1000 in dark mode: only about 19 and 15 RGB units from the real hover), so no visible hover change is drawn`;
      }
    }
  }
  const stateDisclosuresFinal = stateDisclosures.map((line) => {
    const m = line.match(/^(State \S+ \/ Hover): .*arbitrary Tailwind value/);
    return m ? `${m[1]}: renders identical to Default by the user's decision (2026-10-13): the real hover is an arbitrary color-mix value with no design token to bind to, and the nearest solid token to it is the rest step itself (neutral.200 in light mode, neutral.1000 in dark mode; the real hover is only about 19 and 15 RGB units from rest), so no visible hover change is drawn.` : line;
  });

  const disclosures: string[] = [];
  disclosures.push("Clickable: Default is the plain bubble (its content is text). Clickable is a bubble whose content is a button or a link (BubbleContent rendered as <button> or <a>). At rest the two look the same; the real hover and focus classes apply only to the Clickable one.");
  disclosures.push(...buildCommonStateDisclosures(synth, variants, stateNames, { hasSizeAxis: false, prefixLabels: { Hover: HOVER_PREFIX, Focus: FOCUS_PREFIX } }));
  disclosures.push(`States: every Variant also comes in State Default, Hover and Focus. The real classes are written ${HOVER_PREFIX} (Hover, per variant) and ${FOCUS_PREFIX} (Focus, on BubbleContent); they are read here as ordinary hover: and focus-visible: classes. On Clickable=Default (a plain bubble) Hover and Focus are built identical to the rest look so every combination has the same State values: the real plain bubble has no hover or focus look.`);
  disclosures.push("States: Muted's real hover is color-mix(in oklch, var(--muted), var(--foreground) 5%), an arbitrary value with no design token. Solid tokens were compared on a page (2026-10-13) and the nearest is the rest step itself, so by the user's decision Muted / Hover is drawn identical to its rest look. Secondary and Tinted are not built as variants at all (no secondary colour; Tinted's colours are oklch calculations with no token), so they have no states either.");
  disclosures.push(...stateDisclosuresFinal);
  for (const line of disclosures) notes.push(`Bubble ${line}`);

  const axis: FigmaComponentAxisPlanItem = {
    propertyName: "Clickable",
    options: [
      { name: "Default", overrides: { ignoreStates: ["Hover", "Focus"] } },
      { name: "Clickable", overrides: {} },
    ],
    skippedOptions: [],
    disclosures: [],
  };
  return { built: true, axes: [axis], disclosures };
}

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
  const radiusTarget = shadcnRadiusPx(radius, "xl");
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
  notes.push("Bubble (Batch 10 check, 2026-10-09, no states built): Bubble has no `link` variant, so the Link underline-at-rest gap does not apply. Its real `destructive` variant DOES share the Button/Badge Destructive gap: the real hover is `[&>[data-slot=bubble-content]:is(button,a):hover]:bg-destructive/20` (a 20% tint over a 10% tint, only when the bubble content is a button or link), while this plan draws the rest as a solid status.error fill. If Bubble states are ever built, apply the same Destructive Hover decision as Button and Badge (fill status/error-bg, text status/error) rather than reading the class literally, which would render identical to rest. Bubble's other variants' hover classes (`bg-primary/80`, `bg-muted`, `color-mix(...)`) use a selector this plan's state reader does not read, so none of them is modeled today.");
  notes.push("Bubble: its real `destructive` variant's `bg-destructive/10` (a translucent 10% tint) is represented as a SOLID status.error fill, same opacity-drop simplification already documented for Badge's and Item's own destructive/muted variants — confirmed via a live browser check that the real rendered color is a light translucent tint, not the solid color this plan binds.");

  // Batch 15 triage: no State property (see the disclosure lines). The hover and focus classes are read
  // out of the real source token by token, so only classes that really exist are named.
  const bubbleClickable = buildBubbleClickable(bubbleSource, variants, notes);
  const bubbleTokens = [...new Set(bubbleSource.split(/[\s"'`]+/).filter(Boolean))];
  const bubbleHover = bubbleTokens.filter((t) => t.startsWith("[&>[data-slot=bubble-content]:is(button,a):hover]:"));
  const bubbleFocus = bubbleTokens.filter((t) => t.startsWith("[button,a]:focus-visible:"));
  const bubbleSkipLines: string[] = [];
  if (!bubbleClickable.built && (bubbleHover.length > 0 || bubbleFocus.length > 0)) {
    bubbleSkipLines.push("States (not built): no State property was built for Bubble. Every hover and focus class in the real source applies only when BubbleContent is rendered as a <button> or an <a> (an interactive bubble, written in the source as :is(button,a) / [button,a]); the Figma Bubble is the plain, non-interactive bubble, and the real source has no disabled:, aria-invalid: or aria-pressed: class.");
    if (bubbleHover.length > 0) {
      bubbleSkipLines.push(`States (not built): the real hover classes on the bubble's content are ${bubbleHover.join(" ")}. Three of the seven variants could be drawn from them (default: bg-primary/80, which has the solid token action.primary-hover-soft; outline and ghost: bg-muted, a solid token), but secondary, muted and tinted use color-mix(...) / oklch(from ...) arbitrary values with no token, and destructive uses a translucent bg-destructive/20 (a bound fill's transparency is lost on Figma instances). A half-built Hover (3 variants visibly changing, 4 identical) was judged more confusing than useful, so none is built.`);
    }
    if (bubbleFocus.length > 0) {
      bubbleSkipLines.push(`States (not built): the real focus classes are ${bubbleFocus.join(" ")} (a focus-colored border plus a 3px ring, on the bubble content, only for a button or link bubble).`);
    }
  }
  const bubbleSkipDisclosures = bubbleSkipLines.length > 0 ? skippedStatesDisclosure("Bubble", bubbleSkipLines, notes) : [];

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
    ...(bubbleClickable.built ? { extraAxes: bubbleClickable.axes, statePropertyName: "State" as const, disclosures: bubbleClickable.disclosures } : {}),
    ...(!bubbleClickable.built && bubbleSkipDisclosures.length > 0 ? { disclosures: bubbleSkipDisclosures } : {}),
  };
}

// Twenty-first real component, added 2026-09-22 — "Batch 11" of
// figma-remaining-components-plan.md, and the first component using the
// new `bar` shape (see `FigmaComponentBarPlanItem`'s own comment for the
// full real-source derivation and reasoning). Real current source
// (`progress.tsx`, confirmed against a real vendored `shadcn add --all`
// project, `@base-ui/react/progress`-based): only `ProgressTrack` and
// `ProgressIndicator` are modeled — `ProgressLabel`/`ProgressValue` (a
// real optional text pair, e.g. "Uploading…" / "60%") aren't, the same
// "modeled subset of a real multi-part component" disclosure Card's own
// CardFooter and Avatar's own AvatarImage already established.
function buildProgressPlan(tokensCss: string, progressSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ['data-slot="progress-track"', 'data-slot="progress-indicator"', "rounded-full", "bg-muted", "bg-primary", "h-full"]) {
    if (!progressSource.includes(marker)) {
      throw new Error(`Progress's real source no longer contains "${marker}" — shadcn/ui's real Progress has likely changed shape since buildProgressPlan was written. Re-verify against the current vendored progress.tsx before trusting this plan.`);
    }
  }

  const trackMatch = progressSource.match(/function ProgressTrack[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!trackMatch) throw new Error("Could not find ProgressTrack's own className string — real vendored source may have changed shape since this parser was written.");
  const indicatorMatch = progressSource.match(/function ProgressIndicator[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!indicatorMatch) throw new Error("Could not find ProgressIndicator's own className string — real vendored source may have changed shape since this parser was written.");

  const trackColors = scanClassesForColors(trackMatch[1]);
  if (!trackColors.fillVariable) throw new Error("ProgressTrack's own bg-muted class didn't resolve to a fill variable — real vendored source may have changed shape since this parser was written.");
  const indicatorColors = scanClassesForColors(indicatorMatch[1]);
  if (!indicatorColors.fillVariable) throw new Error("ProgressIndicator's own bg-primary class didn't resolve to a fill variable — real vendored source may have changed shape since this parser was written.");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");

  const radiusMatch = exactRadiusFull(radius); // real rounded-lg -> a real EXACT alias to radius.full, same discipline as Avatar's own case
  const heightMatch = nearestToken(4, spacing, "spacing"); // real h-1
  if (heightMatch.deltaPx > 0) {
    notes.push(`Progress height: nearest real spacing token is ${heightMatch.deltaPx}px off shadcn's own exact Tailwind value (h-1, 4px).`);
  }

  notes.push("Progress: only ProgressTrack/ProgressIndicator are modeled — ProgressLabel/ProgressValue (a real optional text pair, e.g. a percentage readout) aren't, the same disclosed scope cut as Card's own CardFooter.");
  notes.push("Progress: its real indicator width is set via an inline style keyed to a runtime value/max prop, not a class — there is no real static default to read, so this plan uses a disclosed representative footprint (a 240px track, 60% filled) rather than a fabricated 'real' default. See FigmaComponentBarPlanItem's own comment for why this is a different category of gap than every other numeric target in this file.");
  notes.push("Progress: the indicator's real rounded LEFT edge comes entirely from the track's own overflow-x-hidden clip in a real browser, not a rounded-* class on the indicator itself (which has none) — replayed as a square indicator rectangle inside a clipsContent track, not a second independent radius binding, which would incorrectly round the indicator's right edge too whenever the fill is under 100%.");

  return {
    name: "Progress",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", underline: false }], // no real fill/text/stroke of its own at this level — see `bar` instead
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName, // mirrors bar.radiusVariable — interface-shape parity only, same precedent `line` already established
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    bar: {
      trackColorVariable: trackColors.fillVariable,
      indicatorColorVariable: indicatorColors.fillVariable,
      widthPx: 240,
      representativeFillFraction: 0.6,
      radiusVariable: radiusMatch.figmaName,
      heightVariable: heightMatch.figmaName,
    },
  };
}

// Real, confirmed formula behind every `rounded-md` class in this
// pipeline's own real vendored source, found while scoping Tabs/Tooltip
// (2026-09-22, "Batch 12"): grepping a real generated `globals.css` shows
// `--radius-md: calc(var(--radius) * 0.8)` — a MULTIPLIER off `--radius`
// (this pipeline's own `radius.md`), the exact same category of formula
// already established for Bubble's own `rounded-xl` (`* 1.4`, see
// `buildBubblePlan`'s own comment) and Card's `rounded-xl` — never a
// direct alias the way `rounded-lg` is (`exactRadiusLg`, `* 1.0`). Every
// `rounded-md` class in this file before Batch 12 (Tabs' own
// TabsTrigger, Tooltip's own TooltipContent) is new territory — no
// earlier component used `rounded-md` specifically, only `rounded-lg`
// (exact alias) and `rounded-xl` (a different multiplier, 1.4×). Kept as
// an inline `nearestToken(shadcnRadiusPx(radius, "md"), ...)` call at each of the two
// real call sites rather than a third named `exactRadius*` helper — this
// IS a `nearestToken` search (the multiplier only changes the TARGET fed
// into it, unlike `exactRadiusLg`'s genuinely-exact, delta-always-0
// alias) — extracting a one-line arithmetic expression into its own
// function would add a name to track without saving anything real.

// Twenty-second real component, added 2026-09-22 — "Batch 12" of
// figma-remaining-components-plan.md, and the first of its three
// components. Real current source (`tabs.tsx`, confirmed against a real
// vendored `shadcn add --all` project, `@base-ui/react/tabs`-based) has
// NO `cva()` at all for `TabsTrigger` (unlike Button/Badge/Toggle/Alert/
// Item/Bubble) — its real active/inactive axis instead lives on a single
// className string, gated by a bare `data-active:` PSEUDO-CLASS prefix
// (Base UI's own boolean-attribute convention: `[data-active]`, no
// bracketed `key=value` pair at all) — a genuinely different shape from
// Batch 9's own `data-[key=value]:`/`*:data-[key=value]:` stripping
// (`SELECTOR_PREFIX_PATTERN`), which requires brackets and would NOT
// strip this. Rather than generalize the shared pattern for a single
// caller, `buildTabsPlan` does its own narrow, local extraction (below) —
// consistent with this file's own "one path only" scope discipline
// (e.g. Breadcrumb's `separatorGlyph` is component-specific, not a table
// change) — since nothing else in this file needs a bare, unbracketed
// `data-<word>:` prefix stripped yet.
//
// A second genuinely new extraction shape, also confirmed by reading the
// real source in full (this batch's own mandatory first step, since the
// original survey never quoted these three files' real class strings):
// `TabsTrigger`'s own `className={cn(...)}` call passes FOUR separate
// string literals, not one (every earlier component's `cn()` call passed
// exactly one class string plus the `className` prop) — `readTabsTriggerClassString`
// below concatenates all of them before doing any parsing, a strict
// generalization of "read the first quoted string" that still reads
// exactly one string for every earlier single-literal caller.
//
// Modeled per the user's own decision (figma-remaining-components-plan.md,
// Batch 12): only `TabsTrigger` itself, as a manual two-option "Active"/
// "Inactive" variant axis (never routed through `buildVariantsFromCva`,
// since there's no real `cva()` here to parse) — the same real shape
// Toggle's own on/off state has, but built by hand since Tabs has no
// `variants: { ... }` block to extract from. Real BASE (inactive) classes
// (every unprefixed token in the combined string): `... rounded-md ...
// px-1.5 py-0.5 text-sm font-medium ... text-foreground/60 ...` — no
// `bg-*` class at all (transparent), `border-transparent` (no visible
// stroke). Real ACTIVE-only classes (tokens with the bare `data-active:`
// prefix stripped, ignoring `dark:data-active:`/`group-data-[variant=
// line]/tabs-list:data-active:`-scoped overrides — the same "ignore dark:
// and non-default-variant paths" scope cut this pipeline applies
// everywhere, not something new to Tabs): `bg-background` /
// `text-foreground` — a real filled-white-pill-on-gray-track look,
// confirmed against source, not assumed from Base UI convention.
// `text-foreground/60`'s own `/60` opacity modifier is dropped per this
// file's existing, established simplification (same as Badge's
// `bg-destructive/10`) — meaning Active and Inactive end up with the
// SAME bound `text.primary`, not a genuinely lighter/darker pair the way
// the real component shows; disclosed explicitly below, not silently
// passed through. `TabsList`'s own wrapping pill container (its real
// `p-[3px]` padding, `bg-muted` track) isn't modeled — only the trigger
// itself, the same "model the meaningful sub-part, not the whole
// compound wrapper" precedent Avatar's own AvatarFallback-only scope and
// Marker's ignored-variant-axis reframing already established.
function readTabsTriggerClassString(tabsSource: string): string {
  const fnMatch = tabsSource.match(/function TabsTrigger[\s\S]*?className=\{cn\(([\s\S]*?)\)\}/);
  if (!fnMatch) throw new Error("Could not find TabsTrigger's own className={cn(...)} call — real vendored source may have changed shape since this parser was written.");
  const literals = [...fnMatch[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (literals.length === 0) throw new Error("TabsTrigger's own className={cn(...)} call contained no quoted string literals — real vendored source may have changed shape since this parser was written.");
  return literals.join(" ");
}
// Tabs' `Style` axis (component-variations plan, Batch 8, 2026-10-08): the
// real `tabsListVariants` cva `variant` axis (default / line). It lives on
// TabsList, which this plan does not model, so each style's effect on the
// TRIGGER comes from the trigger's own `group-data-[variant=<style>]/tabs-list:`
// prefixed classes (read below, never invented):
//   default: `group-data-[variant=default]/tabs-list:data-active:shadow-sm`
//   line:    `...[variant=line]/tabs-list:bg-transparent` (inactive trigger,
//            already transparent), `...:data-active:bg-transparent` (active
//            trigger loses the filled pill), `...:data-active:shadow-none`, and
//            `...:data-active:after:opacity-100` which turns on the trigger's
//            `after:` pseudo-element (`after:bg-foreground`, `h-0.5`,
//            `bottom-[-5px]`, full width): a 2px foreground bar just under the
//            active tab, the classic underline-tab indicator.
// Default reproduces today's Tabs exactly (empty overrides). Line is a
// `variantOverrides` entry per variant keyed by the existing names
// ("Inactive"/"Active"): Active drops its fill and gains a BOTTOM-EDGE stroke
// (`strokeSides: "bottom"`, `strokeWeightPx` from `h-0.5`, colored by
// `after:bg-foreground`). Why a stroke and not a child bar: Figma's per-side
// stroke weights make this a small additive change to the existing frame
// (no new node, stays bound to a color variable), but it is the NEAREST
// representable look, not an exact one: the real bar is a separate element that
// sits 3-5px BELOW the tab and spans the tab's inner width, while the Figma
// stroke is flush on the tab's own bottom edge across its full width. That is
// disclosed on the axis (and so in the Figma set description).
function buildTabsStyleAxis(tabsSource: string, triggerTokens: string[], baseInactive: FigmaComponentVariantPlanItem, baseActive: FigmaComponentVariantPlanItem, notes: string[]): FigmaComponentAxisPlanItem[] {
  let entries: Array<[string, string]>;
  try {
    entries = parseCvaAxis(tabsSource, "variant");
  } catch {
    notes.push("Tabs: no `variant` axis was found in the vendored tabsListVariants, so no Style property was built — Tabs stays the one (Default) style (real vendored source may have changed shape).");
    return [];
  }
  if (entries.length === 0) {
    notes.push("Tabs: the vendored tabsListVariants `variant` axis has no options, so no Style property was built.");
    return [];
  }

  // The base TabsList class string (the first quoted string of the cva call),
  // for the list-level `data-[variant=X]:` classes the disclosures name.
  const listBase = tabsSource.match(/tabsListVariants\s*=\s*cva\(\s*"([^"]+)"/)?.[1] ?? "";
  const listBaseTokens = listBase.split(/\s+/).filter(Boolean);

  // The active indicator bar, from the trigger's unconditional `after:` classes.
  const barColorClass = triggerTokens.find((t) => /^after:bg-[a-z-]+$/.test(t));
  const barColor = barColorClass ? classToFigmaVariable(barColorClass.slice("after:".length)) : null;
  const barHeightClass = triggerTokens.find((t) => /^group-data-horizontal\/tabs:after:h-\d+(?:\.\d+)?$/.test(t));
  const barHeightPx = barHeightClass ? tailwindClassPx(barHeightClass.slice(barHeightClass.lastIndexOf(":") + 1)) : null;
  const barBottomClass = triggerTokens.find((t) => /^group-data-horizontal\/tabs:after:bottom-\[-?\d+px\]$/.test(t));
  const barBottomPx = barBottomClass ? parseInt(barBottomClass.match(/\[(-?\d+)px\]/)![1], 10) : null;

  const options: FigmaComponentAxisPlanItem["options"] = [];
  const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const disclosures: string[] = [];
  const merged: Array<{ label: string; byVariant: Record<string, string> }> = []; // each option's finished per-variant look, for the "identical to Default" check

  for (const [name] of entries) {
    const label = capitalize(name);
    const prefix = `group-data-[variant=${name}]/tabs-list:`;
    const own = triggerTokens.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
    const inactiveOverride: Partial<FigmaComponentVariantPlanItem> = {};
    const activeOverride: Partial<FigmaComponentVariantPlanItem> = {};
    const unmodeled: string[] = [];
    for (const cls of own) {
      if (cls === "bg-transparent") {
        if (baseInactive.fillVariable) inactiveOverride.fillVariable = "";
      } else if (cls === "data-active:bg-transparent") {
        if (baseActive.fillVariable) activeOverride.fillVariable = "";
      } else if (cls === "data-active:after:opacity-100") {
        if (barColor && barColor.kind === "fill" && barHeightPx !== null) {
          activeOverride.strokeVariable = barColor.variable;
          activeOverride.strokeSides = "bottom";
          activeOverride.strokeWeightPx = barHeightPx;
          disclosures.push(`Style ${label}: the real active tab's underline bar (${barColorClass} ${barHeightClass}${barBottomClass ? ` ${barBottomClass}` : ""}) is drawn as a ${barHeightPx}px stroke on the Active tab's bottom edge only, bound to ${barColor.variable}. This is the nearest look Figma's frame can show, not an exact copy: in the real component the bar is a separate element${barBottomPx !== null ? ` that sits ${Math.abs(barBottomPx) - barHeightPx} to ${Math.abs(barBottomPx)}px below the tab` : " that sits just below the tab"} and spans the tab's inner width (inside its 1px border), while the Figma stroke sits flush on the tab's own bottom edge across its full width, its ends follow the tab's rounded bottom corners (the real bar is straight), and it makes the Active tab 2px taller than the others (a stroke counts toward an auto-layout frame's size; the real bar is absolutely positioned and adds no height). Because the inactive tab's 60% text opacity is dropped (the file-wide opacity simplification), this bar is the only thing telling Active from Inactive in this style.`);
        } else {
          unmodeled.push(cls);
          disclosures.push(`Style ${label}: the real active tab shows an underline bar, but its colour/height classes (after:bg-*, group-data-horizontal/tabs:after:h-*) could not be read from the vendored source, so the bar is NOT drawn and Active shows no indicator.`);
        }
      } else {
        unmodeled.push(cls);
      }
    }
    if (unmodeled.length > 0) {
      disclosures.push(`Style ${label}: these real trigger classes aren't modeled: ${unmodeled.map((c) => `${prefix}${c}`).join(" ")}${unmodeled.some((c) => /shadow/.test(c)) ? " (the active tab's drop shadow isn't drawn in either style)" : ""}.`);
    }
    const listOwn = [
      ...entries.filter(([key]) => key === name).map(([, classes]) => classes).filter(Boolean),
      ...listBaseTokens.filter((t) => t.startsWith(`data-[variant=${name}]:`)),
    ].join(" ").trim();
    disclosures.push(`Style ${label}: the TabsList container is not modeled in either style, so ${listOwn ? `its own classes for this style (${listOwn}) don't appear` : "this style's list-level look doesn't appear"} — only the tab trigger is drawn.`);

    const variantOverrides: Record<string, Partial<FigmaComponentVariantPlanItem>> = {};
    if (Object.keys(inactiveOverride).length > 0) variantOverrides[baseInactive.name] = inactiveOverride;
    if (Object.keys(activeOverride).length > 0) variantOverrides[baseActive.name] = activeOverride;
    options.push({ name: label, overrides: Object.keys(variantOverrides).length > 0 ? { variantOverrides } : {} });
    merged.push({
      label,
      byVariant: {
        [baseInactive.name]: JSON.stringify({ ...baseInactive, ...inactiveOverride }),
        [baseActive.name]: JSON.stringify({ ...baseActive, ...activeOverride }),
      },
    });
  }

  // Per-variant look that comes out the same as the first style's (Line's
  // Inactive tab = Default's Inactive tab): all options are still built so the
  // Figma property values match the code's `variant` values.
  for (const m of merged.slice(1)) {
    for (const variantName of Object.keys(m.byVariant)) {
      if (m.byVariant[variantName] === merged[0].byVariant[variantName]) {
        disclosures.push(`Style ${m.label}: the ${variantName} tab renders identical to ${merged[0].label}'s ${variantName} tab in Figma (this style only changes the other tab's look) — still created so the Figma property values match the code's own values.`);
      }
    }
  }
  disclosures.push(...describeIdenticalOptions("Style", options));
  for (const line of disclosures) notes.push(`Tabs ${line}`);
  return [{ propertyName: "Style", options, skippedOptions, disclosures }];
}

function buildTabsPlan(tokensCss: string, tabsSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function TabsTrigger", "data-active:bg-background", "data-active:text-foreground", "rounded-md", "text-foreground/60"]) {
    if (!tabsSource.includes(marker)) {
      throw new Error(`Tabs's real source no longer contains "${marker}" — shadcn/ui's real Tabs has likely changed shape since buildTabsPlan was written. Re-verify against the current vendored tabs.tsx before trusting this plan.`);
    }
  }

  const fullClassString = readTabsTriggerClassString(tabsSource);
  const tokens = fullClassString.split(/\s+/).filter(Boolean);
  const baseClasses = tokens.filter((t) => !t.includes(":")).join(" ");
  const activeClasses = tokens
    .filter((t) => t.startsWith("data-active:"))
    .map((t) => t.slice("data-active:".length))
    .join(" ");

  const inactiveColors = scanClassesForColors(baseClasses);
  const activeColors = scanClassesForColors(activeClasses);
  // The Inactive tab's resting text as a solid token (see TAB_INACTIVE_TOKEN), when the project has it.
  const tabInactiveToken = baseClasses.split(/\s+/).includes("text-foreground/60") && projectHasToken(TAB_INACTIVE_TOKEN.cssVar);
  if (tabInactiveToken) inactiveColors.textVariable = sdsgtPathToFigmaName(TAB_INACTIVE_TOKEN.token);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(shadcnRadiusPx(radius, "md"), radius, "radius"); // real rounded-md: calc(var(--radius) * 0.8) — see this file's own comment above `COMPONENT_BUILDERS`
  const paddingHMatch = nearestToken(6, spacing, "spacing"); // real px-1.5
  const paddingVMatch = nearestToken(2, spacing, "spacing"); // real py-0.5
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // real text-sm

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0.01) {
      notes.push(`Tabs ${label}: nearest real token is ${match.deltaPx.toFixed(1)}px off shadcn's own exact Tailwind value.`);
    }
  }

  notes.push("Tabs: only TabsTrigger itself is modeled, as a manual Active/Inactive axis (there is no real cva() here to parse) — TabsList's own wrapping pill container (its real p-[3px] padding and bg-muted track) isn't modeled, the same 'meaningful sub-part only' scope Avatar's own AvatarFallback-only cut already established. Every dark:-scoped override is ignored entirely, not just its color-bearing parts — the same 'one path only' scope this file applies everywhere. The real TabsList 'line' variant is modeled as a Style axis (Default / Line) on the TRIGGER only (see buildTabsStyleAxis).");
  if (tabInactiveToken) {
    notes.push(`Tabs: the Inactive tab's resting text is the solid token ${sdsgtPathToFigmaName(TAB_INACTIVE_TOKEN.token)} (light neutral.700, dark neutral.200), chosen by the user (2026-10-13), instead of the real text-foreground/60 (text.primary at 60%, whose transparency is lost on Figma instances). In light mode neutral.700 matches that 60% blend exactly on the Default style's tab bar (background.secondary) and is 13 to 22 off (RGB distance) on the Line style over the page; in dark mode the real class is dark:text-muted-foreground (text.secondary = neutral.200), an exact match. This is an intended change to an existing rest value (the Inactive text was drawn at full text.primary before). Active stays text.primary, so Hover now visibly brightens an Inactive tab.`);
  } else notes.push("Tabs: Active and Inactive end up with the SAME bound text.primary, not a genuinely different pair — the real inactive state's own text-foreground/60 (60% opacity) is dropped per this file's existing opacity-modifier simplification (same as Badge's bg-destructive/10), so the one real visual difference this plan still carries is Active's own filled background.primary pill, not a text-color change.");

  const tabsVariants: FigmaComponentVariantPlanItem[] = [
    { name: "Inactive", fillVariable: inactiveColors.fillVariable, textVariable: inactiveColors.textVariable, strokeVariable: inactiveColors.strokeVariable, underline: false },
    { name: "Active", fillVariable: activeColors.fillVariable, textVariable: activeColors.textVariable, underline: false },
  ];
  const extraAxes = buildTabsStyleAxis(tabsSource, tokens, tabsVariants[0], tabsVariants[1], notes);
  // Batch 14: interaction states (Hover, Focus, Disabled) from the real trigger classes.
  const stateDisclosures = buildTabsStates(tabsSource, fullClassString, tabsVariants, extraAxes, notes);

  return {
    name: "Tabs",
    variantPropertyName: "Variant",
    variants: tabsVariants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Tab",
    ...(extraAxes.length > 0 ? { extraAxes } : {}),
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Batch 14 (component-variations plan, 2026-10-13): interaction States for Tabs. State = Default,
// Hover, Focus, Disabled (no Invalid, no Pressed: the real TabsTrigger has no `aria-invalid:` or
// `aria-pressed:` classes; "active" is the Active variant, not a state). Read from the trigger's
// concatenated class string (its several `cn()` literals) through `buildStatesForVariants`,
// with `aria-disabled:` added as a Disabled prefix (the real source writes the same
// `opacity-50` under both `disabled:` and `aria-disabled:`).
//
// Real values: Hover = `hover:text-foreground` (full-strength text). Focus =
// `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` (a 1px border
// plus a 3px ring; `focus-visible:outline-1 focus-visible:outline-ring` is not modeled and is
// listed as such in the state's `skippedStates`). Disabled = `disabled:opacity-50`.
//
// Compiled with the demo project's own Tailwind v4 (2026-10-13): `border-transparent` and
// `text-foreground/60` come BEFORE `focus-visible:border-ring` and `hover:text-foreground` in
// the CSS, so the state classes win; `data-active:text-foreground` (after the hover rule) is the
// same colour as the hover colour, so Hover cannot change an Active tab.
//
// ONE special case: Line style's Active tab draws its underline bar as a BOTTOM-EDGE stroke (Batch 8),
// and a Figma frame has only one stroke colour, so it cannot also show the focus border. The state's
// own `strokeSides: "all"` / `strokeWeightPx: 1` (laid on top of the Style override, a state wins over
// a Style tweak) makes Focus draw the real 1px focus border on all four sides INSTEAD of the bar while
// focused (disclosed). Default style's Active has no bar, so the same fields change nothing there.
//
// Writes the plan `notes` lines (prefixed `Tabs`) and returns the disclosure lines for the
// component's Figma description. Never throws; returns [] (and sets no `states`) if the real
// source has none of these classes.
function buildTabsStates(
  tabsSource: string,
  triggerClassString: string,
  variants: FigmaComponentVariantPlanItem[],
  extraAxes: FigmaComponentAxisPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus", "Disabled"];
  const allClasses = triggerClassString.split(/\s+/).filter(Boolean);
  const stateDisclosures = buildStatesForVariants(tabsSource, "variant", variants, stateNames, undefined, { Disabled: ["aria-disabled:"] }, triggerClassString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(tabsSource, variants, stateNames, { hasSizeAxis: false, singleClassString: triggerClassString, disabledPrefixes: ["disabled:", "aria-disabled:"] }));
  disclosures.push("States: every Variant and Style combination gets the same State values. There is no Invalid state and no Pressed state (the real TabsTrigger has no aria-invalid: or aria-pressed: classes; being the selected tab is the Active variant, not a state).");

  const hover = variants[0].states?.find((st) => st.name === "Hover");
  const hoverClass = allClasses.find((c) => c.startsWith("hover:"));
  if (hoverClass && hover) {
    const hoverSame = variants.every((v) => (v.skippedStates ?? []).some((sk) => sk.name === "Hover" && sk.reason.startsWith("renders identical to Default")));
    if (!hoverSame && hover?.textVariable) {
      disclosures.push(`States: Hover (the real ${hoverClass}) changes an Inactive tab's text from ${variants[0].textVariable} (the solid stand-in for the real text-foreground/60) to ${hover.textVariable} (full strength). On the Active tab Hover is identical to Default, because its text is already full strength (data-active:text-foreground).`);
    }
    if (hoverSame) {
      disclosures.push(`States: Hover (the real ${hoverClass}, text at full strength) renders identical to Default on every Variant and Style. The real inactive tab's rest text is text-foreground/60 (60% strength) and this plan already draws it at full strength (no transparency on a bound colour: it is lost on Figma instances), so there is nothing left for Hover to brighten, and the active tab's text is already text-foreground. Hover is still built so every Variant has the same State values.`);
    }
  }

  // Ring on fill-less tabs: the Inactive tab (both styles) and the Line style's Active tab have no fill at rest; the
  // push gives them the invisible ring fill (2026-10-14), see FILL_LESS_RING_DISCLOSURE.
  disclosures.push("States: the same applies to the Line style's Active tab (its fill is dropped, so it has no fill at rest either): it carries the same invisible ring fill, so the Focus ring shows on every Focus frame of both styles.");

  // The Line style's Active bar: the state border replaces it while focused.
  const barVariants = variants.filter((v) => extraAxes.some((axis) => axis.options.some((o) => o.overrides.variantOverrides?.[v.name]?.strokeSides === "bottom")));
  for (const v of barVariants) {
    const focus = v.states?.find((st) => st.name === "Focus");
    if (!focus?.strokeVariable) continue;
    focus.strokeSides = "all";
    focus.strokeWeightPx = 1;
    const reason = `in the Line style this tab's underline bar is drawn as a bottom-edge stroke, and a Figma frame has only one stroke colour, so while focused the bar is replaced by the real 1px focus border (${focus.strokeVariable}) on all four sides. The real tab shows both the border and the bar (the bar is a separate element); here the bar is hidden in the Line / ${v.name} / Focus frame (which is therefore 2px shorter than the Line / ${v.name} rest frame, since the bar's stroke no longer adds height). The Default style has no bar, so it is unaffected`;
    const existing = (v.skippedStates ?? []).find((sk) => sk.name === "Focus");
    v.skippedStates = [...(v.skippedStates ?? []).filter((sk) => sk.name !== "Focus"), { name: "Focus", reason: existing ? `${existing.reason}; ${reason}` : reason }];
    disclosures.push(`State ${v.name} / Focus: ${reason}.`);
  }

  const other = allClasses.filter((c) => ["transition-all", "transition-colors"].includes(c));
  if (other.length > 0) {
    disclosures.push(`States: ${other.join(" and ")} (the fade between states) is not modeled: Figma has no transitions.`);
  }
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`Tabs ${line}`);
  return disclosures;
}

// Twenty-third real component, added 2026-09-22 — "Batch 12" of
// figma-remaining-components-plan.md, second of three. Real current
// source (`accordion.tsx`, confirmed against the same real vendored
// project, `@base-ui/react/accordion`-based): `AccordionTrigger`'s own
// real classes are a SINGLE plain string (no `cva()`, no multi-literal
// `cn()` the way Tabs' own trigger has) — `group/accordion-trigger
// relative flex flex-1 items-start justify-between rounded-lg border
// border-transparent py-2.5 text-left text-sm font-medium ...` plus a
// real trailing chevron icon (`ChevronDownIcon`/`ChevronUpIcon`, swapped
// via a sibling `group-aria-expanded/accordion-trigger:hidden`/`:inline`
// pair, not a color-bearing class this parser would touch either way).
//
// Real, disclosed finding: NO explicit `text-*` color class anywhere on
// the trigger (falls back to `text.primary` via `scanClassesForColors`'s
// own default, the same base-layer-inheritance finding already confirmed
// for Label/Marker) and NO horizontal padding class at all — genuinely
// zero, not a gap, the same "computed via nearestToken(0, ...), not a
// hardcoded literal" discipline Label/Marker's own zero targets already
// established. `rounded-lg` binds via `exactRadiusLg` (a real EXACT
// alias, delta always 0) — the same, already-proven pattern Toggle/Badge/
// Input/Textarea/Card/Item all share, not the NEW `rounded-md` multiplier
// Tabs/Tooltip need.
//
// Real, disclosed scope cut, genuinely narrower than the plan's own
// "(chevron + label)" framing: the chevron itself is NOT represented as a
// second element in this component's own body. `sections`' own
// `textLineDirection: "horizontal"` branch (the mechanism that would let
// a trailing `separatorGlyph` sit beside a label on one row, the same way
// Breadcrumb's own chevron stand-in does) hardcodes its outer frame's
// horizontal padding to 0 — a real, correct choice for Breadcrumb's own
// shape (no root padding at all, only an item gap), but WRONG for
// Accordion's own real `py-2.5` vertical padding, which that branch has
// no field for at all. Stretching that mechanism for this one caller
// would either silently drop a real, confirmed padding value or require
// reinterpreting `sectionGapVariable`'s own meaning (Breadcrumb: gap
// between items; here: outer vertical padding) for a single-section,
// single-glyph case it was never designed around. Per this project's own
// disclosure policy (state real gaps precisely rather than force a
// mechanism into an awkward, half-fitting shape), this trigger is
// represented as a flat single-text box instead (Label/Marker's own
// shape) — real py-2.5 correctly bound via the normal
// `paddingVerticalVariable` path — with the chevron omitted entirely, the
// same disclosed-omission treatment Tooltip's own Arrow and Avatar's own
// AvatarImage already receive.
function buildAccordionPlan(tokensCss: string, accordionSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function AccordionTrigger", "rounded-lg", "py-2.5", "ChevronDownIcon"]) {
    if (!accordionSource.includes(marker)) {
      throw new Error(`Accordion's real source no longer contains "${marker}" — shadcn/ui's real Accordion has likely changed shape since buildAccordionPlan was written. Re-verify against the current vendored accordion.tsx before trusting this plan.`);
    }
  }

  const triggerMatch = accordionSource.match(/function AccordionTrigger[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!triggerMatch) throw new Error("Could not find AccordionTrigger's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(triggerMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = exactRadiusLg(radius); // real rounded-lg -> a real EXACT alias to radius.md, same discipline as Item/Toggle/Badge/Card
  const paddingHMatch = nearestToken(0, spacing, "spacing"); // genuinely no horizontal padding class of its own — see this function's own comment
  const paddingVMatch = nearestToken(10, spacing, "spacing"); // real py-2.5
  const fontSizeMatch = nearestToken(14, fontSize, "typography/primitive/fontSize"); // real text-sm

  if (paddingVMatch.deltaPx > 0) {
    notes.push(`Accordion vertical padding: nearest real spacing token is ${paddingVMatch.deltaPx}px off shadcn's own exact Tailwind value (py-2.5, 10px).`);
  }
  notes.push("Accordion: only AccordionTrigger's own label is modeled, as a flat single-text box — its real trailing chevron icon (ChevronDownIcon/ChevronUpIcon) is NOT represented, a disclosed scope cut narrower than a literal 'chevron + label' reading, since the existing sections/textLineDirection mechanism that could place a trailing glyph beside a label has no field for this component's own real vertical padding (see this function's own comment for the full reasoning). AccordionContent (the expandable panel) isn't modeled at all — arbitrary caller-supplied children with no fixed shape, the same reason chart.tsx is permanently out of scope.");
  notes.push("Accordion: has no horizontal padding class of its own in real source (confirmed: no px-* class anywhere on AccordionTrigger) — represented as a real, computed 0px via nearestToken, the same 'genuinely zero, not a gap' discipline already established for Label/Marker.");

  const accordionVariants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false }];
  // Batch 15: interaction states (Hover, Focus, Disabled) from the real trigger classes.
  const stateDisclosures = buildAccordionStates(accordionSource, triggerMatch[1], accordionVariants, notes);

  return {
    name: "Accordion",
    variantPropertyName: "Variant",
    variants: accordionVariants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Is it accessible?",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Batch 15 (component-variations plan, 2026-10-13): interaction States for Accordion. State =
// Default, Hover, Focus, Disabled. Read from AccordionTrigger's one real class string:
//   Hover    = `hover:underline` (the label text gets an underline)
//   Focus    = `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`
//              (a 1px border.focus border over the rest `border-transparent`, plus a 3px ring);
//              `focus-visible:after:border-ring` (the trigger's `after:` pseudo-element) is not modeled
//              and is listed by exact class in the Focus state's `skippedStates`
//   Disabled = `aria-disabled:opacity-50` (the real trigger uses aria-disabled:, not disabled:;
//              `aria-disabled:pointer-events-none` has no Figma meaning)
// No Invalid and no Pressed: the real trigger has no `aria-invalid:` / `aria-pressed:` /
// `aria-expanded:` class of its own (the open/closed look is the chevron swap on the icon
// children, `group-aria-expanded/accordion-trigger:hidden|inline`, and the chevron is not modeled).
// The Focus ring is set, but a Figma drop shadow is only drawn for a frame with a fill and the
// trigger has none, so Focus shows only as the focus-coloured border (the shared helper writes that
// disclosure line). Returns the disclosure lines for the Figma description and writes the plan
// `notes` lines (prefixed `Accordion`). Never throws.
function buildAccordionStates(
  accordionSource: string,
  triggerClassString: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus", "Disabled"];
  const stateDisclosures = buildStatesForVariants(accordionSource, "variant", variants, stateNames, undefined, { Disabled: ["aria-disabled:"] }, triggerClassString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(accordionSource, variants, stateNames, { hasSizeAxis: false, singleClassString: triggerClassString, disabledPrefixes: ["aria-disabled:"] }));
  disclosures.push("States: there is no Invalid state and no Pressed state: the real AccordionTrigger has no aria-invalid:, aria-pressed: or aria-expanded: classes of its own. Its open/closed look is the chevron swap on the icon children (group-aria-expanded/accordion-trigger:hidden and :inline), and the chevron is not modeled in Figma.");
  disclosures.push("States: Hover is the real hover:underline, drawn as an underline under the label text (the chevron is not modeled, so nothing else changes).");
  disclosures.push("States: Focus draws the real 1px focus-colored border (the rest look has no visible stroke: the real border is border-transparent). The real trigger is also `relative` with an `after:` pseudo-element whose border turns focus-colored (focus-visible:after:border-ring); that pseudo-element is not modeled.");
  disclosures.push("States: AccordionContent (the expandable panel) is not modeled in Figma at all, so its real [&_a]:hover:text-foreground link hover is not built either.");
  const other = triggerClassString.split(/\s+/).filter((c) => ["transition-all", "outline-none"].includes(c));
  if (other.length > 0) {
    disclosures.push(`States: ${other.join(" and ")} (${other.includes("transition-all") ? "the fade between states, which Figma has none of" : ""}${other.length === 2 ? "; " : ""}${other.includes("outline-none") ? "the removal of the browser's default outline, which Figma does not draw" : ""}) ${other.length === 2 ? "are" : "is"} not modeled.`);
  }
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`Accordion ${line}`);
  return disclosures;
}

// Twenty-fourth real component, added 2026-09-22 — "Batch 12" of
// figma-remaining-components-plan.md, third and last of three (and of
// this whole plan). Real current source (`tooltip.tsx`, confirmed against
// the same real vendored project, `@base-ui/react/tooltip`-based):
// `TooltipContent`'s real box lives on `TooltipPrimitive.Popup`'s own
// className, a single plain string — `... rounded-md bg-foreground px-3
// py-1.5 text-xs text-background ...` (every other token is a real
// `data-[side=...]:`/`has-data-[...]:`-prefixed animation/positioning
// class, correctly ignored by this parser's plain-class regex either
// way).
//
// Real, disclosed, load-bearing finding named directly in the plan
// (figma-remaining-components-plan.md, Batch 12): `bg-foreground` /
// `text-background` is a genuine, INTENTIONAL fg/bg role INVERSION (a
// real dark tooltip with light text — `foreground` is normally a TEXT
// color and `background` is normally a page fill, here used the other
// way around). This resolves CORRECTLY through the existing
// `SHADCN_VAR_TO_SDSGT_PATH` table with zero code change — `foreground`
// still maps to `text.primary`, `background` still maps to
// `background.primary`, and `classToFigmaVariable` determines FILL vs.
// TEXT purely from the class's own `bg-`/`text-` prefix, not from the
// shadcn variable name — so `bg-foreground` correctly becomes a FILL
// bound to a variable literally NAMED `text/primary`, and `text-background`
// correctly becomes a TEXT color bound to a variable literally named
// `background/primary`. Right value, confusing name for anyone auditing
// bound variable names later without this context — the same class of
// non-obvious-but-correct finding `buildAlertPlan`'s own destructive-gate
// comment already documents for itself, disclosed here the same way
// rather than silently passed through.
//
// `rounded-md` uses the SAME real `* 0.8` multiplier as Tabs' own
// TabsTrigger (see this file's own comment above `COMPONENT_BUILDERS`).
// `text-xs` (12px) is a real, new-to-this-file target — every component
// built before this used `text-sm` (14px) or larger. The real `Arrow`
// element (a rotated, separately-colored connector triangle) is NOT
// modeled — content box only, per the plan's own explicit scope, the
// same disclosed-omission treatment already established for Avatar's own
// AvatarImage and Card's own Footer. `TooltipTrigger`'s own real
// hover/focus mechanics aren't modeled either — this pipeline's own
// components have no hover/focus state axis at all (rest states only,
// per this file's own header).
function buildTooltipPlan(tokensCss: string, tooltipSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ['data-slot="tooltip-content"', "bg-foreground", "text-background", "rounded-md"]) {
    if (!tooltipSource.includes(marker)) {
      throw new Error(`Tooltip's real source no longer contains "${marker}" — shadcn/ui's real Tooltip has likely changed shape since buildTooltipPlan was written. Re-verify against the current vendored tooltip.tsx before trusting this plan.`);
    }
  }

  const classMatch = tooltipSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find TooltipContent's own className string — real vendored source may have changed shape since this parser was written.");
  const colors = scanClassesForColors(classMatch[1]);
  if (!colors.fillVariable) throw new Error("TooltipContent's own bg-foreground class didn't resolve to a fill variable — real vendored source may have changed shape since this parser was written.");

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(shadcnRadiusPx(radius, "md"), radius, "radius"); // real rounded-md: calc(var(--radius) * 0.8) — see this file's own comment above `COMPONENT_BUILDERS`
  const paddingHMatch = nearestToken(12, spacing, "spacing"); // real px-3
  const paddingVMatch = nearestToken(6, spacing, "spacing"); // real py-1.5
  const fontSizeMatch = nearestToken(12, fontSize, "typography/primitive/fontSize"); // real text-xs

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
    ["font size", fontSizeMatch],
  ] as const) {
    if (match.deltaPx > 0.01) {
      notes.push(`Tooltip ${label}: nearest real token is ${match.deltaPx.toFixed(1)}px off shadcn's own exact Tailwind value.`);
    }
  }

  notes.push("Tooltip: its real bg-foreground/text-background classes are a genuine, intentional fg/bg role inversion (a dark tooltip with light text) — this resolves correctly (fill bound to the real text.primary color value, text bound to the real background.primary color value) but reads as backwards to anyone auditing bound VARIABLE NAMES later, since the fill is bound to a variable literally named text/primary and the text color to one named background/primary. Right value, confusing name — disclosed here, not silently passed through.");
  notes.push("Tooltip: only TooltipContent's own box is modeled — the real Arrow connector (a separately-colored, rotated triangle) isn't, the same disclosed scope cut already established for Avatar's own AvatarImage and Card's own Footer. TooltipTrigger's own real hover/focus-driven show/hide mechanics aren't modeled either — this pipeline's components are rest-states only.");

  return {
    name: "Tooltip",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", ...colors, underline: false }],
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    paddingHorizontalVariable: paddingHMatch.figmaName,
    paddingVerticalVariable: paddingVMatch.figmaName,
    fontSizeVariable: fontSizeMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    labelPropertyName: "Label",
    defaultLabel: "Add to library",
  };
}

// Batch 13 (component-variations plan, 2026-10-13): interaction States for the
// two checkable controls, Checkbox and RadioGroup (Unchecked / Checked variants,
// one shared class string each, no `cva()`). State = Default, Focus, Disabled,
// Invalid (no Hover, no Pressed: the real source has no hover: or aria-pressed:
// classes). The class string is read through `buildStatesForVariants` exactly as
// for Input/Textarea (Batch 11), with ONE checked-specific rule.
//
// The rule: both variants share the same `focus-visible:border-ring` and
// `aria-invalid:border-destructive` classes, but a Checked box ALSO carries
// `data-checked:border-primary` (and the explicit `aria-invalid:aria-checked:
// border-primary`). Compiling the real classes with the project's own Tailwind
// (2026-10-13) puts `.data-checked\:border-primary[data-checked]` AFTER the
// focus-visible and aria-invalid border rules at the same specificity, so it
// wins: a checked box keeps its primary-coloured border while focused or
// invalid, and only the ring is added. The Checked variant's Focus and Invalid
// therefore drop the stroke override and keep just the ring. Unchecked reads the
// classes literally (border colour change plus ring).
//
// Writes the plan `notes` lines (prefixed with `label`) and returns the
// disclosure lines for the component's Figma description. Returns [] (and sets
// no `states`) if the real source has none of these classes.
function buildCheckableControlStates(
  label: "Checkbox" | "RadioGroup",
  source: string,
  classString: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Focus", "Disabled", "Invalid"];
  const allClasses = classString.split(/\s+/).filter(Boolean);
  // The explicit checked+invalid compound is read here, not by the generic state
  // reader (which would list it as a class it cannot model).
  const checkedInvalidClasses = allClasses.filter((c) => c.startsWith("aria-invalid:aria-checked:"));
  const readableClassString = allClasses.filter((c) => !checkedInvalidClasses.includes(c)).join(" ");
  const stateDisclosures = buildStatesForVariants(source, "variant", variants, stateNames, undefined, undefined, readableClassString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(source, variants, stateNames, { hasSizeAxis: false, singleClassString: classString }));
  disclosures.push(`States: there is no Hover state and no Pressed state (the real ${label} has no hover: or aria-pressed: classes).`);

  // The checked-border rule (see above).
  const checkedBorderClass = allClasses.find((c) => /^data-checked:border-/.test(c));
  const checkedVariant = variants.find((v) => v.name === "Checked");
  if (checkedBorderClass && checkedVariant?.states) {
    const kept: string[] = [];
    for (const st of checkedVariant.states) {
      if ((st.name !== "Focus" && st.name !== "Invalid") || st.strokeVariable === undefined) continue;
      delete st.strokeVariable;
      delete st.strokeOpacity;
      kept.push(st.name);
      const reason = `the real ${checkedBorderClass} is written after (and wins over) the ${st.name === "Focus" ? "focus-visible:border-ring" : "aria-invalid:border-destructive"} border class at the same CSS strength, so a checked ${label === "Checkbox" ? "box" : "radio"} keeps its primary-coloured border; only the ring is added`;
      checkedVariant.skippedStates = [...(checkedVariant.skippedStates ?? []).filter((s) => s.name !== st.name), { name: st.name, reason }];
    }
    if (kept.length > 0) {
      disclosures.push(`States: on Checked, ${kept.join(" and ")} keep the checked border (${checkedBorderClass}${checkedInvalidClasses.length > 0 ? `, and the explicit ${checkedInvalidClasses.join(" ")}` : ""}) because the real class wins over the ${kept.join("/")} border colour (confirmed by compiling the real classes with the project's Tailwind, where the data-checked rule comes last), so those states add only the ring. Unchecked changes its border colour as written.`);
    }
  }


  const fieldContext = allClasses.filter((c) => c.startsWith("group-has-"));
  if (fieldContext.length > 0) {
    const fadesRow = fieldContext.some((c) => c.startsWith("group-has-disabled/"));
    disclosures.push(`States: the real ${fieldContext.join(" ")} classes only apply when the control sits inside a Field/label (they hide the control's own ring and let the surrounding label show focus${fadesRow ? ", and fade a disabled field's whole row" : ""}). They are not modeled; the states above are for the standalone control.`);
  }
  const other = allClasses.filter((c) => ["transition-colors", "outline-none"].includes(c));
  if (other.length > 0) {
    const otherMeaning = other.map((c) => (c === "transition-colors" ? "transition-colors (the color fade)" : "outline-none (the removal of the browser's own focus outline)"));
    disclosures.push(`States: ${otherMeaning.join(" and ")} ${other.length > 1 ? "are" : "is"} not modeled: Figma has no transitions, and there is no browser outline to remove.`);
  }
  disclosures.push(`States: the checked indicator (${label === "Checkbox" ? "the check icon" : "the center dot"}) looks the same in every state; the real source has no state-specific classes for it.`);
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`${label} ${line}`);
  return disclosures;
}

// Twenty-fifth real component, added 2026-09-22 — the first icon-support
// component, unlocking part of figma-remaining-components-plan.md's own
// NEEDS-ICON bucket (that bucket's own closing note named this exact
// "real, separate icon-drawing-capability decision" as the pending
// blocker). Real current source (`checkbox.tsx`, confirmed against the
// same real vendored project, `@base-ui/react/checkbox`-based): a SINGLE
// plain className string (not multi-literal the way Tabs' own trigger
// is), no `cva()`. Real checked/unchecked axis lives behind the same bare
// `data-checked:` pseudo-class shape already found and handled for Tabs'
// own `data-active:` — extracted here with the identical, small, local
// technique (not shared code — see this project's own "extract once a
// SECOND consumer needs it" discipline; sharing it now would mean editing
// Tabs' own already-proven-live extraction for no functional gain, real,
// avoidable re-validation risk for zero benefit).
//
// Real BASE (unchecked) classes: `peer relative flex size-4 shrink-0
// items-center justify-center rounded-[4px] border border-input
// transition-colors outline-none` — no `bg-*` (transparent), `border-
// input` (→ `border.default`, unconditional, no fallback needed). Real
// CHECKED-only classes (bare `data-checked:` prefix stripped, ignoring
// `group-has-[:focus-visible]/field-label:data-checked:.../`dark:data-
// checked:...`-scoped overrides, the same "ignore dark: and non-default
// paths" scope cut this file applies everywhere): `border-primary bg-
// primary text-primary-foreground` → `action.primary` fill AND stroke
// (a real, confirmed SAME-color fill+stroke, not a mismatch), `text.on-
// primary` for the icon (see below).
//
// Real, genuinely new radius finding: `rounded-[4px]` is an ARBITRARY
// bracket-value class with a literal pixel number — not a named Tailwind
// radius utility (`rounded-md`/`rounded-lg`/etc.), so none of this file's
// existing radius helpers (`exactRadiusLg`, the `* 0.8`/`* 1.4`
// multiplier pattern) apply. Extracted via a new, local, one-off regex
// (`/rounded-\[(\d+(?:\.\d+)?)px\]/`) feeding the literal `4` straight
// into the existing `nearestToken` — real, confirmed to land EXACTLY on
// `radius/sm` (4px in the tailwind preset, the same value Tabs/Tooltip's
// own `* 0.8` multiplier landed on by a completely different real
// formula — a coincidence confirmed by checking the actual resolved
// number, not assumed).
//
// Real, genuinely new size finding: `size-4` sets BOTH width and height
// to a literal, unconditional 16px — a real FIXED square, never a
// hug-content-plus-padding approximation the way every earlier box-shaped
// component in this file is (Avatar's own comment already named this
// exact missing shape — "this schema has no 'fixed size, no padding'
// shape yet" — see `FigmaComponentPlanItem.fixedSizePx`'s own comment for
// why it's finally added here, now that a real, EXACTLY-known size
// justifies it instead of Avatar's own computed approximation).
//
// Real, disclosed, non-obvious-but-correct finding, same category as
// Tooltip's own fg/bg inversion: the Indicator's own real icon class is
// `text-current`, not a direct color class — `text-current` inherits
// whatever color the CHECKED BOX's own `text-primary-foreground` class
// already set, so the icon's real color is bound to the exact SAME
// `text.on-primary` variable as the box's own checked-state text color,
// not a separately-derived value. `[&>svg]:size-3.5` (the Indicator's own
// child-selector sizing the real `CheckIcon`) sets the icon's real target
// render size to 14px.
function buildCheckboxPlan(tokensCss: string, checkboxSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Checkbox", "data-checked:bg-primary", "data-checked:text-primary-foreground", "rounded-[4px]", "size-4", "CheckIcon", "[&>svg]:size-3.5"]) {
    if (!checkboxSource.includes(marker)) {
      throw new Error(`Checkbox's real source no longer contains "${marker}" — shadcn/ui's real Checkbox has likely changed shape since buildCheckboxPlan was written. Re-verify against the current vendored checkbox.tsx before trusting this plan.`);
    }
  }

  const classMatch = checkboxSource.match(/className=\{cn\(\s*"([^"]+)"/);
  if (!classMatch) throw new Error("Could not find Checkbox's own className string — real vendored source may have changed shape since this parser was written.");
  const tokens = classMatch[1].split(/\s+/).filter(Boolean);
  const baseClasses = tokens.filter((t) => !t.includes(":")).join(" ");
  const checkedClasses = tokens
    .filter((t) => t.startsWith("data-checked:"))
    .map((t) => t.slice("data-checked:".length))
    .join(" ");

  const uncheckedColors = scanClassesForColors(baseClasses);
  const checkedColors = scanClassesForColors(checkedClasses);

  const radiusMatch_ = baseClasses.match(/rounded-\[(\d+(?:\.\d+)?)px\]/);
  if (!radiusMatch_) throw new Error("Could not find Checkbox's own rounded-[Npx] arbitrary-value radius class — real vendored source may have changed shape since this parser was written.");
  const radiusTargetPx = parseFloat(radiusMatch_[1]);

  const radius = readCssScale(tokensCss, "radius");
  const radiusMatch = nearestToken(radiusTargetPx, radius, "radius");
  if (radiusMatch.deltaPx > 0) {
    notes.push(`Checkbox radius: nearest real token is ${radiusMatch.deltaPx}px off shadcn's own exact literal value (rounded-[${radiusTargetPx}px]).`);
  }

  notes.push("Checkbox: fixed at a literal 16×16px square (real size-4, unconditional) — the first component in this file using fixedSizePx instead of a hug-content-plus-padding approximation, since its real size is exactly known rather than computed.");
  notes.push("Checkbox: the checked icon's real class is text-current, not a direct color class — it inherits the checked box's own text-primary-foreground, so the icon is bound to the SAME text.on-primary variable as the box's own text color, not a separately-derived one. Disclosed for the same reason Tooltip's own fg/bg inversion is: a real, confirmed-correct binding that could otherwise read as a coincidence to someone auditing it later.");

  const variants: FigmaComponentVariantPlanItem[] = [
    { name: "Unchecked", fillVariable: uncheckedColors.fillVariable, strokeVariable: uncheckedColors.strokeVariable, underline: false },
    {
      name: "Checked",
      fillVariable: checkedColors.fillVariable,
      strokeVariable: checkedColors.fillVariable, // real, confirmed: border-primary and bg-primary resolve to the exact same action.primary value — not a mismatch
      underline: false,
      icon: { viewBox: LUCIDE_ICONS.check.viewBox, pathData: LUCIDE_ICONS.check.pathData, sizePx: 14, colorVariable: sdsgtPathToFigmaName("text.on-primary") },
    },
  ];
  // Batch 13: interaction states (Focus, Disabled, Invalid) from the real classes.
  const stateDisclosures = buildCheckableControlStates("Checkbox", checkboxSource, classMatch[1], variants, notes);

  return {
    name: "Checkbox",
    variantPropertyName: "Variant",
    variants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fixedSizePx: 16,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Twenty-sixth real component, added 2026-09-22 — second and last of the
// icon-support batch. Real current source (`spinner.tsx`): the ENTIRE
// component is a single `<Loader2Icon data-slot="spinner" role="status"
// aria-label="Loading" className={cn("size-4 animate-spin", className)}
// {...props} />` — no wrapping box, no `cva()`, no other markup at all.
// `size-4` sets the icon's own real render size to 16px. No color class
// anywhere — the real rendered stroke inherits `currentColor` from
// whatever text color context it's placed in, the same base-layer-
// inheritance finding already established for Label/Marker/Accordion's
// own text color (bound here to the same `text.primary` fallback path).
// The real `animate-spin` rotation is NOT reproduced — a disclosed
// static icon, the same treatment Skeleton's own `animate-pulse` already
// receives. Uses the TOP-LEVEL `icon` field (the whole component IS the
// icon), not the per-variant one Checkbox uses — see
// `FigmaComponentPlanItem.icon`'s own comment for why these are two
// different fields, not one.
function buildSpinnerPlan(tokensCss: string, spinnerSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Spinner", "Loader2Icon", "size-4", "animate-spin"]) {
    if (!spinnerSource.includes(marker)) {
      throw new Error(`Spinner's real source no longer contains "${marker}" — shadcn/ui's real Spinner has likely changed shape since buildSpinnerPlan was written. Re-verify against the current vendored spinner.tsx before trusting this plan.`);
    }
  }

  const radius = readCssScale(tokensCss, "radius");
  const radiusMatch = nearestToken(0, radius, "radius"); // a bare icon has no corner radius of its own — see this file's own `line` precedent for the same "genuinely zero, interface-shape parity only" reasoning

  notes.push("Spinner: its real animate-spin rotation isn't reproduced — a disclosed static icon, the same treatment Skeleton's own animate-pulse already receives.");
  notes.push("Spinner: has no color class of its own anywhere in real source — bound to text.primary via the same base-layer-inheritance fallback already established for Label/Marker/Accordion, not a parse miss.");

  return {
    name: "Spinner",
    variantPropertyName: "Variant",
    variants: [{ name: "Default", underline: false }], // no real fill/text/stroke of its own at this level — see top-level `icon` instead
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    icon: {
      viewBox: LUCIDE_ICONS.loaderCircle.viewBox,
      pathData: LUCIDE_ICONS.loaderCircle.pathData,
      sizePx: 16,
      colorVariable: sdsgtPathToFigmaName("text.primary"),
    },
  };
}

// Twenty-seventh real component, added 2026-09-22 — final batch closing
// out figma-remaining-components-plan.md's own NEEDS-ICON bucket for
// real: Switch needs NO icon capability at all (re-confirmed here, not
// just asserted) — its real source has no icon anywhere. Real current
// source (`switch.tsx`): the outer `SwitchPrimitive.Root` is a fixed
// TRACK (`data-[size=default]:h-[18.4px] data-[size=default]:w-[32px]` —
// real, confirmed ARBITRARY bracket values, "default" size only, per this
// file's own "one size" precedent), `rounded-full`, two real track colors
// via the same bare `data-checked:`/`data-unchecked:` pseudo-class shape
// already found and handled for Tabs/Checkbox (`bg-primary`/`bg-input`).
// The nested `SwitchPrimitive.Thumb` is a fixed circle
// (`group-data-[size=default]/switch:size-4`, 16px, `rounded-full`,
// `bg-background`, no color axis of its own) that TRANSLATES position via
// `data-checked:translate-x-[calc(100%-2px)]` /
// `data-unchecked:translate-x-0` — a discretely POSITIONED element, not a
// continuously growing fill the way Progress's own `bar` is, hence the
// new per-variant `thumb` field (see its own comment on
// `FigmaComponentVariantPlanItem`) rather than reusing `bar` directly.
//
// Real, disclosed, non-obvious-but-correct finding, same category as
// Tooltip's own fg/bg inversion: `bg-input` (the unchecked track's own
// real fill class) resolves via the existing table to `border.default`
// (`input` → `"border.default"`) — a FILL bound to a variable literally
// named `border/default`, not a naming mismatch or a parser miss, just
// this pipeline's own existing shadcn-var mapping table applied to a
// background use of a variable whose SDSGT name assumes a border use.
//
// `border` (bare, no color suffix) on the track itself doesn't match
// `classToFigmaVariable`'s own regex at all (no dash-suffix) — same real
// gap already found for Attachment (below) and Alert before it — but here
// the real border is `border-transparent` in effect (an invisible 1px
// inset, not a visible stroke) since Switch's own track never sets an
// explicit border color, so no `strokeVariable` fallback is applied here
// (correctly none, not a missed case — confirmed by the real rendered
// result having no visible track outline).
function buildSwitchPlan(tokensCss: string, switchSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Switch", "data-checked:bg-primary", "data-unchecked:bg-input", "data-[size=default]:h-[18.4px]", "data-[size=default]:w-[32px]", "group-data-[size=default]/switch:size-4", "translate-x-[calc(100%-2px)]"]) {
    if (!switchSource.includes(marker)) {
      throw new Error(`Switch's real source no longer contains "${marker}" — shadcn/ui's real Switch has likely changed shape since buildSwitchPlan was written. Re-verify against the current vendored switch.tsx before trusting this plan.`);
    }
  }

  const radius = readCssScale(tokensCss, "radius");
  const radiusMatch = exactRadiusFull(radius); // real rounded-full on both track and thumb

  // Component-variations plan, Batch 4 (2026-10-08): every size's track and
  // thumb dims are read from the real `data-[size=X]:` / `group-data-[size=X]/switch:`
  // classes via `parseDataSizeClasses` (default: h-[18.4px] w-[32px] size-4;
  // sm: h-[14px] w-[24px] size-3). The two markers above guarantee the
  // default size reads back as the 32 / 18.4 / 16 this plan always had.
  const borderInsetPx = 1; // real Tailwind bare `border` utility width — the same well-known 1px default this file already assumes for every other bare `border`-based strokeWeight
  const bySize = parseDataSizeClasses(switchSource.replace(/["'`,]/g, " "));
  const arbitraryPx = (classes: string[], axis: "h" | "w"): number | null => {
    for (const cls of classes) {
      const m = cls.match(new RegExp(`^${axis}-\\[(\\d+(?:\\.\\d+)?)px\\]$`));
      if (m) return parseFloat(m[1]);
    }
    return null;
  };
  const readSwitchSize = (sizeName: string): { trackWidthPx: number; trackHeightPx: number; thumbSizePx: number } | null => {
    const classes = bySize[sizeName] ?? [];
    const trackWidthPx = arbitraryPx(classes, "w");
    const trackHeightPx = arbitraryPx(classes, "h");
    const thumbClass = classes.find((cls) => /^size-\d/.test(cls));
    const thumbSizePx = thumbClass ? tailwindClassPx(thumbClass) : null;
    if (trackWidthPx === null || trackHeightPx === null || thumbSizePx === null) return null;
    return { trackWidthPx, trackHeightPx, thumbSizePx };
  };
  // The ONE place the thumb geometry is computed, for every size: checked =
  // trackWidth - thumbSize - borderInset (real translate-x-[calc(100%-2px)]),
  // unchecked = borderInset (real translate-x-0). Key order matters (the
  // Default size must serialize byte-identically to the pre-axis plan).
  const makeThumb = (state: "Unchecked" | "Checked", dims: { trackWidthPx: number; trackHeightPx: number; thumbSizePx: number }): NonNullable<FigmaComponentVariantPlanItem["thumb"]> => ({
    trackColorVariable: sdsgtPathToFigmaName(state === "Checked" ? "action.primary" : "border.default"),
    thumbColorVariable: sdsgtPathToFigmaName("background.primary"),
    trackWidthPx: dims.trackWidthPx,
    trackHeightPx: dims.trackHeightPx,
    thumbSizePx: dims.thumbSizePx,
    thumbOffsetXPx: state === "Checked" ? dims.trackWidthPx - dims.thumbSizePx - borderInsetPx : borderInsetPx,
    radiusVariable: radiusMatch.figmaName,
  });
  const defaultDims = readSwitchSize("default");
  if (!defaultDims) {
    throw new Error("Switch's real source has the default-size markers but its data-[size=default] track/thumb classes could not be read — real vendored source may have changed shape since buildSwitchPlan was written.");
  }

  const sizeOrder = ["default", ...Object.keys(bySize).filter((n) => n !== "default")];
  const axisOptions: FigmaComponentAxisPlanItem["options"] = [];
  const axisSkipped: FigmaComponentAxisPlanItem["skippedOptions"] = [];
  const axisDisclosures: string[] = [];
  for (const sizeName of sizeOrder) {
    const dims = readSwitchSize(sizeName);
    if (!dims) {
      axisSkipped.push({ name: sizeName, reason: "no readable `h-[Npx]`, `w-[Npx]` and thumb `size-N` classes for this size, so the track and thumb can't be derived" });
      continue;
    }
    axisOptions.push({
      name: capitalize(sizeName),
      overrides: { variantOverrides: { Unchecked: { thumb: makeThumb("Unchecked", dims) }, Checked: { thumb: makeThumb("Checked", dims) } } },
    });
  }
  axisDisclosures.push("Size: track and thumb sizes are the real literal px values (e.g. 32 x 18.4 track and 16px thumb for Default), not spacing tokens — there is no matching token scale, so nothing was snapped. The thumb's horizontal position is recomputed per size as a geometric equivalent of the real CSS transform, not replicated.");
  axisDisclosures.push(...describeIdenticalOptions("Size", axisOptions));
  if (axisSkipped.length > 0) axisDisclosures.push(`Size options not built: ${axisSkipped.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
  for (const line of axisDisclosures) notes.push(`Switch ${line}`);
  const sizeAxis: FigmaComponentAxisPlanItem | undefined = axisOptions.length > 0 ? { propertyName: "Size", options: axisOptions, skippedOptions: axisSkipped, disclosures: axisDisclosures } : undefined;

  notes.push("Switch: needs no icon capability at all — confirmed by re-reading its real source in full, not assumed. Its track's own real bg-input (unchecked) resolves to a fill bound to a variable literally named border/default, via this file's existing shadcn-var table — a real, confirmed-correct binding, not a mismatch (see this function's own comment).");
  notes.push("Switch: the thumb's own real position is set via a CSS transform (translate-x-[calc(100%-2px)] when checked, translate-x-0 when unchecked) — represented here as a computed geometric equivalent (trackWidthPx - thumbSizePx - borderInsetPx, and borderInsetPx respectively), not a literal replication of the real transform math.");

  const switchVariants: FigmaComponentVariantPlanItem[] = [
    { name: "Unchecked", underline: false, thumb: makeThumb("Unchecked", defaultDims) },
    { name: "Checked", underline: false, thumb: makeThumb("Checked", defaultDims) },
  ];
  // Batch 14: interaction states (Focus, Disabled, Invalid) from the real classes.
  const stateDisclosures = buildSwitchStates(switchSource, switchVariants, notes);

  return {
    name: "Switch",
    variantPropertyName: "Variant",
    variants: switchVariants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName, // interface-shape parity only, mirrors thumb.radiusVariable — same precedent line/bar already established
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    ...(sizeAxis ? { extraAxes: [sizeAxis] } : {}),
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Batch 14 (component-variations plan, 2026-10-13): interaction States for Switch.
// State = Default, Focus, Disabled, Invalid (no Hover, no Pressed: the real source has no
// `hover:` or `aria-pressed:` classes). Read from the Switch ROOT's one real class string
// through `buildStatesForVariants` (like Input and Checkbox). Switch writes its Disabled as
// `data-disabled:opacity-50` (not the plain `disabled:`), so that prefix is added through
// `extraPrefixes`. The state look goes on the TRACK frame (the thumb child is untouched, so it
// looks the same in every state, as in the real source).
//
// "Which wins" check (verified, not assumed; compiled the real classes with the demo project's
// own Tailwind v4 via `@tailwindcss/node`'s `compile`, 2026-10-13): `border-transparent` comes
// BEFORE `focus-visible:border-ring` and `aria-invalid:border-destructive` in the CSS, so the
// state borders win over the invisible rest border. The Checked / Unchecked classes
// (`data-checked:bg-primary`, `data-unchecked:bg-input`) set only the track fill, never a border,
// so nothing competes on either: Focus and Invalid read the same on Checked and Unchecked
// (unlike Checkbox, which has `data-checked:border-primary`). The track has a fill at rest, so
// the rings DO render for Switch.
//
// Writes the plan `notes` lines (prefixed `Switch`) and returns the disclosure lines for the
// component's Figma description. Returns [] (and sets no `states`) if the real source has none
// of these classes. Never throws.
function buildSwitchStates(switchSource: string, variants: FigmaComponentVariantPlanItem[], notes: string[]): string[] {
  const rootClass = switchSource.match(/className=\{cn\(\s*"([^"]+)"/)?.[1];
  if (!rootClass) return [];
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Focus", "Disabled", "Invalid"];
  const allClasses = rootClass.split(/\s+/).filter(Boolean);
  const stateDisclosures = buildStatesForVariants(switchSource, "variant", variants, stateNames, undefined, { Disabled: ["data-disabled:"] }, rootClass);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(switchSource, variants, stateNames, { hasSizeAxis: true, singleClassString: rootClass, disabledPrefixes: ["data-disabled:"] }));
  disclosures.push("States: there is no Hover state and no Pressed state (the real Switch has no hover: or aria-pressed: classes).");

  // A state border drawn in the very colour of the track it sits on cannot be seen.
  for (const v of variants) {
    for (const st of v.states ?? []) {
      if (st.strokeVariable && v.thumb && st.strokeVariable === v.thumb.trackColorVariable) {
        const reason = `its border colour (${st.strokeVariable}) is the same colour as this variant's track fill, so the border cannot be seen against the track and only the ring is visible`;
        v.skippedStates = [...(v.skippedStates ?? []).filter((s) => s.name !== st.name), { name: st.name, reason }];
        disclosures.push(`State ${v.name} / ${st.name}: ${reason}.`);
      }
    }
  }

  const trackFillClasses = allClasses.filter((c) => /^data-(checked|unchecked):/.test(c));
  const competing = trackFillClasses.filter((c) => !/^data-(checked|unchecked):bg-/.test(c));
  disclosures.push(
    competing.length === 0
      ? `States: Focus (focus-visible:border-ring) and Invalid (aria-invalid:border-destructive) draw the real 1px border (the rest border is the invisible border-transparent) as a 1px stroke inside the track edge, colored border/focus and status/error. Compiling the real classes with the project's Tailwind confirms the state border classes come after border-transparent in the CSS, so they win. The Checked and Unchecked classes (${trackFillClasses.join(" ")}) set only the track fill, never a border, so nothing competes and Focus and Invalid look the same on Checked and Unchecked (unlike Checkbox, whose checked border wins).`
      : `States: Focus and Invalid draw the real 1px border as a 1px stroke inside the track edge. The real ${competing.join(" ")} class(es) also set something other than the track fill and are not modeled, so Checked and Unchecked read the state border the same way.`,
  );
  disclosures.push("States: the track has a fill at rest (border/default when Unchecked, action/primary when Checked), so the Focus and Invalid rings show in Figma on every Switch with no extra fill needed.");
  disclosures.push("States: the thumb looks the same in every state; the real source has no non-dark state classes for it.");
  disclosures.push("States: on Checked, the Focus border (border/focus) is drawn over the action/primary track (and the Invalid border, status/error, the same way). In a project whose focus or error colour is close to its primary colour the border is hard to tell apart from the track, so there the ring carries the state.");

  const darkTranslucent = allClasses.filter((c) => c.startsWith("dark:") && /\/\d+$/.test(c) && /bg-/.test(c));
  if (darkTranslucent.length > 0) {
    disclosures.push(`States: the real ${darkTranslucent.join(" ")} class (a translucent unchecked track, dark mode only) is not drawn: dark mode is handled by the Figma variable modes, and a transparency on a bound colour would be lost on instances anyway.`);
  }
  const fieldContext = allClasses.filter((c) => c.startsWith("group-has-"));
  if (fieldContext.length > 0) {
    disclosures.push(`States: the real ${fieldContext.join(" ")} classes only apply when the Switch sits inside a Field/label (they hide the control's own border and ring and let the surrounding label show focus). They are not modeled; the states above are for the standalone Switch.`);
  }
  const hitArea = allClasses.filter((c) => c.startsWith("after:"));
  if (hitArea.length > 0) {
    disclosures.push(`States: the real ${hitArea.join(" ")} classes (an invisible, larger click area around the Switch) are not modeled; Figma has no click areas.`);
  }
  const other = allClasses.filter((c) => ["transition-all", "outline-none"].includes(c));
  if (other.length > 0) {
    const otherMeaning = other.map((c) => (c === "transition-all" ? "transition-all (the fade between states)" : "outline-none (the removal of the browser's own focus outline)"));
    disclosures.push(`States: ${otherMeaning.join(" and ")} ${other.length > 1 ? "are" : "is"} not modeled: Figma has no transitions, and there is no browser outline to remove.`);
  }
  disclosures.push(...stateDisclosures);
  for (const line of disclosures) notes.push(`Switch ${line}`);
  return disclosures;
}

// Twenty-eighth real component, added 2026-09-22, same batch as Switch.
// Real current source (`radio-group.tsx`) confirms RadioGroup ALSO needs
// no icon capability — its real checked indicator is a plain `<span
// className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2
// -translate-y-1/2 rounded-full bg-primary-foreground" />`, a solid
// circle, not an SVG. Real shape is otherwise IDENTICAL to Checkbox's own
// (fixed 16×16 square via `size-4`/`aspect-square`, bare
// `data-checked:`-prefixed axis, same extraction technique) except
// `rounded-full` (not Checkbox's own arbitrary `rounded-[4px]`) and a
// `centerDot` instead of an `icon` on the Checked variant — genuinely
// cheaper than Checkbox, no `createNodeFromSvg`/`rescale` involved at all.
// Real base (unchecked) classes: `... rounded-full border border-input
// ...` — `border-input` is explicit, no fallback needed (unlike
// Switch/Attachment's own bare `border` gaps). Real checked-only classes
// (bare `data-checked:` stripped): `border-primary bg-primary
// text-primary-foreground` — the SAME same-color fill+stroke finding
// already confirmed for Checkbox. The dot's own real `bg-primary-
// foreground` → `text.on-primary`, the exact SAME variable Checkbox's own
// icon binds to, for the same real reason (both represent "the color that
// contrasts against a primary-filled background").
function buildRadioGroupPlan(tokensCss: string, radioSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function RadioGroupItem", "data-checked:bg-primary", "data-checked:text-primary-foreground", "rounded-full", "size-4", "bg-primary-foreground"]) {
    if (!radioSource.includes(marker)) {
      throw new Error(`RadioGroup's real source no longer contains "${marker}" — shadcn/ui's real RadioGroup has likely changed shape since buildRadioGroupPlan was written. Re-verify against the current vendored radio-group.tsx before trusting this plan.`);
    }
  }

  const itemMatch = radioSource.match(/function RadioGroupItem[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!itemMatch) throw new Error("Could not find RadioGroupItem's own className string — real vendored source may have changed shape since this parser was written.");
  const tokens = itemMatch[1].split(/\s+/).filter(Boolean);
  const baseClasses = tokens.filter((t) => !t.includes(":")).join(" ");
  const checkedClasses = tokens
    .filter((t) => t.startsWith("data-checked:"))
    .map((t) => t.slice("data-checked:".length))
    .join(" ");

  const uncheckedColors = scanClassesForColors(baseClasses);
  const checkedColors = scanClassesForColors(checkedClasses);

  const radius = readCssScale(tokensCss, "radius");
  const radiusMatch = exactRadiusFull(radius);

  notes.push("RadioGroup: needs no icon capability at all — its real checked indicator is a plain solid <span> circle, not an SVG (confirmed against real source, not assumed from Checkbox's own shape).");

  const variants: FigmaComponentVariantPlanItem[] = [
    { name: "Unchecked", fillVariable: uncheckedColors.fillVariable, strokeVariable: uncheckedColors.strokeVariable, underline: false },
    {
      name: "Checked",
      fillVariable: checkedColors.fillVariable,
      strokeVariable: checkedColors.fillVariable, // real, confirmed same-color fill+stroke — same finding as Checkbox
      underline: false,
      centerDot: { sizePx: 8, colorVariable: sdsgtPathToFigmaName("text.on-primary") }, // real size-2 (8px), real bg-primary-foreground
    },
  ];
  // Batch 13: interaction states (Focus, Disabled, Invalid) from the real classes.
  const stateDisclosures = buildCheckableControlStates("RadioGroup", radioSource, itemMatch[1], variants, notes);

  return {
    name: "RadioGroup",
    variantPropertyName: "Variant",
    variants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fixedSizePx: 16, // real size-4/aspect-square, same fixed-square treatment as Checkbox
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Twenty-ninth real component, added 2026-09-22, same batch — the last of
// figma-remaining-components-plan.md's own NEEDS-ICON bucket, and its real
// blocker was never icon-drawing (confirmed by re-reading the real
// source): `AttachmentMedia` (the real icon/image slot) is CALLER-
// SUPPLIED, not a default the component ships with, and isn't modeled
// here — the same declared exclusion Item's own ItemMedia already
// established. Modeled the identical way: outer frame via its own real
// base classes (no `cva()` color axis at all — `attachmentVariants`' two
// real axes, `size`/`orientation`, only vary SPACING/LAYOUT, never color,
// so this is a flat single-state box like Kbd/Marker, not a
// `buildVariantsFromCva` consumer) plus Title/Description via `sections`,
// mirroring Item's own Title/Description shape exactly. Only the
// "default" size, "horizontal" orientation, "done" state (the component's
// own real default) are modeled — `sm`/`xs`/`vertical` and the real
// `idle`/`uploading`/`processing`/`error` states aren't, the same "one
// size, rest states only" scope this whole file uses everywhere.
//
// Real base classes (merged: the shared base string plus "default" size's
// own and "horizontal" orientation's own): `... rounded-xl border bg-card
// text-card-foreground ... gap-2 text-sm ... items-center` (padding
// extracted separately below — see that field's own comment).
// `rounded-xl` uses the SAME real `* 1.4` multiplier already established
// for Card/Bubble (`--radius-xl: calc(var(--radius) * 1.4)`), not the
// newer `* 0.8` (`rounded-md`) formula Tabs/Tooltip/Checkbox use — a
// different named utility, a different real multiplier, confirmed
// separately, not assumed to match.
//
// Real, disclosed, non-obvious finding: bare `border` (no color suffix)
// doesn't match `classToFigmaVariable`'s own regex at all (no dash-suffix
// to parse) — the same real gap Alert's own border-fallback and Switch's
// own bare-border case already found — hardcoded here to `border.default`
// via the same post-process precedent `buildAlertPlan` established.
//
// Real, disclosed, GENUINELY NEW finding (not seen in any earlier
// component): `AttachmentTitle` has no explicit color class of its own
// (`font-medium` only) — inherits from its OWN ANCESTOR's `text-card-
// foreground`, not the global body's `text-foreground` the way Label/
// Marker/Accordion's own base-layer fallback already assumes. Using this
// file's own SHARED "text.primary" fallback default here would be WRONG
// — hardcoded directly to `text.on-surface` instead (the real value
// `text-card-foreground` resolves to), not routed through
// `scanClassesForColors`'s own generic fallback parameter.
function buildAttachmentPlan(tokensCss: string, attachmentSource: string, notes: string[]): FigmaComponentPlanItem {
  for (const marker of ["function Attachment(", "function AttachmentTitle", "function AttachmentDescription", "attachmentVariants = cva(", "rounded-xl", "bg-card", "text-card-foreground"]) {
    if (!attachmentSource.includes(marker)) {
      throw new Error(`Attachment's real source no longer contains "${marker}" — shadcn/ui's real Attachment has likely changed shape since buildAttachmentPlan was written. Re-verify against the current vendored attachment.tsx before trusting this plan.`);
    }
  }

  const baseMatch = attachmentSource.match(/attachmentVariants = cva\(\s*"([^"]+)"/);
  if (!baseMatch) throw new Error("Could not find attachmentVariants' own base class string — real vendored source may have changed shape since this parser was written.");
  // Real bug caught before any live push, 2026-09-22: this base string
  // contains two conditional `data-[state=error]:`/`data-[state=idle]:`
  // classes inline (unlike every earlier single-string-literal component,
  // whose own first cva() literal never mixed in a bracketed selector).
  // Passing the raw string straight to `scanClassesForColors` let Batch
  // 9's own selector-prefix stripping (inside `classToFigmaVariable`)
  // silently strip the `data-[state=error]:` prefix and match the
  // REMAINING `border-destructive` as if it were this component's own
  // unconditional border color — producing a real, wrong `status.error`
  // stroke for the "done"-state box this function is actually building.
  // Fixed the same way Switch/RadioGroup/Checkbox/Tabs already handle a
  // bare `data-<word>:`-prefixed axis: filter out every colon-prefixed
  // token BEFORE scanning, so only this component's own real
  // unconditional base classes reach `scanClassesForColors` at all.
  const baseClasses = baseMatch[1]
    .split(/\s+/)
    .filter((t) => !t.includes(":"))
    .join(" ");
  const colors = scanClassesForColors(baseClasses);
  if (!colors.strokeVariable) colors.strokeVariable = sdsgtPathToFigmaName("border.default"); // bare `border`, no dash-suffix — see this function's own comment

  const descMatch = attachmentSource.match(/function AttachmentDescription[\s\S]*?className=\{cn\(\s*"([^"]+)"/);
  if (!descMatch) throw new Error("Could not find AttachmentDescription's own className string — real vendored source may have changed shape since this parser was written.");
  const descColors = scanClassesForColors(descMatch[1]);

  const spacing = readCssScale(tokensCss, "spacing");
  const radius = readCssScale(tokensCss, "radius");
  const fontSize = readCssScale(tokensCss, "typography-primitive-font-size");

  const radiusMatch = nearestToken(shadcnRadiusPx(radius, "xl"), radius, "radius"); // real rounded-xl, same * 1.4 multiplier already established for Card/Bubble
  const paddingHMatch = nearestToken(10, spacing, "spacing"); // real has-data-[slot=attachment-content]:px-2.5 ("default" size)
  const paddingVMatch = nearestToken(8, spacing, "spacing"); // real has-data-[slot=attachment-content]:py-2 ("default" size)
  const titleFontSize = nearestToken(14, fontSize, "typography/primitive/fontSize"); // real text-sm ("default" size)
  const descFontSize = nearestToken(12, fontSize, "typography/primitive/fontSize"); // real text-xs (AttachmentDescription's own explicit class)

  for (const [label, match] of [
    ["radius", radiusMatch],
    ["horizontal padding", paddingHMatch],
    ["vertical padding", paddingVMatch],
  ] as const) {
    if (match.deltaPx > 0.01) {
      notes.push(`Attachment ${label}: nearest real token is ${match.deltaPx.toFixed(1)}px off shadcn's own exact Tailwind value.`);
    }
  }

  // The one Title + Description section, parameterized by the two values a
  // Size/Orientation option can change (horizontal padding, Title font size);
  // the base plan and every axis option build theirs through this function.
  const buildSections = (paddingHVar: string, titleFontVar: string): FigmaComponentSectionPlanItem[] => [
    {
      paddingHorizontalVariable: paddingHVar,
      textLines: [
        { textVariable: sdsgtPathToFigmaName("text.on-surface"), fontSizeVariable: titleFontVar, weight: "Medium", labelPropertyName: "Title", defaultLabel: "receipt.pdf" },
        { textVariable: descColors.textVariable, fontSizeVariable: descFontSize.figmaName, weight: "Regular", labelPropertyName: "Description", defaultLabel: "2.4 MB" },
      ],
    },
  ];

  notes.push("Attachment: only the outer frame and AttachmentTitle/AttachmentDescription are modeled — AttachmentMedia (a real icon/image slot, always caller-supplied, never a default the component ships with) and AttachmentActions (real interactive buttons) aren't, the same declared NEEDS-ICON/NEEDS-INTERACTIVE-STRUCTURE reasons already named in [Legacy] figma-remaining-components-plan.md and established by Item's own ItemMedia/ItemActions exclusion. Only its 'done' state (the component's own real default) is modeled — the real idle/uploading/processing/error states aren't. Its real size (default/sm/xs) and orientation (horizontal/vertical) axes are modeled as Size and Orientation properties — see the `Attachment Size ...`/`Attachment Orientation ...` notes below for what they do and don't change.");
  notes.push("Attachment: AttachmentTitle has no explicit color class of its own — it inherits from Attachment's own text-card-foreground, NOT the global body's text-foreground this file's usual fallback assumes, so it's hardcoded to text.on-surface directly rather than routed through scanClassesForColors's own generic fallback default, which would have been wrong here.");

  const extraAxes = buildAttachmentAxes(attachmentSource, spacing, radius, fontSize, radiusMatch, notes, buildSections);
  const attachmentVariants: FigmaComponentVariantPlanItem[] = [{ name: "Default", ...colors, underline: false }];
  // Batch 15: interaction states (Hover, Focus) from the real root classes.
  const stateDisclosures = buildAttachmentStates(attachmentSource, baseMatch[1], attachmentVariants, notes);

  return {
    name: "Attachment",
    variantPropertyName: "Variant",
    variants: attachmentVariants,
    skippedVariants: [],
    radiusVariable: radiusMatch.figmaName,
    fontFamilyVariable: "typography/primitive/fontFamily/primary",
    sectionGapVariable: paddingVMatch.figmaName,
    sections: buildSections(paddingHMatch.figmaName, titleFontSize.figmaName),
    ...(extraAxes.length > 0 ? { extraAxes } : {}),
    ...(stateDisclosures.length > 0 ? { statePropertyName: "State" as const, disclosures: stateDisclosures } : {}),
  };
}

// Batch 15 (component-variations plan, 2026-10-13): interaction States for Attachment. The real
// root class string (the cva base) has three state-like pieces:
//   Focus    = `focus-within:ring-1 focus-within:ring-ring/50`: a 1px ring on the ROOT while anything
//              inside it (the AttachmentTrigger, an AttachmentAction button) has focus. Built: ring
//              1px, the baked `border.focus-ring` token (0.5). The root has a card fill (bg-card),
//              so the ring renders. No border change (the real class sets none).
//   Hover    = `has-[>a,>button]:hover:bg-muted/50`: a 50% muted tint over the card fill, only when
//              the Attachment has a direct link/button child (the AttachmentTrigger). NOT built: a
//              translucent fill on a bound colour is lost on Figma instances and there is no solid
//              token for it. Hover is still built as a State value, identical to Default
//              (recorded in `skippedStates` with the exact class); this is an OPEN DECISION for the user.
//   `data-[state=error]:border-destructive/30` and `data-[state=idle]:border-dashed`: these are the
//              attachment's own upload status (the `state` prop: idle / uploading / processing /
//              error / done), not interaction states; the Figma Attachment is the `done` status only
//              (see the existing Attachment note), so they are named in the disclosures, not built.
// No Disabled, Invalid or Pressed: the real source has none. Returns the disclosure lines for the
// Figma description and writes the plan `notes` lines (prefixed `Attachment`). Never throws.
function buildAttachmentStates(
  attachmentSource: string,
  baseClassString: string,
  variants: FigmaComponentVariantPlanItem[],
  notes: string[],
): string[] {
  const stateNames: Array<FigmaComponentStatePlanItem["name"]> = ["Hover", "Focus"];
  const classes = baseClassString.split(/\s+/).filter(Boolean);
  const hoverClass = classes.find((c) => c.startsWith("has-[>a,>button]:hover:"));
  // `hover:` is deliberately NOT read here (the real hover class sits behind a `has-[...]` selector the
  // shared reader does not handle, and its translucent fill must not be built); Focus is `focus-within:`.
  // Hover as a solid token (see ATTACHMENT_HOVER_TOKEN), only when the project has it and the real class is there.
  const hoverToken = Boolean(hoverClass) && projectHasToken(ATTACHMENT_HOVER_TOKEN.cssVar);
  const hoverOverrides = hoverToken
    ? Object.fromEntries(variants.map((v) => [`${v.name}/Hover`, {
        item: { fillVariable: sdsgtPathToFigmaName(ATTACHMENT_HOVER_TOKEN.token) },
        note: `drawn as the solid token ${sdsgtPathToFigmaName(ATTACHMENT_HOVER_TOKEN.token)} (light neutral.200, dark neutral.1000) instead of the real ${hoverClass} (background.secondary at 50%, blending with whatever is behind the card), because a fill's transparency is lost on Figma instances; chosen by the user (2026-10-13) as the best single step per mode across the backgrounds (RGB distance light 0 to 28, dark 0 to 16), so it is an approximation. In dark mode it is the same step as the card at rest (background.surface = neutral.1000), so Hover shows no change there. The real hover applies only when the Attachment has a direct link or button child (the AttachmentTrigger, not modeled), so Figma shows it for every Attachment`,
      }]))
    : undefined;
  const rawDisclosures = buildStatesForVariants(attachmentSource, "variant", variants, stateNames, hoverOverrides, { Focus: ["focus-within:"] }, baseClassString);
  if (!variants.some((v) => v.states && v.states.length > 0)) return [];

  // Replace the generic "no hover: classes" reading of Hover with the real reason.
  const hoverReason = hoverClass
    ? `renders identical to Default: the real hover look is ${hoverClass} (a 50% muted tint over the card fill, drawn only when the Attachment has a direct link or button child, i.e. the AttachmentTrigger, which is not modeled). Not built: a fill's transparency is lost on Figma instances and there is no solid token for this tint, so the fill is left as at rest; building it would need a solid hover token, which is not decided yet`
    : "renders identical to Default: the real source has no hover classes for this component";
  const disclosures: string[] = [];
  disclosures.push(...buildCommonStateDisclosures(attachmentSource, variants, stateNames, { hasSizeAxis: false, singleClassString: baseClassString, prefixLabels: { Hover: "has-[>a,>button]:hover:", Focus: "focus-within:" } }));
  if (hoverToken) {
    disclosures.push(...rawDisclosures); // includes the "State Default / Hover: drawn as the solid token ..." line
  } else {
    for (const v of variants) {
      v.skippedStates = [...(v.skippedStates ?? []).filter((sk) => sk.name !== "Hover"), { name: "Hover", reason: hoverReason }];
    }
    disclosures.push(...rawDisclosures.filter((line) => !line.includes(" / Hover:")));
    for (const v of variants) disclosures.push(`State ${v.name} / Hover: ${hoverReason}.`);
  }
  disclosures.push("States: every Size and Orientation combination gets the same State values (Default, Hover, Focus). There is no Disabled, Invalid or Pressed state: the real Attachment has no disabled:, aria-invalid: or aria-pressed: classes.");
  disclosures.push("States: Focus is the real focus-within:ring-1 focus-within:ring-ring/50 on the Attachment's root: a 1px ring while something inside it (the trigger or an action button, neither modeled) has focus. Drawn on the whole Attachment frame, which has a card fill, so the ring shows.");
  const statusClasses = classes.filter((c) => c.startsWith("data-[state="));
  if (statusClasses.length > 0) {
    disclosures.push(`States: ${statusClasses.join(" and ")} are NOT interaction states: they style the Attachment's own upload status (the state prop: idle, uploading, processing, error, done). The Figma Attachment is the done status only, so these are not built (data-[state=error]:border-destructive/30 would also be a translucent border).`);
  }
  if (classes.includes("transition-colors")) {
    disclosures.push("States: transition-colors (the fade between states) is not modeled: Figma has no transitions.");
  }
  for (const line of disclosures) notes.push(`Attachment ${line}`);
  return disclosures;
}

// Attachment's `Size` and `Orientation` axes (component-variations plan,
// Batch 6, 2026-10-08) — the first component with TWO extra axes. Reads the
// real `attachmentVariants` `size` (default/sm/xs) and `orientation`
// (horizontal/vertical) cva axes; never invents a value.
//
// Size, per option: `has-data-[slot=attachment-content]:px-N/py-N` (the root's
// padding when it holds a content part, which is how the modeled Title/
// Description sit) -> the section's horizontal padding and `sectionGapVariable`
// (the frame's top/bottom padding); the bare `text-*` class (inherited by
// AttachmentTitle, which sets no size of its own) -> Title font size; the
// `rounded-*` class (xs: `rounded-lg`, i.e. radius.md; the others keep the
// base `rounded-xl`) -> radius. AttachmentDescription keeps its own explicit
// `text-xs` in every size.
//
// Orientation, per option (read from the cva `orientation` classes and from
// AttachmentContent's own `group-data-[orientation=X]/attachment:px-N`):
// horizontal (`min-w-40 items-center`) changes nothing the Figma Attachment
// models, so its overrides are empty (Default + Horizontal therefore equals
// the pre-axis plan exactly). Vertical (`w-24 flex-col
// has-data-[slot=attachment-content]:w-30`, plus the content's extra `px-1`)
// models a FIXED width (`widthVariable`, w-30 snapped to the spacing scale)
// and adds the content's `px-1` on top of each size's own `px-N`; that padding
// depends on BOTH axes, so it lives in `combinationOverrides` per Size.
// `flex-col` only restacks the media part above the content, which isn't
// modeled.
function buildAttachmentAxes(
  attachmentSource: string,
  spacing: Record<string, number>,
  radius: Record<string, number>,
  fontSize: Record<string, number>,
  baseRadius: { figmaName: string; deltaPx: number },
  notes: string[],
  buildSections: (paddingHVar: string, titleFontVar: string) => FigmaComponentSectionPlanItem[],
): FigmaComponentAxisPlanItem[] {
  const tokenPx = (figmaName: string, scale: Record<string, number>) => scale[figmaName.split("/").pop() as string];
  const axes: FigmaComponentAxisPlanItem[] = [];

  // ---- Size ----
  let sizeEntries: Array<[string, string]> = [];
  try {
    sizeEntries = parseCvaAxis(attachmentSource, "size");
  } catch {
    notes.push("Attachment: could not find a `size` axis in the vendored source, so no Size property was built — Attachment stays one size (real vendored source may have changed shape).");
  }
  const contentPadClass = (classes: string[], axis: "px" | "py"): { cls: string; px: number } | null => {
    for (const cls of classes) {
      const m = cls.match(new RegExp(`^has-data-\\[slot=attachment-content\\]:(${axis}-\\d+(?:\\.\\d+)?)$`));
      if (!m) continue;
      const px = tailwindClassPx(m[1]);
      if (px !== null) return { cls, px };
    }
    return null;
  };
  type SizeInfo = { label: string; padXPx: number; padXClass: string; padHVar: string; titleFontVar: string };
  const sizeInfo = new Map<string, SizeInfo>(); // label -> what the Orientation combos need

  if (sizeEntries.length > 0) {
    const options: FigmaComponentAxisPlanItem["options"] = [];
    const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
    const disclosures: string[] = [];
    for (const [sizeName, classString] of sizeEntries) {
      const classes = classString.split(/\s+/).filter(Boolean);
      const label = capitalize(sizeName);
      const padX = contentPadClass(classes, "px");
      const padY = contentPadClass(classes, "py");
      const textClass = classes.find((cls) => cls.startsWith("text-") && tailwindClassPx(cls) !== null);
      if (!padX || !padY || !textClass) {
        skippedOptions.push({ name: sizeName, reason: "no readable `has-data-[slot=attachment-content]:px-N`, `:py-N` and bare `text-*` classes in this size's real class string, so padding and Title size can't be derived" });
        continue;
      }
      const padXMatch = nearestToken(padX.px, spacing, "spacing");
      const padYMatch = nearestToken(padY.px, spacing, "spacing");
      const titleMatch = nearestToken(tailwindClassPx(textClass) as number, fontSize, "typography/primitive/fontSize");
      const roundedClass = classes.find((cls) => cls.startsWith("rounded-"));
      let radiusMatch = baseRadius;
      if (roundedClass === "rounded-lg") radiusMatch = exactRadiusLg(radius);
      else if (roundedClass && roundedClass !== "rounded-xl") {
        disclosures.push(`Size ${label}: radius class ${roundedClass} isn't one this builder understands, so the base rounded-xl radius is kept.`);
      }

      // Default's own snaps are already disclosed by the base plan's notes.
      if (sizeName !== "default") {
        if (padYMatch.deltaPx > 0) disclosures.push(`Size ${label}: vertical padding ${padY.cls.split(":")[1]} (${padY.px}px) snapped to ${padYMatch.figmaName} (${tokenPx(padYMatch.figmaName, spacing)}px), ${padYMatch.deltaPx}px off — no exact spacing token.`);
        if (padXMatch.deltaPx > 0) disclosures.push(`Size ${label}: horizontal padding ${padX.cls.split(":")[1]} (${padX.px}px) snapped to ${padXMatch.figmaName} (${tokenPx(padXMatch.figmaName, spacing)}px), ${padXMatch.deltaPx}px off — no exact spacing token.`);
        if (titleMatch.deltaPx > 0) disclosures.push(`Size ${label}: Title text size ${tailwindClassPx(textClass)}px snapped to ${titleMatch.figmaName}, ${titleMatch.deltaPx}px off — no exact type-scale token.`);
      }
      const gapClass = classes.find((cls) => /^gap-\d/.test(cls));
      if (gapClass) disclosures.push(`Size ${label}: ${gapClass} (the space between Attachment's media, content and actions parts) isn't modeled — this Figma Attachment has only the one text section.`);
      const mediaPad = classes.find((cls) => cls.startsWith("has-data-[slot=attachment-media]:"));
      if (mediaPad) disclosures.push(`Size ${label}: ${mediaPad} (the padding when the Attachment holds only a media part) isn't modeled — Media isn't part of this Figma Attachment.`);

      sizeInfo.set(label, { label, padXPx: padX.px, padXClass: padX.cls.split(":")[1], padHVar: padXMatch.figmaName, titleFontVar: titleMatch.figmaName });
      options.push({
        name: label,
        overrides: {
          radiusVariable: radiusMatch.figmaName,
          sectionGapVariable: padYMatch.figmaName,
          sections: buildSections(padXMatch.figmaName, titleMatch.figmaName),
        },
      });
    }
    if (options.length > 0) {
      disclosures.push("Size: AttachmentDescription keeps its own explicit text-xs (12px) in every size, and the media part's per-size classes (group-data-[size=X]/attachment: width, radius, icon size on AttachmentMedia) aren't modeled — Media isn't part of this Figma Attachment.");
      disclosures.push(...describeIdenticalOptions("Size", options));
      if (skippedOptions.length > 0) disclosures.push(`Size options not built: ${skippedOptions.map((o) => `${o.name} (${o.reason})`).join(", ")}.`);
      axes.push({ propertyName: "Size", options, skippedOptions, disclosures });
    } else {
      notes.push("Attachment: no size in the vendored `size` axis had readable padding and text classes, so no Size property was built — Attachment stays one size.");
    }
  }

  // ---- Orientation ----
  let orientationEntries: Array<[string, string]> = [];
  try {
    orientationEntries = parseCvaAxis(attachmentSource, "orientation");
  } catch {
    notes.push("Attachment: could not find an `orientation` axis in the vendored source, so no Orientation property was built — Attachment stays one orientation (real vendored source may have changed shape).");
  }
  if (orientationEntries.length > 0) {
    const contentSource = attachmentSource.match(/data-slot="attachment-content"[\s\S]*?cn\(\s*"([^"]*)"/)?.[1] ?? "";
    const contentTokens = contentSource.split(/\s+/).filter(Boolean);
    const options: FigmaComponentAxisPlanItem["options"] = [];
    const skippedOptions: FigmaComponentAxisPlanItem["skippedOptions"] = [];
    const disclosures: string[] = [];
    for (const [orientationName, classString] of orientationEntries) {
      const classes = classString.split(/\s+/).filter(Boolean);
      const label = capitalize(orientationName);
      const overrides: FigmaComponentLayoutOverrides = {};
      let combinationOverrides: Record<string, FigmaComponentLayoutOverrides> | undefined;

      // The content's extra horizontal padding for this orientation, from AttachmentContent's own classes.
      const contentPadToken = contentTokens.find((cls) => new RegExp(`^group-data-\\[orientation=${orientationName}\\]/attachment:px-\\d`).test(cls));
      const contentPadPx = contentPadToken ? tailwindClassPx(contentPadToken.split(":")[1]) : null;
      // The fixed width when the Attachment holds a content part (the modeled case).
      const widthToken = classes.find((cls) => /^has-data-\[slot=attachment-content\]:w-\d/.test(cls));
      const widthMatch = widthToken?.match(/:w-(\d+(?:\.\d+)?)$/);
      const widthPx = widthMatch ? parseFloat(widthMatch[1]) * 4 : null;

      if (widthPx !== null) {
        const widthTokenMatch = nearestToken(widthPx, spacing, "spacing");
        overrides.widthVariable = widthTokenMatch.figmaName;
        const widthClass = (widthToken as string).split(":")[1];
        if (widthTokenMatch.deltaPx > 0) disclosures.push(`Orientation ${label}: width ${widthClass} (${widthPx}px, the width when the Attachment holds a content part) snapped to ${widthTokenMatch.figmaName} (${tokenPx(widthTokenMatch.figmaName, spacing)}px), ${widthTokenMatch.deltaPx}px off — no exact spacing token that wide, so the Figma ${label} Attachment is narrower than the real one.`);
        else disclosures.push(`Orientation ${label}: width ${widthClass} (${widthPx}px) is a fixed ${tokenPx(widthTokenMatch.figmaName, spacing)}px (${widthTokenMatch.figmaName}).`);
        disclosures.push(`Orientation ${label}: Title and Description truncate with an ellipsis when too long for the fixed width (like the real component's truncate), so a longer text shows cut off.`);
      }
      if (contentPadPx !== null) {
        combinationOverrides = {};
        for (const info of sizeInfo.values()) {
          const sumMatch = nearestToken(info.padXPx + contentPadPx, spacing, "spacing");
          combinationOverrides[`Size=${info.label}`] = { sections: buildSections(sumMatch.figmaName, info.titleFontVar) };
          if (sumMatch.deltaPx > 0) disclosures.push(`Orientation ${label} with Size ${info.label}: horizontal padding ${info.padXClass} (${info.padXPx}px) plus the content's own ${(contentPadToken as string).split(":")[1]} (${contentPadPx}px) is ${info.padXPx + contentPadPx}px, snapped to ${sumMatch.figmaName} (${tokenPx(sumMatch.figmaName, spacing)}px), ${sumMatch.deltaPx}px off — no exact spacing token.`);
        }
      }
      const minW = classes.find((cls) => /^min-w-\d/.test(cls));
      if (minW) disclosures.push(`Orientation ${label}: ${minW} (a minimum width) isn't modeled — the Figma ${label} Attachment hugs its text, as before.`);
      if (classes.includes("flex-col")) disclosures.push(`Orientation ${label}: flex-col (stacks the media part above the content) has no visible effect here — Media isn't part of this Figma Attachment.`);
      const noContentWidth = classes.find((cls) => /^w-\d/.test(cls));
      if (noContentWidth) disclosures.push(`Orientation ${label}: ${noContentWidth} (the width when the Attachment has no content part) isn't modeled — this Figma Attachment always has its Title and Description.`);
      if (orientationName === "vertical") disclosures.push("Orientation Vertical: AttachmentActions' vertical placement (absolute, top-right) and the media part's vertical sizing aren't modeled — Media and Actions aren't part of this Figma Attachment.");

      options.push({ name: label, overrides, ...(combinationOverrides ? { combinationOverrides } : {}) });
    }
    disclosures.push(...describeIdenticalOptions("Orientation", options));
    axes.push({ propertyName: "Orientation", options, skippedOptions, disclosures });
  }

  // Combinations that come out identical only ACROSS the two axes (the
  // per-axis helper above can't see these): merge each combination the same
  // way SKILL.md step 2c does and compare.
  if (axes.length === 2) {
    const [sizeAxis, orientationAxis] = axes;
    const seen = new Map<string, string>();
    const crossLines: string[] = [];
    for (const orientationOption of orientationAxis.options) {
      for (const sizeOption of sizeAxis.options) {
        const merged = Object.assign(
          {},
          sizeOption.overrides,
          orientationOption.overrides,
          sizeOption.combinationOverrides?.[`Orientation=${orientationOption.name}`] ?? {},
          orientationOption.combinationOverrides?.[`Size=${sizeOption.name}`] ?? {},
        );
        const key = JSON.stringify(merged);
        const first = seen.get(key);
        const name = `Size=${sizeOption.name}, Orientation=${orientationOption.name}`;
        if (first === undefined) seen.set(key, name);
        else crossLines.push(`Orientation combined with Size: ${name} renders identical to ${first} in Figma (both snap to the same tokens) — still created so the Figma property values match the code's own values.`);
      }
    }
    orientationAxis.disclosures = [...(orientationAxis.disclosures ?? []), ...crossLines];
  }

  for (const axis of axes) {
    for (const line of axis.disclosures ?? []) notes.push(`Attachment ${line.startsWith(axis.propertyName) ? "" : `${axis.propertyName} `}${line}`.replace(/\s+/g, " "));
  }
  return axes;
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
  { filename: "progress.tsx", name: "Progress", build: buildProgressPlan },
  { filename: "tabs.tsx", name: "Tabs", build: buildTabsPlan },
  { filename: "accordion.tsx", name: "Accordion", build: buildAccordionPlan },
  { filename: "tooltip.tsx", name: "Tooltip", build: buildTooltipPlan },
  { filename: "checkbox.tsx", name: "Checkbox", build: buildCheckboxPlan },
  { filename: "spinner.tsx", name: "Spinner", build: buildSpinnerPlan },
  { filename: "switch.tsx", name: "Switch", build: buildSwitchPlan },
  { filename: "radio-group.tsx", name: "RadioGroup", build: buildRadioGroupPlan },
  { filename: "attachment.tsx", name: "Attachment", build: buildAttachmentPlan },
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
  // Which semantic tokens this project really has (see FADE_FILL_TOKENS). A mode file that
  // does not exist (light-only / dark-only projects) is simply skipped.
  projectSemanticCssVars = new Set<string>();
  for (const modeFile of ["light.css", "dark.css"]) {
    const modePath = join(codeDir, "css", modeFile);
    if (!existsSync(modePath)) continue;
    for (const m of readFileSync(modePath, "utf-8").matchAll(/(--color-semantic-[a-z0-9-]+)\s*:/g)) projectSemanticCssVars.add(m[1]);
  }

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
