---
name: SDSGT-start
description: Use when the user wants to start a new SDSGT project, run the seed-input flow, or generate design tokens by answering brand color/font/preset questions in chat. Triggers on "/SDSGT-start", "start a new design system", "run the seed input", "generate tokens", or similar. This is the conversational front end over the `cli/` promote pipeline — see the project's CLAUDE.md, "Tool architecture."
---

# SDSGT-start: seed input → promote → (Figma push) → generate

This skill is the conversational front end described in `pipeline-plan.md`
("The CLI core, not inside any single agent's instructions"). It does not
contain the pipeline's logic — it just holds the conversation with the user,
one question at a time, assembles the answers into a seed config JSON that
matches `cli/src/types/seed-config.ts`, and then runs the real logic by
calling the CLI: `node src/cli.ts promote`, then — after showing the result
and getting the user's go-ahead — `node src/cli.ts generate`. If the user
chose `Figma-managed` (row 5), it also delegates to the `SDSGT-figma-push`
skill right after `promote`, to push that run's tokens into their Figma
file.

**This skill drives `promote`, an optional Figma push, and `generate`, with
a confirmation gate between the second and third.** Scaffolding and
component styling are not built yet — see "Known gaps," below, for exactly
which questions are collected now but not yet acted on. `generate` needs no
new *seed* input when it runs — everything it requires (`targetFramework`,
`targetDesignLanguage`) was already collected in rows 2/3 of the question
table — but the skill still stops and asks the user whether to actually run
it, right after showing them Promote's result (and running the Figma push,
if applicable). See "Running the flow," steps 6–9 (plus 7a), for the exact
sequence and flag mapping.

Both steps write a self-contained visual HTML report, and — unlike an
earlier version of this skill — **both get shown to the user**, just at
different points in the flow: `promote` writes `report.html` (platform-
agnostic — see its own top-of-page banner) and it's sent right after step 6
finishes, before the generate/no-generate question gets asked. `generate`
writes `<platform>-design-system-demo.html` (adapted to the user's actual
chosen framework/design language — same banner treatment, different
wording) and it's sent after step 8's confirmed `generate` run, alongside
direct links to the other files `generate` wrote (`AGENTS.md`,
`foundations-rules.md`, `design.md`). See "Running the flow," steps 7 and 9.

