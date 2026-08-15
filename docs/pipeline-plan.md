# DSAT Pipeline Plan (working)

Status: **planning — no code generated yet.** Last updated 2026-08-11.

The design-system slice of the broader scaffolding tool. This documents the process and the decisions settled so far.

---

## Where this is going (three layers)

The foundation is **step one of three**. Each layer consumes the one below and adds a single user selection; the ultimate product is a kickoff-ready project template (matches the CLAUDE.md end goal — the DS is the first slice of a broader scaffolding tool).

```
LAYER 1  FOUNDATION            tokens + rules                    ← what this doc designs
            │  + component library (user selects)
            ▼
LAYER 2  DESIGN SYSTEM         foundation bound to components (code + Figma)
            │  + framework (user selects)
            ▼
LAYER 3  PROJECT TEMPLATE      design system dropped into a running scaffold
```

**Governing discipline (same as the foundation's):** each layer is a **one-way, decoupled add-on; code stays the source of truth.** The design system stays framework-agnostic and installable so Layer 3 is a *drop-in*, not a merge — mirroring how the foundation stays platform-agnostic.

**Difficulty is front-loaded into Layer 2.** Layers 1 and 3 are the tractable ones; components are where the risk concentrates:
- **"Applying the foundation to a component library" is a token→component *binding contract*, not a copy** — mapping semantic tokens onto the chosen library's own theme contract (expected var names/assumptions). Library-specific, so "user selects a library" multiplies it. Same tier of artifact as naming conventions.
- **ACIM scars apply directly:** trim vendored components to used variants, mark `// CUSTOMIZED`, never blindly re-run the vendor CLI, account for `tailwind-merge` not cancelling across variant groups. Encode these, don't rediscover them.
- **The Figma side of components is the fragile visual layer** — a jump in fragility from tokens-as-variables (proven/clean) to a full component library in Figma (variants/auto-layout/binding via MCP, screenshot-and-iterate).

**Token round-trip ≠ component round-trip (decided expectation).**
- **Tokens:** in-process, automated, lossless round-trip (Figma variable aliases *are* the recipe). Edit in Figma → promote → code.
- **Components:** **code = source of truth for component structure; Figma = a generated projection.** Editing a component's structure in Figma does **not** flow back to code automatically — there's no lossless reader for "you rearranged this auto-layout." Getting a Figma component change into code is an **out-of-band escape hatch** (invoke an agent to re-derive/pull it), a deliberate "you can if you need to," **not a stage of the process.** Don't promise a symmetric component round-trip.

---

## The process loop (the "engine")

A designer explores visually, then promotes to code, and code becomes the source of truth.

```
  presets / defaults ──┐   (spacing, breakpoints, grid, radii… — chosen, not explored)
                       ▼
  seed inputs ─────promote──▶ code token spec (SOURCE OF TRUTH)
  (2 brand colors + font,      light/dark held as separate token sets
   via chat #hex / screenshot         │ generate
   / optional Figma pre-tokens)       │
                    ┌────────────────┼────────────────┬────────────────┐
                    ▼                ▼                 ▼                 ▼
            code tokens        Figma push:        agent rules      rule-foundations
        (web or native,     2 collections          (CLAUDE.md /    (static doc, copied
         user's choice)      Light + Dark            .cursor/rules)  in + platform-filtered)
```

1. **Seed input** — *supply the raw creative decisions, through any channel.* The definitive seeds are a small set of **explicit user inputs**: ~2 brand colors (hue extracted, the rest derived) + a base font, plus the preset picks (spacing/rounding/etc.). These can arrive as **raw `#hex` in chat, a screenshot, or an optional Figma pre-tokens file** — Figma is *one* channel, not required. When Figma *is* used, it's the "see before deciding" scratchpad (pre-tokens; see below).
2. **Promote** — *seeds → code, one-way.* Reads the seeds (from whichever channel) and **generates a structured token system**: **primitives** (formulas run once, then *baked to raw values*) + **semantics** (real *links*/aliases to primitives). **The moment you promote, code becomes the source of truth.** (See "Formula resolution — bake once" below.)
3. **Generate** — *code → everything.* From the spec, generate code tokens, agent rules, and a clean push of Figma variables/styles (Figma is now a generated projection, not scratch).

### Pre-tokens (the explore seeds)

**Pre-tokens are one *optional* seed channel, not the required front door.** The same seeds (2 brand colors + font) can be given as `#hex` in chat or a screenshot instead. Use the Figma pre-token frame when a designer wants to *see before deciding*; skip it entirely when the values are already known. Everything below describes the Figma-channel case.

Three tiers of vocabulary:

| Tier | What it is | Where |
|---|---|---|
| **Pre-tokens** | Raw seeds — colored swatches, font samples, single raw values | Figma explore surface (scratch, disposable) |
| **Tokens (generated)** | Structured system: primitive + semantic/alias tokens + scales | DTCG spec (code — source of truth) |
| **Projection** | Clean variables/styles pushed back | Figma (generated mirror) |

- **What they are:** unstructured design decisions expressed as plain canvas elements (a rectangle filled with a brand color, a text node in a chosen font/size). Expected seeds: **brand colors and fonts**. They separate *creative exploration* from *system structure*.
- **Generation = seeds → a *system*, not a 1:1 copy.** From a few pre-tokens, derive: brand color → tints/shades + state variants (hover/active/disabled) + semantic roles (bg/fg/border) + light/dark; font + base size → a ratio-based type scale with roles (heading/body/caption).
- **Derived ≠ final.** Generate a sensible default system, but the designer prunes what isn't needed before it becomes canonical (respects the "avoid premature abstraction" principle — don't auto-spawn shades nobody uses).
- **Needs a convention** so *promote* knows what to read — e.g. a designated `Pre-tokens` frame/section where a swatch's *name* carries meaning (`brand/primary`, `font/base`). This is part of the **naming & structure conventions** contract (next to design). Keep the pre-token scratch area visually separate from the generated-variable projection.

