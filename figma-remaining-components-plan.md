# Plan: Tackle all remaining Next.js shadcn/ui components for the Figma component push

## Context

The Figma component push (`cli/src/scaffold/figma-components-plan.ts`, replayed by `.claude/skills/SDSGT-figma-push/SKILL.md` step 7) covers 7 of shadcn/ui's ~62 real components today, live-proven: Button, Badge, Toggle, Alert, Input, Textarea, Card. The user asked for a full batch-by-batch plan to cover as much of the remaining ~54 components as is honestly achievable, rather than continuing to pick components ad hoc.

A dedicated read-only survey (every one of the 54 remaining real source files, read in full) produced a ground-truth catalog bucketed by structural shape against the three mechanisms that exist today:
1. `buildVariantsFromCva` — real `cva()` variant axis, distinct colors per option.
2. `scanClassesForColors` — no `cva()`, one plain class string, still box-shaped.
3. `sections`/`FigmaComponentSectionPlanItem` — compound, vertical stack of text-only sections (Card's shape).

A second pass designed the concrete, sequenced batches below against that catalog, cross-checked against the real current `figma-components-plan.ts` source (confirmed exact function signatures before proposing changes to them). Three open scope questions were resolved directly with the user:
- **Marker** (no real color-variant axis) → ship as a colorless single-variant box, not skipped.
- **Interactive components** (Tabs/Accordion/Tooltip etc.) → reframe three specific ones (Tabs full, Accordion's trigger row only, Tooltip's content box only) as **static** multi-variant components, since Figma components don't need real click/hover/drag behavior — a tab's active/inactive state is exactly as "static" as Button's own Default/Outline/Ghost variants already are. Decline the rest (Dialog/Sheet/Popover/DropdownMenu/Select/etc.) — stripped of their real overlay mechanics they'd just be a re-skinned Card with no new design information.
- **The 6 "chat/AI kit" files** (a newer shadcn/ui registry extension, not the classic set) → included now, not deferred. In practice this only changes scheduling for `bubble.tsx` and `marker.tsx` (the only two with a buildable path) — the other four are still blocked by the same real, unrelated technical gaps (icons, interactive structure) as their classic-set bucket-mates.

Every batch ends at the same bar step 7 already applies to all 7 shipped components: plan JSON inspected → real compiled build + live browser check where a UI exists to check → live Figma push → `figma_capture_screenshot` → real instance `setProperties()` swap → screenshot → clean up the validation instance. No batch is "done" on plan computation alone — that discipline is exactly what caught the Alert same-tone-trap bug and the `radius/lg`-vs-`radius/md` bug earlier this session, both of which shipped invisible from the plan JSON alone.

## Batch sequence

**Batch 1 — `kbd.tsx`, `native-select.tsx`, `avatar.tsx` (AvatarFallback only)**
Mechanism: existing, as-is — identical shape to Input/Textarea (one plain class string, no `cva()`, known color paths `background.secondary`/`text.secondary`/`border.default`). Zero changes to shared code. AvatarImage (a real photo) is not modeled — fallback-only, disclosed the same way CardFooter is. Lowest risk in the plan; verify Avatar's own real box-height-vs-radius pill look the same way Badge's own header already checked this for its shape, since Avatar's real size class hasn't been checked against every radius preset yet.

**Batch 2 — `label.tsx`**
Mechanism: existing, needs one signature extension. `scanClassesForColors` currently has no fallback built in — both existing callers (`buildInputPlan`/`buildTextareaPlan`) inline `?? sdsgtPathToFigmaName("text.secondary")` at the call site for their own specific reason (representing placeholder text, not "no class found"). Label has no explicit `text-*` class at all and needs the real base-layer-inheritance fallback (`text.primary`) — the same class of finding as Alert's own `border.default` fallback. Add an optional `fallbackTextPath: string = "text.primary"` parameter to `scanClassesForColors`; update Input/Textarea's call sites to pass `"text.secondary"` explicitly (no behavior change, just makes their already-disclosed exception visible); `buildLabelPlan` calls with no second argument.

**Batch 3 — `skeleton.tsx`**
Mechanism: existing, needs one schema + skill change. First component with NO text at all. Make `FigmaComponentVariantPlanItem.textVariable` optional; guard `SKILL.md` step 7's text-child creation and step 4's label-property binding to skip when absent. The `animate-pulse` shimmer itself is not reproduced — disclosed, static gray box only.

**Batch 4 — `empty.tsx` (Header + Content only), `field.tsx` (FieldLabel/FieldDescription/FieldError only)**
Mechanism: existing (`sections`), as-is — both match Card's own Header/Content shape or a simple one-line-per-section pattern, using already-tabled color paths. `EmptyTitle`'s missing color class gets the same `text.primary` fallback reasoning as Batch 2 (hardcoded directly in `buildEmptyPlan`, no dependency on Batch 2's code). **Before hardcoding FieldError's color, confirm the real class is `text-destructive`** (not hidden behind a data-attribute) — the survey didn't quote this file's exact string. `EmptyMedia` (icon) and `FieldSeparator` are excluded from this batch.

**Batch 5 — `separator.tsx`, `field.tsx`'s `FieldSeparator`**
Mechanism: genuinely new — first non-box shape. A 1px line has no "hug contents" equivalent. Add `FigmaComponentLinePlanItem` (`colorVariable`, `thicknessPx`, `representativeLengthPx`, optional `centerLabel`) and a `line?` field on `FigmaComponentPlanItem`, mutually exclusive with `variants`/`sections`. `SKILL.md` step 7 gets one new branch: a fixed-size (non-auto-layout) rectangle, or a `[line, text, line]` row when `centerLabel` is present. Building both real consumers in the same batch (per this project's own "extract once a second consumer needs it" discipline) rather than a Separator-only special case.

**Batch 6 — `breadcrumb.tsx`**
Mechanism: existing (`sections`), needs one named extension. Items lay out horizontally, unlike Card's vertical stack. Add optional `textLineDirection?: "vertical" | "horizontal"` (default `"vertical"`, Card unaffected) and `separatorGlyph?: string` to `FigmaComponentSectionPlanItem`; the glyph is decorative only — explicitly NOT wired to a component property, disclosed in the plan's own `notes`.

**Batch 7 — `item.tsx` (outer frame + ItemTitle/ItemDescription only)**
Mechanism: existing, combined for the first time — no schema change needed (the interface already allows `variants` + `sections` together; no build function has exercised both at once). Outer `cva()` axis (default/outline/border-border/muted/bg-muted-50) via `buildVariantsFromCva` as-is; Title/Description via `sections`. `ItemMedia`/`ItemActions` excluded (icon + real interactive buttons). **Real, first-of-its-kind risk**: this is the first live test of `sections` rendering correctly across N>1 variants in the same component set — don't assume it "just works" because each half is separately proven; validate live per variant.

**Batch 8 — `marker.tsx`**
Mechanism: existing, as-is, reframed. Per the user's decision: ship as a one-variant box (same treatment as Input), running `scanClassesForColors` against the `default` option's own classes only — ignore the `cva()` axis entirely, since none of its options differ in color. Zero new code beyond a new `buildMarkerPlan`.

**Batch 9 — Parser capability: selector-prefix stripping + arbitrary-value skip rule (infrastructure)**
Mechanism: new extension to the most shared code in the file (`classToFigmaVariable`/`buildVariantsFromCva`). Two additions:
1. Strip a known selector prefix (`*:data-[slot=...]:`, `data-[state=...]:`) before the existing regex match — a pure preprocessing step, unchanged return contract.
2. Generalize the existing `bg-secondary`/`text-secondary-foreground` skip pattern: any class matching `/^(bg|text|border)-\[/` (an arbitrary-value utility with no possible token) gets pushed to `skippedVariants` with a clear reason, instead of silently mismatching or crashing.

**High relative risk** — this is the single most reused function in the file. After this change, re-run the full live screenshot-validation pass on Button/Badge/Toggle/Alert (the four `cva()`-based components), not just the new consumer, since a regression here silently affects every already-shipped component.

**Batch 10 — `bubble.tsx` (excluding the `tinted` variant)**
Mechanism: consumes Batch 9. Default/secondary/muted/outline/ghost/destructive become buildable once prefix-stripping lands (all reuse already-tabled paths, including Badge's own same-tone destructive fix recurring here for the same real reason). `tinted` (`bg-[oklch(...)]`) is permanently skipped automatically by Batch 9's own generalized arbitrary-value rule — no Bubble-specific carve-out needed.

**Batch 11 — `progress.tsx`**
Mechanism: genuinely new — first FIXED-size (non-hug-content) nested frame in the whole file. Add `FigmaComponentBarPlanItem` (`trackColorVariable`, `indicatorColorVariable`, `widthPx`, `representativeFillFraction`, `radiusVariable`, `heightVariable`) — the fill fraction is an explicitly disclosed representative stand-in (there's no live numeric value to bind, same "no fixed default state" category as `chart.tsx`, except Progress's fixed two-layer STRUCTURE is still worth representing). `SKILL.md` step 7 needs a new branch computing absolute pixel widths at build time (Figma auto-layout has no percentage-width concept). **Highest engineering risk in the plan** — new interface, new replay branch, first non-hug-content sizing path. Budget a full independent validation pass.

**Batch 12 — Tabs (full), Accordion (trigger row only), Tooltip (content box only)**
Mechanism: reframe as static multi-variant/single-state components, per the user's decision. **Mandatory first step, not yet done by anyone**: read the real current `tabs.tsx`/`accordion.tsx`/`tooltip.tsx` source in full before writing any plan code — the earlier survey never quoted real class strings for these three files (unlike Bubble's), so any assumed `data-[state=active]:`-shaped prefix is speculation based on Base UI convention, not a confirmed fact, and must be verified against real source the same way every other component in this file already was.
- **Tabs**: TabsTrigger's active/inactive is a real two-option color axis — model as a genuine `cva()`-or-manual variant, same shape as Toggle's own on/off.
- **Accordion**: model ONLY the trigger row (chevron + label). Its expandable Content is arbitrary caller-supplied children with no fixed shape — same reason `chart.tsx` is out of scope — do not attempt the panel itself.
- **Tooltip**: content box only (not the hover-trigger mechanics). Real, disclosed gotcha already found: its classes are `bg-foreground ... text-background` — a real, intentional fg/bg role INVERSION (dark tooltip, light text) that resolves correctly through the existing token table but reads as backwards to anyone auditing bound variable names later. Add an explicit disclosure comment in `buildTooltipPlan`, the same way `buildAlertPlan`'s own destructive-gate comment documents its own non-obvious-but-correct behavior — do not silently pass it through.

## Permanently out of scope (not deferred — declared closed, with reasons)

- **`chart.tsx`'s data-driven content** — Recharts' per-series colors come from a runtime, caller-defined `ChartConfig` with no fixed default state at all, categorically incompatible with this pipeline's "one deterministic plan computed once from static source" model. (`ChartTooltipContent`'s own static box could become its own tiny future component — that's not excluded by this ruling.)
- **NEEDS-ICON bucket**: `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, `spinner.tsx`, `attachment.tsx` — pending a real, separate icon-drawing-capability decision (constructing/embedding vector nodes via the Plugin API), a wholly different capability domain than anything this file does today. Even a "just the unchecked rest state" stub is declared out of scope, not merely deferred — unlike Input's placeholder-text choice (a normal, honest representation), a checkbox that can never show a checkmark reads as actively broken in a design file, not just incomplete.
- **NEEDS-INTERACTIVE-STRUCTURE, everything except the 3 reframed in Batch 12**: Dialog, AlertDialog, Sheet, Drawer, Popover, HoverCard, DropdownMenu, ContextMenu, Menubar, NavigationMenu, Select, Combobox, Command, InputGroup, InputOTP, Calendar, Carousel, Resizable, ScrollArea, MessageScroller, Slider, Table, Sidebar, Collapsible, Toast, Questionnaire — real overlay/portal/multi-row/drag/scroll-driven structure this pipeline has no representation for, and (per the user's own decision) not worth reframing as a stripped-down static shell, since several of these would just become a re-skinned Card with no real new design information.
- **`bubble.tsx`'s `tinted` variant specifically** — handled automatically and permanently by Batch 9's generalized arbitrary-value skip rule.
- **NOT-APPLICABLE bucket**: `aspect-ratio.tsx` (pure layout, no color), `direction.tsx` (bare re-export, no rendering), `message.tsx` (pure layout wrapper composing other components), `button-group.tsx`/`pagination.tsx`/`toggle-group.tsx` (compose already-solved Button/Toggle instances, no new color of their own).

## Critical files

- `cli/src/scaffold/figma-components-plan.ts` — every batch's actual implementation.
- `.claude/skills/SDSGT-figma-push/SKILL.md` — step 7's replay logic, updated alongside any schema change (Batches 3, 5, 6, 11 all need a matching skill update, not just a CLI change).
- `docs/layer2-layer3-plan.md` — dated entry per batch (or per closely-related batch group), matching this session's existing density/precision.
- `contracts-and-seeds.md`, `.claude/skills/SDSGT-start/SKILL.md` — scope-count updates ("N real components") after each batch, same as done for Batches 1-7 already shipped.

## Verification, per batch

1. Typecheck (`cd cli && npx tsc --noEmit`) after every code change.
2. Regenerate a real test project's `figma-components-push-plan.json` and inspect the new component's actual JSON output (not just that it doesn't crash).
3. Where the component renders visibly in a real page (everything except pure infrastructure batches 5/9/11's own internal logic): a real `next build` + live Playwright `getComputedStyle`/screenshot check that the real rendered component matches what the plan describes.
4. Live Figma push: build → `figma_capture_screenshot` → real instance `setProperties()` swap on every independent property → screenshot → remove the validation instance → final full-page screenshot confirming no orphans.
5. For Batch 9 specifically: re-run step 4 against Button/Badge/Toggle/Alert too, not just the new Bubble consumer.
6. Full `qa:matrix --group=cli` after any shared-code change (Batches 2, 3, 5, 6, 9, 11); `--group=core` if the change touches anything outside `figma-components-plan.ts` itself.
