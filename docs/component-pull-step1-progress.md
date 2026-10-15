# Component pull, step 1 — build progress (source records)

Working file for building **step 1** of the Figma→code component pull (see `pipeline-plan.md`,
"Tokens and components round-trip differently"). Kept accurate at every point so a fresh agent can
resume from files alone. Started 2026-10-15.

## Goal (one paragraph)

`figma-components-plan.ts` builds `figma-components-push-plan.json` (which Figma variable every
property of every component/variant/axis option/state uses). Step 1 adds a SEPARATE output,
`figma-components-sources.json`, that records for every variable binding the replay actually applies
WHERE it came from in code (file + exact class + location), or that it is `"derived"` (no single class
to edit). The plan JSON (`components` and `notes`) must stay **byte-identical**.

## Record schema (final — defined in `cli/src/scaffold/figma-components-sources.ts`)

```ts
type FigmaComponentSourceProperty =
  | "fill" | "stroke" | "textColor" | "ringColor"
  | "radius" | "paddingHorizontal" | "paddingVertical" | "paddingBottom" | "itemSpacing"
  | "height" | "width" | "fontSize" | "fontFamily";

interface FigmaComponentSourceRecordBase {
  component: string;                   // plan component name, e.g. "Button"
  combination: Record<string, string>; // Figma variant property -> value, exactly as the replay names it:
                                       // { Variant: "Destructive", Size: "Sm", State: "Hover" }
                                       // (Variant always; then each extraAxes propertyName; then State if any)
  part?: string;                       // node inside the component; ABSENT = the component's own root node
  property: FigmaComponentSourceProperty;
  variable: string;                    // the Figma variable bound, e.g. "color/semantic/action/primary"
}
interface FigmaComponentClassOrigin {
  origin: "class";
  file: string;      // vendored file name, e.g. "button.tsx"
  class: string;     // the exact full class as written in source, e.g. "hover:bg-primary/80"
  location: string;  // "cva <const> base" | "cva <const> variants.<axis>.<key>" | "function <Name>"
  shared: boolean;   // true when more than one record (binding) traces to this same file+location+class
  snapped?: { classPx: number; tokenPx: number }; // only when the class's px was snapped to a different token px
}
interface FigmaComponentDerivedOrigin {
  origin: "derived";
  reason: string;    // plain language: why no single class can be edited to reproduce this binding
}
type FigmaComponentSourceRecord = FigmaComponentSourceRecordBase & (FigmaComponentClassOrigin | FigmaComponentDerivedOrigin);
interface FigmaComponentsSources { version: 1; records: FigmaComponentSourceRecord[] }
```

