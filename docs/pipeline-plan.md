# SDSGT Pipeline Plan (working)

Status: planning — no code generated yet. Rewritten in plain language 2026-08-15 (originally written 2026-08-11 under Opus; see `docs/archive/pipeline-plan-archive.md` for the original wording, kept verbatim for reference).

This is the working plan for the design-system-generation slice of SDSGT — the process, and the decisions settled so far.

---

## Three layers

The design system (this doc) is step one of three. Each layer builds on the one before it, adding one more user choice:

```
LAYER 1  FOUNDATION            tokens + rules                    ← this doc
            │  + component library (user picks)
            ▼
LAYER 2  DESIGN SYSTEM         foundation applied to real components (code + Figma)
            │  + framework (user picks)
            ▼
LAYER 3  PROJECT TEMPLATE      design system dropped into a running project scaffold
```

Each layer is a one-way add-on, and code stays the source of truth throughout — the design system stays framework-agnostic so Layer 3 is a drop-in, not a merge.

**Layer 2 is where the real difficulty is**, not Layer 1 or 3:
- Applying tokens to a component library means mapping our tokens onto that library's own theming setup (its expected variable names, its assumptions) — and every library does this differently, so "let the user pick a library" multiplies the work.
- The lessons from the ACIM app apply directly here: trim vendored components to only what's used, mark customized files clearly, never blindly re-run a vendor's install command, and watch for `tailwind-merge` not overriding cleanly.
- The Figma side of components is much more fragile than the Figma side of tokens. Tokens-as-variables is simple and proven; a full component library in Figma (variants, auto-layout, binding) is visual and finicky — expect a build-screenshot-check-adjust loop, not a clean one-shot.

**Tokens and components round-trip differently — this is a deliberate, accepted asymmetry:**
- **Tokens** round-trip cleanly and automatically: edit in Figma → pull into code → done. (See "Editing model" below — this works because of how Figma variables can *link* to each other.)
- **Components do not.** Code is the source of truth for a component's structure; Figma only ever shows a generated picture of it. If someone rearranges a component visually in Figma, that change does not flow back into code by itself — there's no reliable way to read "you rearranged this layout" back out of Figma. Getting a Figma-side component change into code is a manual, on-demand thing (ask an agent to go look and re-create it in code), not an automatic stage of the pipeline.

---

## How generation actually works

A user supplies a few raw creative decisions, the tool turns those into a full structured system, and from then on, code is the master copy.

```
  presets / defaults ──┐   (spacing, breakpoints, grid, roundness… — picked, not explored)
                       ▼
  seed inputs ─────promote──▶ code token spec (SOURCE OF TRUTH)
  (brand colors + font,        light/dark held as separate token sets
   via chat #hex / screenshot         │ generate
   / optional Figma file)             │
                    ┌────────────────┼────────────────┬────────────────┐
                    ▼                ▼                 ▼                 ▼
            code tokens        Figma push:        agent rules      rule-foundations doc
        (web or native,     2 collections          (CLAUDE.md /    (static doc, copied
         user's choice)      Light + Dark            .cursor/rules)  in, platform-filtered)
```

**1. Seed input** — the user supplies the raw creative decisions: brand colors (a hue is extracted, the rest gets derived) and a base font, plus the preset picks (spacing, corner-roundness, etc). These can arrive as raw `#hex` values in chat, a screenshot, or an optional Figma file — Figma is one possible channel, never required.

**2. Promote** — the seeds get turned into a real structured token system: **primitives** (computed once, then locked in as plain values) and **semantics** (real links back to those primitives). The moment this happens, code becomes the source of truth. (See "Formulas run once" below for why this matters.)

**3. Generate** — from that spec, the tool produces code tokens, agent rules, and a clean push of Figma variables/styles. Figma at this point is a generated result, not a scratchpad anymore.

### Pretokens (the raw seeds)