**Discipline that prevents drift:** only one side is authoritative at a time. Once promoted, the pre-token scratch is spent; ongoing token edits happen in the **Figma projection** (the single edit surface — see "Editing model — layer-split") and sync back. Don't edit the same token in both code and Figma.

### Editing model — layer-split (decided)

The Figma projection isn't a read-only mirror — it's the designer's **live editing interface**. The dividing line for what round-trips back to the spec is **not** "primitive vs semantic." It's **alias / hand-picked value vs. math-derived *output***:

| Kind of token | Examples | Editable in Figma → round-trips to spec? |
|---|---|---|
| **Primitives** (leaf values) | brand colors, base font, base size, shadow blur/color | ✅ Yes — clean |
| **Hand-picked values** | manually curated shades (each shade a primitive) | ✅ Yes — clean |
| **Alias-based semantic tokens** | `color.action.bg → brand.primary`, `text.primary → neutral.900` | ✅ Yes — see below |
| **Math-derived *outputs*** | generated scale steps, algorithmic tints/shades | ⚠️ generated; edit via *inputs*, or eject (below) |

**Why aliases round-trip (correcting the earlier "Figma is flat" claim):** Figma variables natively support **aliasing** — a variable's value can be "points to another variable," not just a raw hex. Semantic colors are almost always aliases, and that link is readable via the Plugin API. So a designer re-pointing `button/bg` from `brand/primary` to `brand/secondary` in Figma is read on **promote** and written back as `button.bg: { alias: brand.secondary }`. Lossless. **No recipe-metadata machinery needed — the Figma alias *is* the recipe.**
- Edge case: if a designer *overrides* a semantic token to a **raw hex** (breaking the alias), promote can't tell intent — so it **flags it in the promote report** ("`button.bg` no longer linked to a primitive — keep as raw?") rather than silently accepting.