`part` values: `PrimaryText`, `SecondaryText`, `InlineLink` (Alert's link range), a sections text
line's `labelPropertyName` (e.g. `Title`), `Section:<first line label>` (a section frame's own
padding), `Line` (FieldSeparator's two line rects), `CenterLabelText`, `FlankLine` (Marker
Separator's two lines), `Indicator` (Progress), `Thumb` (Switch), `Icon` (any lucide icon vector),
`CenterDot` (RadioGroup). Root = absent `part` (a frame, a bare Separator rectangle, Progress's track,
Switch's track).

Property → Figma field: `fill` = fills[0] colour; `stroke` = strokes[0] colour (a vector's strokes for
`Icon`); `textColor` = a TEXT node's fills (for `InlineLink`, the range fill at the end of
SecondaryText); `ringColor` = the drop-shadow ring effect colour; `radius` = all four corner radii;
`paddingHorizontal` = paddingLeft+Right; `paddingVertical` = paddingTop+Bottom (when a `paddingBottom`
record also exists for that combination, `paddingVertical` is only paddingTop); `itemSpacing`; `height`;
`width` (an `iconOnly`/`square` frame binds width+height to the same variable: two records);
`fontSize`; `fontFamily`.

## How records are collected (design)

- **Origin registry** (`figma-components-sources.ts`): a module-level `WeakMap<object, Record<field, origin>>`.
  Builders tag the exact plan object + field they set (`tag(obj, "fillVariable", origin)`). Tagging
  never changes the plan objects, so the plan JSON is untouched.
- **Origin helpers**: `classOrigin(cls, within, snap?)` finds the class token in the vendored file's
  string literals (preferring literals whose tokens all sit inside `within`, the class string the
  builder parsed), computes its location, and returns a `"class"` origin — or a `"derived"` origin
  ("not found"/"ambiguous") if it can't pin exactly one location. `derivedOrigin(reason)`.
  The current file/source is set per component by `buildFigmaComponentsPushPlanWithSources`
  (`setSourceContext`), so helpers deep in shared builders know which file they're reading.
- **Shared chokepoints tagged**: `scanClassesForColors`, `buildVariantsFromCva`,
  `buildStatesForVariants` (incl. fade-token / stateOverrides → derived), `buildCvaSizeAxis`; then each
  bespoke builder / axis builder.
- **Walker** (`collectFigmaComponentSources(plan)`): emulates SDSGT-figma-push's replay merge exactly
  (step 2c: `item = Object.assign({}, component, ...overrides, ...combinationOverrides)`,
  `variantItem = Object.assign({}, variant, ...variantOverrides, stateFields)`, `ignoreStates`), but
  tracks WHICH object supplied each final value, then looks up that object's tag. One record per
  bound property per combination. `shared` is computed at the end. Bindings with no tag are returned
  in `unrecorded` (and omitted from the file) so the check script flags them.
- **Entry points**: `buildFigmaComponentsPushPlanWithSources(codeDir, uiDir)` → `{ plan, sources, unrecorded }`;
  `buildFigmaComponentsPushPlan` keeps its exact signature and output.

## Verification commands (run from `Tool/cli`, i.e. `cli/`)

```sh
BASE="/Users/migjulio/Scaffolded Design System Generation Tool (SDSGT)/.tmp/component-pull-step1/baseline-plan.json"
node scripts/regen-components-plan.ts --out /tmp/sdsgt-plan.json --sources-out /tmp/sdsgt-sources.json
cmp "$BASE" /tmp/sdsgt-plan.json && echo PLAN-IDENTICAL
npm run typecheck
node scripts/check-components-sources.ts --plan /tmp/sdsgt-plan.json --sources /tmp/sdsgt-sources.json [--component Button]
# (also: npm run check:components-sources -- --plan ... --sources ...)
```

Baseline plan (pre-change, from commit `4e2baf1`): `.tmp/component-pull-step1/baseline-plan.json`
(repo root, gitignored). Original copy: `/private/tmp/claude-502/-Users-migjulio-Scaffolded-Design-System-Generation-Tool--SDSGT-/10619656-a7a2-44e1-a9dc-45d4cf3a5b0e/scratchpad/baseline-plan.json`.
If both are missing: `git worktree add /tmp/sdsgt-base 4e2baf1`, then from `/tmp/sdsgt-base/Tool/cli`
run `node scripts/regen-components-plan.ts --code-dir "<repo>/Demo/out/Code tokens (consumables)/sdsgt-demo" --ui-dir "<repo>/Demo/sdsgt-demo-app/src/components/ui" --out <baseline path>`
(needs `node_modules` — symlink `Tool/cli/node_modules` in if missing), then `git worktree remove /tmp/sdsgt-base`.

The check script walks the plan JSON independently (its own copy of the replay merge, written from
SKILL.md), requires exactly one record per bound property per combination with the same variable and
no extra records, and verifies every `"class"` record's class token really appears in that file at
that location.

## Component checklist (COMPONENT_BUILDERS order)

- [x] Infrastructure: schema + registry + helpers + walker + check script + regen/nextjs/cli.ts-help wiring (both walkers agree: 3011 bindings)
- [x] Button (button.tsx) — 1296 records (1004 class / 292 derived). Tagged in shared `buildVariantsFromCva`, `buildStatesForVariants`, `buildCvaSizeAxis`; fontFamily tagged centrally in `buildFigmaComponentsPushPlanWithSources`.
- [x] Badge (badge.tsx) — 145 (112 class / 33 derived). Top-level hardcoded targets map to real base classes (py-0.5 snaps 2px→0).
- [x] Toggle (toggle.tsx) — 258 (186/72). Size axis replaces top-level padding/font/radius (top-level tagged anyway).
- [x] Alert (alert.tsx) — 44 (34/10). Stroke derived (bare `border`, colour from global base rule); InlineLink rest colour derived (inherits description).
- [x] Input (input.tsx) — 31 (22/9). Text = real `placeholder:text-muted-foreground`; Disabled = user-decision solid tokens (derived).
- [x] Textarea (textarea.tsx) — 31 (22/9). Same as Input.
- [x] Card (card.tsx) — 26 (24/2). Padding + gap + section padding all = the root's `[--card-spacing:--spacing(N)]` (shared); Title/Content colour = root `text-card-foreground` (inherited); stroke derived (ring-1 ring-foreground/10 approximated).
- [x] Kbd (kbd.tsx) — 7 (5/2). Vertical padding derived (computed from h-5/text-xs).
- [x] NativeSelect (native-select.tsx) — 74 (50/24). Sm classes recorded with their full `data-[size=sm]:` prefix; padding = `pl-2.5` used for both sides.
- [x] Avatar (avatar.tsx) — 24 (21/3). Ring stroke = root's `after:border-border`; size via `size-N`/`data-[size=X]:size-N`.
- [x] Label (label.tsx) — 12 (2/10). Zero padding/radius derived (no class exists).
- [x] Skeleton (skeleton.tsx) — 4 (2/2). Padding = representative stand-in (derived).
- [x] Breadcrumb (breadcrumb.tsx) — 11 (7/4). Zero item padding / radius derived.
- [x] Empty (empty.tsx) — 11 (8/3). sectionGap: padding = `p-6` (class), gap = derived (real gap-4 approximated). Uses property-specific tags (`sectionGapVariable@itemSpacing`).
- [x] Field (field.tsx) — 69 (32/37). Gap = `gap-2` (cva base); padding derived; Label font size derived (lives in label.tsx); Invalid = `data-[invalid=true]:text-destructive`; Disabled = solid token (derived).
- [x] Separator (separator.tsx) — 2 (2/0). Both orientations = `bg-border`.
- [x] FieldSeparator (field.tsx — same file as Field) — 4 (3/1). Line colour derived (nested Separator, colour in separator.tsx).
- [x] Item (item.tsx) — 255 (192/63). Size classes located by `variants.size.<key>` (default and sm strings are identical); gap between sections derived (single section).
- [x] Marker (marker.tsx) — 22 (8/14). Separator's flank-line colour and gap derived (two classes / a sum of classes); Border = `border-border` + `pb-2`.
- [x] Bubble (bubble.tsx) — 220 (161/59). States read from a synthetic source: `setSourceAlias` maps `hover:`/`focus-visible:` back to the real `[&>[data-slot=bubble-content]:is(button,a):hover]:` / `[button,a]:focus-visible:` classes.
- [x] Progress (progress.tsx) — 5 (5/0). Indicator height = the track's `h-1` (indicator is h-full).
- [x] Tabs (tabs.tsx) — 111 (85/26). Active colours = `data-active:` classes; Inactive text = solid `text.tab-inactive` (derived); Line style bar = `after:bg-foreground`.
- [x] Accordion (accordion.tsx) — 26 (13/13). Zero horizontal padding derived.
- [x] Tooltip (tooltip.tsx) — 7 (6/1).
- [x] Checkbox (checkbox.tsx) — 28 (24/4). Checked = `data-checked:bg-primary` / `data-checked:border-primary`; icon = `data-checked:text-primary-foreground` (via text-current). Helper `tagCheckedControl`.
- [x] Spinner (spinner.tsx) — 1 (0/1). Icon colour derived (currentColor, no class).
- [x] Switch (switch.tsx) — 64 (56/8). Track = `data-checked:bg-primary` / `data-unchecked:bg-input`; thumb = `bg-background`; tagged in `makeThumb`.
- [x] RadioGroup (radio-group.tsx) — 28 (24/4). Center dot = the span's `bg-primary-foreground`.
- [x] Attachment (attachment.tsx) — 195 (138/57). Vertical + Size padding = sum of two classes (derived); stroke derived (bare `border`); Hover = user-decision solid token.
- [x] Docs: pipeline-plan.md entry (Build status + step 1) + figma-components-plan.ts header comment + cli.ts help text

## Result (2026-10-15): all 29 done

3011 records = 3011 bindings (2248 `class`, 763 `derived`); plan byte-identical to the baseline;
`npm run typecheck` clean; check script OK (241 distinct class origins verified at their locations);
no ambiguous or not-found classes; sources output deterministic (two runs byte-identical); QA case CLI-6
passes (25/25). File size ~945 KB for the Demo project.

## How to resume

1. Read this file, then `cli/src/scaffold/figma-components-sources.ts` (schema, helpers, walker).
2. Run the verification commands. `check-components-sources.ts` lists, per component, unrecorded
   bindings and bad class records — the first unchecked component above is where to continue.
3. For a component: find its builder in `figma-components-plan.ts` (search `function build<Name>Plan`),
   tag every variable-bound field it (or its axis/state builder) sets with `tag(...)` +
   `classOrigin(...)` / `derivedOrigin(...)`. Re-run verification; spot-check against
   `Demo/sdsgt-demo-app/src/components/ui/<file>`. Tick it here with a one-line note.
4. Never commit; never touch `node_modules/`; never edit the SDSGT-figma-push skill.

## Notes per component (filled in as each is done)

- Button: derived = fontFamily, Destructive's text (same-tone readability fix), Ghost/Outline text
  (no text class, inherited), Default Hover fill (fade token `action/primary-hover-soft`), all rings
  (baked ring tokens), Destructive Hover (user decision). Component-level padding is derived but never
  bound (every Size option replaces it).
- Fix made while doing Alert: `buildVariantsFromCva`/`scanClassesForColors` let the LAST matching class
  win; for Alert Destructive the title colour came from `*:data-[slot=alert-description]:text-destructive/90`
  (a class that styles the description). Same variable, so the plan is unchanged, but the ORIGIN now
  prefers the earlier plain class (`text-destructive`) when a selector-prefixed class only repeats the value.
- New helpers in figma-components-plan.ts: `tagFields`, `tagLike`, `cvaBase`, `withColorTags`, `dataSizeToken`,
  `placeholderTextOrigin`, `radiusSnapOf`; `CardSectionOrigins` (Card's per-size origins).
- sources module additions: a tag key may be `"<field>@<property>"` (walker tries it first) for a field the
  replay binds to two properties with different real origins (`sectionGapVariable` = padding AND gap);
  `classOrigin(cls, within, snapped, locationSuffix)` — the suffix (e.g. `variants.size.sm`) separates
  identical strings in two cva entries (Item's size.default and size.sm are the same string).
- `buildStatesForVariants` now passes `variants.<axis>.<key>` for classes read from a variant's own cva
  entry (Bubble Outline/Ghost hover classes are textually identical). `classOrigin`'s `within` match
  accepts a literal that is a subset OR a superset of the parsed string.
