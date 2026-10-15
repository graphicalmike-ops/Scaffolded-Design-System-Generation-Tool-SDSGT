# Component pull, step 1b — build progress (read every bound value from the code)

Working file for **step 1b** of the Figma→code component pull (see `pipeline-plan.md`, "Tokens and
components round-trip differently", step 1b). Kept accurate at every point so a fresh agent can
resume from this file plus the working tree. Started 2026-10-15. Nothing is committed.

## Goal

Every binding whose recorded origin (in `figma-components-sources.json`) is a code class must be
READ from the code: find the class of the right KIND in the right class string ("the `px-*` class in
Alert's cva base") and derive both the Figma token and the origin from whatever class is actually
there. Then a pull that edits a class in the code flows through to the next push and to the source
list, instead of being silently undone (old token pushed back), losing track of the class, or
crashing the push (exact-class safety throws).

Tools (in `cli/src/scaffold/figma-components-plan.ts`, search "Component pull, step 1b"):
`tokenFromClass(classString, kind, fallbackClass, scales, notes, label, prefix?)`,
`CLASS_KIND_PATTERN`, `radiusClassToken`, `classKindToken`. Badge (`buildBadgePlan`) is the pattern.

## Rules

1. Plan JSON byte-identical to baseline for the Demo project; sources identical except deliberate
   reclassifications (listed below).
2. Exact-class safety throws become kind checks (still throw if the SHAPE is gone).
3. User decisions / disclosed approximations stay; where they REPLACE what the class gives, origin = `derived`.
4. Never-bound top-level values (axis overrides every combination) only change if the check fails.
5. Notes stating a class's px use the value actually read.
6. No commit, no `node_modules/` edits, don't touch the SDSGT-figma-push skill.

## Verification (run from `Tool/cli`)

```sh
R="../../.tmp/component-pull-step1b"
node scripts/regen-components-plan.ts --out /tmp/p.json --sources-out /tmp/s.json
cmp $R/baseline-plan.json /tmp/p.json && cmp $R/baseline-sources.json /tmp/s.json && echo IDENT
node scripts/check-components-roundtrip.ts [--component <Name>]   # or npm run check:components-roundtrip
npm run typecheck
npm run check:components-sources -- --plan /tmp/p.json --sources /tmp/s.json
node scripts/qa-matrix.ts --group=core,achromatic,mismatch,baseline,boundary,cli --out=/tmp/qa-after
```

Shortcut: `PRESETS=1 bash .tmp/component-pull-step1b/v.sh Alert Card` (repo root) runs the IDENT compare, the
other-preset compare, and the roundtrip check for the named components.

Baselines (repo root, gitignored): `.tmp/component-pull-step1b/baseline-plan.json`,
`.tmp/component-pull-step1b/baseline-sources.json`. If sources differ, `diff` them with `jq` to
confirm only the listed reclassifications changed.

Starting state (2026-10-15): roundtrip check = 241 class origins, 134 pass, 97 fail, 10 not swappable.
QA matrix before: see "QA" below.

## Checklist (failing class origins per component at start)

- [x] Badge — converted before this file was written (pattern).
- [x] Button (1): base rounded-lg — `resolveRadiusClass` now maps EVERY named radius class by name (was `rounded-lg` only), so the Size axis follows a base radius edit. Top-level radius/padding left as is (never bound: Size axis overrides).
- [x] Toggle (1): base rounded-lg — same `resolveRadiusClass` fix.
- [x] Alert (8): `tokenFromClass` on cva base + AlertDescription; description colour + link hover colour via new `colorFromClass(classString, kind, prefix)`. Fix: a `*:`-prefixed class (styles a CHILD) no longer overrides an element's own plain colour class (`buildVariantsFromCva` + `scanClassesForColors`). Was: base px-2.5, py-2, rounded-lg, text-sm; Description text-sm, text-muted-foreground; destructive text-destructive; Description [&_a]:hover:text-foreground
- [x] Input (5): `tokenFromClass` on className; placeholder colour read from `placeholder:text-*` (notes now name the class/variable read). Was: px-2.5, py-1, rounded-lg, text-base, placeholder:text-muted-foreground
- [x] Textarea (5): same as Input. Was: px-2.5, py-2, rounded-lg, text-base, placeholder:text-muted-foreground
- [x] Card (7): exact-class throws for rounded-xl/bg-card -> kind checks (root must have a rounded-* class, a bg-* and text-* colour, and a `[--card-spacing:--spacing(N)]`); radius/fonts via `tokenFromClass`; fill, Title/Content colour (root text-*) and Description colour via `colorFromClass`; `--card-spacing` read from the root (first kept binding `spacing/N` by NAME; changed 2026-10-15 by user decision to the token NEAREST N x 4px, like the Size options — Demo unchanged, bootstrap's Card now binds spacing/3 = 16px, what the browser draws, instead of spacing/4 = 24px). Was: rounded-xl (throws), bg-card (throws), CardTitle text-base, root text-card-foreground, CardDescription text-sm + text-muted-foreground, root text-sm
- [x] Kbd (3): `tokenFromClass` for radius/px/text/h; derived vertical padding now computed from the read h-* and text-* (reason text names them). Radius now by name (`radius/sm`) instead of nearest-to-radius.sm px (same token in all 5 checked presets). Was: px-1, rounded-sm, text-xs
- [x] NativeSelect (3): `tokenFromClass` (kind `paddingLeft` for the text side); the asymmetric-padding note names the classes read. Was: pl-2.5, rounded-lg, text-sm
- [x] Avatar (4): marker throws for size-8/rounded-full/bg-muted -> kind checks (AvatarFallback needs a bg-* colour and a rounded-* class); radius via `tokenFromClass`; ring colour from the root's `after:border-*` via `colorFromClass(…, "border", "after:")`. Top-level padding/font left (never bound, Size axis). Was: size-8 (throws), AvatarFallback rounded-full, bg-muted (throws), after:border-border
- [x] Label (1): font size via `tokenFromClass`. Was: text-sm
- [x] Skeleton (1): radius via `tokenFromClass` (by name: `radius/md`, was nearest-to-radius.md px). Was: rounded-md
- [x] Breadcrumb (2): gap + font size via `tokenFromClass` on BreadcrumbList. Was: gap-1.5, text-sm
- [x] Empty (5): rounded-xl marker -> kind check; radius/p-*/fonts via `tokenFromClass` (fontSize kind now accepts a `/leading` suffix, so `text-sm/relaxed` is read too); Description colour via `colorFromClass`; the outer-padding-vs-gap note and the derived gap reason now name the classes/px read. Was: p-6, rounded-xl (throws), EmptyTitle text-sm, EmptyDescription text-muted-foreground, EmptyContent text-sm
- [x] Field (5): gap + Description/Error font sizes via `tokenFromClass`; Invalid colour read from the root's `data-[invalid=true]:text-*`. Label line font size stays 14px/derived (lives in label.tsx). Was: base gap-2, FieldDescription text-sm + text-muted-foreground (throws via FieldSeparator), FieldError text-sm, data-[invalid=true]:text-destructive
- [x] Separator (1): removed the exact `bg-border` marker (the existing "no fill colour" throw is the kind check). Was: bg-border (throws)
- [x] FieldSeparator (3): label span found by its `data-slot` (was: the string containing `bg-background`); exact-class markers removed, span must have a text colour; font size (root) + gap (span px-*) via `tokenFromClass`. Was: px-2, text-sm, text-muted-foreground (throws)
- [x] Item (4): radius (cva base), Title + Description font sizes and Description colour read; the Size axis's fallback Description px is now the read base value (was a hardcoded 14). Top-level padding left (never bound, Size axis). Was: base rounded-lg, ItemTitle text-sm, ItemDescription text-sm + text-muted-foreground
- [x] Marker (2): font size via `tokenFromClass`; exact `text-muted-foreground` marker removed (colour already read by `scanClassesForColors`). Was: text-sm, text-muted-foreground (throws)
- [x] Bubble (4): all four BubbleContent values via `tokenFromClass` (radius by name). Was: BubbleContent px-3, py-2, rounded-xl, text-sm
- [x] Progress (4): exact rounded-full/bg-muted/bg-primary markers -> kind checks (track needs a rounded-* class; both fills were already required by kind); radius + h-* via `tokenFromClass`. Was: track bg-muted (throws), indicator bg-primary (throws), h-1, rounded-full (throws)
- [x] Tabs (5): exact markers -> kind checks (an Active `data-active:bg-*` fill, a rounded-* class); radius/px/py/text via `tokenFromClass` on the trigger's unprefixed classes (radius by name, `radius/md`). JUDGMENT: the Inactive solid-token substitution (TAB_INACTIVE_TOKEN, user decision) is now keyed to the PATTERN `text-foreground/NN` (any translucent foreground text), not the exact `text-foreground/60`; its derived reason names the class read. A solid replacement class would be read as-is. Was: trigger px-1.5, py-0.5, rounded-md (throws), text-sm, data-active:bg-background (throws)
- [x] Accordion (3): rounded-lg/py-2.5 markers -> kind checks on the trigger; radius/py/text via `tokenFromClass`. Was: py-2.5 (throws), rounded-lg (throws), text-sm
- [x] Tooltip (6): colour/radius markers -> kind checks (bg-*, text-*, rounded-*); radius/px/py/text via `tokenFromClass` (radius by name). Was: px-3, py-1.5, rounded-md (throws), bg-foreground (throws), text-xs, text-background (throws)
- [x] Checkbox (2): data-checked:/rounded-[4px] markers -> kind checks (a `data-checked:bg-*`; any rounded-* class: arbitrary `rounded-[Npx]` snaps to nearest, a named one maps by name); Checked stroke now read from `data-checked:border-*` (was: copied from the fill, same value today); icon colour read from `data-checked:text-*`. Was: data-checked:border-primary, data-checked:text-primary-foreground (throws)
- [x] Switch (4): colour markers -> `requireColorFromClass` (`data-checked:bg-*`, `data-unchecked:bg-*`, thumb `bg-*`) — the track/thumb colours were HARDCODED before, now read; radius read from the root (kind check). `colorFromClass` now ignores classes with a further variant after the prefix (e.g. `dark:…`, `data-[x=y]:…`). Was: rounded-full, data-unchecked:bg-input, bg-background, data-checked:bg-primary
- [x] RadioGroup (3): markers -> kind checks; radius via `tokenFromClass`; Checked stroke read from `data-checked:border-*` (was copied from the fill); centre-dot colour read from the dot `<span>`'s bg-* (was hardcoded `text.on-primary`). Was: rounded-full (throws), data-checked:border-primary, bg-primary-foreground (throws)
- [x] Attachment (5): rounded-xl/bg-card/text-card-foreground markers -> kind checks (root needs a bg-*, a text-* and a rounded-* class); radius by name and Description size via `tokenFromClass`; Title colour read from the root text-* (was hardcoded `text.on-surface`); a Size option's own radius class now maps any named class by name (was `rounded-lg` only); the Size note names the Description class read. Top-level padding/Title size left (never bound, Size axis). Was: base rounded-xl (throws), bg-card (throws), text-card-foreground (throws), AttachmentDescription text-xs, size.xs rounded-lg
- [x] 10 "not swappable" arbitrary-value classes: the check now swaps them too (see below); all follow.
- [x] `package.json` script `check:components-roundtrip`
- [x] Docs: pipeline-plan.md step 1b BUILT + Build status line; step-1 progress doc note; plan-file header comment

## Reclassifications (sources file changes, deliberate)

None. `figma-components-sources.json` for the Demo is byte-identical to the baseline: every binding recorded as `class` in step 1 could be made to follow its class, so none had to become `derived`.

## Judgment calls

- `tokenFromClass` now also returns `cls` and `px` (the class read), for notes.
- Empty's note "bound to the larger, outer-padding value (spacing/6, 24px)" was hardcoded and WRONG for bootstrap (its 24px token is spacing/4); it now names the token actually bound. That is the only accepted other-preset diff so far (CORE-B1, saved as `presets/CORE-B1-accepted-plan.json`).
- Card `--card-spacing` (user decision, 2026-10-15): binds the token NEAREST N x 4px, not the token named spacing/N. Only diff in any preset: bootstrap (CORE-B1) Card default spacing/4 (24px) -> spacing/3 (16px, what the browser draws).
- Other presets: reference plans for CORE-A1/B1/C1/D1/A4 token sets built from HEAD (`.tmp/component-pull-step1b/presets/*-head-plan.json`); `PRESETS=1 /tmp/v.sh` style compare — any diff must be a by-name radius consequence.

## Not-swappable classes (hand check)

`swapCore` in the check now also swaps arbitrary-value radius classes (to a named class, as a pull
would write), `[--card-spacing:--spacing(N)]` (N -> 8 or 4) and `text-sm/relaxed` (-> `text-lg/relaxed`),
so all 10 are exercised automatically (0 "not swappable"). Also checked by hand that a changed
arbitrary VALUE flows through: Checkbox `rounded-[4px]` -> `rounded-[16px]` binds radius/xl;
Button xs `rounded-[min(var(--radius-md),10px)]` -> `...,4px)]` binds radius/sm; NativeSelect sm
the same; origins follow the edited class.

## QA

`node scripts/qa-matrix.ts --group=core,achromatic,mismatch,baseline,boundary,cli`: before and after
are identical — 7 passed, 30 failed (the same pre-existing failure in every seed case: "tailwind: real
Tailwind v4 build compiles with no errors"; unrelated to this work), CLI-6 25/25 PASS.

## Result (2026-10-15): done

Roundtrip check 241 class origins: 241 follow a code change, 0 fail, 0 not swappable (start: 134 / 97 / 10).
Demo plan + sources byte-identical to baseline; `npm run typecheck` clean; `check:components-sources` OK
(3011 records, 2248 class / 763 derived); sources output deterministic; other presets (CORE-A1/B1/C1/D1/A4)
identical to HEAD except the Empty note fix on bootstrap (B1).

## How to resume

1. Read this file, then search `figma-components-plan.ts` for "Component pull, step 1b".
2. Run `node scripts/check-components-roundtrip.ts` — its FAIL list is the remaining to-do list
   (use `--component <Name>` to focus; it takes ~1-2 min for all).
3. For a component: find its builder (`function build<Name>Plan`), replace typed-in classes/px with
   `tokenFromClass(...)` on the real class string (or a kind-based colour read), use the returned
   `origin` in `tagFields`, turn exact-class throws into kind checks. Run the verification block:
   plan must stay IDENT. Tick it here with a one-line note.
