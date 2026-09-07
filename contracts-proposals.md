# Contracts — proposals (pending decisions)

Draft proposals for each item in the "Contracts" table in `contracts-and-seeds.md`, based on the seed inputs listed there plus the decisions already settled in `pipeline-plan.md`. Nothing here is built or final — this is a discussion draft. Work through it point by point; open questions that need a decision are called out inline and collected again at the end.

---

## Finding: the two docs disagreed on how corner-roundness is chosen — resolved

- `pipeline-plan.md` ("Value-foundations," "Everything settled so far") said roundness was a **tool-original 3-way preset** — square / lowly-round / highly-round — its own menu, independent of design language.
- `contracts-and-seeds.md` (confirmed complete) lists roundness as a **4-way menu matching the design-language pick** — Tailwind / Bootstrap / Material Design 3 / Material Design 2 — same options as spacing and type-scale.

**Decided: `contracts-and-seeds.md`'s 4-way, design-language-matched model is current.** Roundness is a fixed-key menu (A6 below) using the same mechanism as type-scale — one shared set of role names (`none, sm, md, lg, xl, full`), values swapped per design-language pick. The 3-way tool-original model (`square`/`lowly-round`/`highly-round`) is dropped. `pipeline-plan.md` had several passages written against the old 3-way model — fixed as a follow-up alongside this decision (see its "Value-foundations" and "Everything settled so far" sections).

---

## Proposal 1 — Token spec (DTCG JSON shape)

One file per token group, matching the `tokens/` layout already sketched in `pipeline-plan.md`'s "Where things live" diagram:

```
tokens/
  color.primitive.json          raw ramps — brand, neutral, status
  color.semantic.light.json     role tokens, alias into primitives (present only if the light/dark seed choice includes light)
  color.semantic.dark.json      role tokens, alias into primitives (present only if the light/dark seed choice includes dark)
  typography.primitive.json     atomic values — font family, weight, size, line-height
  typography.semantic.json      composite "mixin" tokens (e.g. body-lg-semibold), each aliasing typography primitives
  spacing.json
  radius.json
  border-width.json
  opacity.json
  shadow.json
  breakpoint.json
  grid.json
```

**Color and typography are the only two groups with a primitive/semantic split.** Color, because a role like `action.primary` is a simple one-to-one alias into a primitive. Typography, because a role like `body-lg-semibold` is a *composite* alias — it bundles several primitives (family + weight + size + line-height) into one named style, using DTCG's own `typography` composite token type rather than anything custom. Every other group — spacing, radius, border-width, opacity, shadow, breakpoint, grid — stays single-tier: the value in the file *is* the token, with no separate primitive layer underneath it that a component could bypass.

Color, concretely:

```jsonc
// color.primitive.json — see Proposal 2, A1 for the full reasoning behind this shape
{
  "color": { "primitive": {
    "brand":           { "100": {...}, "600": {"$type":"color","$value":"#3B82F6"}, "1100": {...} },
    "brand-secondary": { "100": {...}, "600": {...}, "1100": {...} },
    "static":          { "100": {"$type":"color","$value":"#FFFFFF"}, "200": {"$type":"color","$value":"#000000"} },
    "neutral":         { "100": {...}, "1100": {...} },
    "status":          { "1": { "100": {...}, "200": {...} }, "2": {...}, "3": {...}, "4": {...}, "5": {...} }
  }}
}

// color.semantic.light.json
{
  "color": { "semantic": {
    "background": { "primary": {"$value":"{color.primitive.neutral.100}"} },
    "text":       { "on-primary": {"$value":"{color.primitive.static.100}"} },
    "action":     { "primary": {"$value":"{color.primitive.brand.600}"}, "primary-hover": {"$value":"{color.primitive.brand.700}"} },
    "status":     { "error": {"$value":"{color.primitive.status.1.200}"}, "error-bg": {"$value":"{color.primitive.status.1.100}"} }
  }}
}
```

Typography, concretely:

```jsonc
// typography.primitive.json
{
  "typography": { "primitive": {
    "fontFamily": { "primary": {"$type":"fontFamily","$value":"Proxima Nova"} },
    "fontWeight": { "semibold": {"$type":"fontWeight","$value":600} },
    "fontSize":   { "12": {"$type":"dimension","$value":"12px"} },
    "lineHeight": { "16": {"$type":"dimension","$value":"16px"} }
  }}
}

// typography.semantic.json
{
  "typography": { "semantic": {
    "body-lg-semibold": {
      "$type": "typography",
      "$value": {
        "fontFamily": "{typography.primitive.fontFamily.primary}",
        "fontWeight": "{typography.primitive.fontWeight.semibold}",
        "fontSize":   "{typography.primitive.fontSize.12}",
        "lineHeight": "{typography.primitive.lineHeight.16}"
      }
    }
  }}
}
```

Aliases use DTCG's own `{dot.path}` syntax — no custom reference syntax invented.

### DTCG type mapping

DTCG doesn't define a distinct type per our category — several of ours share the same underlying DTCG `$type`:

| Our category | DTCG `$type` | Note |
|---|---|---|
| color | `color` | direct match |
| typography | `typography` (composite) | direct match |
| spacing, radius, border-width, breakpoint | `dimension` | DTCG has no separate type for any of these — all four are just a number + unit |
| opacity | `number` | plain unitless 0–1 |
| shadow | `shadow` (composite) | direct match |
| grid | *(none)* | no DTCG type — built manually from `dimension`/`number` |

DTCG is still a community-group draft, not a frozen standard — worth reverifying composite field names against the current published spec before final build.

### Single file vs. multiple files (your question 1)

**Recommendation: keep them split by group**, matching the file list above — not collapsed into one `tokens.json`. Reasons:

- **Style Dictionary** — the tool already locked in for turning the spec into real code — expects a directory of token files matched by a glob (e.g. `source: ["tokens/**/*.json"]`), not a single file. A single file still technically works, but every idiomatic Style Dictionary setup uses one-file-per-category; splitting keeps the CLI wrapper doing what the tool already expects instead of writing extra logic to work around a single-file shape.
- **Token-sync gets cheaper and safer.** When someone edits one spacing value in Figma, the sync engine only needs to touch `spacing.json` — a small, readable diff. A single monolithic file means every sync, regardless of category, rewrites the same file, and diffs get noisy from incidental key reordering.
- It mirrors the Figma side: variables/collections are naturally grouped by category there too, so a 1:1 file-to-group mapping keeps "promote" and "push" symmetric instead of one side flat and the other nested.
- It's already implied by `pipeline-plan.md`'s own "Where things live" diagrams (`spacing.json`, `radius.json`, etc. as separate files under `tokens/`) — this confirms what was already sketched rather than inventing something new.

The real tradeoff going the other way: one file is easier to open and see the whole system at a glance. Worth naming, but I'd still lean split.

### Light/dark mode is now optional (your point 2 — seed input update)

Since `contracts-and-seeds.md` now lets someone pick light-only, dark-only, or both, the token spec needs to handle three shapes instead of always shipping two color files. Proposed rule: **always name the files with the mode suffix, and let the seed choice decide which files actually get generated** — never a mode-less filename.