Pretokens are the *optional* Figma-based way to supply seeds — not the only way. The same brand-color-and-font seeds can just as easily be typed as `#hex` values in chat or shown as a screenshot. Use an actual Figma pretokens file only when someone wants to see color/font choices visually before deciding; skip it entirely when the values are already known.

What they are: unstructured swatches and samples on a Figma canvas — a rectangle filled with a candidate brand color, a text sample in a candidate font. Only brand colors and fonts get explored this way — corner-roundness moved to the preset-menu path instead (see "Value-foundations" below), since it's a small, opinionated choice rather than something worth free-form exploring.

Generating from pretokens means going from a couple of raw picks to an entire system — not copying them 1:1. From one brand color, the tool derives tints/shades, hover/active/disabled states, semantic roles (background/foreground/border), and light + dark versions. From a font + base size, it derives a full type scale with roles (heading/body/caption). The generated system is a sensible default, not a final answer — the user prunes what isn't needed before it becomes canonical (in keeping with "don't build things just in case").

This needs a naming convention so the tool knows what it's reading — e.g., a dedicated "Pretokens" area in the Figma file where a swatch's name carries meaning (`brand/primary`, `font/base`). That naming convention is still undecided — see "Blocking item" below.

Once pretokens are promoted into real tokens, the pretoken scratch area is spent — it's not touched again. Ongoing editing happens in the generated Figma projection instead (see next section). The rule that prevents confusion: **a token is only ever edited in one place at a time.**

### Editing model: what can be changed in Figma and synced back

Think of tokens like a spreadsheet. A cell can hold **a value you typed** (`#3B82F6`), or **a formula** ("brand color, 20% darker"). Figma only ever shows the final result of a cell — it doesn't remember formulas.

So every token is one of three things:

| Kind | Plain example | Can you edit it in Figma and sync it back to code? |
|---|---|---|
| **A value you picked** | "Brand blue is `#3B82F6`" | Yes, no issues |
| **A link to another token** | "Button color = *same as* brand blue" | Yes — Figma understands links between variables |
| **An auto-calculated value** | "This shade = brand blue, 20% darker" | The only tricky case |

The first two cover the large majority of real design work, and sync cleanly both ways. The one gotcha: if a token is auto-calculated and someone hand-edits the result directly in Figma, the next recalculation could silently overwrite that edit. Two ways around it: **change the ingredient the formula uses** (always safe), or **don't auto-calculate that token at all** — hand-pick the value instead, which turns it into "a value you picked" and the gotcha disappears entirely. The one thing that's genuinely not possible from Figma: inventing a brand-new calculation rule — that's a one-time code change, not a design action.

If someone overrides a linked token with a raw color in Figma (breaking the link, on purpose or by accident), the tool can't guess their intent — so it flags it during the next sync ("this token is no longer linked — keep it as a fixed value?") instead of silently deciding for them.

### Formulas run once, then get locked in

This is what makes the "auto-calculated" gotcha above basically go away. **A formula runs exactly once, at the moment seeds get promoted into tokens — and the result is saved as a plain value from then on.** Same idea as using a spreadsheet formula to fill in a column, then doing "paste as values" and deleting the formula. After that point, nothing in the live system is still auto-calculating:

- **Primitives are locked-in (baked) values.** For example, the main brand color is one primitive; a 20%-lighter tint is a second primitive, computed once at promotion time and then stored as a plain color from then on. Fully editable in Figma afterward, with no formula left to fight with.
- **Semantics are real links to primitives**, also fully editable (re-point which primitive they link to). Editing a primitive automatically flows through to anything linked to it.

The trade-off, accepted on purpose: because formulas only run once, re-generating a whole palette after changing the main brand color is a deliberate, separate action — a "regenerate this palette" step you choose to run, which will replace any manual shade edits made since the last time it ran. Day to day, everything is freely editable; regenerating is an intentional reset, not something that happens quietly in the background.