**Why math-derived is basically fine anyway** — split a formula into inputs vs outputs:
- **Inputs** (seed color, ratio, steps, curve) are themselves primitives/params → **editable in Figma, round-trip**. "Editing the formula" in practice = editing its inputs, then it re-derives. That control is *not* locked away.
- **Outputs** (the generated steps) are the only thing you can't hand-nudge-and-keep. Escape hatch: **eject-to-explicit** — on promote, if an output no longer matches what the formula would produce, store it as a flagged explicit override so the next generate respects it instead of clobbering.
- **Derivation is optional.** You can hand-pick every shade as a primitive (no formula → fully editable, fully round-trips). Fits the "see it to edit it" and "avoid premature abstraction" instincts. Choose per token group: hand-picked / derived-edit-via-inputs / derived-with-override.

**The one honest limit:** you can't *invent a new derivation formula* by drawing in Figma — new generation *logic* is a code change (values are design; formulas are engineering).

- **Flow:** edit a primitive / re-point an alias in Figma → promote (Figma → spec, with flags for raw-overrides & ejected outputs) → generate re-derives → push refreshes the projection.
- **Discipline:** each editable token is edited in **one place only** (Figma) — no "who wins" conflicts.
- **Push must use real aliases:** the generator emits semantic tokens as *bound variable aliases* in Figma, not flattened resolved colors — otherwise the alias round-trip has nothing to read.
- **Depends on:** stable naming/matching so promote can map a Figma variable back to its spec token — part of the **naming & structure conventions** contract (next to design).

#### In plain language (designer-friendly)

Think of tokens like a spreadsheet. Cells hold two kinds of things: **a value you typed** (`#3B82F6`), or **a formula** ("brand color, 20% darker"). Figma is like a spreadsheet that only shows the final numbers — it never remembers the formulas.

So tokens come in three flavors:

| Flavor | Plain example | Edit in Figma & push to code? |
|---|---|---|
| **A value you picked** | "Brand blue is `#3B82F6`" | ✅ Totally fine |
| **A link** | "Button color = *same as* brand blue" | ✅ Totally fine (Figma understands links) |
| **An auto-calculated value** | "This shade = brand blue, 20% darker" | ⚠️ The only tricky one |

The first two are ~99% of real design work and push to code with zero issues. The only gotcha: if a token is *auto-calculated* and you hand-edit it in Figma, the next recalculation could overwrite your tweak. Two ways around it: **change the ingredient it's built from** (always works), or **don't auto-calculate** — hand-pick values so everything is "a value you picked" (gotcha gone). The only thing you truly can't do in Figma is *invent a new calculation rule* — that's a one-time code setup.

#### Formula resolution — bake once, then plain values (decided)

This is how we eliminate the auto-calculated gotcha entirely. **Formulas run once, at promotion, then the result is stored as a plain value** — like using a spreadsheet formula to fill cells, then paste-as-values and delete the formula. After promotion the live system has *no* auto-calculated tokens left, only:

- **Primitives = plain (baked) values.** e.g. `brand.100` = the main brand pre-token; `brand.200` = brand + 20% luminance; `brand.300` = brand + 40%… — *computed at promotion, stored as raw hex.* Freely editable in Figma, round-trip cleanly.
- **Semantics = real links (aliases) to primitives.** Freely editable in Figma (re-point the link), round-trip cleanly. Editing a primitive automatically cascades to anything linked to it (links stay live).

**The process (resolves the issue):**
1. **Exploration** — designer creates pre-tokens in Figma (e.g. main brand color).
2. **Promotion** — Claude Code turns pre-tokens into primitive tokens using formulas, **stored as raw values**; then creates semantic tokens as **links** to primitives.
3. **Generation** — Claude Code replicates the code tokens into Figma as primitive + semantic variables/styles (semantics as **real bound aliases**, not flat copies).

Because primitives are baked, a designer editing a primitive and pushing to code breaks nothing — there's no live formula to overwrite it.

**The one honest trade-off (accepted):** baking trades auto-cascade for edit-freedom. To re-cascade a palette after changing the main brand color, you **re-run the formula** — a *deliberate* "regenerate palette from brand color" action that starts the ladder fresh and **replaces manual shade edits** made since. Day-to-day = full freedom to edit values/links directly; re-cascade = an intentional reset you invoke on purpose, not a background process.

