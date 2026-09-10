# Contracts & seed inputs — current status

This tracks Step 1 (seed input) and its Contracts together, per the "Next step" note in `pipeline-plan.md` (seed input and Contracts are being built in parallel, not contracts-first). Nothing below has been built or collected yet — this project is still in the planning phase. Update each row/section as it moves from TBD to decided/built.

This file is meant to be self-sufficient for running the pipeline — an agent shouldn't need to open `contracts-proposals.md` to generate a project. `contracts-proposals.md` holds the reasoning, alternatives considered, and citations behind everything decided below, for human reference only.

**Determinism note:** this step is one of the places the project's determinism goal (see `CLAUDE.md`, "Architecture decisions so far") applies most directly — the same seed inputs should produce the same generated design system every run. Every row below needs a crisp, unambiguous rule by the time it's built, not a judgment call left to whichever agent happens to run it. The only accepted exceptions are the handful of steps `pipeline-plan.md`'s "Tool architecture" already calls out as genuinely needing AI (e.g. reading a brand color or font off a screenshot) — and even those need as tight a rule as possible around them, not an open-ended "use your judgment."

---

## Seed inputs

The raw, user-supplied creative decisions the tool collects before it can generate anything (see "How generation actually works" in `pipeline-plan.md`). No project has gone through seed input yet, so nothing here has real values — only the input's planned shape.


| Input                                 | Channel(s)                                                                                                                                                                                                                                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold vs. Design system files only | Menu pick —`Scaffold`  / `Design system files only`                                                                                                                                                                                                                                                                | Target framework is always asked next regardless of this answer — code-token output shape depends on it either way (see `pipeline-plan.md`, "Everything settled so far"). This choice only decides whether the official scaffolding CLI also gets run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Target framework                      | Menu pick —`Next.js` (React, web) / `Vue.js` (web) / `React Native (Expo)` / `Kotlin` (Jetpack Compose, native Android) / `SwiftUI` (native iOS)                                                                                                                                                                   | Fixed list, no "etc." — every option must resolve to a real Component library suggestion, design-language mapping, and scaffolding CLI (`create-next-app` / `create-expo-app` / etc.), so an open-ended list risks picking a framework with no realized story. Selecting a framework marks its matching Component library option as "(Suggested)": `Next.js` → `shadcn/ui`, `Vue.js` → `shadcn-vue`, `React Native (Expo)` → `react-native-reusables (RNR)`, `Kotlin` → `Jetpack Compose Material3`, `SwiftUI` → `SwiftUI native components` — then refined further by the Target design languages pick, per the Component library row's notes.                                                                                                                                                                                                                                  |
| Target design languages               | Menu pick —`Tailwind` /`Bootstrap`/ `Material Design 3`/`Material Design 2`                                                                                                                                                                                                                                        | This selection will only mark the following design language based seeds as "(Suggested)": Type-scale, spacing, border roundness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Component library                     | Menu pick — filtered by Target framework:`shadcn/ui` / `MUI` / `React-Bootstrap` (Next.js) · `shadcn-vue` / `Vuetify` / `bootstrap-vue-next` (Vue.js) · `react-native-reusables (RNR)` / `React Native Paper` (React Native) · `Jetpack Compose Material3` (Kotlin) · `SwiftUI native components` (native iOS) | Suggestion depends on Target framework AND Target design languages together, not framework alone: Next.js — Tailwind→`shadcn/ui`, Bootstrap→`React-Bootstrap`, Material Design 3/2→`MUI`. Vue.js — Tailwind→`shadcn-vue`, Bootstrap→`bootstrap-vue-next`, Material Design 3/2→`Vuetify`. React Native — Tailwind→`RNR`, Material Design 3/2→`React Native Paper`, Bootstrap→no match, fall back to Tailwind's suggestion. Kotlin and native iOS only ever have one library option, so the suggested *library* doesn't change with the design-language pick — only the *token values* poured into it do (e.g. a Tailwind-flavored spacing/type scale themed onto Compose Material3 is a valid combo, per the mixing discussion). Bootstrap has no React Native/Kotlin/iOS option at all — mark unavailable for those targets when Bootstrap is the chosen design language. |
| Figma-managed vs. code-only tokens | Yes/no, asked at seed input (stand-in until Generate is its own step — see "Still open") | **Built.** If `Figma-managed`, the very next question (below) collects the target file; the push itself runs right after `promote`, using that run's own token spec — see "Figma push," below. |
| Figma file link (conditional — only asked if the row above is `Figma-managed`) | A Figma URL, in chat | Must parse as a real Figma URL (`figma.com/design/<fileKey>/...` or `figma.com/file/<fileKey>/...`) — ask again rather than guess if it doesn't. Identifies the push target and is used to verify the live MCP connection is pointed at the right file — see "Figma push," below. Not a remote fetch: the file still needs to be open in Figma Desktop with the Desktop Bridge plugin running when the push runs (`docs/figma-mcp-capabilities.md`). |
| Which Figma MCP (conditional — only asked if `Figma-managed`) | Menu — `Official Figma MCP` / `Southleft MCP` | A real choice, collected for real — but **pinned to Southleft during internal testing regardless of the answer**, disclosed plainly right after asking. See "Which Figma MCP," under "Figma push," below. |
| Which Figma plan (conditional — only asked if `Figma-managed`) | Menu — `Free plan` / `Paid plan` | **Unlike the MCP choice above, this one drives real behavior.** Decides whether the push builds two variable collections (free) or one collection with two real modes (paid) — see "Collection strategy," under "Figma push," below. Only matters if `Both Light and Dark mode` is also picked; a no-op otherwise, since a single mode never reaches the collection-count question. |
| Light/dark mode                       | Menu pick —`Light Mode only` / `Dark mode only` / `Both Light and Dark mode`                                                                                                                                                                                                                                        | Choice decided;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Primary color                         | `#hex` in chat / screenshot                                                                                                                                                                                                                                                                                        | The agent must ask for clarification instead of assuming an answer, in cases including: (A) the input itself isn't legible — e.g. a screenshot too blurry to read hex values off of; (B) more colors were provided than needed (primary + secondary) and it isn't clear which is which; (C) any other case where the agent would otherwise have to assume rather than read directly off what was provided.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Secondary color (optional)            | `#hex` in chat / screenshot                                                                                                                                                                                                                                                                                        | The agent must ask for clarification instead of assuming an answer, in cases including: (A) the input itself isn't legible — e.g. a screenshot too blurry to read hex values off of; (B) more colors were provided than needed (primary + secondary) and it isn't clear which is which; (C) any other case where the agent would otherwise have to assume rather than read directly off what was provided.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Neutral colors                        | Menu pick — `Brand-tinted` / `Pure achromatic gray`                                                                                                                                                                                                                                                                | Determines where the `neutral` primitive ramp's base color comes from — not typed directly. `Brand-tinted`: a faint hint of the brand's hue (low, fixed saturation) at 50% lightness. `Pure achromatic gray`: 0% saturation at 50% lightness (hue irrelevant). Either way, the rest of the `neutral` ramp is generated by the same formula as `brand`/`brand-secondary` — see Contracts, "Color primitives."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Status-color style (not shown)        | `Boilerplate`                                                                                                                                                                                                                                                                                       | Not an option to users — the only status-color formula. Fixed, brand-independent, decided, see Contracts, "Color primitives." A brand-derived variant (nudging status hues toward the brand color) was considered and dropped, not deferred — see `contracts-proposals.md` for the reasoning trail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Primary font family                   | in chat / screenshot                                                                                                                                                                                                                                                                                                | Only Google Fonts are accepted. If the user provides a font that isn't a Google Font, the agent must say so and ask them to pick a Google Font instead — never silently substitute a similar-looking one. Used for `heading-*`/`display` roles when a secondary font is also supplied; used for every text role if no secondary font is supplied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Secondary font family (optional)     | in chat / screenshot                                                                                                                                                                                                                                                                                                | Only Google Fonts are accepted. If the user provides a font that isn't a Google Font, the agent must say so and ask them to pick a Google Font instead — never silently substitute a similar-looking one. **Form copy must state before submit:** this font is used for `body*`/`caption` roles (primary covers `heading-*`/`display`); left blank, primary is used for every role instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Type-scale                            | Menu pick —`Tailwind`  / `Bootstrap`/ `Material Design 3` / `Material Design 2`                                                                                                                                                                                                                                    | The interface should include a description of each option and a scale example. Recommend the option matching whichever Target design language was already selected — Target design languages is always chosen earlier in the flow, so there's always a match by the time this question is asked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Spacing                               | Menu pick —`Tailwind` / `Bootstrap` `Material Design 3` / `Material Design 2`                                                                                                                                                                                                                                      | The interface should include a description of each option and a scale example. Recommend the option matching whichever Target design language was already selected — Target design languages is always chosen earlier in the flow, so there's always a match by the time this question is asked. If Material Design 3 or Material Design 2 is picked, the interface must say plainly that spacing will use Tailwind's scale under the hood — neither MD3 nor MD2 has a stable, official named spacing scale of its own. Also, since Tailwind's (and thus MD3/MD2's) keys are an index, not a pixel value — e.g. `spacing.4` is 16px, not 4px — the interface must show the actual scale example (key → px value) alongside the option, so this isn't discovered later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Border/Corner-roundness               | Menu pick —`Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2`                                                                                                                                                                                                                                    | The interface should include a description of each option and a scale example. Recommend the option matching whichever Target design language was already selected — Target design languages is always chosen earlier in the flow, so there's always a match by the time this question is asked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Border width (not shown)              | `Tailwind`                                                                                                                                                                                                                                                                                                          | This will work under the hood, not an option to users but indicated to users somehow in the process. We will use Tailwind's border width scaling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Opacity                               | Menu pick —`Tailwind` / `Bootstrap`                                                                                                                                                                                                                                                                                | Indicate that Material Design doesn't have a preset opacity scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Shadows                               | Menu pick —`Tailwind` / `Bootstrap` `Material Design 3` / `Material Design 2`                                                                                                                                                                                                                                      | Shadow values are generated as tokens; shadow semantics (which level a modal vs. a card vs. an app bar uses) are not — that mapping depends on the selected component library, same treatment as z-index/elevation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Breakpoints (not shown)              | `Tailwind`                                                                                                                                                                                                                                                                                                          | This will work under the hood, not an option to users but indicated to users somehow in the process. We will use Tailwind's breakpoint scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Column system (not shown)           | `Material Design 3`                                                                                                                                                                                                                                                                                                 | This will work under the hood, not an option to users but indicated to users somehow in the process. We will use Material Design 3's column/grid system, unconditionally (every project gets MD3's grid recipe, regardless of target design language, same as Breakpoints above). That disclosure must also state grid's compact/medium/expanded tiers switch at Tailwind's breakpoints (md/lg), not MD3's own native dp thresholds — so nobody assumes MD3's real 600/840dp values are in play.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## Contracts

