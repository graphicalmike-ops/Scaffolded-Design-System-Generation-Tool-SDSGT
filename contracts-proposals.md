# Contracts — proposals (pending decisions)

Draft proposals for each item in the "Contracts" table in `contracts-and-seeds.md`, based on the seed inputs listed there plus the decisions already settled in `pipeline-plan.md`. Nothing here is built or final — this is a discussion draft. Work through it point by point; open questions that need a decision are called out inline and collected again at the end.

---

## Finding: the two docs disagree on how corner-roundness is chosen

- `pipeline-plan.md` ("Value-foundations," "Everything settled so far") says roundness is a **tool-original 3-way preset** — square / lowly-round / highly-round — its own menu, independent of design language.
- `contracts-and-seeds.md` (confirmed complete) lists roundness as a **4-way menu matching the design-language pick** — Tailwind / Bootstrap / Material Design 3 / Material Design 2 — same options as spacing and type-scale.

These aren't reconcilable as written. The roundness proposal below assumes **contracts-and-seeds.md is current** (design-language-matched, 4-way), since that's the doc most recently confirmed finalized, but flags where the older 3-way model would give a different answer. Once decided, `pipeline-plan.md` has a stale passage that needs a follow-up fix (not done yet).

**Decision needed:** which model is actually current — 3-way tool preset, or 4-way matching design language?

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
  borderWidth.json
  opacity.json
  shadow.json
  breakpoint.json
  grid.json
```

**Color and typography are the only two groups with a primitive/semantic split.** Color, because a role like `action.primary` is a simple one-to-one alias into a primitive. Typography, because a role like `body-lg-semibold` is a *composite* alias — it bundles several primitives (family + weight + size + line-height) into one named style, using DTCG's own `typography` composite token type rather than anything custom. Every other group — spacing, radius, border-width, opacity, shadow, breakpoint, grid — stays single-tier: the value in the file *is* the token, with no separate primitive layer underneath it that a component could bypass.

Color, concretely:

```jsonc
// color.primitive.json
{
  "color": { "primitive": {
    "brand":   { "50": {"$type":"color","$value":"#eef4ff"}, "500": {"$type":"color","$value":"#3B82F6"}, "900": {"$type":"color","$value":"#1e3a8a"} },
    "neutral": { "50": {...}, "900": {...} },
    "status":  { "error": {...}, "success": {...}, "warning": {...}, "info": {...} }
  }}
}