**The color formula itself (brand color → full palette) is still just a starting proposal, not finalized:** the idea is to work in HSL (hue/saturation/lightness), treat hue as the fixed anchor, and build the palette by adjusting saturation and lightness from there. The exact steps, how many, and whether hue ever shifts are still to be decided later. Whatever formula is finally chosen, results still get baked into plain values per the rule above.

**Status colors (error/success/warning/info) and neutral grays can't just come from the brand hue** — an error message needs to unambiguously read as "error," not as "brand color, but sadder." So generation will ask the user to choose between:
- **Boilerplate (default)** — a conventional, safe, accessibility-sane status palette and a plain gray ramp.
- **Brand-derived** — the same colors, nudged toward the brand's hue while staying clearly recognizable as their intended meaning.

Either way, results get baked into plain values like everything else. The exact "nudge toward brand" formula is still to be worked out alongside the main color formula.

---

## Foundational settings: values vs. rules

Beyond colors and type, a design system needs things like a grid, breakpoints, accessibility minimums, and interactive states. These split into two genuinely different categories.

### Value-foundations — these are just more tokens

Breakpoints, grid (columns/gutter/margins/max-widths), spacing scale, corner-roundness, border widths, opacity. These all have an actual value that needs to stay consistent across web and native, so they live in the same token spec as everything else and flow through the same pipeline (code tokens + Figma push). There's no separate document for these — a second home would just mean a second source of truth to keep in sync.

A few scope notes:
- **Motion (durations, easing) isn't generated at all.** It's too specific to the platform/framework/component library in use.
- **Z-index/elevation isn't generated either**, for the same reason — it belongs to whichever component library gets used, not to the foundation.
- **Grid stays a code-only token — it's not pushed to Figma as a variable.** In Figma, a grid is a property of a frame (a "layout grid style"), not a variable, so it doesn't fit the same push mechanism. Breakpoints push fine, since they're just plain numbers.

These don't go through the explore-and-promote loop the way brand color does — nobody hand-draws a breakpoint in Figma. Instead, each one gets its starting value one of three ways, and once it's in the spec, it's an ordinary editable token like anything else:

| How it starts | Examples | Decided by |
|---|---|---|
| **Explored per project** | brand colors, font | The user, via chat / screenshot / optional Figma file |
| **Picked from a preset menu** | spacing rhythm, corner-roundness, type-scale ratio | The user, choosing from 2-3 options at generation time |
| **Fixed default** | breakpoints, grid | Shipped as-is, no choice needed |

The preset menus themselves ship as real token files (e.g. a `lowly-round` roundness file, a `linear-8` spacing file) — generation literally copies the chosen file into the project's token spec, so it's transparent and editable afterward, not a hidden config flag. The menus stay small and opinionated on purpose (2-3 good options, not an open-ended configurator) — the goal is a sane default in seconds, not infinite customization up front.

**Corner-roundness specifically** ships as a preset menu — **square / lowly-round / highly-round** — the same mechanism as spacing and type scale, rather than a freely-explored pretoken like color. A fourth option, **squircle** (the smoothed, flowing corner shape used on iOS app icons), is deliberately deferred rather than included now — it's not just a bigger radius value, it needs real platform-specific drawing work (SVG/clip-path on web, custom masking on native) that doesn't exist yet. See "Deferred," below.

### Rule-foundations — a static reference doc, not something generated

Accessibility contrast minimums, minimum touch-target sizes (44px on iOS, 48dp on Android), the requirement for a visible focus state, respecting a user's reduced-motion setting, what interactive states a component needs, and general token-usage do's and don'ts. These aren't values to pick — they're near-universal rules about *how* tokens and components should be used, and they don't really change project to project.

Because they're universal, they're not generated — they're a static document the tool ships and copies into every project unchanged (aside from filtering by platform — e.g. only including the iOS touch-target rule for a native project).