The predetermined (tool-fixed, not user-chosen) seeds everything else depends on — see "What actually needs to get built" in `pipeline-plan.md`. Status index, then the actual reference content each row summarizes.

| Contract                                                          | Status                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Token spec (DTCG JSON shape)                                      | **Built** — `cli/src/promote/index.ts`, see "Token spec — file layout" below. |
| Naming & structure conventions (token-side)                       | **Built** — every token `promote` writes uses this grammar. The Figma-side half is **now also built** (dot→slash name mapping, collection naming) — see "Figma push" below and "Naming & structure conventions" here. |
| Preset library (actual token files behind the preset menus above) | **Built** — `cli/src/presets/`, all 4 design languages × 5 groups, tested including MD3/MD2 edge cases. See the per-group sections below (Color primitives through Fixed defaults). |
| Fixed defaults (breakpoints, grid)                                | **Built** — `cli/src/defaults/`, see "Fixed defaults" below. |
| `foundations-rules.md`                                            | **Built** — `cli/src/generate/project-docs.ts` (`generate` writes it unconditionally, every run). See "`foundations-rules.md` content" below. |
| Agent rules template (`AGENTS.md`)                                | **Built** — `cli/src/generate/project-docs.ts`. `CLAUDE.md`/`.cursor/rules` mirrors aren't built yet. See "`AGENTS.md` template content" below. |
| `design.md` template                                               | Flagged, not decided — deferred, not required for the pipeline to work. A placeholder file (pointing at `AGENTS.md`/`foundations-rules.md` in the meantime) is written by `cli/src/generate/project-docs.ts` so the pointer isn't a dead link, but its real content contract is still undesigned. See "`design.md` (flagged, deferred)" below. |
| Figma push (variables + styles)                                    | **Built and verified live (2026-09-09).** The plan-building half (`cli/src/promote/figma-plan.ts`) is deterministic, pure Node, and QA-matrix-tested — every `promote` run writes `figma-push-plan.json`. The replay half (`.claude/skills/SDSGT-figma-push/SKILL.md`) drives the Southleft MCP and was run end to end against a real Figma file — 286 variables (real aliases, not baked copies), 15 text styles, 5 effect styles, correctly landed the free-plan two-collection fallback. The paid-plan branch (one collection, two real modes) remains untestable without a paid Figma workspace — see "Figma push" below and `pipeline-plan.md`'s "Pre-launch validation." |

Rationale, alternatives considered, and citations for every value below live in `contracts-proposals.md` — useful for a human who wants the "why," not needed to run the pipeline.

### Token spec — file layout

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
  report.html                   not a DTCG token file — a self-contained visual summary of this run, written by Promote alongside the JSON above. See "report.html," below.