**Two requirements for this to hold:**
1. **Semantics pushed as real aliases**, not copies — or the link round-trip has nothing to read.
2. **Stable naming** so promote can match a Figma variable back to its code token (→ naming & structure conventions contract).

**Color formula approach — HSL-based (proposal, to be finalized by the user later):**
- Colors use the **HSL** model. **Hue is the anchor/key value**; the ladder is built by **adding/subtracting Saturation and Luminance** from the pre-token color (hue mostly held constant).
- Illustrative example (numbers are placeholders, not final): pre-token brand `HSL(35, 20, 10)` → `brand.100`; `brand.200 = brand.100 + 20 saturation`; `brand.300 = brand.100 + 40 saturation + 10 luminance`; etc.
- This is a **base to build from** — the real formula (exact steps, curve, how many stops, whether hue shifts at all) will be decided by the user when we tackle formulas for real. Result still gets **baked to raw values** per the resolution above, so nothing here changes the round-trip behavior.

**Status & neutral colors — default, with a door to brand-derived (decided):** the brand seeds (~2 colors) yield brand/primary/secondary ladders, but **feedback/status colors (error/success/warning/info) and neutrals/greys can't come from the brand hue** (error must read as "error," not tinted into the brand). So the skill **asks the user**:
- **Boilerplate (default)** — ship a conventional status palette + a plain neutral ramp. Fast, safe, a11y-sane.
- **Brand-derived** — *approximate* these toward the brand hue (e.g. blue brand → blue-ish blacks/greys; status colors nudged toward the brand while staying recognizable).

Either way the result is **baked to raw values** like everything else. The approximation formula is deferred — sort out with the color formula work.

---

## Foundations: value-foundations vs. rule-foundations (decided)

"Design-system foundation beyond tokens" (grid, breakpoints, WCAG, motion, states…) is **two different kinds of thing**. Splitting them is the whole decision — one is *values*, one is *policy*.

### Value-foundations → they're just more tokens

Breakpoints, grid (columns/gutter/margin/container max-widths), spacing scale, radii, border widths, opacity. These have a *value* that must stay consistent across web/native, so they live **in the DTCG token spec** and flow through the normal pipeline (code tokens + Figma push). No separate document — a second home would mean a second source of truth.

**Scope exclusions & Figma-representation caveats (decided):**
- **Motion** (durations, easing) — **not output at all.** Motion is platform/framework/component-library specific; we don't tokenize or emit it.
- **z-index / elevation** — **not output as rules or tokens.** Stacking/elevation depends on platform/framework/component library; it belongs to the component layer, not the foundation.
- **Grid** — **stays a code-side token, but is NOT pushed to Figma as a variable.** In Figma a grid is a *layout-grid style* (a frame property), not a variable — same class of caveat as shadows/type being *styles*, except here we simply don't project grid into Figma. Breakpoints push fine (plain numbers).

**They do NOT go through explore→promote.** Nobody hand-draws a breakpoint in Figma. Instead they get their initial seed one of three ways — all landing in the same spec, all editable as ordinary tokens afterward:

| Seed source | Examples | Who decides, when |
|---|---|---|
| **Seeded per-project** | brand colors, fonts | User input via any channel — `#hex` in chat, screenshot, or optional Figma pre-tokens (the promote loop) |
| **Preset-selected at generation** | spacing scale, radii scale, type-scale ratio | User picks from a small menu, at scaffold time |
| **Fixed default** | breakpoints, grid | Shipped standard, no choice needed |

This *narrows* the explore surface to what genuinely benefits from "see it to decide it" — brand color and type — which is more honest about what exploration is for.

**Preset library** (a Contracts-layer artifact): a finite set of named, interchangeable systems shipped with the tooling — e.g. spacing `linear-4` / `linear-8` / `geometric`; type scale minor-third / major-third / perfect-fourth; radii `sharp` / `soft` / `round`. Rules:
- **Ship each preset as an actual DTCG token-set file, not a config flag.** Generation *copies the chosen preset file into the spec* — transparent, diff-able, user edits the real tokens afterward.
- **Keep the menu opinionated and small** (anti-over-engineering): 2–3 good options, not an infinite configurator. Value = a sane default in seconds.
- **Fixed defaults (breakpoints/grid) need no menu** — ship one good standard set as tokens; "editable after" covers the rare project that needs different ones.