This content lives in exactly one place, with everything else pointing to it rather than repeating it:

| Where | What's there |
|---|---|
| **The canonical doc** (`foundations-rules.md`, ships with every project) | The full, human-readable explanation — this is the source of truth |
| **Agent rules** (`CLAUDE.md` / `.cursor/rules`) | Not the full explanation — just a short pointer to the doc, plus the handful of hard always/never rules an agent needs on hand while working |
| **Automated checks** | Whichever of these rules can actually be checked by a machine (e.g. contrast ratios) get run as validation against the token spec |

**Automated contrast checking needs one more piece to work:** to check contrast, the tool needs to know which text color is meant to sit on which background color — the token spec alone doesn't say that. The plan is to have the token *naming convention* carry that information (e.g. a token named `text-on-primary` implies it's meant to sit on `primary`), which is nearly free once the naming convention exists (see "Blocking item" below). If that doesn't end up working, contrast falls back to being a written guideline rather than an automated check.

Accessibility checks run once, at the moment seeds get promoted into tokens. If someone hand-edits tokens after that, they're doing so at their own risk of breaking one of these rules — promotion is the checkpoint, not a background process constantly watching for problems.

---

## Everything settled so far, in one list

- **The tool starts in Claude Code, not Figma.** Figma is an output, never the master copy.
- **Tokens are stored in the W3C "DTCG" JSON format** — a standard format (not hand-rolled), readable by agents, and already spoken by Figma's own token tooling, which is what makes the Figma round-trip work cleanly.
- **Style Dictionary is the tool that converts those tokens into real platform code** (CSS, TypeScript, etc.) — this is a firm choice, not one of several options left open.
- **Figma "styles" (not just variables) are usable as tokens too.** Figma variables only hold color/number/string/boolean, so things like shadows and fonts live as Figma *styles* instead — but those are just as readable and writable via the Figma MCP, confirmed working for both effect styles (shadows) and text styles (fonts). See `docs/figma-mcp-capabilities.md`. A shadow token's pieces (blur, spread, offset, color) map onto primitive variables that get composed into a Figma effect style.
- **The tool is platform-agnostic at the token level.** The spec itself doesn't know or care what platform it's for — the user picks a platform, and the generator emits the right shape (CSS variables/Tailwind theme for web, TypeScript/NativeWind constants for native).
- **Light/dark mode, worked around for Figma's free plan:** Figma's free tier only allows one "mode" per variable collection, so instead of one collection with a light/dark toggle, the tool creates two separately-named collections (`Tokens / Light` and `Tokens / Dark`) with identical variable names. No values are lost — it's just not a one-click toggle inside Figma the way a paid plan's "modes" feature would allow. If a paid plan gets adopted later, these two collections can be merged into one with two modes fairly mechanically. Code-side, this is simpler: light and dark are just two separate token sets, and Style Dictionary emits both.
- **Editing model = the layer-split described above.** Values you typed, and links between tokens, are freely editable in Figma and sync back cleanly. Auto-calculated results are edited through their inputs instead, or get "frozen" into an explicit override if someone edits the output directly.
- **Formulas run once, then get locked into plain values** (see above) — this is what makes the editing model above actually work in practice, since there's no live formula left to silently overwrite someone's edit.
- **Foundational settings split into value-foundations (just more tokens) and rule-foundations (a static shipped doc)** — see above for the full reasoning. Motion and z-index/elevation are excluded entirely (too platform/library-specific); grid is code-only and doesn't push to Figma.
- **The interface is a Claude Code skill** (working name `/SDSGT-start`) — the user runs it, it asks for the seed inputs, platform/framework, and preset choices, then runs the seed → promote → generate pipeline. Not a clone-and-hand-edit repo.
- **Every seed input is multi-channel, and Figma is optional on both ends.** Brand colors and font can arrive as `#hex` in chat, a screenshot, or an optional Figma file — no Figma file is ever required to generate a design system. Symmetrically, editing tokens through Figma afterward is also optional — someone can just edit the code tokens directly instead.
- **There are two different Figma-to-code operations, and they're not interchangeable:**
  1. **Promote-from-seeds** — the structural one. Reads the pretokens and (re)builds the entire token system from scratch. This is destructive (replaces the whole spec) — it's what happens the first time, or as a deliberate "throw away my earlier decisions and start over" reset. It is not part of routine day-to-day use.
  2. **Token sync** — the everyday one. Edits an existing value or link, syncs just that change back to code. Non-destructive, incremental, and this is the one piece that stays live inside a generated project after it's handed off.