```

**`report.html`** — generated on every `promote` run, not gated behind any seed choice. Deterministic and network-free like the rest of Promote: font specimens reference the seed's real font names in a system-font stack by default, rendering in the actual font only if the caller also supplied real font files via `--fonts-dir` (see `cli/src/cli.ts`, `loadFontFiles`, and `pipeline-plan.md`, "Not everything belongs in the CLI" — fetching those files is agent-side work, the Claude Code skill's job, not Promote's). Covers color primitives (including `static` and `status`, each sized identically to the 11-step ramps — a fixed-width flex row, not a grid that stretches short rows to fill the container), semantic color per mode (with a light/dark toggle when both modes exist), typography specimens, spacing/radius/shadow/opacity, and the fixed defaults (border-width/breakpoint/grid). Accessibility warnings, if any, render here too — advisory only, see "Accessibility checks are advisory, not a gate" in `pipeline-plan.md`.

Primitive/semantic split applies only to color and typography — every other group (spacing, radius, border-width, opacity, shadow, breakpoint, grid) is single-tier: the value in the file *is* the token.

Aliases use DTCG's `{dot.path}` syntax.

**DTCG type mapping:**

| Our category | DTCG `$type` |
|---|---|
| color | `color` |
| typography | `typography` (composite) |
| spacing, radius, border-width, breakpoint | `dimension` |
| opacity | `number` (unitless 0–1) |
| shadow | `shadow` (composite) for Tailwind/Bootstrap projects; `dimension` (elevation dp) for MD3/MD2 projects — see "Shadow" below |
| grid | none — built manually from `dimension`/`number` |

**Light/dark mode files:** filenames always carry the mode suffix; which files actually exist depends on the Light/dark mode seed choice.

- Light only → `color.semantic.light.json` only
- Dark only → `color.semantic.dark.json` only
- Both → both files

`color.primitive.json` is never mode-specific.

### Naming & structure conventions

**Token grammar:** `<group>.<tier?>.<role>[.<state>]`, all lowercase, kebab-case for multi-word segments — e.g. `color.semantic.text.on-primary`, `spacing.4`, `radius.md`.

**Contrast-pairing convention:** a semantic token named `<x>.on-<surface>` is checked against `color.semantic.<owning-group>.<surface>`, via a fixed lookup table (`on-primary`→`action.primary`, `on-surface`→`background.surface`, etc.), not a generic parser.

**Figma-name mapping:** replace `.` with `/` writing to Figma; replace `/` with `.` reading back. Applies uniformly to every token category, including an alias's own target name — see "Figma push," below.

**Collection naming** (free-plan, two-collection case): `Tokens - Light` / `Tokens - Dark` (space-dash, not slash).

### Figma push — `figma-push-plan.json`, and replaying it into Figma

**Built.** Two halves, split exactly along the line `pipeline-plan.md`'s "Tool architecture" already draws between the CLI core and the agent/MCP layer:

1. **The plan** (`cli/src/promote/figma-plan.ts`) — deterministic, pure Node, no network or MCP dependency. Every `promote` run reads back the DTCG files it just wrote and derives `figma-push-plan.json` alongside `report.html`, unconditionally (same "harmless if unused" treatment as the report) — see "Token spec — file layout" above for where it lands. QA-matrix-exercised across all 4 design languages, both light/dark combinations, secondary color/font present and absent.
2. **The replay** (`.claude/skills/SDSGT-figma-push/SKILL.md`) — reads that plan and drives the Southleft MCP (`mcp__figma-southleft__*`) to actually create variables and styles. **Run end to end against a real Figma file (2026-09-09)** — 286 variables (real `VARIABLE_ALIAS` references, not baked hex, verified after the fact), 15 text styles, 5 effect styles, correctly detected the free-plan mode cap and fell back to two collections. One real bug found and fixed in the process: text-style creation can exceed `figma_execute`'s 30s cap, and the underlying work keeps running in Figma's plugin sandbox after the tool call times out — a naive retry can race against it and create duplicates. The skill now sub-batches text styles, re-checks state before retrying after any timeout, and always runs a final duplicate check. The paid-plan branch (one collection, two real modes) is still unverified — not for lack of trying, but because nobody working on this project currently has access to a paid Figma workspace to test it against.

**What gets pushed, and as what:**

| Token category | Figma object | Notes |
|---|---|---|
| `color.primitive.*` (brand/brand-secondary/neutral/static/status) | COLOR variable | One variable per ramp step, mode-independent (same value pushed into every mode that exists). |
| `color.semantic.<mode>.*` | COLOR variable | Every plain-alias token (the large majority) is pushed as a **real Figma variable alias** to its primitive, not a baked copy — this is what makes the "edit a primitive in Figma, semantics update automatically" editing model in `pipeline-plan.md` actually work. `action.*-disabled` and `overlay.scrim` (the two baked, non-alias exceptions) push as literal values; `overlay.scrim` additionally needs a real RGBA value (alpha channel), which the dedicated Southleft tools can't express — set via `figma_execute` directly. |
| `typography.primitive.*` (fontFamily/fontWeight/fontSize/lineHeight) | STRING/FLOAT variable | Same mode-independent treatment as color primitives. |
| `typography.semantic.*` | **Text style**, not a variable | A DTCG `typography` composite has no single-variable Figma equivalent — becomes a Figma text style instead, via `figma_execute` (no dedicated tool exists for text styles — confirmed in `docs/figma-mcp-capabilities.md`). Built with literal resolved values, not variable-bound style properties — text-style variable binding wasn't confirmed working the way effect-style color binding was, so it isn't relied on here. |
| `spacing.*`, `radius.*`, `border-width.*`, `opacity.*`, `breakpoint.*` | FLOAT variable | Flat/single-tier, mode-independent, straightforward. |
| `shadow.*` — Tailwind/Bootstrap (`shadow` composite type) | **Effect style** | Real multi-layer drop shadows, via `figma_execute` (`figma.createEffectStyle()` — confirmed working). |
| `shadow.*` — MD3/MD2 (`dimension`/elevation type) | FLOAT variable | Pushed as the raw elevation dp number, **not** a fabricated effect style — there's no real CSS shadow to represent for this shape (see "Shadow" below), so nothing is approximated here that wasn't already being approximated in `report.html`'s own preview. |
| `grid.*` | **Not pushed** | Decided in `pipeline-plan.md`: a Figma grid is a frame's layout-grid property, not a variable — doesn't fit this mechanism at all. |

**Collection strategy — decided: ask the user (`figmaPlan`), verify only the optimistic branch.** Figma's variable-write surface silently caps a multi-mode collection at 1 mode on a free-plan file, with **no error raised** (`docs/figma-mcp-capabilities.md`, caveat 2) — so there was never a reliable signal to check *before* attempting it programmatically. The original design (2026-09-09, superseded same day) resolved this by always attempting the 2-mode collection and reading back what landed. **Revised (2026-09-09):** the user now states their Figma plan directly at seed input (`figmaPlan`, "Seed inputs" above), and the push uses that answer to pick the structure directly rather than discovering it by trial — no point spending an API call attempting something already expected to fail:

- **`figmaPlan: "free"`:** skip the 2-mode attempt entirely, go straight to building `Tokens - Light` and `Tokens - Dark` as two separate collections from the start.
- **`figmaPlan: "paid"`:** build one `Tokens` collection with both `Light` and `Dark` modes directly, expecting success — the more native Figma experience `pipeline-plan.md` originally described for this case. Still re-read it afterward (`figma_get_variables` with `refreshCache: true` — read-after-write is stale otherwise, caveat 3) as a **safety net for a possibly-wrong self-report**, not the primary decision mechanism anymore: if only `Light` landed despite the "paid" answer, fall back to the same two-collection structure the free-plan branch uses, telling the user plainly that their file didn't behave like a paid workspace.

Same variable *names* in both collections either way; code-side, nothing about this branch matters (Style Dictionary already emits both modes regardless of Figma's structure). This still resolves the "free vs. paid plan detection" question `pipeline-plan.md`'s "Pre-launch validation" flagged as unverified — now by asking rather than guessing, with the old attempt-then-verify behavior demoted to a fallback safety net rather than the primary mechanism. **Verified live against a real free-plan file (2026-09-09)** under the original attempt-then-verify design — the free-plan branch's actual Figma-side behavior (silent 1-mode cap) is proven; this revision only changes how the branch gets *selected*, not what either branch *does*, so that verification still holds.

**Connection model — confirmed, and load-bearing:** the Southleft MCP only reaches a file through the **Desktop Bridge plugin running in Figma Desktop**, never through a file URL or the browser (`docs/figma-mcp-capabilities.md`, caveat 1). This means the Figma file link collected at seed input (see "Seed inputs" above) is an *identifier*, not a remote-fetch target — the push still needs the user to have that exact file open in Figma Desktop with the bridge plugin running at push time. The push procedure checks this first (`figma_get_status` with `probe: true`, then `figma_list_open_files` compared against the link's file key) and asks the user to fix the connection rather than guessing or silently skipping.

**Which Figma MCP — a real seed choice (`figmaMcp`), pinned to one implementation during internal testing only — 🚩 must be revisited before public release, see `pipeline-plan.md`, "Pre-launch validation."** Two Figma MCP integrations are real and available: the Southleft MCP (above — the one actually implemented) and Figma's own official remote MCP (`https://mcp.figma.com/mcp`, OAuth-gated — confirmed to exist via `mcp__plugin_figma_figma__authenticate`/`complete_authentication`, but its post-auth tool surface has never been exercised from this project, so there's nothing verified to build against yet). The seed input asks which one the user wants (see "Seed inputs" above) and that answer is stored for real — but `SDSGT-figma-push` always executes through Southleft today regardless of the answer, disclosing this plainly rather than silently ignoring the choice or guessing at the official MCP's unverified tool names. Starting the official MCP's OAuth flow is never triggered by the seed answer alone — that's a real, user-facing permission action, distinct from having merely mentioned a preference earlier in the conversation. **This "ask but ignore" behavior is acceptable only while the tool has no real external users — it does not ship to a public release as-is.** Before that point, either build the official-MCP path for real (once its tools are inspected) or drop the question so nothing asks for a choice it doesn't honor.

**Not built: the ongoing bidirectional sync engine.** This push is a one-time replay — re-running it against a file that already has a previous push's variables creates a second set rather than updating the first, since Figma variable names aren't globally unique. The real token-sync engine described in `pipeline-plan.md` ("Token-sync staying live") is separate, future work, not this contract.

### Color primitives — `color.primitive.json`

Groups: `brand`, `brand-secondary` (conditional — only generated if a secondary color was supplied), `neutral`, `static`, `status`.

| Group | Steps | Notes |
|---|---|---|
| `brand` / `brand-secondary` | `100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100` (11 steps) | `600` is the base step — equals the user's literal input hex, unmodified |
| `neutral` | same 11 steps | `600` is the base step — computed, not typed directly. See "Neutral base," below. |
| `static` | `100` = white, `200` = black | Fixed, non-computed — same on every project regardless of brand color |
| `status` | 5 roles × 2 tones each: `status.<n>.100` (light tint), `status.<n>.200` (saturated/dark tone) | Fixed order: `1`=error, `2`=success, `3`=warning, `4`=info, `5`=promo. Computed via its own formula, below — not derived from the brand ramp. |