Once seeded, value-foundations are indistinguishable from any other token downstream — generate to code, push to Figma, edited in the final template like anything else. (The pending naming & structure conventions contract must therefore cover these token groups too, not only explored color/type.)

### Rule-foundations → a static shipped doc, referenced by agent rules

WCAG contrast minimums, min touch/hit target (44px iOS / 48dp Android), focus-visible requirement, `prefers-reduced-motion`, required interactive states, dynamic-type/text-resize, token-usage do/don'ts, layout/grid application rules, i18n (later). These have **no value to explore** — they're constraints on *how* tokens are used, and they're practically **universal** (not adjusted per project, though nothing forbids editing).

Because they're universal, they aren't "generated" like tokens — they're a **static asset the template ships with, copied into every output unchanged.** The only generated part is **platform filtering** (emit the iOS touch-target line for native, the Android one for Android, drop both for pure web).

**One source, three surfaces (no duplication, no drift):**

| Surface | What lives here |
|---|---|
| **Canonical doc** (`foundations-rules.md`, ships in template) | Full prose, human audience, complete rationale — **source of truth** |
| **Agent rules** (`CLAUDE.md` / `.cursor/rules`) | *Not* the essay — a short pointer to the doc + only the hard *always/never* imperatives the agent needs in working context (kept lean so high-signal rules aren't diluted) |
| **Checks / validation** | The machine-checkable subset run as lint against the token spec — a rule that *fails a check* gets fixed; a rule in prose gets skimmed. **⚠️ Contrast checks depend on knowing intended foreground/background pairs — see below.** |

**Contrast checks — feasible, but blocked on a pairing input (decided dependency):** an automated contrast check needs to know *which foreground is meant to sit on which background* (`text.primary` on `surface.raised`). The token spec holds tokens, not pairings. Two ways to supply that input:
1. **Encode pairs in the semantic naming convention** — e.g. an `on-` convention (`text.on-primary` pairs with `primary`). If naming does this, the check is nearly free. **← preferred; folds into the naming & structure conventions contract.**
2. **A small explicit pairing manifest** — more machinery; only if naming can't carry it.
If neither is adopted, contrast falls back to **prose guidance the agent must honor**, not an automated gate. **Feasibility resolved:** semantic naming *will* carry role-specific color names (text / background / border / etc.), so intended pairs are declarable — contrast-as-a-check is viable; exact pair encoding folds into naming conventions.

**When checks run (decided):** a11y checks run **at each promote** (seeds → tokens). If a user hand-edits promoted tokens afterward, that's **at their own risk** of breaking a11y rules — promote is the gate, not a continuous guard.

**Discipline:** don't over-author (anti-over-engineering) — start with a11y + grid/breakpoints application + states; add density/i18n detail when a real app hits them. (Motion is out of scope — see value-foundations exclusions.)

---

## Decisions settled

- **Automatization starts in Claude Code**, not Figma. Figma is one *output*, not the master.
- **Source of truth = code**, expressed as **W3C DTCG-format JSON** (platform-neutral, standard, agent-readable, and the format Figma/Tokens Studio already speak — so the round-trip is clean).
- **Transform engine = Style Dictionary** (v4, reads DTCG natively) fans the JSON out to platform outputs. **Decided — this is the engine we'll use.** (Alternatives like Terrazzo / Tokens Studio transformer exist but we're going with Style Dictionary.)
  - DTCG/TS/CSS/NativeWind: TypeScript, CSS, NativeWind, etc. are **outputs**, never the source.