This skill's own job in both reports is just fonts: neither `promote` nor
`generate` ever touches the network, so they default to a system-font
fallback for whatever fonts were picked — see "Fetching fonts," below, for
how this skill fetches the real font files and passes them to `promote` via
`--fonts-dir` so the reports render in the actual chosen fonts.

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
| 2 | Which framework/platform? | Menu — `Next.js` (React, web) / `Vue.js` (web) / `React Native (Expo)` / `Kotlin` (Jetpack Compose, native Android) / `SwiftUI` (native iOS) | Fixed list. Selecting one marks a suggested Component library in row 4 (see "Suggestion logic," below). `promote` doesn't branch on this — every token preset it writes is platform-agnostic DTCG JSON. `generate` does read it, though, to pick between `--swiftui` and everything else, and to set `--framework` — see "Running the flow," step 8. | `targetFramework` |
| 3 | Which design language? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Marks Type-scale (row 13), Spacing (row 14), Border-roundness (row 15), Shadows (row 18), and Component library (row 4) as "(Suggested)" further down — see "Suggestion logic." Not read by `promote` — each preset choice below is independent, this just seeds their defaults. `generate` does read it, to pick which platform flag to pass (`--tailwind`/`--bootstrap`/`--md2`/`--md3`) — see "Running the flow," step 8. | `targetDesignLanguage` |
| 4 | Which component library? | Menu, filtered by framework + design language — see "Suggestion logic" | **Not yet a `SeedConfig` field.** Neither `promote` nor `generate` consumes it yet — it's Layer 2 (component library theming) work, not started. Ask it anyway (per `pipeline-plan.md`, seed input is where this gets collected) and record it in the session summary, but tell the user plainly it has no effect on today's output. | *(none yet)* |
| 5 | Manage tokens via Figma, or code only? | Menu — `Figma-managed` / `Code-only` | `pipeline-plan.md` says this is meant to be asked at Generate, not seed input — but `SeedConfig.figmaManaged` is a required field today, so ask it now as a stand-in until Generate is its own step. | `figmaManaged` (boolean) |
| 5a | *(only if row 5 = `Figma-managed`)* Paste the Figma file link to push tokens into | In chat — a Figma URL | Must actually look like a Figma URL (`figma.com/design/...` or `figma.com/file/...`) — if what's pasted doesn't parse as one, say so and ask again rather than guessing a file key out of it. Not asked at all if row 5 = `Code-only`. See "Running the flow," step 7a, for when this actually gets used — pushing happens right after `promote`, using this link, not at seed-input time. | `figmaFileUrl` (string, optional — only set when row 5 is `Figma-managed`) |
| 5b | *(only if row 5 = `Figma-managed`)* Which Figma MCP should the push use? | Menu — `Official Figma MCP` / `Southleft MCP` | A real choice, collected for real — but say plainly, right after they answer, that **during this internal-testing phase the push always runs through the Southleft MCP regardless of which one is picked.** Official Figma MCP is a real, confirmed integration (`mcp.figma.com`, OAuth-gated), it's just never been exercised from this project, so nothing runs against it yet — same "ask it anyway, disclose the gap" treatment as row 4's component library. Not asked at all if row 5 = `Code-only`. See "Running the flow," step 7a. | `figmaMcp` (`"official"` \| `"southleft"`, optional — only set when row 5 is `Figma-managed`) |
| 5c | *(only if row 5 = `Figma-managed`)* Is that Figma file on a free plan or a paid plan? | Menu — `Free plan` / `Paid plan` | Unlike row 5b, **this one actually changes what gets built**: on a free plan, Figma caps a variable collection at one mode with no error raised, so the push uses two separate collections (`Tokens - Light`/`Tokens - Dark`) instead of one collection with two real modes. Only matters if row 6 ends up being `Both Light and Dark mode` — say so if the user seems unsure why this is being asked before row 6. If they don't know which plan they're on, tell them to check figma.com/files → their workspace name → look for "Free"/"Professional"/"Organization"/"Enterprise" in the plan badge, rather than guessing for them. Not asked at all if row 5 = `Code-only`. See "Running the flow," step 7a. | `figmaPlan` (`"free"` \| `"paid"`, optional — only set when row 5 is `Figma-managed`) |
| 6 | Light mode, dark mode, or both? | Menu — `Light Mode only` / `Dark mode only` / `Both Light and Dark mode` | Decides which `color.semantic.*.json` file(s) get written. If Figma-managed and row 6 isn't `Both`, mention that row 5c's answer ends up not mattering — a single mode never reaches the collection-count question at all. | `lightDarkMode` (`"light"` \| `"dark"` \| `"both"`) |
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

- **`componentLibrary`, `scaffoldMode`** — both collected, but nothing reads
  them yet (`promote()` doesn't, and `generate` doesn't either — component
  library theming is Layer 2 work, not started, and scaffolding has no
  `create-next-app`-style step built). Say plainly that picking `Scaffold`
  today doesn't trigger any scaffolding.
- **`figmaManaged` now DOES have a real effect** — unlike the two fields
  above, this is no longer a stored-for-later field. When it's
  `Figma-managed`, row 5a's Figma link gets used right after `promote`
  finishes (see "Running the flow," step 7a) to push the generated tokens
  into that file as variables/styles, via the `SDSGT-figma-push` skill.
  This needs the user to have Figma Desktop open with the Desktop Bridge
  plugin running and connected to that file — it's a real, human-in-the-
  loop step, not a background operation, and it can fail if that
  connection isn't live (see the push skill's own "Verify the connection"
  step). `targetFramework`/`targetDesignLanguage` are also wired up now,
  driving `generate`'s platform flag — see below.