- **After a project is generated, it keeps only the token-sync engine — not the full generator.** From that point on, the intended way to change the design system is to edit token values/links directly (in Figma or code) and sync — not to re-run the full promote step, which would be the explicit "start over" path, chosen knowingly rather than accidentally.
- **A generated project never receives retroactive updates from the tool.** If the SDSGT generator improves later, that improvement doesn't flow into projects that were already generated — each one is frozen at the moment it was scaffolded. This matches the tool's actual purpose (hand someone a solid starting point, then it's theirs) and mirrors the same lesson from the ACIM app (vendored components don't get silently re-synced from upstream either).
- **Corner-roundness ships as a small preset menu** (square / lowly-round / highly-round), the same mechanism as spacing rhythm and type scale — chosen at generation time, not explored per-project like color. Squircle is a deferred addition (see "Deferred," below) since it needs real platform-specific drawing work, not just a bigger number.

---

## What actually needs to get built

**1. Contracts** (has to be designed first — everything else depends on these)
- **Token spec** — the actual DTCG JSON shape for colors, type scale, spacing, corner-roundness, and how light/dark token sets are structured.
- **Naming & structure conventions** — the token-naming rules and the Figma naming/collection rules, so promoting and pushing always agree on what maps to what. Covers the value-foundation groups too (spacing, breakpoints, grid, corner-roundness), not just color/type. **Still undecided — see "Blocking item" below.**
- **Preset library** — the actual token files for each value-foundation menu (spacing / type-scale / corner-roundness), plus the one fixed-default set for breakpoints/grid.
- **Rule-foundations doc** — the static `foundations-rules.md` itself (accessibility, touch targets, focus, states, do's/don'ts).

**2. Tools**
- **Promote** — reads Figma variables, writes them into the token spec.
- **Generators** — turn the spec into code tokens (via Style Dictionary), a Figma push, agent rules, and a platform-filtered copy of the rule-foundations doc.
- **Foundations sheet generator** — a visual reference sheet inside Figma. Deliberately built later, since it's the fragile, iterate-by-screenshot part — variables come first, the visual sheet comes second.

**3. Harness** (what turns this from a one-off into a reusable tool)
- **Bootstrap/scaffold** — the piece that instantiates everything above for a brand-new app or website.

---

## Where things live

Two separate homes: the **SDSGT tooling itself** (built once, holds the inputs and generators), and **a generated project** (produced fresh each time someone runs it).

