---
name: SDSGT-start
description: Use when the user wants to start a new SDSGT project, run the seed-input flow, or generate design tokens by answering brand color/font/preset questions in chat. Triggers on "/SDSGT-start", "start a new design system", "run the seed input", "generate tokens", or similar. This is the conversational front end over the `cli/` promote pipeline — see the project's CLAUDE.md, "Tool architecture."
---

# SDSGT-start: seed input → promote

This skill is the conversational front end described in `pipeline-plan.md`
("The CLI core, not inside any single agent's instructions"). It does not
contain the pipeline's logic — it just holds the conversation with the user,
one question at a time, assembles the answers into a seed config JSON that
matches `cli/src/types/seed-config.ts`, and then runs the real logic by
calling the CLI (`node src/cli.ts promote`).

**Today this skill only drives `promote`** (token generation). Scaffolding,
component styling, agent-rules writing, and the Figma push are not built yet
— see "Known gaps," below, for exactly which questions are collected now but
not yet acted on. `promote` writes a `report.html` alongside the token JSON
on every run — a self-contained visual "proof of work" a human can open
without reading JSON. This skill's own job in that report is just fonts:
`promote` never touches the network, so the report defaults to a system-font
fallback for whatever fonts were picked — see "Fetching fonts," below, for
how this skill fetches the real font files and passes them to `promote` via
`--fonts-dir` so the report renders in the actual chosen fonts.

## The question table

This is the editable source of truth for the conversation flow. Same shape
as the "Seed inputs" table in `contracts-and-seeds.md` — edit rows here to
change what gets asked, in what order, with what options. Keep this table
and that one in sync if you change something structural (e.g. a new preset
option) — `contracts-and-seeds.md` is the planning doc of record; this table
is that plan's implementation in the actual conversation.