- **Figma styles (not just variables) are tokenizable.** Figma variables only support color/number/string/boolean — so shadows, fonts, etc. live as *styles* (effect styles, text styles), not variables. That does **not** stop us: we can still pull those styles and turn them into tokens.
  - Verified 2026-08-10: read + create of **effect styles (shadows)** and **text styles (fonts)** both work via `figma_execute` (no dedicated MCP tool, but fully functional). See [figma-mcp-capabilities.md](./figma-mcp-capabilities.md).
  - Mapping: a DTCG shadow token (`$type: shadow` — offset/blur/spread/color) maps onto Figma **primitive variables** (`shadow.blur`, `shadow.y`, `shadow.color`) **composed into an effect style** (effects expose `boundVariables`, so sub-properties can bind to variables). Same idea for typography styles. So the promote/push round-trip covers styles, not only variables.
- **Target surface = platform-agnostic.** The token spec knows nothing about platform; the **user picks the platform** and the generator emits the right tokens (web: CSS vars / Tailwind theme; native: TS / NativeWind constants). Both are planned; the spec is designed to serve either.
- **Light/dark handling** (given the free Figma plan, which caps 1 mode per collection):
  - **Code:** clean — separate token sets (e.g. `color.light.json` / `color.dark.json`); Style Dictionary emits a light and a dark output per platform.
  - **Figma (free plan):** flatten into **two collections, `Tokens / Light` and `Tokens / Dark`, with identical variable names.** No value drift — just a plan-appropriate projection. Trade-off: no one-click theme toggle in Figma free (that's the paid "modes" feature). Upgrade path: two same-named collections collapse into one collection with two modes almost mechanically if a paid plan is adopted later.
- **Figma read/write is proven** via the Southleft MCP — see [figma-mcp-capabilities.md](./figma-mcp-capabilities.md). Create/edit/delete of variables and text styles all work.
- **Editing model = layer-split.** What round-trips from Figma → spec is decided by *alias / hand-picked value vs. math-derived output* (not primitive vs semantic): primitives, hand-picked values, and **alias-based semantic tokens** are editable in Figma and round-trip; math-derived *outputs* are edited via their inputs or ejected-to-explicit. Requires the generator to push semantics as real Figma aliases. See "Editing model — layer-split" above.
- **Formula resolution = bake once, then plain values.** Formulas run once at promotion to generate primitives, which are **stored as raw values** (no live formula left to overwrite edits); semantics are **real links** to primitives. So editing a primitive in Figma and pushing to code breaks nothing. Trade-off (accepted): re-cascading a palette after a brand-color change is a deliberate "regenerate" action that replaces manual shade edits. See "Formula resolution — bake once" above.
- **Foundations split = value-foundations vs. rule-foundations.** *Value*-foundations (breakpoints, grid, spacing, radii, border, opacity) are **just tokens**, seeded by preset/default (not explored), editable afterward like any token — shipped as a small **preset library** of DTCG files + one fixed-default set. **Excluded from output: motion (any property) and z-index/elevation** — platform/framework/component-library specific. **Grid is a code-only token, not pushed to Figma** (it's a layout-grid style there). *Rule*-foundations (WCAG, touch targets, focus, states, do/don'ts) are a **static shipped doc** (`foundations-rules.md`), universal and copied into every output unchanged except platform filtering, **referenced by** (not duplicated into) the agent rules, with the checkable subset run as validation. See "Foundations: value-foundations vs. rule-foundations" above.
- **Interface = a Claude Code skill (`/DSAT-start`).** The tooling is driven interactively from the terminal: the user runs the skill, it collects the **seed inputs + platform/framework + preset choices**, then runs promote→generate→scaffold. This is the harness/deliverable shape (resolves part of "deliverable shape" — a skill-driven generator, not a clone-and-edit repo).
- **Seed input is multi-channel; Figma is optional on both ends.** The definitive input is a small set of explicit values (~2 brand colors → hue extracted + rest derived; base font; preset picks). These can arrive as **`#hex` in chat, a screenshot, or an optional Figma pre-tokens file** — no Figma file required to generate a DS. Likewise, **editing tokens in Figma is optional**: a user who doesn't want the Figma round-trip can edit tokens directly in code. Figma is a convenience/visualization layer at input and a convenience editing surface after — never mandatory.
- **Two distinct Figma→code operations (don't conflate them):**
  1. **Promote-from-seeds** (structural) — reads pre-tokens and (re)generates the whole structured system. **Destructive: re-running it replaces the entire spec and regenerates all outputs**, at full risk. Used at first generation, or as a deliberate "start over / backtrack initial decisions" reset — *not* part of the day-to-day loop.
  2. **Token sync** (value-level) — the layer-split round-trip: edit an existing primitive value / re-point an alias in the Figma projection, sync those back to the code tokens. Non-destructive, incremental. **This is the engine that stays live in the generated project.**
- **Post-scaffold, the generated project keeps only the token-sync engine**, not the full generator. Once the DS is generated, the intended workflow is to **edit the DS directly** (token values/aliases in Figma → sync) — *not* re-promote or regenerate. Re-promoting after generation is the explicit "throw it away and rebuild" path, chosen knowingly.
- **No update propagation to generated projects (accepted).** A generated design system is frozen at scaffold time; later improvements to DSAT tooling don't flow back into already-scaffolded projects. This matches the project's purpose (generate a kickoff scaffold, then it's the user's), and mirrors the ACIM "vendored, don't re-run the CLI" reality — accepted, not a gap.

---

## The tooling to build (three layers around the loop)

**1. Contracts** (design first — everything depends on them)
- **Token spec** — DTCG JSON schema for colors / type scale / spacing / radii; how light/dark token sets are structured.
- **Naming & structure conventions** — token names + the Figma collection/naming rules (incl. the two-collection light/dark projection) so *promote* and *push* agree on the same mapping. Must also cover the value-foundation groups (spacing/breakpoints/grid/radii/z-index), not only explored color/type. ← **⏳ pending, intentionally deferred — see "Pending — must sort out before building".**
- **Preset library** — finite named DTCG token-set files for value-foundations (spacing / type-scale ratio / radii systems) the user picks among at scaffold; generation copies the chosen file into the spec. Plus one shipped set of fixed defaults (breakpoints/grid). See "Foundations" above.
- **Rule-foundations doc** — the static `foundations-rules.md` (WCAG, touch targets, focus, states, motion, do/don'ts) shipped with the template, referenced by agent rules, checkable subset validated. See "Foundations" above.

**2. Tools**
- **Promote** (Figma → code importer) — reads variables, writes the spec.
- **Generators** (code → outputs): code tokens (Style Dictionary), Figma push, agent rules, and the platform-filtered copy of the rule-foundations doc.
- **Foundations sheet generator** — the visual Figma sheet. Deliberately later (fragile visual layer; needs screenshot-and-iterate). Sequence: variables first, sheet second.

**3. Harness** (what makes it a reusable *template*, not a one-off)
- **Bootstrap/scaffold** — how all of the above is instantiated for a brand-new app/website.

---

## Where assets live (tooling vs. generated project)

Two homes. The **DSAT tooling** holds inputs + generators (built once). A **scaffold run** produces a design system inside a user's project.

```
DSAT TOOLING (built once, reused per app)
  CONTRACTS/
   ├─ token-spec.schema         DTCG shape all tokens must fit
   ├─ naming-conventions        ⏳ pending — Figma↔spec matching
   ├─ presets/                  ◀ value-foundation menu (user picks one each)
   │    ├─ spacing.{linear-4,linear-8,geometric}.json
   │    ├─ type-scale.{minor-third,major-third,perfect-fourth}.json
   │    └─ radii.{sharp,soft,round}.json
   ├─ defaults/                 ◀ fixed value-foundations (no menu)
   │    ├─ breakpoints.json
   │    └─ grid.json
   └─ foundations-rules.md      ◀ rule-foundations SOURCE (static)
  TOOLS/
   ├─ promote      (Figma → spec)
   └─ generators/  code-tokens · figma-push · agent-rules · rules-doc-copy
  HARNESS/  bootstrap — instantiates the above for a new app

GENERATED PROJECT (per scaffold run)
  seeds ─┐ explore: brand color + type (Figma)
         ├ preset:  spacing / type-scale / radii (chosen file copied in)
         ├ default: breakpoints + grid (copied in)
         ▼
  tokens/  ◀ SOURCE OF TRUTH (DTCG JSON — everything with a value)
   │ color.light/.dark · spacing · radii · type · breakpoints · grid · border · opacity
   │ (grid = code-only, not pushed to Figma; no motion / no z-index)
   │ generate
   ├─▶ code tokens     (CSS vars / NativeWind / TS — Style Dictionary)
   ├─▶ Figma push      (2 collections: Light + Dark variables)
   ├─▶ agent rules     (CLAUDE.md / .cursor/rules) ──links to──┐
   ├─▶ foundations-rules.md  (platform-filtered copy) ◀────────┘
   └─▶ a11y checks     (contrast / touch targets, run vs the spec)
```

**How to read it:**
- **Value-foundations are never their own file type — they're tokens the whole way.** Their only distinction is the *left edge* (how they're seeded: explore / preset / default). Once in `tokens/`, they're identical to brand color downstream. One source of truth for all values: `tokens/`.
- **Rule-foundations skip the spec entirely** (no values to tokenize). They ride the pipeline only as a *file copy* (with platform filtering) from the tooling's `foundations-rules.md` → the project's `foundations-rules.md`.
- **Agent rules are a hub, not a copy** — a pointer to the rules doc + only the hard imperatives. Content is stored once: prose in the doc, sharp instructions in agent rules, checkable ones in validation. No duplication.
- **Two source-of-truth boundaries:** values → `tokens/` (Figma is a projection); rules → `foundations-rules.md` in the tooling (the project copy, the agent pointer, and the checks are all downstream surfaces of it).
- **Preset library + rule-foundations doc + naming conventions must all exist before generation can run** — they're Contracts-layer inputs the generators consume. Nothing in Tools runs until they're authored.

---

## Open decisions (not yet settled)

- **Deliverable shape / harness:** *partly resolved* — the interface is a Claude Code skill (`/DSAT-start`); the generated project embeds the retained token-sync engine incl. the Figma+MCP connection (using Figma to edit tokens is optional — a user can edit tokens in code instead). Still open: what exactly the skill emits underneath (a scaffolded repo, an installed package, etc.) and the packaging of the embedded engine.
- **Working pace:** step-by-step (as on ACIM) vs. faster batches for this tooling project.
- **Component layer:** whether/when the DS goes beyond tokens to components (avoid premature abstraction — add when needed). This is where **Layer 2** begins (see "Where this is going").

---

## Deferred — noted, to sort out later

Consciously parked so they're not forgotten (not blockers for the foundation):

- ⏳ **Asset pipeline** — fonts (the actual **font files**, not just a font-family token), icons, logos. A font token names a family; the file still has to be bundled/delivered. ACIM used the MCP for asset pulls. Out of scope for now; design when we reach it.
- ⏳ **Contrast-check pairing input** — see "Contrast checks" under rule-foundations; resolve alongside naming conventions.
- ⏳ **Color formula(s)** — the brand ladder (HSL, hue-anchored) *and* the "brand-derived" approximation for status/neutral colors (see "Status & neutral colors"). Both deferred to the color-formula pass; results bake to raw values regardless.
- ⏳ **Layer 2 (component library) + Layer 3 (framework scaffold)** — the outer layers; difficulty concentrated in Layer 2 (see "Where this is going"). Tackle after the foundation.

---

## Pending — must sort out before building

- ⏳ **Naming & structure conventions** — the contract *promote* and *push* both depend on: token names + the Figma collection/naming rules (incl. the `Pre-tokens` frame convention, the two-collection light/dark projection, and stable Figma↔spec matching for round-trip). **Not yet designed.** Several settled decisions depend on it (semantic aliases, formula-bake matching, pre-token reading). **Deliberately deferred** — we're intentionally settling other decisions first before jumping into this. Pick it up when ready; nothing downstream can be built without it.

> Note to future session (in case context was cleared): this is a known, intentional TODO — not an oversight. Keep deciding other open items (see "Open decisions"); circle back to naming & structure conventions before any tooling is built. No code until explicitly approved.

## Next step

Keep resolving **open decisions** (deliverable shape, working pace, component layer, and anything new that comes up). Design the naming & structure conventions once the user is ready to move toward building.