```
SDSGT TOOLING (built once, reused per project)
  CONTRACTS/
   ├─ token-spec.schema         the DTCG shape every token must fit
   ├─ naming-conventions        ⏳ still undecided — Figma ↔ spec matching
   ├─ presets/                  ◀ value-foundation menus (user picks one of each)
   │    ├─ spacing.{linear-4,linear-8,geometric}.json
   │    ├─ type-scale.{minor-third,major-third,perfect-fourth}.json
   │    └─ roundness.{square,lowly-round,highly-round}.json
   ├─ defaults/                 ◀ fixed value-foundations (no menu)
   │    ├─ breakpoints.json
   │    └─ grid.json
   └─ foundations-rules.md      ◀ the rule-foundations source doc (static)
  TOOLS/
   ├─ promote      (Figma → spec)
   └─ generators/  code-tokens · figma-push · agent-rules · rules-doc-copy
  HARNESS/  bootstrap — instantiates all of the above for a new project

GENERATED PROJECT (one per run)
  seeds ─┐ explored: brand color + font (chat / screenshot / optional Figma file)
         ├ preset:   spacing / type-scale / corner-roundness (chosen file copied in)
         ├ default:  breakpoints + grid (copied in)
         ▼
  tokens/  ◀ SOURCE OF TRUTH (DTCG JSON — everything with a value)
   │ color.light/.dark · spacing · roundness · type · breakpoints · grid · border · opacity
   │ (grid is code-only, not pushed to Figma; no motion tokens; no z-index tokens)
   │ generate
   ├─▶ code tokens     (CSS vars / NativeWind / TS — via Style Dictionary)
   ├─▶ Figma push      (2 collections: Light + Dark variables)
   ├─▶ agent rules     (CLAUDE.md / .cursor/rules) ──links to──┐
   ├─▶ foundations-rules.md  (platform-filtered copy) ◀────────┘
   └─▶ accessibility checks  (contrast / touch targets, run against the spec)
```

A couple of things worth noticing in this diagram:
- **Value-foundations never get their own file type — they're tokens the whole way through.** The only thing that differs between them is how they get their starting value (explored, preset, or default, per the table above). Once they're in `tokens/`, corner-roundness is handled exactly the same way as brand color downstream.
- **Rule-foundations skip the token spec entirely**, since they have no values to store. They travel through the pipeline only as a file copy (filtered by platform) from the tooling's `foundations-rules.md` into the project's own copy.
- **Agent rules are a pointer, not a copy.** They contain a link to the rules doc plus only the sharpest always/never instructions — the full explanation lives in exactly one place.

---

## Still open

- **Which component library/libraries to support first** — not chosen yet.
- **Working pace for this project** — step-by-step confirmation (as with the ACIM app) vs. faster batched changes. (Current default: see "Working style" in `CLAUDE.md` — step-by-step, confirm before big changes.)
- **When the design system extends into actual components** — this is where Layer 2 begins (see "Three layers" above). Deliberately not started until it's actually needed.
- **What exactly the skill produces underneath** — a plain generated folder, or something more structured (an installable package, etc.) — and how the retained token-sync engine gets packaged into a generated project.

## Deferred — noted on purpose, not forgotten

- **Fonts, icons, logos as actual files** (not just a token naming a font family) — a real asset-delivery pipeline is out of scope for now, to be designed when it's actually needed.
- **The contrast-check pairing input** — resolving exactly how the naming convention encodes "this text color sits on this background" (see "Rule-foundations" above), alongside the naming-convention work generally.
- **The actual color formulas** — both the brand-color-to-palette formula and the "nudge status colors toward the brand" formula (see "Formulas run once" above) are still just starting proposals.
- **Squircle as a corner-roundness option** — needs real per-platform drawing work (SVG/clip-path on web, custom masking on native) that doesn't exist yet. Revisit once the basic preset-menu roundness is working.
- **Layer 2 (component library) and Layer 3 (framework scaffold)** — the outer two layers. Layer 2 carries most of the real difficulty (see "Three layers" above); tackle after Layer 1 is solid.

## Blocking item: naming & structure conventions

Both "promote" and "push" depend on one shared contract that doesn't exist yet: the actual token names, plus the Figma collection/naming rules (including the "Pretokens" area convention and the two-collection light/dark setup) — the thing that lets the tool reliably match a Figma variable back to its token. Several already-settled decisions assume this exists (semantic links, the baked-formula matching, reading pretokens at all).

This is **deliberately deferred**, not an oversight — other decisions were intentionally settled first. But nothing else in "What actually needs to get built" can start until this is designed.

## Next step

Keep resolving what's listed under "Still open," then design the naming & structure conventions once ready to move toward actually building something.