| # | Question to ask | Options / channel | Notes & disclosures | → `SeedConfig` field |
|---|---|---|---|---|
| 1 | Full new project, or just the design-system files? | Menu — `Scaffold` / `Design system files only` | Framework is still asked next either way — see row 2. Scaffolding itself isn't built yet (no `create-next-app`-style step exists in the CLI today); this answer is recorded but has no effect on `promote`'s output right now. | `scaffoldMode` (`"scaffold"` \| `"files-only"`) |
| 2 | Which framework/platform? | Menu — `Next.js` (React, web) / `Vue.js` (web) / `React Native (Expo)` / `Kotlin` (Jetpack Compose, native Android) / `SwiftUI` (native iOS) | Fixed list. Selecting one marks a suggested Component library in row 4 (see "Suggestion logic," below). `promote` doesn't branch on this yet — every current preset is platform-agnostic DTCG JSON. | `targetFramework` |
| 3 | Which design language? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Marks Type-scale (row 13), Spacing (row 14), Border-roundness (row 15), Shadows (row 18), and Component library (row 4) as "(Suggested)" further down — see "Suggestion logic." This field itself isn't read by `promote`; each preset choice below is independent, this just seeds their defaults. | `targetDesignLanguage` |
| 4 | Which component library? | Menu, filtered by framework + design language — see "Suggestion logic" | **Not yet a `SeedConfig` field.** `promote` doesn't consume it — it's a Generate-stage input and Generate isn't built. Ask it anyway (per `pipeline-plan.md`, seed input is where this gets collected) and record it in the session summary, but tell the user plainly it has no effect on today's output. | *(none yet)* |
| 5 | Manage tokens via Figma, or code only? | Menu — `Figma-managed` / `Code-only` | `pipeline-plan.md` says this is meant to be asked at Generate, not seed input — but `SeedConfig.figmaManaged` is a required field today, so ask it now as a stand-in until Generate is its own step. No Figma push is built yet either way, so `Figma-managed` has no visible effect today. | `figmaManaged` (boolean) |
| 6 | Light mode, dark mode, or both? | Menu — `Light Mode only` / `Dark mode only` / `Both Light and Dark mode` | Decides which `color.semantic.*.json` file(s) get written. | `lightDarkMode` (`"light"` \| `"dark"` \| `"both"`) |
| 7 | Primary brand color? | `#hex` in chat, or a screenshot | If illegible, ambiguous (e.g. two colors given and it's unclear which is primary vs. secondary), or otherwise not directly readable — ask, don't assume. | `primaryColor` |
| 8 | Secondary brand color? (optional) | `#hex` in chat, or a screenshot | Same clarification rule as row 7. Skip if the user has none. | `secondaryColor` |
| 9 | Neutral grays: brand-tinted or pure gray? | Menu — `Brand-tinted` / `Pure achromatic gray` | Brand-tinted = faint hint of the brand hue at 50% lightness; pure gray = 0% saturation. Full formula in `contracts-and-seeds.md`, "Neutral base." | `neutralColorStyle` (`"brand-tinted"` \| `"pure-gray"`) |
| 10 | Disclosure: status colors are fixed | Two options — `Continue` / `Why isn't this a choice?` | No real choice — always the boilerplate status palette (fixed hue per role, brand-independent). A brand-derived variant (nudging status hues toward the brand color) was considered and dropped, not deferred — there's no plan to add it back. | *(not in `SeedConfig` — hardcoded in `cli/src/color/status.ts`)* |
| 11 | Primary font family? | In chat, or a screenshot | Google Fonts only. Include the link https://fonts.google.com so the user can browse, pick a font, then come back and type the name — don't expect them to already know one. If the user names a non-Google font, say so and ask them to pick a Google Font — never silently substitute. Once collected, this is one of the fonts fetched later — see "Fetching fonts," below. | `primaryFont` |
| 12 | Secondary font family? (optional) | In chat, or a screenshot | Same Google-Fonts-only rule as row 11 — include the https://fonts.google.com link here too. State before the user confirms: this font covers `body*`/`caption` roles; primary covers `heading-*`/`display`. Left blank, primary is used everywhere. | `secondaryFont` |
| 13 | Type-scale preset? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Recommend ("Suggested") whichever was picked in row 3. Show the actual px scale before asking — table in `contracts-and-seeds.md`, "Type-scale." | `typeScalePreset` |
| 14 | Spacing preset? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Recommend the row-3 match. **If MD3 or MD2 is picked, say plainly that spacing runs on Tailwind's scale under the hood** — neither MD3 nor MD2 has its own named spacing scale. Show the key→px table (`contracts-and-seeds.md`, "Spacing") so the index-vs-pixel distinction (`spacing.4` = 16px, not 4px) isn't a surprise later. | `spacingPreset` |
| 15 | Corner-roundness preset? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Recommend the row-3 match. Show the px scale (`contracts-and-seeds.md`, "Radius"). | `radiusPreset` |
| 16 | Disclosure: border width is fixed | Two options — `Continue` / `Why isn't this a choice?` | No real choice — always the Tailwind scale (0/1/2/4/8px). Shown as its own step (not folded into the final summary) so the user actually reads it before moving on, rather than it passing by silently. | *(not in `SeedConfig` — hardcoded default in `cli/src/defaults/`)* |
| 17 | Opacity preset? | Menu — `Tailwind` / `Bootstrap` only | Neither Material Design variant has a preset opacity scale — say so if the user picked MD3/MD2 in row 3, since there's no "(Suggested)" match here. | `opacityPreset` (`"tailwind"` \| `"bootstrap"`) |
| 18 | Shadow preset? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Recommend the row-3 match. Show the scale (`contracts-and-seeds.md`, "Shadow"). | `shadowPreset` |
| 19 | Disclosure: breakpoints are fixed | Two options — `Continue` / `Why isn't this a choice?` | No real choice — always Tailwind's breakpoints. Shown as its own step for the same reason as row 16. | *(not in `SeedConfig` — hardcoded default)* |
| 20 | Disclosure: column/grid system is fixed | Two options — `Continue` / `Why isn't this a choice?` | No real choice — always Material Design 3's grid recipe, regardless of design language; tiers switch at Tailwind's breakpoints, not MD3's native dp thresholds. Shown as its own step for the same reason as row 16. | *(not in `SeedConfig` — hardcoded default)* |

## Suggestion logic (rows 2–4)

Component library options, filtered by framework, then marked "(Suggested)"
by design language:

| Framework | Options | Tailwind → | Bootstrap → | MD3/MD2 → |
|---|---|---|---|---|
| Next.js | `shadcn/ui` / `MUI` / `React-Bootstrap` | `shadcn/ui` | `React-Bootstrap` | `MUI` |
| Vue.js | `shadcn-vue` / `Vuetify` / `bootstrap-vue-next` | `shadcn-vue` | `bootstrap-vue-next` | `Vuetify` |
| React Native (Expo) | `react-native-reusables (RNR)` / `React Native Paper` | `RNR` | *(no match — fall back to RNR)* | `React Native Paper` |
| Kotlin | `Jetpack Compose Material3` (only option) | — | *(unavailable)* | — |
| SwiftUI | `SwiftUI native components` (only option) | — | *(unavailable)* | — |

Bootstrap has no React Native/Kotlin/iOS option — if Bootstrap is picked in
row 3 for one of those frameworks, say the library suggestion is
unavailable for that combination rather than guessing.

For rows 13/14/15/18 (type-scale, spacing, radius, shadow), "(Suggested)"
just means: pre-select whatever was picked in row 3, but let the user
override any of the four independently — they don't have to move together.

## Known gaps (say these to the user, don't paper over them)

- **`componentLibrary`, `figmaManaged`, `scaffoldMode`, `targetFramework`,
  `targetDesignLanguage`** — all collected, but `promote()` only actually
  reads: `primaryColor`, `secondaryColor`, `neutralColorStyle`,
  `lightDarkMode`, `typeScalePreset`, `spacingPreset`, `radiusPreset`,
  `opacityPreset`, `shadowPreset`, `primaryFont`, `secondaryFont`. The rest
  are stored for when Generate/scaffold/Figma-push get built — say plainly
  that picking `Scaffold` or `Figma-managed` today doesn't yet trigger
  scaffolding or a Figma push.
- **`AskUserQuestion` requires at least 2 options per question.** A
  single-option "just click Continue" question is invalid and will error.
  Every disclosure row (10, 16, 19, 20) uses `Continue` /
  `Why isn't this a choice?` as its two options for exactly this reason —
  don't collapse them back down to one option.

## Running the flow

1. Ask the questions from the table above, in order. Use `AskUserQuestion`
   for menu-pick rows; plain chat for free-text rows (hex colors, fonts).
   Apply the clarification rules in rows 7/8/11/12 rather than guessing.
   For the disclosure rows (10, 16, 19, 20), use `AskUserQuestion` with two
   options, `Continue` and `Why isn't this a choice?` — `AskUserQuestion`
   requires at least 2 options, so a single-option "just click Continue"
   question isn't valid. The point is still to make the user actually read
   the fixed-default explanation before moving on, not to collect a real
   answer — if they pick `Why isn't this a choice?`, explain briefly (using
   the row's Notes column) and then move to the next row.
2. Once every row is answered, show the user a plain-language summary of
   every real choice made (rows with an actual `SeedConfig` field) and
   confirm before writing anything. The disclosure rows don't need to be
   repeated here — they were already read and acknowledged in place.
3. Build a JSON object shaped like `cli/src/types/seed-config.ts`'s
   `SeedConfig` (see `cli/examples/sample-seed-config.json` for a filled-in
   reference), using the field mappings in the table's last column. Include
   the not-yet-consumed fields too (`componentLibrary` isn't a real
   `SeedConfig` key — note it in the summary only, don't invent a key for
   it).
4. Write that JSON to `cli/seeds/<short-project-slug>.json` (create the
   `cli/seeds/` directory if it doesn't exist yet — keep it separate from
   `cli/examples/`, which holds the tool's own sample configs, not real
   projects).
5. Fetch the real font files for `primaryFont` (and `secondaryFont`, if set)
   — see "Fetching fonts," below — so the report renders in the actual
   chosen fonts instead of falling back to a system font. Not fatal if this
   fails (no network, font not found): skip it and continue: `promote` still
   runs fine without font files, the report just falls back to its default
   system-font stack.
6. Run, from the `cli/` directory:
   ```
   node src/cli.ts promote --config seeds/<short-project-slug>.json --out out/tokens/<short-project-slug> --fonts-dir seeds/<short-project-slug>-fonts
   ```
   Omit `--fonts-dir` if step 5 didn't produce any font files.
7. Report back in plain language: how many token files were written and
   where, plus any accessibility warnings translated out of the raw
   `contrast X:1, needs Y:1` format into a sentence explaining which pair is
   too low-contrast and by how much. Warnings are advisory only — Promote
   never blocks generation over one, and status colors specifically aren't
   checked against their own light tint at all (see "Accessibility checks
   are advisory, not a gate" in `pipeline-plan.md`) — so don't imply a
   passing/failing gate exists. Mention whether
   `report.html` is showing the real fonts or a system fallback.

## Fetching fonts

`promote` itself never touches the network (see "Known gaps" — determinism
is a project-wide goal, and a CLI step that fetches from Google Fonts on
every run would make token output depend on network availability). Fetching
real font files is instead something the agent running this skill does,
once, before calling `promote` — the same technique used to build the very
first proof-of-work report for this project:

1. For each font in play (`primaryFont`, and `secondaryFont` if set), fetch
   `https://fonts.googleapis.com/css2?family=<Font+Name>:wght@400;600;700&display=swap`
   with a browser-like `User-Agent` header (Google serves different CSS —
   sometimes missing distinct per-weight files — to unrecognized clients).
   Request each weight in its own separate call
   (`wght@400`, `wght@600`, `wght@700`) rather than all three in one request
   — combined requests have been observed silently returning the same
   regular-weight file for every requested weight.
2. From each response, find the `@font-face` block whose `unicode-range`
   starts with `U+0000-00FF` (the plain "latin" subset, not `latin-ext` or
   any other script) and download the `.woff2` URL it points to.
3. Save each file as `cli/seeds/<short-project-slug>-fonts/<slug>-<weight>.woff2`,
   where `<slug>` is the font name lowercased with non-alphanumeric runs
   collapsed to a single hyphen (e.g. "Source Sans Pro" → `source-sans-pro`).
   This exact naming convention is what `cli.ts`'s `--fonts-dir` flag looks
   for — see `loadFontFiles` in `cli/src/cli.ts`.
4. Only 400/600/700 are ever needed — `typography.primitive.fontWeight`
   never generates any other value. If a font doesn't publish one of those
   weights, skip it; the report leaves that weight on the system fallback.