- **`figmaMcp` (row 5b) is collected but currently pinned, not branched
  on.** Whatever the user picks, `SDSGT-figma-push` always executes via the
  Southleft MCP during this internal-testing phase — say so plainly right
  after they answer row 5b, don't wait until the push step to surface it.
  This isn't a placeholder field like `componentLibrary`/`scaffoldMode`
  above (the choice is real, and the official Figma MCP genuinely exists —
  `mcp.figma.com`, OAuth-gated) — it's a deliberate, disclosed pin: nothing
  has ever verified what that server's real tools look like post-auth from
  this project, so nothing is built against it, and no OAuth flow gets
  triggered on the strength of this seed answer alone (starting one
  requires the user's own explicit go-ahead in the moment, separately —
  see the push skill's own notes on this). **🚩 This pin is an
  internal-testing-only shortcut, flagged in `pipeline-plan.md`'s
  "Pre-launch validation" as a must-fix before public release** — asking a
  real user to choose and then ignoring their answer isn't acceptable past
  this phase. Don't quietly let this stay the permanent behavior.
- **Which `generate` platform flag gets used is derived from `targetFramework`/
  `targetDesignLanguage` — see "Running the flow," step 8, for the exact
  rule.** All five Generate targets are built, each with its own decided,
  real-source-verified version target (see "Generators" in
  `pipeline-plan.md` for the verification detail behind each):
  Tailwind v4 (`--tailwind`, CSS `@theme` block, not
  `tailwind.config.js`/`.ts`), Bootstrap 5.3 (`--bootstrap`, a Sass
  `_variables.scss` partial — `$primary`/`$secondary`/`$success`/`$danger`/
  `$warning`/`$info` plus a few `$border-radius-*` variables), MUI 9.x
  (`--md2`, a relabeled `colors.ts` ramp plus a derived `palette.ts` —
  `main`/`light`/`dark`/`contrastText`, computed with MUI's own real
  formula), Jetpack Compose Material3 1.4.0 (`--md3`, a Kotlin `Color.kt`
  with a real HCT-derived `LightColorScheme`/`DarkColorScheme` via Google's
  Material Color Utilities, plus precomputed elevation overlays), and
  SwiftUI (`--swiftui`, no version pin needed — a Swift `DesignTokens.swift`
  with the resolved semantic color tokens as native `Color` values, split
  into `DesignTokens.Light`/`DesignTokens.Dark`).
  Whichever platform flag gets passed also writes a matching
  `<platform>-design-system-demo.html` proof-of-work page (e.g.
  `tailwind-v4-design-system-demo.html`) next to its code files — same
  visual template as `report.html`, relabeled with that platform's real
  generated identifiers, and flagged at the top of the page as adapted to
  that specific platform (versus `report.html`'s own top-of-page flag that
  it's platform-agnostic). Every `generate` run also writes `AGENTS.md` and
  `foundations-rules.md` unconditionally (plus a placeholder `design.md`,
  since its real content contract isn't decided yet) — always pass
  `--framework <targetFramework>` too (same five string values as
  `SeedConfig.targetFramework` itself), so `AGENTS.md`'s NativeWind rule is
  included correctly for a React Native + Tailwind project (it's otherwise
  silently omitted, not guessed).
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
6. Run, from the `cli/` directory (quote `--out` — the default output folder
   names have spaces in them, and so will these per-project ones):
   ```
   node src/cli.ts promote --config seeds/<short-project-slug>.json --out "out/DTCG Token spec (non-consumables)/<short-project-slug>" --fonts-dir seeds/<short-project-slug>-fonts
   ```
   Omit `--fonts-dir` if step 5 didn't produce any font files. If this
   fails, stop here and report the error — there's nothing to show and no
   seed to run `generate` against.
7. Report back in plain language: how many token files were written and
   where, plus any accessibility warnings translated out of the raw
   `contrast X:1, needs Y:1` format into a sentence explaining which pair is
   too low-contrast and by how much. Warnings are advisory only — Promote
   never blocks generation over one, and status colors specifically aren't
   checked against their own light tint at all (see "Accessibility checks
   are advisory, not a gate" in `pipeline-plan.md`) — so don't imply a
   passing/failing gate exists. Mention whether the report is showing the
   real fonts or a system fallback. Then send `report.html` to the user with
   `SendUserFile` (`status: "normal"`, `display: "render"`).
7a. *(Only if row 5 = `Figma-managed`)* Push the tokens `promote` just wrote
    into the Figma file from row 5a, using the `SDSGT-figma-push` skill —
    invoke it with `tokensDir` (the same `--out` path from step 6),
    `figmaFileUrl` (row 5a's answer), `figmaMcp` (row 5b's answer), and
    `figmaPlan` (row 5c's answer). That skill is the one that actually
    applies the "always Southleft during internal testing" pin (row 5b's
    disclosure) and the free/paid collection-structure decision (row 5c) —
    pass the real answers through rather than hardcoding either here, so
    each decision lives in exactly one place. This happens now, right after
    `promote`, not after `generate` — the pushed tokens are Promote's
    output (the DTCG spec), independent of which code-token platform gets
    generated later. That skill handles its own connection check and will
    ask the user to open Figma Desktop with the Desktop Bridge plugin
    running if it isn't already connected — don't try to work around a
    failed connection yourself (e.g. by guessing at a REST API call); there
    isn't one available for this (see that skill's file header). Report
    back what it reports back (variables/styles created, which collection
    structure Figma's plan allowed), then continue to step 8 regardless of
    whether the push succeeded — a failed or skipped Figma push doesn't
    block the rest of the flow, same "optional module" treatment Figma has
    everywhere else in this pipeline.
8. Ask the user, with `AskUserQuestion`, whether to continue on to
   `generate` now — e.g. "Ready to generate the code tokens for
   `<targetFramework>` + `<targetDesignLanguage>`?", options `Yes, generate
   now` / `Not yet`. This step needs a real answer, unlike the row 10/16/19/
   20 disclosures — don't proceed on a timeout or assumption (see the
   user's global "Working with questions" instructions: re-post the same
   question rather than guessing if it times out). If the user picks `Not
   yet`, stop here — mention that `generate` can be run later with the
   command shown below once they're ready, and don't run it in this
   session.
   If they confirm, run `generate` — no new questions needed beyond the
   confirmation itself, since everything it requires (`targetFramework`,
   `targetDesignLanguage`) is already sitting in the seed from rows 2/3.
   Pick the platform flag:
   - `targetFramework` is `swiftui` → `--swiftui` (native iOS has its own
     generator, independent of whatever design language was picked in row 3
     purely for preset values).
   - Otherwise, whichever flag matches `targetDesignLanguage`: `tailwind` →
     `--tailwind`, `bootstrap` → `--bootstrap`, `md2` → `--md2`, `md3` →
     `--md3`.
   Always also pass `--framework <targetFramework>` (the exact same string
   value already sitting in the seed) — this is what lets `AGENTS.md`'s
   NativeWind rule apply correctly for a React Native + Tailwind project;
   it's a no-op for every other target. Note: `generate` has no `--fonts-dir`
   flag today, so the demo HTML this step produces always renders its type
   specimens in the system-font fallback, even if step 5 fetched real font
   files for `promote`'s `report.html` — a known inconsistency between the
   two reports, not something to try to work around here.
   ```
   node src/cli.ts generate --tokens-dir "out/DTCG Token spec (non-consumables)/<short-project-slug>" --out "out/Code tokens (consumables)/<short-project-slug>" --<platform-flag> --framework <targetFramework>
   ```
   If this fails, don't lose the promote result over it — the token spec
   from step 6 still exists either way — just say plainly that code-token
   generation hit an error, quoting the message, rather than silently
   dropping it or retrying on your own judgment.
9. Report back in plain language: which code-token files were written and
   where. Then send two things to the user:
   - The `<platform>-design-system-demo.html` file with `SendUserFile`
     (`status: "normal"`, `display: "render"`) — this is Generate's own
     proof-of-work page, shown the same way `report.html` was in step 7,
     but adapted to the actual chosen framework/design language rather than
     `report.html`'s platform-agnostic view (each page says so at the top —
     see `report/html-utils.ts`'s `stageBannerHtml`).
   - `AGENTS.md`, `foundations-rules.md`, and `design.md` — the other
     contracts `generate` wrote alongside the code tokens — with a second
     `SendUserFile` call (`status: "normal"`, `display: "attach"`, all
     three files together), so the user has direct links to them rather
     than just a folder path. Briefly say what each is for: `AGENTS.md` is
     the canonical rules file a coding agent should read before touching
     this project's UI code; `foundations-rules.md` is the universal
     accessibility/UX rules; `design.md` is a placeholder today (its real
     content contract isn't decided yet — see `pipeline-plan.md`,
     "design.md").

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
