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
| Figma-managed vs. code-only tokens    | Yes/no, asked at Generate                                                                                                                                                                                                                                                                                           | Choice decided; no Figma implementation yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
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
| Naming & structure conventions (token-side)                       | **Built** — every token `promote` writes uses this grammar. The Figma-side half (matching a Figma variable name back to a token, collection naming) is a separate, still-undesigned piece — see "Naming & structure conventions" in `pipeline-plan.md`. |
| Preset library (actual token files behind the preset menus above) | **Built** — `cli/src/presets/`, all 4 design languages × 5 groups, tested including MD3/MD2 edge cases. See the per-group sections below (Color primitives through Fixed defaults). |
| Fixed defaults (breakpoints, grid)                                | **Built** — `cli/src/defaults/`, see "Fixed defaults" below. |
| `foundations-rules.md`                                            | Decided (not yet built) — see "`foundations-rules.md` content" below. |
| Agent rules template (`AGENTS.md`)                                | Decided (not yet built) — see "`AGENTS.md` template content" below. |
| `design.md` template                                               | Flagged, not decided — deferred, not required for the pipeline to work. See "`design.md` (flagged, deferred)" below. |

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

**Figma-name mapping:** replace `.` with `/` writing to Figma; replace `/` with `.` reading back.

**Collection naming** (free-plan, two-collection case): `Tokens - Light` / `Tokens - Dark` (space-dash, not slash).

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

| Our step | Tailwind (shadcn/ui, shadcn-vue, RNR) | Bootstrap | MD2 (MUI, Vuetify, RN Paper) |
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

Bootstrap reads only the base step (`600`) as `$primary`/`$secondary`; its own Sass derives tints/shades from there. MD3 discards this table entirely — its generator computes a real HCT tonal palette + `ColorScheme` directly from the semantic base color instead (generator-layer work, not a spec relabel). SwiftUI reads semantic tokens directly.

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

(px, at 16px root.) `radius.full` = `9999` uniformly across every preset including Bootstrap — the spec holds one canonical value; the Bootstrap generator is free to express it as `border-radius: 50rem` / `.rounded-pill` in the real generated Sass.

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

MD3's elevation isn't a pure shadow — the MD3 generator also derives a tonal surface-color overlay from the semantic surface + primary colors at generation time; that overlay isn't a spec-level value.

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

`AGENTS.md` also points to `foundations-rules.md` and `design.md` (see `pipeline-plan.md`, "Agent rule files"). `CLAUDE.md` and `.cursor/rules` are thin mirrors of it, not separate contracts.

### `design.md` (flagged, deferred)

`design.md` is already referenced structurally elsewhere in the pipeline (see `pipeline-plan.md`, "design.md" and "Agent rule files") as the project-specific companion to `foundations-rules.md` — generated per project, pointing an agent at this project's actual tokens, resolved presets, and component variants, rather than universal rules. That it should exist is settled.

**Its actual contract — what sections it has, exactly what gets pulled from the token spec to populate it — is not defined yet, on purpose.** It isn't required for the pipeline to run: nothing else in the pipeline depends on its content the way `promote`/`push` depend on the naming conventions above. Flagged here as a good addition for a more solid product, to design once the rest of the pipeline is proven out — see `pipeline-plan.md`, "Deferred."

## Seeds we actually have

No real end-user project yet, but seed input and Promote have both been exercised for real — this is no longer purely design work with no live run behind it. Covered so far: a full `SDSGT-start` skill walkthrough (colors, fonts, all preset picks, disclosure steps) run end to end into a real `promote` call, plus a deliberate QA pass across all 4 design languages (Tailwind/Bootstrap/MD3/MD2 — Bootstrap and MD2 had no prior coverage at all until that pass), mismatched preset combinations, light/dark/both modes, secondary color/font present and absent, and edge cases (an achromatic brand color, missing/malformed config files). Two real bugs were found and fixed this way (an achromatic-brand hue tint bleeding into brand-tinted neutrals, and a `report.html` layout wrap at narrow grid columns) — see `cli/src/promote/index.ts` and `cli/src/report/index.ts` history.

No seed values are kept here or anywhere in the repo, by design — `cli/seeds/` (where a real run's config lands) is gitignored, since those are a given project's own data, not the tool's. Once a real end-user project runs through this, its seeds live in that project's own generated token spec, not in this planning doc.

---

Source of the categories and status above: `pipeline-plan.md`, sections "How generation actually works," "What actually needs to get built," and "Still open." Rationale and history behind every decided value: `contracts-proposals.md`.