**Ramp-interpolation formula** (`brand`, `brand-secondary`, `neutral` — same formula, applied independently per group, using each group's own base color):

Given the base color's HSL (H₀, S₀, L₀) at step `600`:
- Hue (H₀) and saturation (S₀) stay constant across every step in the ramp.
- Lightness interpolates linearly from L₀ toward two fixed targets, in 5 equal increments per direction:
  - Lighter steps: `L(500) = L₀ + (97 − L₀)×⅕`, `L(400) = L₀ + (97 − L₀)×⅖`, `L(300) = L₀ + (97 − L₀)×⅗`, `L(200) = L₀ + (97 − L₀)×⅘`, `L(100) = 97`
  - Darker steps: `L(700) = L₀ − (L₀ − 12)×⅕`, `L(800) = L₀ − (L₀ − 12)×⅖`, `L(900) = L₀ − (L₀ − 12)×⅗`, `L(1000) = L₀ − (L₀ − 12)×⅘`, `L(1100) = 12`

`1100` always lands at 12% lightness regardless of the base color — this is what guarantees the near-black end needed for light/dark mode (light: `background=neutral.100`, `text=neutral.1100`; dark: reversed).

**Neutral base** — set by the "Neutral colors" seed choice (see "Seed inputs"), not typed directly:
- **Brand-tinted:** `neutral.600` = HSL(H = brand's hue, S = 6%, L = 50%)
- **Pure achromatic gray:** `neutral.600` = HSL(S = 0%, L = 50%) — hue is irrelevant at 0% saturation

From there, `neutral.100`–`1100` are generated by the ramp-interpolation formula above, same as `brand`.

**Boilerplate status-color formula** (the only status-color formula; fixed and brand-independent):

`.200` (the saturated/dark tone) is sourced directly from real frameworks per role, not an invented hue:

| Role | `.200` source | Hex |
|---|---|---|
| `1` — error | MUI `error.main` (`red[700]`) | `#D32F2F` |
| `2` — success | MUI `success.main` (`green[800]`) | `#2E7D32` |
| `3` — warning | Bootstrap 5.3 `$warning` | `#FFC107` |
| `4` — info | MUI `info.main` (`lightBlue[700]`) | `#0288D1` |
| `5` — promo | supplied brand swatch — no framework defines an equivalent 5th role | `#FFA445` |

`.100` is derived, not sourced: same hue/saturation as `.200`, lightness raised to 95% for a pale tint.

**`.100` and `.200` are not required to pass contrast against each other**, and Promote doesn't check them against each other. They aren't assumed to render stacked — a `.200` icon/badge/border might sit on a neutral surface instead of its own `.100` tint — and warm hues like warning/promo structurally can't hit 3:1 (the applicable bar for a decorative, non-text use — WCAG 1.4.11) against any pale tint of themselves, regardless of source (verified computationally against MUI's own warning too, not just Bootstrap's). See "Accessibility checks are advisory, not a gate," in `pipeline-plan.md`.

**Positional relabel** — how non-MD3 generators translate this ramp into each target's native key shape:

| Our step | Tailwind | Bootstrap | MD2 (MUI) |
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
| `1000` | `900` | *(unused)* | `900` |
| `1100` | `950` | *(unused)* | *(unused)* |

Bootstrap reads only the base step (`600`) as `$primary`/`$secondary`; its own Sass derives tints/shades from there. MD3 discards this table entirely — its generator computes a real HCT tonal palette + `ColorScheme` directly from the semantic base color instead (generator-layer work, not a spec relabel) — **built**, see below. SwiftUI reads semantic tokens directly — **built**, see below.

**This table is the underlying Tailwind/Bootstrap/MD2 *primitive-ramp* relabel — not every downstream component library actually reads it.** shadcn/ui, shadcn-vue, and RNR consume the *semantic* layer directly (own mapping, see "shadcn/ui theming"/"React Native Reusables (RNR) theming" below), bypassing this ramp table entirely. Vuetify reads only the base step (`600`), same treatment as Bootstrap's `$primary` — see "Vuetify theming" below. React Native Paper doesn't use this table at all — it gets a real HCT `ColorScheme`, same computation as MD3 — see "React Native Paper theming" below. (This corrects an earlier version of this table, which grouped Vuetify and RN Paper under the MD2 column — neither actually goes through this positional relabel.)

**Bootstrap generator is built** (`cli/src/generate/bootstrap.ts`, `generate --bootstrap`) — decided/extended 2026-09-08, **targets Bootstrap 5.3** (verified against the real npm-published `5.3.8` source, the current latest — the `$border-radius-sm`/`$border-radius`/`$border-radius-lg`/`$border-radius-pill` names and their defaults are a Bootstrap 5.x convention, not present in Bootstrap 4). This is a documentation/output-shape target, not an npm dependency of the CLI itself. It writes a curated `_variables.scss` partial by reading the relevant DTCG values directly, not a full Style Dictionary tree transform (there's no ramp to relabel, so the whole-tree machinery doesn't apply): `$primary`/`$secondary` from `brand`/`brand-secondary`'s `600` step (omitted if no secondary color was supplied); `status.<n>.200` onto Bootstrap's own `$danger`/`$success`/`$warning`/`$info` (role `5`, "promo," has no Bootstrap equivalent and is skipped, same reasoning as its "no framework defines an equivalent 5th role" note above); `radius.sm`/`md`/`lg` onto `$border-radius-sm`/`$border-radius`/`$border-radius-lg` (px converted to rem at the spec's fixed 16px root); `radius.full` left as Bootstrap's own `$border-radius-pill` default (`50rem`) rather than the spec's literal `9999`, per "Radius" below. `radius.none` and `radius.xl` have no natural Bootstrap variable and are intentionally not mapped.

**MD2/MUI generator is built** (`cli/src/generate/md2.ts`, `generate --md2`) — same direct-DTCG-read approach as Bootstrap's, not a Style Dictionary tree transform. Verified against MUI 9.x (`@mui/material@9.4.0`/`@mui/system@9.4.0`, the current npm latest) — though this exact formula has held unchanged across MUI's 4/5/6/7/8/9 majors, so it's a less fragile target than Bootstrap's version-specific variable names. Writes two files: `colors.ts` (the primitive ramp relabeled per the table above — our `1100` step has no MUI equivalent and is dropped) and `palette.ts` (`main`/`light`/`dark`/`contrastText` per color group, computed with MUI's own real derivation formula, verified against `@mui/material` source rather than approximated — see `generate/mui-color.ts`: `light = lighten(main, 0.2)`, `dark = darken(main, 0.3)` — MUI's own default tonal offsets — and `contrastText` picked by the same WCAG contrast-ratio check MUI's `getContrastText` uses (`>= 3:1`), but against our own `static.100`/`static.200` white/black primitives rather than MUI's hardcoded literals). `status.<n>.200` maps onto MUI's own `error`/`warning`/`info`/`success` palette groups the same way it maps onto Bootstrap's `$danger`/etc.; role `5` ("promo") is skipped, same reasoning.

**MD3/Jetpack Compose generator is built** (`cli/src/generate/md3.ts`, `generate --md3`) — the biggest lift of the five targets, **targets Jetpack Compose Material3 1.4.0** (decided 2026-09-08, the current latest stable release — `1.5.0` exists but is alpha-only; verified against the real `material3-1.4.0-sources.jar` from Google's Maven repo, not GitHub's unpinned default branch — the 48-field `ColorScheme(...)` constructor including the `*Fixed`/`*FixedDim`/`*FixedVariant` roles, and the `surfaceColorAtElevation` formula, both match exactly). Real HCT tonal palettes + a full `androidx.compose.material3.ColorScheme` (light and dark) via Google's own `@material/material-color-utilities` (pinned to `^0.3.0` — the current `0.4.0` has a real, currently-open packaging bug that fails under plain Node ESM resolution; verified before depending on it, see the file's header comment). `primaryPalette`/`secondaryPalette`/`neutralPalette` are built from this project's own real brand/brand-secondary/neutral colors (their actual hue+chroma via `TonalPalette.fromInt()`) rather than Material You's own hue-rotation heuristic, so the generated scheme stays faithful to the colors this project's seed input actually collected. `tertiaryPalette` and `neutralVariantPalette` (no first-class concept in our own token spec) and `secondaryPalette` when no secondary color was supplied fall back to the real `TonalSpot` variant formula, verified from the library's compiled source. `errorPalette` is overridden from our own `status.1` (error) primitive rather than Google's fixed default red. The elevation overlay (see "Shadow" below) uses Compose's own real `surfaceColorAtElevation` formula, verified from `androidx.compose.material3.ColorScheme.kt`.

**SwiftUI generator is built** (`cli/src/generate/swiftui.ts`, `generate --swiftui`) — no iOS/Swift version target decided or needed: `Color(red:green:blue:opacity:)` is a plain SwiftUI initializer available since iOS 13, so nothing here is version-gated (checked 2026-09-08 alongside the other three version decisions above). A real deployment-target decision still exists for Layer 2/3 (SwiftUI-native component library, Xcode scaffolding) — deliberately left open until that work is actually built. Otherwise the simplest of the five, matching its narrow documented scope exactly: no ramp relabel, no derived math, just the resolved semantic color tokens as native `Color(red:green:blue:)` values (SwiftUI's own built-in initializer — no custom hex-parsing extension, no UIKit dependency). "Reads semantic tokens directly" still needed one real resolution step: most semantic tokens in `color.semantic.<mode>.json` are DTCG aliases (`{color.primitive.neutral.100}`), not baked hex — see "Alias vs. baked value" above — resolved against `color.primitive.json` at generation time (the two already-baked exceptions, `action.*-disabled` and `overlay.scrim`, pass through their own literal hex/`rgba()` value unchanged). Light and dark are emitted as two separate namespaces (`DesignTokens.Light`/`DesignTokens.Dark`), same pattern as every other generator here — the consuming app switches between them itself.

**Tailwind's relabel is built** (`cli/src/generate/tailwind.ts`, `generate --tailwind`) and **targets Tailwind v4** — output is a CSS-native `@theme` block (`@theme { --color-primitive-brand-50: ...; }`), not a `tailwind.config.js`/`.ts` theme object. Decided 2026-09-08; see "Generators" in `pipeline-plan.md`. Only `brand`/`brand-secondary`/`neutral` go through this table — `static` and `status` aren't ramps in the 100–1100 sense and keep their own key names.

### Color semantic roles — `color.semantic.<mode>.json`

| Category | Tokens |
|---|---|
| Background | `background.primary`, `background.secondary`, `background.surface`, `background.inverse` |
| Text | `text.primary`, `text.secondary`, `text.disabled`, `text.on-primary`, `text.on-surface`, `text.inverse` |
| Action — primary | `action.primary`, `action.primary-hover`, `action.primary-active`, `action.primary-pressed`, `action.primary-disabled` — always generated |
| Action — secondary | `action.secondary`, `action.secondary-hover`, `action.secondary-active`, `action.secondary-pressed`, `action.secondary-disabled` — conditional, only if a secondary brand color was supplied |
| Border | `border.default`, `border.subtle`, `border.focus`, `border.on-primary` |
| Status ×5 (error / success / warning / info / promo) | `status.<role>`, `status.<role>-bg`, `status.<role>-text`, `status.<role>-border` — 20 tokens |
| Overlay | `overlay.scrim` |

Total: 40 semantic color tokens per mode file that exists (45 with a secondary brand color).

**Background/Text/Border ramp mapping** (mirrored between light and dark, per the light/dark flip rule in "Color primitives"):

| Token | Light mode | Dark mode |
|---|---|---|
| `background.primary` | `neutral.100` | `neutral.1100` |
| `background.secondary` | `neutral.200` | `neutral.1000` |
| `background.surface` | `static.100` | `neutral.1000` |
| `background.inverse` | `neutral.1100` | `neutral.100` |
| `text.primary` | `neutral.1100` | `neutral.100` |
| `text.secondary` | `neutral.900` | `neutral.200` |
| `text.disabled` | `neutral.700` | `neutral.400` |
| `text.on-primary` | `static.100` | `static.100` |
| `text.on-surface` | `neutral.1100` | `neutral.100` |
| `text.inverse` | `neutral.100` | `neutral.1100` |
| `border.default` | `neutral.400` | `neutral.800` |
| `border.subtle` | `neutral.300` | `neutral.900` |
| `border.focus` | `brand.600` | `brand.600` |
| `border.on-primary` | `static.100` | `static.100` |

`background.surface` uses `static.100` (pure white) in light mode rather than a ramp step, since `neutral.100` is already the ramp's lightest step and surface needs to read as raised above it; dark mode has headroom inside the ramp itself (`neutral.1000`, one step lighter than the `neutral.1100` page background), so no need to reach outside it. `border.focus` reuses `action.primary`'s own primitive (`brand.600`) rather than getting a separate value, mode-independent like the rest of `action.*`.

**Action-state ramp mapping:** `action.primary`→`brand.600`, `-hover`→`brand.700`, `-active`→`brand.800`, `-pressed`→`brand.800` (same value as `-active`, but a distinct, independently re-pointable token). `action.secondary.*` mirrors the same mapping onto `brand-secondary`.

**`-disabled` formula:** `brand.600` blended 50% toward `neutral.600` (a desaturate-toward-neutral blend, not a reduced-opacity trick). Same treatment for `action.secondary-disabled` onto `brand-secondary`. **Blend color space: RGB, per-channel linear interpolation** (not HSL) — chosen specifically because HSL blending is ill-defined when one side is achromatic (hue has no meaning at 0% saturation, which `neutral.600` can be under the pure-achromatic-gray seed choice), so RGB avoids a degenerate case the formula would otherwise have to special-case.

**Status tokens:** `status.<role>`, `status.<role>-text`, `status.<role>-border` all alias `status.<n>.200`; `status.<role>-bg` aliases `status.<n>.100`.

**`overlay.scrim`:** `color.primitive.neutral.1100` at 50% alpha (`0.5`), fixed across every project regardless of design language.

**Alias vs. baked value — which semantic tokens are which:** every semantic token above is a plain DTCG alias (`$value: "{color.primitive....}"`) **except** `action.*-disabled` and `overlay.scrim`. Those two apply a transform on top of a primitive (a blend, an alpha) that a straight alias can't express, so they're computed once at promotion time and written as a literal value instead — `action.*-disabled` as an ordinary `$type: "color"` hex, `overlay.scrim` as an `rgba(r, g, b, 0.5)` string built from `neutral.1100`'s resolved RGB channels. Every other token in this file is a real alias, not a baked copy — this pair is the exception, not the rule.

All of the above computes once at promotion time and bakes into plain values/aliases — nothing here stays live afterward.

### shadcn/ui theming — `color.semantic.<mode>.json` → shadcn CSS variables

**Built** (`cli/src/generate/shadcn.ts`, `generate --shadcn`) — Layer 2's first slice (see `pipeline-plan.md`, "Three layers": Layer 2 is the foundation applied to a real component library, not just relabeled tokens). Reads the DTCG JSON directly, same approach as `bootstrap.ts`/`swiftui.ts` — no Style Dictionary tree transform, since this only needs a curated set of resolved semantic values, not a full-tree relabel.

**Targets shadcn/ui CLI v4** (verified live against `ui.shadcn.com/docs/theming`, 2026-09-10, current published CLI `4.13.1`) and **Base UI** as the underlying primitive library (shadcn's own current init default, `-b radix` the opt-out) — decided the same day. The primitive-library choice doesn't affect this slice's output at all: `theme.css` is pure CSS custom properties, unrelated to which component primitives a later component-vendoring step would install. What's actually pinned here is shadcn's own CSS variable *name* contract (`--primary`, `--card`, etc.), which has stayed stable across shadcn's CLI major versions to date.

**The mapping** (SDSGT semantic token → shadcn CSS var):

| shadcn var | SDSGT source | Note |
|---|---|---|
| `--background` | `background.primary` | |
| `--foreground` | `text.primary` | |
| `--card` | `background.surface` | |
| `--card-foreground` | `text.on-surface` | |
| `--popover` | `background.surface` | shadcn has no separate popover-surface concept; reuses `--card`'s source |
| `--popover-foreground` | `text.on-surface` | |
| `--primary` | `action.primary` | |
| `--primary-foreground` | `text.on-primary` | |
| `--secondary` | `action.secondary` | conditional — only emitted if the seed supplied a secondary brand color, same conditionality as `action.secondary.*` itself |
| `--secondary-foreground` | `text.on-primary` | approximation — SDSGT has no `text.on-secondary`; revisit once real shadcn components are visually checked against it |
| `--muted` | `background.secondary` | gap-fill — SDSGT has no `muted` role; closest "quieter surface" concept |
| `--muted-foreground` | `text.secondary` | gap-fill, same reasoning |
| `--accent` | `action.secondary-hover` (falls back to `action.primary-hover` if no secondary color) | gap-fill — shadcn's hover/highlight slot; judgment call, not a clean 1:1 match |
| `--accent-foreground` | `text.on-primary` | |
| `--destructive` | `status.error` | |
| `--destructive-foreground` | computed via `contrastText()` (`generate/mui-color.ts`) against `static.100`/`static.200` | **not** `status.error-text` — that token is the *same saturated tone* as `status.error` itself (meant for colored inline text on a neutral surface, not a contrasting color for text sitting on a filled background). Reuses MD2's own real WCAG-contrast-based white/black pick rather than inventing a new formula. Caught by actually running the generator and inspecting the output (red-on-red) before shipping this contract. |
| `--border` | `border.default` | |
| `--input` | `border.default` | approximation — SDSGT has no separate input-border role; common in real shadcn themes too |
| `--ring` | `border.focus` | clean match |
| `--radius` | `radius.md` | shadcn v4 derives `--radius-sm/lg/xl/2xl` etc. from this one base var via its own `calc()` convention — no extra generator work needed |

**Status roles beyond error are emitted as SDSGT extensions, not dropped.** shadcn's own variable set only has a native slot for error (`--destructive`) — no success/warning/info/promo. Existing precedent elsewhere (Bootstrap's `$danger`-only mapping, MUI's promo-skip, both above) is to drop a role with no native slot for that target's own variable set. A CSS *theme file* is different: dropping 4 of 5 status roles would leave a shadcn project with no design-system-consistent way to build a success/warning/info/promo alert or badge, which real shadcn-based projects commonly need anyway regardless of what shadcn ships by default. So `--success`/`--warning`/`--info`/`--promo` are written alongside shadcn's native vars, clearly commented as SDSGT additions, sourced from `status.<role>`. Each `-foreground` pair is **not** `status.<role>-text` (same saturated-tone trap as `--destructive-foreground` above) — computed the same way, via `contrastText()` against `static.100`/`static.200`.

**`--chart-1` through `--chart-5` and `--sidebar-*` are out of scope** — no SDSGT semantic concept maps to them. Documented as a known gap, not fabricated.

**Dark mode uses shadcn's own `.dark` class selector, not this project's usual `[data-theme="dark"]` convention** — the one deliberate, scoped exception across all Generate-stage output. `shadcn/theme.css` is meant to be the actual `globals.css` for a shadcn-flavored project, and shadcn's whole ecosystem (its own templates, `next-themes`, every community example) assumes `.dark` on `<html>`/`<body>`. Fighting that with a Tailwind `@custom-variant` remap would just make the generated project non-idiomatic for no real benefit — every other generator keeps `[data-theme="dark"]`, this is the one documented exception.

**A dark-only project's `:root` intentionally carries no color values** (only `--radius`, which isn't mode-dependent) — mirrors the base CSS platform's own dark-only handling (`generate/index.ts`): there's no separate "light" to fall back to, so the project is expected to apply `.dark` unconditionally, same requirement the base platform already has for `[data-theme="dark"]`.

**Not built: actually installing shadcn/ui.** This contract covers the theme-variable mapping only. Running `shadcn init`/`shadcn add <component>` against a real project, choosing a curated/trimmed component list, and marking vendored files as customized (the ACIM lesson — see `CLAUDE.md`) is separate, substantial follow-up work, not part of this slice. See `pipeline-plan.md`, "Three layers," Layer 2.

**This same `theme.css` also serves shadcn-vue as-is** — verified (`shadcn-vue.com/docs/theming`, 2026-09-10) that shadcn-vue uses the *identical* CSS variable convention as shadcn/ui (same names, same background/foreground pairing rule). No separate generator or flag needed.

### React Native Reusables (RNR) theming — `color.semantic.<mode>.json` → `global.css` + `constants.ts`

**Built** (`cli/src/generate/rnr.ts`, `generate --rnr`) — Layer 2, slice 2. RNR is explicitly "shadcn for React Native": this generator reuses `shadcn.ts`'s `resolveShadcnVars` directly for the semantic mapping (same variable set, same gap-fills/approximations as the table above) — only the value *serialization* differs.

**Real format verified against RNR's actual source** (`founded-labs/react-native-reusables`, checked 2026-09-10 — an older `mrzachnugent/react-native-reusables` org shows up in some older search results too, likely a prior name/transfer; re-check if this generator ever needs revisiting): RNR's `global.css` writes each CSS variable as a **raw `H S% L%` triplet with no `hsl()` wrapper** (e.g. `--background: 0 0% 100%;`), not hex — the wrapper lives in `tailwind.config.js` instead (`background: 'hsl(var(--background))'`). This is NativeWind's own requirement, not a style choice: substituting a hex string into that `hsl()` wrapper would be invalid CSS. `hexToHslTriplet()` (`generate/rnr.ts`) does the conversion, verified against the standard CSS Color Module RGB→HSL algorithm. RNR's own real file also has **no `--destructive-foreground` var** (it forked from an older shadcn/ui convention, before that var existed) — this generator matches that for fidelity, filtering it out even though it's computed correctly by `resolveShadcnVars`.

**A second file, `constants.ts`, exports `NAV_THEME.light`/`.dark`** — React Navigation's own `Theme.colors` shape (verified against `reactnavigation.org/docs/themes`, 2026-09-10: `primary`, `background`, `card`, `text`, `border`, `notification` — 6 keys). Values here stay plain hex (not HSL triplets) since React Navigation consumes real color values directly, not CSS variables — no NativeWind involvement on this path. Meant to be spread into React Navigation's own `DefaultTheme`/`DarkTheme` (`{ ...DefaultTheme, colors: NAV_THEME.light }`), not used as a full replacement `Theme`.

**Not built: actually installing RNR components.** Same boundary as shadcn/ui above.

### React Native Paper theming — real HCT `ColorScheme`, reshaped onto Paper's `MD3Theme.colors`

**Built** (`cli/src/generate/rn-paper.ts`, `generate --rn-paper`) — Layer 2, slice 2. Verified (`oss.callstack.com/react-native-paper/docs/guides/theming`, current npm `5.15.3`, 2026-09-10) that Paper now defaults to **MD3** theming, not MD2 — **this corrects a stale grouping**: `pipeline-plan.md` previously listed RN Paper under "MD2 (MUI, Vuetify, RN Paper)," which no longer holds for Paper specifically. Paper's `MD3Theme.colors` role set overlaps heavily with the real Material3 `ColorScheme` `md3.ts` already computes for Jetpack Compose, so this generator reuses `buildScheme()` and `surfaceColorAtElevation()` directly (both already exported from `md3.ts`) rather than recomputing a parallel palette.

**Not a blind 1:1 reuse** — Paper's role list is a *subset* of `md3.ts`'s full 47-role `COLOR_SCHEME_ROLES` (Paper predates/omits Compose's newer `*Fixed`/`*FixedDim`/`*FixedVariant` roles and the `surfaceBright`/`surfaceDim`/`surfaceContainer*` tier), plus a handful of roles Compose's `ColorScheme` doesn't have at all:

| Paper-only key | Source | Verified against |
|---|---|---|
| `shadow` | fixed `#000000` | Paper's own MD3 spec default — pure black, not translucent (alpha handling lives elsewhere in Paper's shadow rendering) |
| `surfaceDisabled` | `onSurface` @ 12% alpha | Paper's real `MD3LightTheme` source: `"rgba(32, 26, 24, 0.12)"` |
| `onSurfaceDisabled` | `onSurface` @ 38% alpha | same source: `"rgba(32, 26, 24, 0.38)"` |
| `backdrop` | this project's own `overlay.scrim` token, reused directly | Paper's own hardcoded default (`"rgba(59, 45, 41, 0.4)"`) is a generic, brand-independent Material default — reusing our own already-decided scrim token (same role: a dark translucent overlay behind modals) is more consistent with this project's own token system than re-deriving a parallel formula, same reuse-over-reinvent discipline as `contrastText()` in `shadcn.ts` |
| `elevation.level0`–`level5` | `surfaceColorAtElevation()` at MD3's own fixed dp scale (`0/1/3/6/8/12`) | a framework-level constant, independent of this project's own `shadow.json` (different 5-tier `sm`–`2xl` shape, not the same cardinality as Paper's fixed 6 levels) |

**Written as `theme.ts`**, spreading Paper's own `MD3LightTheme`/`MD3DarkTheme` as the base (per Paper's own documented customization pattern) and overriding only `colors` — fonts/roundness/etc. stay Paper's defaults.

**Not built: actually installing React Native Paper components.** Same boundary as shadcn/ui above.

### Vuetify theming — base colors only, Vuetify's own runtime derives the rest

**Built** (`cli/src/generate/vuetify.ts`, `generate --vuetify`) — Layer 2, slice 2. **Targets Vuetify 4** (current npm latest, verified 2026-09-10 — Vuetify `3.13.0` became the final v3 minor and moved to LTS in July 2026; 4.x is now the actively developed line). Verified against Vuetify's own real theme composable source (`packages/vuetify/src/composables/theme.ts`) and its migration notes: the theme system's core `ThemeDefinition` shape (`{ dark: boolean, colors: {...} }`) and base color keys are unchanged from v3 to v4 — the real v4 breaking changes are the default theme mode (system vs. light) and elevation moving to MD3's 6-level scale, neither of which affects this generator's output shape.

**Decided scope: a small, curated base-color set, same pattern as `bootstrap.ts`** — `primary`, `secondary` (conditional), `background`, `surface`, plus `status.*` onto Vuetify's native `error`/`warning`/`info`/`success` keys (role 5, "promo," skipped — same precedent as Bootstrap/MUI's own promo-skip). Vuetify's own runtime auto-derives `on-*` contrast pairs and `lighten-N`/`darken-N` tint variants from these base colors, the same way Bootstrap's own Sass derives tints from just `$primary` — confirmed via Vuetify's own theme docs (`vuetifyjs.com/en/features/theme`) and its documented default theme, which auto-generates `on-background`/`on-surface`/`on-primary`, etc. Vuetify's own *default* theme additionally hardcodes a few more keys (`surface-bright`, `primary-darken-1`, etc. — confirmed by reading the real source) instead of relying purely on auto-derivation, but those are Vuetify's own internal implementation choice, not part of the documented custom-theme contract this generator targets.

`background`/`surface` are read from `color.semantic.<mode>.json` (`background.primary`/`background.surface`), not the primitive ramp — these are semantic, mode-dependent concepts, same source as shadcn's `--background`/`--card`.

**Written as `theme.ts`** exporting `lightTheme`/`darkTheme`, each a real Vuetify `ThemeDefinition` — meant to spread into `createVuetify({ theme: { themes: { light: lightTheme, dark: darkTheme } } })`.

**Not built: actually installing Vuetify components.** Same boundary as shadcn/ui above.

### React-Bootstrap and bootstrap-vue-next — already served by `--bootstrap`

Verified (both projects' own theming docs, 2026-09-10): neither introduces a separate component-library-specific variable convention — both consume plain Bootstrap Sass variables/maps directly, the exact same `_variables.scss` the Bootstrap generator (above, "Positional relabel") already writes. No new flag or generator needed.

### Typography — `typography.primitive.json`, `typography.semantic.json`

**Font-weight primitives:** `typography.primitive.fontWeight.regular` = 400, `.semibold` = 600, `.bold` = 700.

**Line-height formula:** derived from each role's font-size (see "Type-scale," below), not a separate seed or preset. `typography.primitive.lineHeight.<size>` = font-size × 1.5, rounded to the nearest px, for the `caption`/`body-sm`/`body`/`body-lg` roles; font-size × 1.2, rounded to the nearest px, for `heading-sm`/`heading-md`/`heading-lg`/`display` (tighter leading is standard at larger sizes).

| Role | Weight(s) generated | Composite token name(s) | Font family (when both fonts supplied) |
|---|---|---|---|
| caption | regular, semibold | `caption-regular`, `caption-semibold` | secondary |
| body-sm | regular, semibold | `body-sm-regular`, `body-sm-semibold` | secondary |
| body | regular, semibold | `body-regular`, `body-semibold` | secondary |
| body-lg | regular, semibold | `body-lg-regular`, `body-lg-semibold` | secondary |
| heading-sm | semibold, bold | `heading-sm-semibold`, `heading-sm-bold` | primary |
| heading-md | semibold, bold | `heading-md-semibold`, `heading-md-bold` | primary |
| heading-lg | semibold, bold | `heading-lg-semibold`, `heading-lg-bold` | primary |
| display | bold | `display-bold` | primary |

15 composite `typography.semantic.*` tokens total, each a DTCG `typography` composite aliasing `typography.primitive.fontFamily`/`fontWeight`/`fontSize`/`lineHeight`.

**Font-family mapping:** when both fonts are supplied, primary feeds `heading-*`/`display`, secondary feeds `body*`/`caption`. When only a primary font is supplied, it feeds every role — the token set is still all 15, just aliased to one family everywhere.

### Spacing — `spacing.json` (native keys per preset)

| Preset | Values (px, at 16px root) |
|---|---|
| Tailwind | 0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64, 20=80, 24=96 |
| Bootstrap | 0, 1=4, 2=8, 3=16, 4=24, 5=48 |
| Material Design 3 | reuses Tailwind's scale verbatim — same keys, same values |
| Material Design 2 | reuses Tailwind's scale verbatim — same keys, same values |

Keys are an index, not the pixel value (`spacing.4` = 16px, not 4px) — the seed-input form must show the real key → px mapping alongside this option.

### Type-scale — sizes for `typography.semantic.json` roles (fixed keys: `caption, body-sm, body, body-lg, heading-sm, heading-md, heading-lg, display`)

| Preset | caption | body-sm | body | body-lg | heading-sm | heading-md | heading-lg | display |
|---|---|---|---|---|---|---|---|---|
| Tailwind | 12 | 14 | 16 | 18 | 20 | 24 | 30 | 48 |
| Bootstrap | 12 | 14 | 16 | 18 | 20 (h5) | 25 (h4→h3ish) | 32 (h2) | 40 (h1) |
| MD3 | 11 (label-sm) | 12 (body-sm) | 16 (body-lg) | 19 | 22 (title-lg) | 28 (headline-md) | 32 (headline-lg) | 45 (display-medium) |
| MD2 | 10 (overline) | 14 (body2) | 16 (body1) | 18 | 20 (h6) | 24 (h5) | 34 (h4) | 60 (h2) |

Bootstrap and MD3/MD2 values are a best-fit compression into these 8 shared roles — approximate, not exact. Two fixed-up gaps: neither Bootstrap, MD3, nor MD2 defines a role that maps cleanly onto `body-lg` — resolved as the midpoint between that preset's own `body` and `heading-sm` values, rounded to the nearest px (matches Tailwind's own `body-lg`, which likewise sits roughly midway between its `body` and `heading-sm`). MD3's and MD2's `display` sizes were each sourced as an open range (MD3 "45–57," MD2 "60–96," spanning more than one of their own named tiers) — resolved to a single value each (MD3: Display Medium, 45; MD2: H2, 60) to stay deterministic and roughly proportionate to the other presets' `display` sizes, rather than jumping to the largest tier in each system's own scale.

### Radius — `radius.json` (fixed keys: `none, sm, md, lg, xl, full`)

| Preset | none | sm | md | lg | xl | full |
|---|---|---|---|---|---|---|
| Tailwind | 0 | 4 | 6 | 8 | 12 | 9999 |
| Bootstrap | 0 | 4 | 6 | 8 | 16 | 9999 |
| MD3 | 0 | 4 | 12 | 16 | 28 | 9999 |
| MD2 | 0 | 2 | 4 | 8 | 16 | 9999 |

(px, at 16px root.) `radius.full` = `9999` uniformly across every preset including Bootstrap — the spec holds one canonical value; the Bootstrap generator expresses it as `$border-radius-pill: 50rem;` in the real generated Sass (built — see "Positional relabel" above).

### Border-width — `border-width.json` (fixed, Tailwind scale, not user-facing)

`border-width.0`, `border-width.1`, `border-width.2`, `border-width.4`, `border-width.8` — values 0/1/2/4/8px, key = value for all five. Flat/single-tier, no primitive/semantic split.

### Opacity — `opacity.json` (independent 2-option menu: Tailwind or Bootstrap only)

| Preset | Values |
|---|---|
| Tailwind | 0, 5, 10, …, 95, 100 (5% steps — 21 tokens) |
| Bootstrap | 0, 25, 50, 75, 100 (5 tokens) |

Token *keys* use the percentage (`opacity.0` … `opacity.100`); the stored `$value` is the 0–1 decimal (`opacity.50` → `0.5`). Flat/single-tier, DTCG `number` type. Neither Material Design variant has a preset opacity scale.

### Shadow — `shadow.json` (fixed keys: `sm, md, lg, xl, 2xl`, shared across all four presets)

**Tailwind/Bootstrap projects** — DTCG `shadow` composite type, real CSS values:

| Role | Tailwind | Bootstrap |
|---|---|---|
| `shadow.sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `0 .125rem .25rem rgba(0,0,0,.075)` |
| `shadow.md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | `0 .5rem 1rem rgba(0,0,0,.15)` |
| `shadow.lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | `0 1rem 3rem rgba(0,0,0,.175)` |
| `shadow.xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | same as `shadow.lg` |
| `shadow.2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | same as `shadow.lg` |

Two implementation details not obvious from the CSS strings above: **multi-layer shadows (`md`/`lg`/`xl` for Tailwind — each a comma-separated pair of CSS shadows) are stored as a DTCG `shadow` `$value` array**, one object per layer (`{offsetX, offsetY, blur, spread, color}`), in the same order as the CSS — a single-layer role (`sm`, `2xl`, and every Bootstrap role) is still an array, just with one entry, so the shape never has to branch on layer count. **Bootstrap's values are given in `rem` above but stored in `px`**, converted at the same 16px root already used everywhere else in this spec (e.g. `.125rem` → `2px`) — nothing in the token spec is ever left in `rem`.

**MD3/MD2 projects** — DTCG `dimension` type, value is an elevation dp number; the MD3/MD2 generator computes the real multi-layer shadow from that dp at generation time:

| Role | MD3 dp | MD2 dp |
|---|---|---|
| `shadow.sm` | 1 | 1 |
| `shadow.md` | 3 | 4 |
| `shadow.lg` | 6 | 8 |
| `shadow.xl` | 8 | 16 |
| `shadow.2xl` | 12 | 24 |

MD2 shadow opacities: key umbra 0.20, key penumbra 0.14, ambient 0.12.

`shadow.*`'s DTCG type differs by project (composite for Tailwind/Bootstrap, dimension for MD3/MD2) — never mixed within one project, since each project has only one design-language pick.

MD3's elevation isn't a pure shadow — the MD3 generator also derives a tonal surface-color overlay from the semantic surface + primary colors at generation time; that overlay isn't a spec-level value. **Built** — `generate --md3` precomputes this per shadow role (`sm`-`2xl`) using Compose's own real `surfaceColorAtElevation` formula (`alpha = (4.5 * ln(dp + 1) + 2) / 100`, `surfaceTint` at that alpha composited over `surface`), only when `shadow.json`'s tokens are this `dimension` shape — skipped, not approximated, for a mismatched Tailwind/Bootstrap `shadow` composite preset.

### Fixed defaults — `breakpoint.json`, `grid.json`

| | Values |
|---|---|
| Breakpoints (Tailwind, unconditional) | `breakpoint.sm`=640, `breakpoint.md`=768, `breakpoint.lg`=1024, `breakpoint.xl`=1280, `breakpoint.2xl`=1536px |
| Grid (Material Design 3 recipe, unconditional) | `grid.compact.columns`=4, `.margin`=16, `.gutter`=16dp · `grid.medium.columns`=8, `.margin`=24, `.gutter`=24dp · `grid.expanded.columns`=12, `.margin`=24, `.gutter`=24dp |

Grid rides Tailwind's breakpoints, not MD3's native dp thresholds: `compact` below `breakpoint.md` (0–767px), `medium` between `breakpoint.md` and `breakpoint.lg` (768–1023px), `expanded` at `breakpoint.lg`+ (1024px+). Must be disclosed on the seed-input form, since neither Breakpoints nor Column system is a user-facing menu pick.

### `foundations-rules.md` content

- **Contrast:** WCAG 2.1 AA — 4.5:1 normal text, 3:1 large text (≥24px, or ≥18.66px bold) and UI components.
- **Touch targets:** 44×44pt minimum (iOS HIG), 48×48dp minimum (Android Material), 24×24 CSS px minimum for web (WCAG 2.2 SC 2.5.8 Target Size Minimum, AA). Native targets follow their platform's own (larger) minimum; web targets follow WCAG's floor.
- **Focus visibility:** every interactive element needs a visible focus indicator (WCAG 2.4.7, AA); that indicator needs ≥3:1 contrast against adjacent colors (WCAG 1.4.11 Non-text Contrast, AA).
- **Reduced motion:** respect `prefers-reduced-motion` (web) / OS-level Reduce Motion (iOS/Android).
- **Use of color** (WCAG 1.4.1, Level A): color can't be the only signal for meaning, action, or state — needs an icon/text/shape backup. Directly relevant to the 5-role status system (`status.error/success/warning/info/promo`).
- **Required interactive states per component:** default, hover, focus, active/pressed, disabled, plus loading/selected/error where relevant.
- **Accessibility checks are advisory, not a gate:** anything Promote checks (contrast, or any future check on colors or other properties) gets *flagged* — in the console, in `report.html`, and eventually here in a generated project's own copy — never blocked. A failing check doesn't stop token generation or get silently auto-corrected; it's surfaced so a human or agent can decide whether and how to address it. See "Accessibility checks are advisory, not a gate" in `pipeline-plan.md`.

Scoped to accessibility/UX (how the UI should behave). Token-usage discipline lives in `AGENTS.md` instead (below) — a different audience (how an agent writes code against the token spec).

**Built** — `cli/src/generate/project-docs.ts` (`generate` writes it unconditionally, every run, identical content regardless of seed or platform flags — see "static and universal" above).

### `AGENTS.md` template content

**Core rule:** use semantic tokens, not primitives, for color and typography. Every other token group — spacing, radius, opacity, border-width, shadow, breakpoints, grid — is flat by design, so referencing it directly is expected, not a violation. No hardcoded hex/px where a token already covers the value. If no semantic token fits, add one — don't fall back to a primitive or a magic number to route around the gap.

**Always/never rules:**

1. Never blindly re-run a vendored component's install/add command once it's been customized. There's no merge logic — it silently overwrites. Mark customized files clearly.
2. NativeWind's `inlineRem` must be set to 16, not the default 14. *(Conditional — React Native/Expo target only.)*
3. `tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups (e.g. `px-4` vs. `pl-5`) — component variants need to account for this. *(Conditional — Tailwind-targeted projects only: shadcn/ui, shadcn-vue, RNR.)*
4. Never re-run the token generator expecting it to "update" the project. Regenerating is a deliberate, destructive reset — it replaces manual edits made since the last run. To fix or adjust something, edit the specific token; don't regenerate.
5. A token is only ever edited in one place at a time. If a value already exists as a token, change the token — don't hardcode a local override in a component to work around it.
6. Don't cross-wire another design language's conventions into a project (e.g. hand-rolling Tailwind-style shade computation into a Bootstrap-targeted project, or approximating MD3's tonal palette with a plain color ramp). Trust the tokens already generated for this project's actual chosen stack — if something seems missing, flag it as a gap rather than importing a different system's approach.

Rules 2 and 3 are conditional on target framework/design-language; the generator needs to know which conditional rules apply before writing a project's `AGENTS.md`. Every other rule is universal.

**Built** — `cli/src/generate/project-docs.ts` (`generate` writes `AGENTS.md` unconditionally, every run). Rule 3 is gated on whether `--tailwind` was passed; rule 2 is gated on that *and* a new `--framework react-native` flag (`generate`'s only way to learn the original seed's `targetFramework` — same explicit opt-in reasoning as `--tailwind`/`--bootstrap`/etc., since Generate never receives the seed itself). Omitting `--framework` (or passing anything other than `react-native`) simply skips rule 2, rather than guessing.

`AGENTS.md` also points to `foundations-rules.md` and `design.md` (see `pipeline-plan.md`, "Agent rule files"). `CLAUDE.md` and `.cursor/rules` are thin mirrors of it — not built yet, not separate contracts.

### `design.md` (flagged, deferred)

`design.md` is already referenced structurally elsewhere in the pipeline (see `pipeline-plan.md`, "design.md" and "Agent rule files") as the project-specific companion to `foundations-rules.md` — generated per project, pointing an agent at this project's actual tokens, resolved presets, and component variants, rather than universal rules. That it should exist is settled.

**Its actual contract — what sections it has, exactly what gets pulled from the token spec to populate it — is not defined yet, on purpose.** It isn't required for the pipeline to run: nothing else in the pipeline depends on its content the way `promote`/`push` depend on the naming conventions above. Flagged here as a good addition for a more solid product, to design once the rest of the pipeline is proven out — see `pipeline-plan.md`, "Deferred."

`cli/src/generate/project-docs.ts` writes a minimal placeholder `design.md` on every `generate` run in the meantime (a title plus pointers to `AGENTS.md`/`foundations-rules.md`) — purely so `AGENTS.md`'s pointer to it resolves to a real file, not a design decision about its eventual content.

## Seeds we actually have

No real end-user project yet, but seed input and Promote have both been exercised for real — this is no longer purely design work with no live run behind it. Covered so far: a full `SDSGT-start` skill walkthrough (colors, fonts, all preset picks, disclosure steps) run end to end into a real `promote` call, plus a deliberate QA pass across all 4 design languages (Tailwind/Bootstrap/MD3/MD2 — Bootstrap and MD2 had no prior coverage at all until that pass), mismatched preset combinations, light/dark/both modes, secondary color/font present and absent, and edge cases (an achromatic brand color, missing/malformed config files). Two real bugs were found and fixed this way (an achromatic-brand hue tint bleeding into brand-tinted neutrals, and a `report.html` layout wrap at narrow grid columns) — see `cli/src/promote/index.ts` and `cli/src/report/index.ts` history.

No seed values are kept here or anywhere in the repo, by design — `cli/seeds/` (where a real run's config lands) is gitignored, since those are a given project's own data, not the tool's. Once a real end-user project runs through this, its seeds live in that project's own generated token spec, not in this planning doc.

---

Source of the categories and status above: `pipeline-plan.md`, sections "How generation actually works," "What actually needs to get built," and "Still open." Rationale and history behind every decided value: `contracts-proposals.md`.