// color.semantic.light.json
{
  "color": { "semantic": {
    "background": { "primary": {"$value":"{color.primitive.neutral.50}"} },
    "text":       { "on-primary": {"$value":"{color.primitive.neutral.50}"} },
    "action":     { "primary": {"$value":"{color.primitive.brand.500}"}, "primary-hover": {"$value":"{color.primitive.brand.600}"} }
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

## Proposal 2 — Naming & structure conventions

**Token grammar:** `<group>.<tier?>.<role>[.<state>]`, all lowercase, kebab-case for multi-word segments — `color.semantic.text.on-primary`, `spacing.4`, `radius.md`, `typography.scale.heading-lg`.

**Contrast-pairing convention** (what `foundations-rules.md`'s automated contrast check needs): a semantic token named `<x>.on-<surface>` is asserted to sit on `color.semantic.<owning-group>.<surface>`, via one small fixed lookup table (`on-primary`→`action.primary`, `on-surface`→`background.surface`, etc.) rather than a generic parser — there are only a handful of surface roles, so a generic solution would be solving a bigger problem than exists.

**Figma-name mapping — mechanical and already exercised once:** replace `.` with `/` writing to Figma, `/` with `.` reading back. Not new — `figma-mcp-capabilities.md` already shows an effect style created and named `elevation/md` using exactly this slash convention.

**Collection naming (free-plan, two-collection case):** propose `Tokens - Light` / `Tokens - Dark` (space-dash), *not* `Tokens/Light`. Reason: `/` inside a variable *name* is what triggers Figma's own grouping UI — reusing it in the *collection* name risks Figma treating "Tokens" and "Light"/"Dark" as a nesting hint rather than a literal name. This is a judgment call, not a verified constraint.

**Pretokens area:** a Figma page/frame literally named `Pretokens`, with only these layer names recognized by "promote": `brand/primary`, `brand/secondary`, `font/primary`, `font/secondary`. Anything else on that page is ignored, not an error.

**Decisions needed:**
- Collection-name separator: `Tokens - Light` (proposed) vs. something else.

---

## Proposal 3 — Preset library

**Key philosophy split** (a new proposal — not stated anywhere in the docs yet): **type-scale and radius use one fixed set of role/step names across all four presets — only the values change.** Spacing uses each system's own native step names, since values and key-shape both change.

Reason: components will eventually bind to a role like "card title uses `typography.heading-lg`" or "button uses `radius.md`" — that binding has to survive someone switching design-language presets later, so those two need stable keys. Nothing in the plan currently binds a *component* to a specific spacing step the same way, so spacing doesn't need that constraint yet — matches "don't build things just in case."

**Decision needed:** confirm this split (fixed keys for type-scale + radius, native keys for spacing) makes sense before it's locked in.

### Spacing (native keys per system)

| Preset | Values (px, at 16px root) |
|---|---|
| Tailwind | 0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96 |
| Bootstrap | 0, 1=4, 2=8, 3=16, 4=24, 5=48 |
| Material Design 3 | 4, 8, 12, 16, 24, 32, 40, 48, 56, 64 *(MD3 spacing-token names shift between spec revisions — verify against current m3.material.io before locking in)* |
| Material Design 2 | 4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96 *(MD2 only ever specified "use the 8dp grid, 4dp when needed" — this is a derived ramp, not an official named scale)* |

### Type-scale (fixed roles: `caption, body-sm, body, body-lg, heading-sm, heading-md, heading-lg, display`)

| Preset | caption | body-sm | body | body-lg | heading-sm | heading-md | heading-lg | display |
|---|---|---|---|---|---|---|---|---|
| Tailwind | 12 | 14 | 16 | 18 | 20 | 24 | 30 | 48 |
| Bootstrap | 12 | 14 | 16 | — | 20 (h5) | 25 (h4→h3ish) | 32 (h2) | 40 (h1) |
| MD3 | 11 (label-sm) | 12 (body-sm) | 16 (body-lg) | — | 22 (title-lg) | 28 (headline-md) | 32 (headline-lg) | 45–57 (display) |
| MD2 | 10 (overline) | 14 (body2) | 16 (body1) | — | 20 (h6) | 24 (h5) | 34 (h4) | 60–96 (h2/h1) |

Bootstrap and MD3/MD2 don't map onto 8 roles as cleanly as Tailwind does (they're named scales with 6–13 steps of their own) — the numbers above are a best-fit compression into the shared roles, flagged as approximate rather than exact.

### Radius (fixed keys: `none, sm, md, lg, xl, full`) — under the 4-way (contracts-and-seeds.md) model

| Preset | none | sm | md | lg | xl | full |
|---|---|---|---|---|---|---|
| Tailwind | 0 | 4 | 6 | 8 | 12 | 9999 |
| Bootstrap | 0 | 4 | 6 | 8 | 16 | pill (50rem) |
| MD3 | 0 | 4 | 12 | 16 | 28 | 9999 |
| MD2 | 0 | 2 | 4 | 8 | 16 | 9999 *(MD2 was much less prescriptive on shape than MD3 — lower confidence)* |

If the **3-way tool-original model** turns out to be the real one instead: `square` = all zero except `full` (still needs to allow pill/circle avatars even in a "square" system); `lowly-round` ≈ 0/2/4/6/8/9999; `highly-round` ≈ 0/6/12/20/32/9999.

### Border-width (fixed, Tailwind, not user-facing)

0, 1 (default), 2, 4, 8px — high confidence, Tailwind's unmodified default scale.

### Opacity (independent 2-option menu — Tailwind or Bootstrap only; neither MD variant has a preset scale)

| Preset | Values |
|---|---|
| Tailwind | 0, 5, 10, …, 95, 100 (5% steps) |
| Bootstrap | 0, 25, 50, 75, 100 |

### Shadow

Role names are confident (`sm, md, lg, xl, 2xl` for Tailwind/Bootstrap-style; MD3/MD2 use numbered elevation instead), but exact blur/offset/spread numbers should be sourced from each system's real published values at build time rather than hand-typed into a contract from memory — a wrong pixel value here is exactly the kind of subtly-wrong thing that's easy to bake in and annoying to notice later.

**Structural flag:** MD3 elevation isn't a pure shadow — each level pairs a shadow with a tonal surface-color overlay, which doesn't fit a plain `shadow` token. Proposal: approximate MD3/MD2 elevation as shadow-only (drop the tonal-overlay part) as a named, deliberate simplification, rather than silently getting it wrong.

**Decisions needed:**
- MD3/MD2 elevation approximated as shadow-only — acceptable simplification?
- Sourcing exact shadow numbers from official specs at build time rather than from this doc — agreed?

### Fixed defaults

| | Values |
|---|---|
| Breakpoints (Tailwind) | sm 640, md 768, lg 1024, xl 1280, 2xl 1536px — high confidence, unmodified defaults |
| Grid (Material Design 3) | Compact: 4 columns / 16dp margin+gutter. Medium: 8–12 columns (MD3 docs aren't fully consistent between revisions — verify) / 24dp margin+gutter. Expanded: 12 columns / 24dp margin+gutter |

**Gap found:** MD3's own grid breakpoints (600/840/1200dp) don't match the Tailwind breakpoints (640/768/1024px) already fixed elsewhere — two competing breakpoint systems in one project. Proposal: use MD3 for the column-count/margin/gutter *recipe* only, but switch between its steps at the **already-fixed Tailwind breakpoints**, rather than importing MD3's own dp thresholds too.

**Decision needed:** MD3 grid riding on Tailwind's breakpoints (proposed) vs. grid using MD3's native breakpoints and accepting two breakpoint systems in the project.

---

## Proposal 4 — `foundations-rules.md` outline

High confidence on all of these — stable, well-established numbers, not design-language-specific:

- **Contrast:** WCAG 2.1 AA — 4.5:1 normal text, 3:1 large text (≥24px, or ≥18.66px bold) and UI components.
- **Touch targets:** 44×44pt minimum (iOS HIG), 48×48dp minimum (Android Material).
- **Focus visibility:** every interactive element needs a visible focus indicator; ≥3:1 contrast against adjacent colors (WCAG 2.4.11).
- **Reduced motion:** respect `prefers-reduced-motion` (web) / OS-level Reduce Motion (iOS/Android).
- **Required interactive states per component:** default, hover, focus, active/pressed, disabled, plus loading/selected/error where relevant.
- **Token-usage do's/don'ts:** components consume semantic tokens only, never primitives directly; no hardcoded hex/px where a token exists; missing semantic token → add one, don't reach for a primitive or a magic number.

---

## Proposal 5 — Agent rules template (a new `AGENTS.md` contract)

Addresses your point 3: yes, `AGENTS.md` is the right file for this — `pipeline-plan.md` already designs it as "the canonical file: pointers to `foundations-rules.md` and `design.md`, plus the sharpest always/never rules... read natively by Codex" (see "Agent rule files"), with `CLAUDE.md` and `.cursor/rules` as thin mirrors of it. What's missing is that this was never captured as its own line in the Contracts table — it's described in the plan but not tracked as something that still needs to be designed and built, the way `foundations-rules.md` is.

**Proposed new Contract:** *Agent rules template — the fixed `AGENTS.md` skeleton (structure + the fixed always/never rules list) that every generated project's `AGENTS.md` gets populated from, plus the pointer-only structure `CLAUDE.md`/`.cursor/rules` mirror it with.*

This is a different thing from `foundations-rules.md` (also static/fixed, but scoped to accessibility/UX — contrast, touch targets, focus, motion). The new contract is scoped to **token-usage discipline** — how an agent is supposed to reach for tokens at all, not how the UI should behave.

**Agreed and now written into `contracts-and-seeds.md` and `pipeline-plan.md`** (per your 3.1) — see the Contracts table and "What actually needs to get built" respectively.

### 3.2 — the rule itself (scoped)

"Use semantic tokens, not primitives, for color and typography. Every other token group — spacing, radius, opacity, border-width, shadow, breakpoints, grid — is flat by design, so referencing it directly is expected, not a violation."

### 3.3 — resolved

The primitive/semantic split is scoped to color and typography only (see the updated Proposal 1) — spacing stays flat. That keeps the rule above fully honest without inventing spacing roles ahead of Layer 2.

---

## All open calls, collected

1. **Roundness: 3-way tool preset, or 4-way matching design language?** Changes which radius table above is real.
2. Collection-name separator: `Tokens - Light` (proposed) vs. something else.
3. Confirm the key-shape split: type-scale + radius get fixed shared keys across presets; spacing keeps preset-native keys.
4. MD3 grid values riding on Tailwind's breakpoints instead of MD3's own — OK, or should grid use MD3's native breakpoints and just accept two breakpoint systems?
5. MD3/MD2 elevation approximated as shadow-only (dropping the tonal-overlay part for MD3) — acceptable simplification?
6. A few numbers flagged above (MD3 spacing-token names, MD3 medium-grid column count, exact shadow blur/offset values) should be verified against current official sources rather than trusted to memory before they go into a real Contract file.

**Resolved — Subject 1 (Token spec):** multiple files per group; primitive/semantic split scoped to color and typography only; light/dark files always mode-suffixed, presence depends on the seed choice; the `AGENTS.md` agent-rules-template contract, now tracked in `contracts-and-seeds.md` and `pipeline-plan.md`.

Nothing above is built yet — this file is the discussion draft to work through before anything becomes an actual Contract file.