- Light only → generates `color.semantic.light.json` only (`color.semantic.dark.json` doesn't exist in the project at all)
- Dark only → generates `color.semantic.dark.json` only
- Both → generates both, as originally proposed

Why not a mode-less `color.semantic.json` for the single-mode case: it would mean two different possible filenames depending on how many modes were picked, so every downstream consumer (Style Dictionary config, Figma push, `design.md`) would have to branch on both "which filename exists" *and* "how many modes." Keeping the suffix always present means there's exactly one rule — "does `color.semantic.<mode>.json` exist?" — regardless of which combination was chosen, and adding a second mode later is purely additive (a new file), never a rename.

Same logic carries downstream:
- **Figma push:** single-mode project pushes one collection (`Tokens - Light` or `Tokens - Dark`, whichever exists); both-mode project pushes two collections (free plan) or one collection with two modes (paid plan), per the existing decision in `pipeline-plan.md`.
- **`design.md`:** should state which mode(s) a given project actually has, so an agent never assumes a dark file exists when it wasn't generated.

`color.primitive.json` is unaffected — primitives were never mode-specific to begin with.

---

## Proposal 2 — Exact tokens per group, and the naming conventions that name them

*(Merges the former "Proposal 2 — Naming & structure conventions" and "Proposal 3 — Preset library" into a single proposal. Naming can't really be finalized ahead of knowing which tokens exist — and several of the "preset library" decisions below were already naming decisions wearing a different hat: type-scale and radius's fixed role keys are names, not just values.)*

**Pretokens dropped.** Brand colors and fonts are now gathered directly through the seed-input form (see `contracts-and-seeds.md`'s "Seed inputs" table) — hex values and a font pick, not a Figma canvas with named layers. The old "Pretokens area" convention (a page literally named `Pretokens`, with only `brand/primary` / `brand/secondary` / `font/primary` / `font/secondary` layer names recognized by "promote") no longer applies — there's nothing left to parse, since the form's fields are already unambiguous. One fewer thing this naming convention has to carry.

### A. Which exact tokens get generated

**The token spec is platform-agnostic — this whole section is a single universal shape, not one tuned per framework/library.** Everything below (primitives, semantic roles, preset values) is generated once, the same way, regardless of which target framework/design-language/component-library was picked in the seed form. Making the output feel native to a specific target (a real Tailwind config, a Bootstrap Sass map, an MD3 `ColorScheme`) is **generator work**, not a Contracts-level concern — see `pipeline-plan.md`'s "What actually needs to get built → Generators." This section stops short of picking shapes/values that try to minimize cross-framework friction; that pressure doesn't belong here.

**Key philosophy split:** **type-scale and radius use one fixed set of role/step names across all four design-language presets — only the values change.** Spacing uses each system's own native step names, since values and key-shape both change together.

Reason: components will eventually bind to a role like "card title uses `typography.heading-lg`" or "button uses `radius.md`" — that binding has to survive someone switching design-language presets later, so those two need stable keys. Nothing in the plan currently binds a *component* to a specific spacing step the same way, so spacing doesn't need that constraint yet — matches "don't build things just in case."

**Decision needed:** confirm this split (fixed keys for type-scale + radius, native keys for spacing) makes sense before it's locked in.

#### A1. Color primitives (the raw ramp) — decided

Groups: `brand`, `brand-secondary` (conditional — only generated if a secondary color was supplied), `static`, `neutral`, `status` (5 numeric-keyed roles).

| Group | Steps | Notes |
|---|---|---|
| `brand` / `brand-secondary` / `neutral` | `100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100` (11 steps, evenly numbered) | `600` is the **base step** — the one that equals the user's literal input hex, unmodified — chosen so it sits with exactly 5 lighter steps below (`100`–`500`) and 5 darker steps above (`700`–`1100`). This is a sensible spec-level default, not a shape picked to minimize any particular framework's conversion work — see the platform-agnostic note above. |
| `static` | `100` = white, `200` = black | (Renamed from `base` — avoids colliding with "base step," the anchor value inside a ramp, which is a different concept.) Fixed, non-computed — same value on every project regardless of brand color. Exists so semantics like `text.on-primary` or a MUI `contrastText` never have to hardcode a hex. |
| `status` | 5 roles × 2 tones each: `status.<n>.100` (light tint), `status.<n>.200` (saturated/dark tone) | Status colors don't need hover/active gradients, only a bg/accent pair. Numeric role keys are deliberate — primitives shouldn't carry meaning, the semantic layer (A2 below) is what assigns "2 means success." **Fixed order for determinism: `1`=error, `2`=success, `3`=warning, `4`=info, `5`=promo** (promotions/new-item highlight, conventionally gold/amber-leaning). |

**This exact shape (`100`–`1100`) is generated the same way for every project, regardless of target** — the spec doesn't branch by framework (see the platform-agnostic note above). Every non-MD3 generator reads directly from this one ramp via a fixed positional relabel:

| Our step | Tailwind — shadcn/ui, shadcn-vue, RNR | Bootstrap — React-Bootstrap, bootstrap-vue-next | MD2 — MUI, Vuetify, React Native Paper (MD2 mode) |
|---|---|---|---|
| `100` | `50` | `100` | `50` |
| `200` | `100` | `200` | `100` |
| `300` | `200` | `300` | `200` |
| `400` | `300` | `400` | `300` |
| `500` | `400` | `500` | `400` |
| **`600` (base)** | `500` | `600` | `500` |
| `700` | `600` | `700` | `600` |
| `800` | `700` | `800` | `700` |
| `900` | `800` | `900` | `800` |
| `1000` | `900` | *(unused — Bootstrap's gray scale stops at `900`)* | `900` |
| `1100` | `950` | *(unused)* | *(unused — MD2's palette stops at `900`)* |

Bootstrap's brand colors don't use this table at all — they only ever read the single base step (`600`) as `$primary`/`$secondary`; Bootstrap's own Sass derives tints/shades from there. SwiftUI reads whichever semantic token it needs directly, no relabeling required either way.

**MD3 is the one annotated exception.** The spec still generates this same full `100`–`1100` ramp for an MD3-targeted project too — spec generation never branches on target, per the platform-agnostic note above — but **the MD3 generator doesn't read this table at all**. When converting the spec into Jetpack Compose Material3 tokens, it discards the ramp and instead recomputes a proper 13-stop HCT tonal palette + `ColorScheme` directly from the semantic base color, using MD3's own tonal algorithm (see `pipeline-plan.md`'s "Generators" bullet — Material Color Utilities is the concrete library named there). That's why MD3 has no column in the mapping table above: it isn't a relabeling of these steps at all, it's a separate, parallel computation seeded from the same source color.

**Formula constraints** (apply once the actual HSL/hex values get computed — these are spec-level, not framework-specific):
- `neutral.1100` (the darkest step, since `600` is the midpoint rather than the end) must land near-black (~10–15% lightness) — light/dark mode is planned to work by flipping which end of the ramp means background vs. text (light: `background=neutral.100`, `text=neutral.1100`; dark: reversed), which only works if both ends are genuinely extreme.
- Each `status.<n>.200` must be dark/saturated enough against its own `.100` to clear the 4.5:1 contrast minimum from `foundations-rules.md`, since `.200` feeds `status.<role>-text` sitting on `status.<role>-bg` (=`.100`) — see A2 below.

#### A2. Color — semantic role list (revised: 5 statuses, not 4; overlay added) — decided

Proposal 1 only ever showed *illustrative* examples (`action.primary`, `body-lg-semibold`) — nobody had written down the actual, exhaustive list of semantic color roles the tool generates. Value-foundation groups already had this (spacing/radius/type-scale below); color and typography didn't. Proposed list, derived from what `pipeline-plan.md`'s "Seed input" section already says gets derived from a brand color (tints/shades, hover/active/disabled states, background/foreground/border roles):

| Category | Tokens | Notes |
|---|---|---|
| Background | `background.primary`, `background.secondary`, `background.surface`, `background.inverse` | `primary` = app/page background; `secondary` = subtle section background; `surface` = raised elements (cards, modals, sheets); `inverse` = flipped background for content sitting on an inverted patch |
| Text | `text.primary`, `text.secondary`, `text.disabled`, `text.on-primary`, `text.on-surface`, `text.inverse` | the `on-*` tokens are exactly what the contrast-pairing convention (Section B) checks against their paired surface |
| Action — primary | `action.primary`, `action.primary-hover`, `action.primary-active`, `action.primary-pressed`, `action.primary-disabled` | always generated — a primary brand color always exists. **`-active` and `-pressed` are distinct tokens that share a value.** Not a merge — both tokens exist in the spec, both alias `brand.800` at generation time, so out of the box they render identically. The point of keeping them separate: someone can later re-point just `-pressed` (or just `-active`) to a different primitive step without the other token moving too — a single merged token couldn't be split apart later without editing every component that consumed it. Matches `foundations-rules.md`'s "active/pressed" wording (Proposal 3) — one *conceptual* required state, expressed as two independently-editable tokens. **Ramp-step mapping decided:** `primary`→`brand.600` (base), `primary-hover`→`brand.700`, `primary-active`→`brand.800`, `primary-pressed`→`brand.800` (same value as `-active`, distinct token), `primary-disabled`→`brand.600` desaturated and blended toward `neutral` (not a reduced-opacity trick, and not a plain ramp step — a distinct formula, see note below). This is the same "formula runs once, then bakes into a plain value" treatment as A1's ramp itself (`pipeline-plan.md`, "Formulas run once") — computed once at promotion time, then a fixed alias/value from then on. |
| Action — secondary | `action.secondary`, `action.secondary-hover`, `action.secondary-active`, `action.secondary-pressed`, `action.secondary-disabled` | **conditional** — only generated if a secondary brand color was actually supplied (see `contracts-and-seeds.md`'s "Secondary color (optional)" row); doesn't exist in the spec otherwise. **Decided:** stays conditional rather than falling back to a neutral alias — this just extends the precedent A1 already set for `brand-secondary` primitives (a whole group can be absent), so it isn't a new kind of complexity. What a component library's own "secondary" variant slot should resolve to when this group is absent is a Generator-layer question (per the platform-agnostic note above), not a Contracts one. Mirrors the same `600/700/800/800(shared)/desaturated` step mapping onto `brand-secondary`. |
| Border | `border.default`, `border.subtle`, `border.focus`, `border.on-primary` | `border.focus` pairs with the rule-foundations focus-visibility requirement (Proposal 3) |
| Status ×5 (error / success / warning / info / promo) | `status.<role>`, `status.<role>-bg`, `status.<role>-text`, `status.<role>-border` | 5 roles × 4 tokens = 20. All four alias only **2** primitive tones per role (A1 above): `status.<role>` and `status.<role>-text` and `status.<role>-border` → `status.<n>.200` (same value, intentional — matches the common alert-component pattern of one accent tone for icon/text/border); `status.<role>-bg` → `status.<n>.100`. `-text` pairs with `-bg` for the contrast check, same `on-*`-style pattern as above. |
| Overlay | `overlay.scrim` | **Added.** Backdrop color for modals/dialogs/sheets — every target component library has at least one of these (shadcn Dialog, MUI Modal, Bootstrap `.modal-backdrop`, RNR Sheet), so this isn't a speculative addition, it's a near-certain requirement. Single token, no light/dark-specific variation in role (just in value) — same mode-file treatment as every other semantic token. Aliases `color.primitive.neutral.1100` at a fixed alpha. **Alpha decided: 50% (`0.5`)** — sourced from Bootstrap's own official default (`$modal-backdrop-opacity: .5`, confirmed via [getbootstrap.com](https://getbootstrap.com/docs/5.3/components/modal/)), applied universally across every project regardless of which design language was actually picked, since `overlay.scrim` is one single cross-preset token, not a per-preset table like A9's shadow. |

Total: 4 (background) + 6 (text) + 5 (action-primary) + 5 (action-secondary, conditional) + 4 (border) + 20 (status) + 1 (overlay) = **40 semantic color tokens** (45 if a secondary brand color was supplied), generated once per mode file that actually exists (light and/or dark, per Proposal 1's mode-suffix rule).

**How action states actually get computed (answers "where does hover come from"):** two separate mechanisms, only one of which is finalized. (1) The brand hex the user types in becomes `brand.600`; the rest of the `100`–`1100` ramp is computed from it by A1's HSL formula — which is still an open starting proposal, not finalized (`pipeline-plan.md`, "Formulas run once"). (2) `action.primary` and its `-hover`/`-active`/`-pressed` siblings are **not** their own formula — they're fixed aliases into specific steps of that already-computed ramp (`600`/`700`/`800`, decided above — `-active` and `-pressed` both alias `800`, distinct tokens sharing one value so either can be re-pointed independently later), so once the ramp exists, these states just fall out of it. `-disabled` is the one exception to "just alias a ramp step" — it needs its own formula (desaturate `brand.600` and blend it toward `neutral`), because no plain ramp step reads as "inactive" the way a flatter, grayer tone does. **Blend percentage decided: 50%** — unlike the shadow/overlay numbers above, no framework or spec publishes an official "disabled state" blend formula to source this from (it's not a value that exists in any external spec, just a design convention we have to pick ourselves), so this is our own call rather than a researched one: `action.primary-disabled` = `brand.600` blended 50% toward `neutral.600` (mid-gray), landing roughly halfway between the brand hue and a flat gray — reads as clearly inactive without going fully monochrome. Per "Formulas run once," all of this computes exactly once at promotion time and then bakes into plain values — nothing here stays live.

#### A3. Typography — semantic composite tokens (new/expanded from Proposal 1's illustrative examples) — decided

Same gap as color: Proposal 1 showed one example (`body-lg-semibold`); the full set of role × weight combinations that actually get generated was never listed. Proposed matrix — not a full role × weight cross-product, just the combinations each role plausibly needs:

| Role | Weight(s) generated | Composite token name(s) | Font family (both fonts supplied) |
|---|---|---|---|
| caption | regular, semibold | `caption-regular`, `caption-semibold` | secondary |
| body-sm | regular, semibold | `body-sm-regular`, `body-sm-semibold` | secondary |
| body | regular, semibold | `body-regular`, `body-semibold` | secondary |
| body-lg | regular, semibold | `body-lg-regular`, `body-lg-semibold` | secondary |
| heading-sm | semibold, bold | `heading-sm-semibold`, `heading-sm-bold` | primary |
| heading-md | semibold, bold | `heading-md-semibold`, `heading-md-bold` | primary |
| heading-lg | semibold, bold | `heading-lg-semibold`, `heading-lg-bold` | primary |
| display | bold | `display-bold` | primary |

15 composite `typography.semantic.*` tokens total, each a DTCG `typography` composite aliasing `typography.primitive.fontFamily`/`fontWeight`/`fontSize`/`lineHeight`, per Proposal 1's shape.

**Font-family mapping — decided:** when both fonts are supplied, **primary feeds `heading-*`/`display`, secondary feeds `body*`/`caption`** — the reverse of the "distinct display face" pattern this section originally floated, and that's fine; it's a deliberate call, not a default. **When only a primary font is supplied, it feeds every role** — there's no secondary to fall back to, so nothing conditionally disappears here the way `action.secondary.*` does in A2; the token set is always the full 15, just with one family aliased everywhere. This needs to be stated on the seed-input form itself, next to the Secondary font field, so someone supplying a secondary font understands what it'll actually be used for before they submit it — see the corresponding update in `contracts-and-seeds.md`.

#### A4. Spacing (native keys per system) — decided

**Key-shape split confirmed:** spacing keeps each design-language's own native keys, unlike type-scale/radius (A5/A6 below), which share one fixed key set across all four presets. Reasoning stands as originally proposed — nothing currently binds a *component* to a specific spacing step the way `radius.md` or `typography.heading-lg` do, so there's no forcing reason to fix the keys yet.

| Preset | Values (px, at 16px root) |
|---|---|
| Tailwind | 0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96 |
| Bootstrap | 0, 1=4, 2=8, 3=16, 4=24, 5=48 |
| Material Design 3 | **reuses Tailwind's scale verbatim** — same keys, same values |
| Material Design 2 | **reuses Tailwind's scale verbatim** — same keys, same values |

**MD3/MD2 decided:** neither has a stable, official named spacing scale worth treating as authoritative — MD2 only ever specified "use the 8dp grid, 4dp when needed" (no named steps at all), and MD3's own spacing guidance shifts between spec revisions. Rather than presenting a derived/fabricated scale as if it were each system's "native" one, MD3 and MD2 spacing tokens just reuse Tailwind's scale directly — same keys (`1`, `2`, `3`...) and same values, not a separate approximation. This also resolves the key-naming question that would otherwise come up for MD3/MD2 (there's no invented ordinal numbering to defend, since the keys are just Tailwind's). **Must be stated on the seed-input form** when a user selects MD3 or MD2 spacing, so they know they're getting Tailwind's numbers under the hood rather than something MD3/MD2-specific — see the corresponding update in `contracts-and-seeds.md`.

**Key ≠ value, also disclosed on the form:** Tailwind's (and by extension MD3/MD2's) keys are an index, not the pixel value — `spacing.4` is `16px`, not `4px`. Easy to misread at a glance, so the seed-input form must show the real key → px mapping as its "scale example" for this question rather than just naming the preset, so nobody discovers the mismatch later at the code level.

#### A5. Type-scale (fixed roles: `caption, body-sm, body, body-lg, heading-sm, heading-md, heading-lg, display`)

| Preset | caption | body-sm | body | body-lg | heading-sm | heading-md | heading-lg | display |
|---|---|---|---|---|---|---|---|---|
| Tailwind | 12 | 14 | 16 | 18 | 20 | 24 | 30 | 48 |
| Bootstrap | 12 | 14 | 16 | — | 20 (h5) | 25 (h4→h3ish) | 32 (h2) | 40 (h1) |
| MD3 | 11 (label-sm) | 12 (body-sm) | 16 (body-lg) | — | 22 (title-lg) | 28 (headline-md) | 32 (headline-lg) | 45–57 (display) |
| MD2 | 10 (overline) | 14 (body2) | 16 (body1) | — | 20 (h6) | 24 (h5) | 34 (h4) | 60–96 (h2/h1) |

Bootstrap and MD3/MD2 don't map onto 8 roles as cleanly as Tailwind does (they're named scales with 6–13 steps of their own) — the numbers above are a best-fit compression into the shared roles, flagged as approximate rather than exact.

#### A6. Radius (fixed keys: `none, sm, md, lg, xl, full`) — decided

**Roundness model decided: 4-way, matching the design-language pick** (see the resolved "Finding" at the top of this file) — same mechanism as type-scale (A5): one shared set of role names across all four presets, values swap per design-language pick. The 3-way tool-original model (`square`/`lowly-round`/`highly-round`) is dropped; not carried forward.

| Preset | none | sm | md | lg | xl | full |
|---|---|---|---|---|---|---|
| Tailwind | 0 | 4 | 6 | 8 | 12 | 9999 |
| Bootstrap | 0 | 4 | 6 | 8 | 16 | 9999 |
| MD3 | 0 | 4 | 12 | 16 | 28 | 9999 |
| MD2 | 0 | 2 | 4 | 8 | 16 | 9999 *(MD2 was much less prescriptive on shape than MD3 — lower confidence)* |

*(px, at 16px root — same convention as A4's spacing table)*

**`radius.full` decided: one canonical value (`9999`) across all four presets, including Bootstrap.** Bootstrap's real convention is `border-radius: 50rem` (or its `.rounded-pill` utility) rather than a literal `9999px` — but that's a **Generator-layer** concern, not a spec one, same split already established for color in A1 (Bootstrap's color generator reads only the base step and derives the rest via Bootstrap's own Sass, ignoring the shared ramp table). The Bootstrap generator is free to read the spec's `radius.full = 9999` and emit it as `50rem`/`.rounded-pill` in the real generated Sass — functionally identical (both just need to exceed half the element's smaller dimension to render fully round), only the literal CSS expression differs. The token spec itself holds one uniform, platform-agnostic number.

#### A7. Border-width (fixed, Tailwind, not user-facing) — decided

Values: 0, 1, 2, 4, 8px — high confidence, Tailwind's unmodified default scale.

**Token names decided:** `border-width.0`, `border-width.1`, `border-width.2`, `border-width.4`, `border-width.8` — key = value for all five, no special-cased `default` name. (Tailwind's own CSS class for `1` is unnamed/bare — `border` rather than `border-1` — but that's a quirk of Tailwind's own utility-class naming, not something our token layer needs to inherit; `border-width.1` keeps every key in this group on the same self-describing pattern already used for `radius.full`.) Flat/single-tier, no primitive/semantic split, per Proposal 1.

**Naming fix:** Proposal 1's file list originally had `borderWidth.json` (camelCase) — the one holdover that didn't match Section B's "lowercase, kebab-case for multi-word segments" rule, which every other file already followed. Corrected to `border-width.json` / `border-width.*` tokens.

#### A8. Opacity (independent 2-option menu — Tailwind or Bootstrap only; neither MD variant has a preset scale) — decided

| Preset | Values |
|---|---|
| Tailwind | 0, 5, 10, …, 95, 100 (5% steps — 21 tokens) |
| Bootstrap | 0, 25, 50, 75, 100 (5 tokens) |

**Key vs. value decided:** token *keys* use the percentage naming above (`opacity.0`, `opacity.5`, ... `opacity.100`), matching Tailwind/Bootstrap's own utility-class naming (`opacity-50`) for readability. The stored `$value` is the **0–1 decimal** (`opacity.50` → `0.5`), not the raw percentage — every target platform's real opacity property (CSS `opacity`, React Native `style.opacity`, SwiftUI `.opacity()`, Android/Compose `alpha`) takes a 0–1 float natively, so storing the decimal means zero conversion in any generator, vs. a percent→decimal step in all of them if the raw percentage were stored instead. Milder version of spacing's key/value mismatch (A4) — percent-to-decimal is a standard, self-evident conversion, so no separate seed-input-form disclosure needed the way spacing's arbitrary index scale required. Flat/single-tier, no primitive/semantic split, per Proposal 1; DTCG `number` type per the type-mapping table above.

#### A9. Shadow — decided

**Key-shape model decided: fixed keys shared across all four presets**, matching type-scale (A5) and radius (A6) rather than a per-pair split. Token names: `shadow.sm`, `shadow.md`, `shadow.lg`, `shadow.xl`, `shadow.2xl` — same five roles regardless of which design language was picked, only the blur/offset/spread values (and MD3's tonal-overlay treatment, below) change per preset. Reasoning: a component binding like "Card uses `shadow.sm`, Modal uses `shadow.lg`" needs to survive switching design-language presets later, the same forcing reason already used for type-scale and radius — MD3/MD2 previously proposed switching to a numbered-elevation key scheme instead, which would break exactly that binding. MD3/MD2 supply their own values under these same five names rather than inventing separate keys. Flat/single-tier, DTCG `shadow` composite type, per Proposal 1.

Tailwind's real shadow scale has an extra unnamed `DEFAULT` tier between `sm` and `md` (`shadow-sm` / `shadow` / `shadow-md`...) — dropped, same curation already applied to A4's spacing table (trimmed from Tailwind's full raw scale to a clean subset), so the token set stays at 5 named roles rather than 6.

**MD3's elevation isn't a pure shadow** — each level pairs a shadow with a tonal surface-color overlay, which doesn't fit a plain `shadow` token. Under the platform-agnostic split (see the note under "A. Which exact tokens get generated" above), this is no longer a spec-level simplification to approve — the spec just keeps plain `shadow` tokens (blur/offset/spread/color) under the five fixed keys above, and the **MD3 generator** derives the real tonal overlay at generation time from the semantic surface + primary colors, the same way it derives the full tonal palette (see `pipeline-plan.md`'s "Generators" bullet). Nothing gets approximated or dropped — it just isn't computed at the Contracts layer.

**Exact values — now sourced, not left to build-time verification:**

| Role | Tailwind (real CSS, [source](https://tailwindcss.com/docs/box-shadow)) | Bootstrap (real CSS, [source](https://getbootstrap.com/docs/5.3/utilities/shadows/)) |
|---|---|---|
| `shadow.sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `0 .125rem .25rem rgba(0,0,0,.075)` (Bootstrap's `.shadow-sm`) |
| `shadow.md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | `0 .5rem 1rem rgba(0,0,0,.15)` (Bootstrap's unnamed `.shadow` default) |
| `shadow.lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | `0 1rem 3rem rgba(0,0,0,.175)` (Bootstrap's `.shadow-lg`) |
| `shadow.xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | same as `shadow.lg` — capped, see note below |
| `shadow.2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | same as `shadow.lg` — capped, see note below |

**Bootstrap only has 3 real tiers** (`shadow-sm`, unnamed `shadow`, `shadow-lg`) against our 5 fixed roles — same shape of gap A5 already hit and resolved (Bootstrap's type-scale doesn't cleanly cover 8 roles either, "best-fit compression into the shared roles, flagged as approximate"). Same treatment here: `sm`→`shadow-sm`, `md`→Bootstrap's unnamed default, `lg`→`shadow-lg`, and since Bootstrap defines nothing past `lg`, `xl`/`2xl` **reuse `shadow.lg`'s value** rather than inventing numbers beyond what Bootstrap actually specifies — capping is more honest than extrapolating.

**MD3 and MD2 are a different shape of token entirely — not a `shadow` composite, an elevation dp number.** Both systems' real shadows are computed from a dp (elevation) value via each system's own umbra/penumbra/ambient shadow algorithm, not authored as a fixed blur/offset/spread — the same reason MD3's tonal palette and elevation-overlay are already Generator-layer work rather than spec-level values (see the note above, and `pipeline-plan.md`'s "Generators" bullet). So for MD3/MD2-targeted projects, `shadow.*`'s stored `$value` is the **elevation dp number** (DTCG `dimension` type, not `shadow`), and the **MD3/MD2 generator** computes the real multi-layer shadow from that dp at generation time — MD3 via Material's own elevation formula (confirmed dp levels: [level 0=0dp, 1=1dp, 2=3dp, 3=6dp, 4=8dp, 5=12dp](https://github.com/material-components/material-web/blob/main/docs/components/elevation.md), levels 1–5 mapped directly onto our five roles), MD2 via its published shadow-key opacities (key umbra 0.20, key penumbra 0.14, ambient 0.12 — [source](https://m2.material.io/design/environment/elevation.html)) at dp values best-fit from MD2's own component-elevation table (card/app-bar/button/nav-drawer/dialog): `sm`=1dp, `md`=4dp, `lg`=8dp, `xl`=16dp, `2xl`=24dp — flagged approximate, since MD2 never published a single named 5-step scale either (same caveat as MD2's spacing in A4).

**One consequence worth flagging:** `shadow.*` tokens use a *different DTCG type* depending on which design language was picked (`shadow` composite for Tailwind/Bootstrap projects, `dimension` for MD3/MD2 projects) — never mixed within a single generated project, since each project only ever has one design-language pick, but worth knowing before writing the Style Dictionary config that reads this file.

**Still needs sourcing at build time** (not resolvable from search alone, don't treat as confirmed): the exact real CSS translation MD3/MD2 generators apply for umbra/penumbra/ambient at each specific dp value — the opacities above are confirmed, but the precise blur-radius/spread formula per dp level should be verified against Google's Material Color/Elevation utilities source at implementation time.

#### A10. Fixed defaults — decided

| | Values |
|---|---|
| Breakpoints (Tailwind) | sm 640, md 768, lg 1024, xl 1280, 2xl 1536px — high confidence, unmodified defaults |
| Grid (Material Design 3) | Compact: 4 columns / 16dp margin+gutter. Medium: **8 columns** (confirmed, was previously flagged as an uncertain 8–12 range) / 24dp margin+gutter. Expanded: 12 columns / 24dp margin+gutter |

**Token names:** `breakpoint.sm`/`md`/`lg`/`xl`/`2xl` (Tailwind's own scale, unconditional — single fixed set, no design-language variation, per `contracts-and-seeds.md`). `grid.compact.columns`/`margin`/`gutter`, `grid.medium.columns`/`margin`/`gutter`, `grid.expanded.columns`/`margin`/`gutter` — 9 tokens, grouped by MD3's own tier names, since grid has no DTCG type and is built manually (per the type-mapping table above).

**Gap found and resolved:** MD3's own grid breakpoints (600/840/1200dp) didn't match the Tailwind breakpoints (640/768/1024px) already fixed elsewhere — two competing breakpoint systems in one project. **Decided: MD3's grid rides on Tailwind's already-fixed breakpoints.** Grid uses MD3 for the column-count/margin/gutter *recipe* only; the tier switches happen at `breakpoint.md`/`breakpoint.lg`, not MD3's own dp thresholds — `compact` below `md` (0–767px), `medium` between `md` and `lg` (768–1023px), `expanded` at `lg`+ (1024px+). Reasoning: breakpoints are already unconditionally Tailwind-only everywhere else in the spec — introducing MD3's separate 600/840/1200dp thresholds just for grid would mean grid switches tiers at different points than every other breakpoint-driven behavior in the same generated app, a real inconsistency for no gained benefit (nothing else in the project reads MD3's native thresholds).

**Must be disclosed on the seed-input form** (per `contracts-and-seeds.md`'s "indicated to users somehow in the process" requirement for both Breakpoints and Column system, since neither is a user-facing menu pick): grid unconditionally uses MD3's recipe regardless of target design language, and its tiers switch at Tailwind's `md`/`lg` breakpoints, not MD3's native 600/840dp — so nobody assumes MD3's real dp thresholds are in play. See the corresponding update in `contracts-and-seeds.md`.

### B. Naming grammar & structure (mechanical rules, apply across every group above)

**Token grammar:** `<group>.<tier?>.<role>[.<state>]`, all lowercase, kebab-case for multi-word segments — `color.semantic.text.on-primary`, `spacing.4`, `radius.md`, `typography.scale.heading-lg`.

**Contrast-pairing convention** (what `foundations-rules.md`'s automated contrast check needs): a semantic token named `<x>.on-<surface>` is asserted to sit on `color.semantic.<owning-group>.<surface>`, via one small fixed lookup table (`on-primary`→`action.primary`, `on-surface`→`background.surface`, etc.) rather than a generic parser — there are only a handful of surface roles, so a generic solution would be solving a bigger problem than exists.

**Figma-name mapping — mechanical and already exercised once:** replace `.` with `/` writing to Figma, `/` with `.` reading back. Not new — `figma-mcp-capabilities.md` already shows an effect style created and named `elevation/md` using exactly this slash convention.

**Collection naming (free-plan, two-collection case) — decided:** `Tokens - Light` / `Tokens - Dark` (space-dash), *not* `Tokens/Light`. Reason: `/` inside a variable *name* is what triggers Figma's own grouping UI — reusing it in the *collection* name risks Figma treating "Tokens" and "Light"/"Dark" as a nesting hint rather than a literal name. Whether `/` actually causes that in a *collection* name (as opposed to a variable name) was never independently verified — but since `-` costs nothing and carries no such risk either way, there's no reason to take the chance just to find out. Confirmed as final.

---

## Proposal 3 — `foundations-rules.md` outline — decided

Stable, well-established rules, not design-language-specific — verified against current sources rather than trusted from memory (one citation error caught and fixed in the process, see Focus visibility below):

- **Contrast:** WCAG 2.1 AA — 4.5:1 normal text, 3:1 large text (≥24px, or ≥18.66px bold) and UI components.
- **Touch targets:** 44×44pt minimum (iOS HIG), 48×48dp minimum (Android Material), **24×24 CSS px minimum for web (WCAG 2.2, SC 2.5.8 Target Size Minimum, AA) — added.** The platform guidelines already listed are native-app design conventions, not WCAG requirements — this project also targets Next.js and Vue.js, so the actual web-applicable WCAG criterion belongs here too, not just the two native ones. All three coexist: native targets follow their platform's own (larger) minimum, web targets follow WCAG's floor.
- **Focus visibility:** every interactive element needs a visible focus indicator (WCAG 2.4.7, AA); that indicator needs ≥3:1 contrast against adjacent colors (WCAG **1.4.11** Non-text Contrast, AA — corrected from an earlier draft that cited 2.4.11, which is actually "Focus Not Obscured," an unrelated WCAG 2.2 criterion about focused elements not being hidden by other content, not about contrast at all).
- **Reduced motion:** respect `prefers-reduced-motion` (web) / OS-level Reduce Motion (iOS/Android).
- **Use of color (WCAG 1.4.1, Level A) — added.** Color can't be the *only* signal for meaning, action, or state — needs an icon/text/shape backup. Directly relevant, not speculative: the token spec already built a 5-role status system (`status.error/success/warning/info/promo`, Proposal 2 A2) that's exactly the pattern this rule exists to catch — a status badge that's only ever distinguished by hue fails this the moment someone can't perceive the color difference.
- **Required interactive states per component:** default, hover, focus, active/pressed, disabled, plus loading/selected/error where relevant. (One conceptual state at this level — Proposal 2, A2 backs it with two distinct, independently-editable tokens, `-active` and `-pressed`, that share a value out of the box.)

**Moved out: token-usage do's/don'ts now live in `AGENTS.md` (Proposal 4), not here.** `foundations-rules.md` is scoped to accessibility/UX — how the *UI* should behave. Token-usage discipline is about how an *agent* writes code against the token spec — a different audience and a different file, per Proposal 4's own stated boundary below. The rule itself (semantic-only for color/typography, flat groups referenced directly, missing token → add one) is written into Proposal 4, 3.2.

---

## Proposal 4 — Agent rules template (a new `AGENTS.md` contract)

Addresses your point 3: yes, `AGENTS.md` is the right file for this — `pipeline-plan.md` already designs it as "the canonical file: pointers to `foundations-rules.md` and `design.md`, plus the sharpest always/never rules... read natively by Codex" (see "Agent rule files"), with `CLAUDE.md` and `.cursor/rules` as thin mirrors of it. What's missing is that this was never captured as its own line in the Contracts table — it's described in the plan but not tracked as something that still needs to be designed and built, the way `foundations-rules.md` is.

**Proposed new Contract:** *Agent rules template — the fixed `AGENTS.md` skeleton (structure + the fixed always/never rules list) that every generated project's `AGENTS.md` gets populated from, plus the pointer-only structure `CLAUDE.md`/`.cursor/rules` mirror it with.*

This is a different thing from `foundations-rules.md` (also static/fixed, but scoped to accessibility/UX — contrast, touch targets, focus, motion). The new contract is scoped to **token-usage discipline** — how an agent is supposed to reach for tokens at all, not how the UI should behave.

**Agreed and now written into `contracts-and-seeds.md` and `pipeline-plan.md`** (per your 3.1) — see the Contracts table and "What actually needs to get built" respectively.

### 3.2 — the rule itself (scoped)

"Use semantic tokens, not primitives, for color and typography. Every other token group — spacing, radius, opacity, border-width, shadow, breakpoints, grid — is flat by design, so referencing it directly is expected, not a violation. No hardcoded hex/px where a token already covers the value. If no semantic token fits, add one — don't fall back to a primitive or a magic number to route around the gap." (Folded in from Proposal 3's now-retired "Token-usage do's/don'ts" bullet — same rule, this is just its one home instead of two.)

### 3.3 — resolved

The primitive/semantic split is scoped to color and typography only (see the updated Proposal 1) — spacing stays flat. That keeps the rule above fully honest without inventing spacing roles ahead of Layer 2.

### 3.4 — additional always/never rules — decided

3.2 was the only concrete rule `AGENTS.md` actually had, despite `pipeline-plan.md`'s own description calling for "the sharpest always/never rules" (plural). The rest weren't invented — they're already sitting in `CLAUDE.md` (hard-learned once already, on the ACIM app) and in `pipeline-plan.md`'s own settled architecture decisions, just never pulled together into the one file that's supposed to carry them forward into every generated project.

**From `CLAUDE.md`'s "Lessons from a previous project (ACIM app)":**

1. **Never blindly re-run a vendored component's install/add command once it's been customized.** There's no merge logic — it silently overwrites. Mark customized files clearly so an agent doesn't reflexively "fix" them by re-pulling.
2. **NativeWind's `inlineRem` must be set to 16, not the default 14.** The default silently shrinks every rem-based token value with no warning. **Conditional** — only included in `AGENTS.md` for projects scaffolded with React Native (Expo) as the target framework; not relevant, so not written into, any other target's `AGENTS.md`.
3. **`tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups** (e.g. `px-4` vs. `pl-5`). Component variants need to account for this, not assume overrides "just work." **Conditional** — only included for Tailwind-targeted projects (shadcn/ui, shadcn-vue, RNR).

**From `pipeline-plan.md`'s already-settled architecture decisions:**

4. **Never re-run the token generator expecting it to "update" the project.** Regenerating is a deliberate, destructive reset — it replaces any manual edits made since the last run, per "Formulas run once, then get locked in." If asked to fix or adjust something, edit the specific token; don't regenerate.
5. **A token is only ever edited in one place at a time.** If a value already exists as a token, change the token — don't hardcode a local override in a component to work around it. A local override silently drifts from Figma sync (if enabled) and defeats the single-source-of-truth model the whole pipeline depends on.

**New, not previously written anywhere, but implied by all of Proposal 2's Generator-layer carve-outs (A1's Bootstrap/MD3 color handling, A6's Bootstrap radius handling, A9's MD3/MD2 shadow handling):**

6. **Don't cross-wire another design language's conventions into a project.** E.g. don't hand-roll Tailwind-style shade computation into a Bootstrap-targeted project, or approximate MD3's tonal palette with a plain color ramp. Trust the tokens already generated for this project's actual chosen stack — if something seems to be missing, that's a gap in the generated spec to flag, not something to work around by importing a different system's approach.

**Conditional-rule mechanism, worth noting:** rules 2 and 3 are the first cases where `AGENTS.md`'s content depends on which target framework/design-language a given project was actually generated with — every other rule in this section is universal. The generator needs to know which conditional rules apply to which target combination before writing a project's `AGENTS.md`, the same way it already needs to know this for token generation itself.

---

## Proposal 5 — Ramp-interpolation formula, neutral base, boilerplate status colors, typography weight/line-height

Surfaced while checking readiness to actually run Step 1 (seed input) → Step 2 (promote): several things Proposal 2 marked "Decided" turned out to have a formula or value gap underneath that Promote can't run without. None of these were previously flagged as open — they were left implicit.

**Finding: A1's table wording accidentally implied `neutral.600` = the user's literal input hex, same as `brand`/`brand-secondary`.** That can't be right — nobody types a neutral color. Nothing had ever actually defined where `neutral`'s base value comes from. **Resolved by adding a new seed input** ("Neutral colors," in `contracts-and-seeds.md`'s Seed inputs table) rather than picking a formula unilaterally: the user chooses brand-tinted (a faint hint of the brand hue) or pure achromatic gray, and the ramp-interpolation formula below takes it from there. This was the user's call, not an inferred default — a pure-gray vs. brand-tinted neutral is a real product-identity choice.

**Ramp-interpolation formula (brand/brand-secondary/neutral) — decided.** `pipeline-plan.md` had only ever committed to "HSL, hue is the anchor, adjust S/L from there" as a starting idea, never an actual per-step formula. Decided: hold hue and saturation constant at the base color's own values, interpolate lightness linearly toward fixed near-white (97%) / near-black (12%) targets in 5 equal steps each direction. Chosen over a white/black RGB-mix ("tint/shade") approach specifically to stay inside the HSL/hue-anchor direction already committed to, and because holding S constant is the simplest option that doesn't require inventing a saturation-tapering rule with no obvious source to justify one particular curve over another (matches "don't build things just in case"). Guarantees `1100` always lands at 12% lightness regardless of the base color, which is what actually satisfies A1's pre-existing "neutral.1100 near-black" constraint — that constraint was written before there was a formula that could reliably deliver it.

**Boilerplate status-color formula — decided.** Fixed hue per role (0/142/38/217/280 — red/green/amber/blue/violet), S=75% for every role, `.100`=95% lightness, `.200`=27% lightness. Originally hand-checked for only 2 of the 5 hues (error, info; ≈6.3:1–6.6:1) at `.200`=38% lightness — once the CLI actually existed and ran its own accessibility check against real output, that check immediately caught that `success` (green) and `warning` (amber) failed 4.5:1 at 38% (2.85:1 and 3.71:1), because green's high luminance weight in the WCAG formula keeps both tones brighter than red/blue at the same S/L. Re-tuned computationally by sweeping `.200`'s lightness across all 5 hues at once rather than hand-checking a couple and assuming the rest follow — 27% is the lowest value where every hue clears 4.5:1, worst case `success` at ≈5.22:1. This is exactly why the accessibility check exists as a real gate and not just a formality. The **brand-derived** status-color variant (nudging these toward the brand hue) was considered and explicitly deferred, not designed. **Update (2026-09-07): dropped outright, not deferred** — Boilerplate is now the only status-color formula, full stop; not a `StatusColorStyle` field, a `SeedConfig` key, or a seed-input question anymore.

**Three more implementation-level gaps, found after the CLI existed and had to actually decide these to run — resolved.** None were wrong in the docs, they just weren't specified at all, which is only visible once real code has to pick something: (1) the `-disabled` blend's color space was never named — resolved as RGB per-channel linear interpolation, specifically because HSL blending breaks down when one side is achromatic (undefined hue at 0% saturation), which the pure-gray neutral seed choice can produce; (2) `action.*-disabled` and `overlay.scrim` were described as if they might be aliases like everything else around them, but a plain DTCG alias can't carry a blend or an alpha override — both are baked literal values instead, the one exception to "everything here is an alias"; (3) multi-layer Tailwind shadows (two comma-separated CSS shadows for `md`/`lg`/`xl`) had no stated DTCG shape — resolved as a `$value` array of layer objects, always an array even for the single-layer roles, so the shape never branches on layer count; Bootstrap's `rem` values also needed an explicit "convert to px at the project's 16px root" rule, same as everywhere else in the spec. See `contracts-and-seeds.md`, "Color semantic roles" and "Shadow."

**A2 gap, found while wiring up real values for Promote: Background/Text/Border tokens had no primitive mapping.** A2 only ever specified exact ramp-step mappings for Action (`hover`→`700`, etc.) and Status (`.200`/`.100`) — Background/Text/Border were listed as token names with no rule for which `neutral`/`static`/`brand` step each one aliases. Resolved with a mirrored light/dark mapping (see `contracts-and-seeds.md`, "Color semantic roles") — each mode uses the same distance-from-primary pattern (e.g. `secondary` background one step deeper than `primary`), so light and dark stay visually parity even though they walk the ramp in opposite directions. `background.surface` is the one asymmetric case: light mode reaches for `static.100` (pure white) since `neutral.100` is already the ramp's lightest step and surface needs to read as raised above it, while dark mode has headroom inside the ramp itself. Same category as the `-disabled` blend % — our own reasonable default, not sourced from an external spec, worth revisiting once real components exist.

**Two more small A5 gaps, found while building the actual preset files: resolved.** Bootstrap/MD3/MD2 all left `body-lg` as "—" (undefined) despite A3 unconditionally generating `body-lg-regular`/`body-lg-semibold` for every project regardless of preset — resolved as the midpoint between that preset's own `body` and `heading-sm` values (Bootstrap: 18, MD3: 19, MD2: 18), which happens to match how Tailwind's own `body-lg` already sits roughly midway between its `body` and `heading-sm`. Separately, MD3's and MD2's `display` sizes were each sourced as an open range spanning more than one of their own named tiers (MD3 "45–57," MD2 "60–96") rather than a single number — resolved to MD3's Display Medium (45) and MD2's H2 (60), picked to stay roughly proportionate to the other presets' `display` sizes rather than jumping to each system's largest named tier.

**Typography font-weight and line-height — decided.** Font-weight numbers (`regular`=400, `semibold`=600, `bold`=700) had only ever appeared once, as an example value inside Proposal 1's illustrative JSON — never written down as an actual decision. Line-height had no value or formula anywhere, not even flagged as open, despite every one of A3's 15 composite tokens needing one. Both resolved as fixed, conventional defaults rather than researched/sourced numbers (same category as the `-disabled` blend % and MD2's elevation dp best-fit, below): weights are the standard 400/600/700 values every Google Font uses; line-height is font-size × 1.5 (body-ish roles) or × 1.2 (heading/display roles, tighter leading being standard at larger sizes), rounded to the nearest px.

---

## All open calls, collected

None required to run Step 1 → Step 2. The one thing still genuinely open on the token-value side, and unresearchable (not an external-spec lookup, a design call with no official source): whether the `-disabled` blend percentage (A2, 50% toward neutral), the MD2 elevation dp best-fit (A9, 1/4/8/16/24dp), and Proposal 5's own defaults (the ramp's 97%/12% lightness targets, the boilerplate status hues/S/L, and the 1.5×/1.2× line-height ratios) hold up once real components get built against them — all are reasonable starting defaults, not verified-correct the way the sourced numbers elsewhere are. The brand-derived status-color nudge formula (Proposal 5), previously the one item still by-design deferred rather than just unverified, was dropped outright on 2026-09-07 — not a deferred future option anymore.

**Resolved since last pass:** the key-shape split (A4) — confirmed spacing keeps preset-native keys, type-scale/radius keep fixed shared keys; MD3/MD2 spacing — resolved by reusing Tailwind's scale directly rather than a derived approximation; the typography composite matrix (A3) and font-family mapping — both decided, see A3; roundness model — decided 4-way, matching design language (see the resolved "Finding" at the top of this file and A6); border-width token names decided (A7), including the `borderWidth` → `border-width` naming fix; opacity key/value split decided (A8); shadow key-shape model decided and **all exact values now sourced** — Tailwind/Bootstrap's real CSS, MD3's confirmed elevation dp levels (0/1/3/6/8/12), MD2's published shadow opacities (A9); fixed defaults (A10) — token names decided, MD3 grid confirmed to ride Tailwind's breakpoints, **and the Medium-grid column count confirmed at 8** (was previously an unverified 8–12 range); `overlay.scrim`'s alpha confirmed at 50%, sourced from Bootstrap's own official modal-backdrop default; **collection-name separator confirmed** (`Tokens - Light` / `Tokens - Dark`, space-dash) — see Proposal 2, Section B.

**Proposal 2 (A1–A10) is now fully decided, including every number that was previously deferred to "verify at build time."**

**Moved out of Contracts, into `pipeline-plan.md`'s "Generators" build item** (these turned out to be platform-fit concerns, not spec decisions): the Tailwind/MD2 positional key-relabel table, Bootstrap's base-color-only consumption, and MD3's real tonal-palette + elevation-overlay generation. See that doc's Generators bullet for the per-target breakdown.

**Resolved — Subject 1 (Token spec):** multiple files per group; primitive/semantic split scoped to color and typography only; light/dark files always mode-suffixed, presence depends on the seed choice; the `AGENTS.md` agent-rules-template contract, now tracked in `contracts-and-seeds.md` and `pipeline-plan.md`.

**Resolved — Subject 2 (naming + preset library, now merged as Proposal 2):** Pretokens dropped — brand color/font naming convention no longer needed at all, since seeds come straight from the form. **The token spec is now explicitly platform-agnostic** (see "A. Which exact tokens get generated" above) — it defines one universal primitive+semantic shape, and per-target fidelity is Generators' job, not a Contracts-level fit-every-framework exercise. **Color primitives decided** (A1): `brand`/`brand-secondary`/`neutral` use an 11-step ramp (`100`–`1100`, evenly numbered, base = `600`); `static` is a fixed white/black pair; `status` is 5 numeric-keyed roles × 2 tones each, fixed order `1`=error…`5`=promo. **Color semantic role list decided** (A2): background/text/action/border/status/overlay, 40 tokens per mode (45 with a secondary brand color) — `action.secondary.*` conditional, `overlay.scrim` added, `-active` and `-pressed` are distinct tokens that share a value (`brand.800`) so either can be re-pointed independently later, ramp-step mapping `hover` → `700`, `active`/`pressed` → `800`, `-disabled` via a desaturate-toward-neutral formula. **Typography decided** (A3): 15 role×weight tokens; primary feeds `heading-*`/`display`, secondary feeds `body*`/`caption`, disclosed on the seed-input form. **Spacing decided** (A4): native per-preset keys; MD3/MD2 reuse Tailwind's scale directly, disclosed on the form, including the key≠value (`spacing.4` = 16px) gotcha. **Roundness model decided** (A6): 4-way matching design language, fixed keys (`none/sm/md/lg/xl/full`), `radius.full` = `9999` uniformly with Bootstrap's `50rem` pushed to Generators. **Border-width decided** (A7): `border-width.0/1/2/4/8`, plus the `borderWidth` → `border-width` naming fix. **Opacity decided** (A8): percentage keys, 0–1 decimal values. **Shadow decided** (A9): fixed keys (`sm/md/lg/xl/2xl`) across all four presets, matching type-scale/radius. **Fixed defaults decided** (A10): `breakpoint.*` and `grid.<tier>.*` token names; MD3's grid rides Tailwind's breakpoints, disclosed on the form. All of Proposal 2 (A1–A10) is now decided — only the build-time-numbers list (see "All open calls" above) remains open.

**Resolved — Proposal 5:** the ramp-interpolation formula (fixed hue/saturation, lightness interpolated toward 97%/12% targets); `neutral`'s base is now a dedicated seed choice (brand-tinted vs. pure achromatic), not implied to be user-typed like `brand`; the boilerplate status-color formula (fixed hue per role, S=75%, L=95%/38%); and typography's font-weight numbers (400/600/700) and line-height formula (×1.5 / ×1.2 by role). The brand-derived status-color variant, previously kept deferred on purpose, was dropped outright on 2026-09-07 — see the "Boilerplate status-color formula" note above.

Nothing above is built yet — this file is the discussion draft to work through before anything becomes an actual Contract file.
