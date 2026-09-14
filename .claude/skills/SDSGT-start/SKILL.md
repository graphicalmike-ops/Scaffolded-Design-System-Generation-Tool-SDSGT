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

**This skill drives `promote`, an optional Figma push, `generate`, and —
for Next.js + Tailwind; for Vue.js (both its Tailwind and its Material
Design/Vuetify paths); and for React Native/Expo (both its Tailwind/
NativeWind and its Material Design/React Native Paper paths), so far — a
real `scaffold` step, with a confirmation gate before each of the last two.**
Kotlin and SwiftUI both have no `scaffold` step (no official non-interactive
CLI exists to drive at all for either — Android/Compose and Xcode/SwiftUI
were checked independently, same real conclusion both times, see "Known
gaps," below, and step 9) but neither is a "nothing built" gap: `generate
--md3`/`--swiftui` each always write a real, filled-in setup guide instead.
Layer 3 now has a real answer — automated or guide — for every framework
this tool supports. Component-library support is theme-only everywhere *except* shadcn/ui
on a Next.js + Tailwind scaffold, shadcn-vue on a Vue.js + Tailwind
scaffold, and RNR on a React Native + Tailwind scaffold — those three
combinations vendor real component source (via each library's own CLI,
each non-interactive) with a customization-safety manifest, not just a
theme file. RNR's own path there took an extra step — its `init` is
genuinely still a blocked interactive wizard — but its `add` command runs
standalone once this pipeline writes a real `components.json` and commits
the git tree, both handled automatically (see "Known gaps," below, for the
full story). Vuetify on a Vue.js + Material Design scaffold, and React
Native Paper on a React Native + Material Design scaffold, are a different
real-installation case again — not vendored source (neither is a
copy-paste library), but a real `npm install vuetify`/`react-native-paper`
plus real `createVuetify()`/`PaperProvider` wiring into the generated
project, not just a theme file sitting in `out/`. Every other library (MUI,
React-Bootstrap, etc.) is still theme-only, no real component source
vendored, no real install run —
**RNR specifically was re-investigated for real vendoring this same session
(now that a real React Native scaffold exists) and is still blocked**, a
genuinely separate reason from before (its own CLI's `init` is a live
interactive menu with no flag to skip it — not just "no project to install
into" anymore, that half is now resolved). `generate` needs no new *seed* input when it runs — everything it requires
(`targetFramework`, `targetDesignLanguage`, `componentLibrary`) was already
collected in rows 2/3/4 of the question table — but the skill still stops
and asks the user whether to actually run it, right after showing them
Promote's result (and running the Figma push, if applicable). See "Running
the flow," steps 6–10
(plus 7a), for the exact sequence and flag mapping.

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
| 1 | Full new project, or just the design-system files? | Menu — `Scaffold` / `Design system files only` | Framework is still asked next either way — see row 2. `promote` never reads this either way. Real scaffolding exists for Next.js + Tailwind; for Vue.js (both its Tailwind path and its Material Design/Vuetify path); and for React Native/Expo (both its Tailwind/NativeWind path and its Material Design/React Native Paper path) — see step 10, "Running the flow," and "Known gaps." Kotlin and SwiftUI are both real exceptions, not "no effect" cases: neither has an official scaffolding CLI at all (Android/Compose and Xcode/SwiftUI, checked independently, same conclusion), so `generate` itself always writes a real setup guide (`md3/SCAFFOLD_GUIDE.md` or `swiftui/SCAFFOLD_GUIDE.md`) regardless of this answer — see step 9. Only Bootstrap-flavored combinations still record this answer with genuinely no effect. | `scaffoldMode` (`"scaffold"` \| `"files-only"`) |
| 2 | Which framework/platform? | Menu — `Next.js` (React, web) / `Vue.js` (web) / `React Native (Expo)` / `Kotlin` (Jetpack Compose, native Android) / `SwiftUI` (native iOS) | Fixed list. Selecting one marks a suggested Component library in row 4 (see "Suggestion logic," below). `promote` doesn't branch on this — every token preset it writes is platform-agnostic DTCG JSON. `generate` does read it, though, to pick between `--swiftui` and everything else, and to set `--framework` — see "Running the flow," step 8. | `targetFramework` |
| 3 | Which design language? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Marks Type-scale (row 13), Spacing (row 14), Border-roundness (row 15), Shadows (row 18), and Component library (row 4) as "(Suggested)" further down — see "Suggestion logic." Not read by `promote` — each preset choice below is independent, this just seeds their defaults. `generate` does read it, to pick which platform flag to pass (`--tailwind`/`--bootstrap`/`--md2`/`--md3`) — see "Running the flow," step 8. | `targetDesignLanguage` |
| 4 | Which component library? | Menu, filtered by framework + design language — see "Suggestion logic" | `generate` now reads this. `shadcn/ui` (and `shadcn-vue`), `RNR`, `React Native Paper`, and `Vuetify` each add their own extra flag (`--shadcn`/`--rnr`/`--rn-paper`/`--vuetify`) — for React Native, this is the ONLY flag passed (no base platform flag — see step 8's real exception, below); for every other framework it's additive alongside the base platform flag from row 3. Every other option (`MUI`, `React-Bootstrap`, `bootstrap-vue-next`, `Jetpack Compose Material3`, `SwiftUI native components`) already gets its theming from the base platform flag alone (`--md2`/`--bootstrap`/`--md3`/`--swiftui`) — no extra flag exists or is needed. At `generate` time this only ever affects the *theme* file, regardless of library — whether real component source or a real install also happens depends on whether the project later gets *scaffolded* (row 1) with that same library, and only for five combinations so far (shadcn/ui on Next.js+Tailwind, shadcn-vue on Vue.js+Tailwind, RNR on React Native+Tailwind, Vuetify on Vue.js+Material Design, React Native Paper on React Native+Material Design) — see "Known gaps" for exactly what each does, and step 10 below for when it runs. MUI/React-Bootstrap never go past the theme file today, scaffolded or not. | `componentLibrary` |
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

The menu label the user picks maps to one of `SeedConfig`'s
`ComponentLibrary` string values (`cli/src/types/seed-config.ts`) — use
this exact value for `componentLibrary` in the seed JSON, and see step 8 for
which of these additionally get an extra `generate` flag:

| Menu label | `componentLibrary` value | Extra `generate` flag? |
|---|---|---|
| `shadcn/ui` | `"shadcn"` | `--shadcn` |
| `shadcn-vue` | `"shadcn"` (same value — identical CSS-variable convention) | `--shadcn` |
| `MUI` | `"mui"` | *(none — covered by `--md2`)* |
| `React-Bootstrap` | `"react-bootstrap"` | *(none — covered by `--bootstrap`)* |
| `bootstrap-vue-next` | `"react-bootstrap"` (same value — identical Sass-variable convention) | *(none — covered by `--bootstrap`)* |
| `Vuetify` | `"vuetify"` | `--vuetify` |
| `react-native-reusables (RNR)` | `"rnr"` | `--rnr` |
| `React Native Paper` | `"rn-paper"` | `--rn-paper` |
| `Jetpack Compose Material3` | `"compose-material3"` | *(none — covered by `--md3`)* |
| `SwiftUI native components` | `"swiftui-native"` | *(none — covered by `--swiftui`)* |

For rows 13/14/15/18 (type-scale, spacing, radius, shadow), "(Suggested)"
just means: pre-select whatever was picked in row 3, but let the user
override any of the four independently — they don't have to move together.

## Known gaps (say these to the user, don't paper over them)

- **`scaffoldMode` now DOES have a real effect — for five combinations.**
  Picking `Scaffold` triggers a real `scaffold` step (see step 10, below)
  when `targetFramework`/`targetDesignLanguage` is one of:
  - `nextjs` + `tailwind` — `cli/src/scaffold/nextjs.ts`, driving
    `create-next-app` non-interactively.
  - `vuejs` + `tailwind` — `cli/src/scaffold/vuejs.ts`, driving `create-vue`
    non-interactively (Tailwind wired in by hand, since create-vue has no
    built-in `--tailwind` flag the way `create-next-app` does).
  - `vuejs` + `md3` or `md2` — `cli/src/scaffold/vuejs-vuetify.ts`, a
    genuinely separate pipeline from the other two: drives `create-vuetify`
    instead of `create-vue`, Material Design via Vuetify's own component
    styling instead of Tailwind. (`md3`/`md2` are otherwise MUI/Compose
    territory elsewhere in this table — for Vue.js specifically, either one
    means "Material Design," which routes to Vuetify.)
  - `react-native` + `tailwind` — `cli/src/scaffold/react-native.ts`,
    driving `create-expo-app` non-interactively, then wiring NativeWind v4
    in by hand. **Real, load-bearing exception:** this does NOT use
    `generate`'s own `--tailwind` output — NativeWind v4 has a hard peer
    dependency on Tailwind v3, incompatible with `--tailwind`'s Tailwind
    v4-shaped theme. It uses `--rnr`'s output instead (already
    Tailwind-v3-shaped, since RNR needs the same compatibility). See step 8
    above for the matching generate-flag exception, and
    `docs/layer2-layer3-plan.md`, Subject 5, for the full finding.
  - `react-native` + `md3` or `md2` — `cli/src/scaffold/react-native-paper.ts`,
    a genuinely separate pipeline again: no Tailwind/NativeWind at all,
    drives `create-expo-app` then installs `react-native-paper` for real.
    Same `md3`/`md2` → "Material Design" routing as Vue.js's own MD3/MD2
    handling above.

  See `docs/layer2-layer3-plan.md`, Subjects 3–5, for the full build detail
  on each. Every other framework, and every other framework/design-language
  combination (Next.js with Bootstrap/MD3/MD2, Vue.js with Bootstrap,
  React Native with Bootstrap), still has nothing built — say plainly that
  picking `Scaffold` for those combinations doesn't trigger any scaffolding
  yet.

  **Two real exceptions worth knowing before step 10: `kotlin` and
  `swiftui` are not in the list above, but neither is a plain "nothing
  built" case.** Real research (2026-09-14, both checked independently, on
  a real Xcode 26.4 install for the SwiftUI check — not assumed from docs
  alone) found no official non-interactive scaffolding CLI exists for
  Android/Jetpack Compose OR for Xcode/SwiftUI — not harder than the
  others, structurally different. Instead of a `scaffold` step, `generate
  --md3` and `generate --swiftui` each always write a real, filled-in
  `SCAFFOLD_GUIDE.md` (regardless of `scaffoldMode`) with the user's own
  actual generated values already in it — see step 9 for when these get
  sent, and step 10's own gate for how to talk about them there instead of
  the generic "not built yet" line. SwiftUI's own guide also generates one
  more real file beyond Kotlin's: `swiftui/Theme.swift`, a working
  light/dark-switching wrapper — `generate --swiftui`'s own
  `DesignTokens.swift` is just flat static color constants with no built-in
  way to switch between modes the way Compose's `ColorScheme` or Vuetify's
  theme object do on their own, so this fills that real gap with working
  code, not just prose describing the gap.
- **`componentLibrary` now DOES have a real effect on `generate` — and, for
  one combination, on `scaffold` too.** `shadcn/ui`/`shadcn-vue`, `RNR`,
  `React Native Paper`, and `Vuetify` each add an extra `generate` flag
  (`--shadcn`/`--rnr`/`--rn-paper`/`--vuetify`) that writes that library's
  theme file (CSS variables or a theme object) mapped from SDSGT's tokens —
  see "Suggestion logic," above, for the exact value/flag table, and step 8
  below for when it's passed. Every other component library option already
  gets its theming for free from the base platform flag alone (`--md2` for
  MUI, `--bootstrap` for React-Bootstrap/bootstrap-vue-next, `--md3` for
  Jetpack Compose Material3, `--swiftui` for SwiftUI native components) —
  no extra flag exists or is needed for those. **For every library except
  shadcn/ui, shadcn-vue, Vuetify, and React Native Paper, none of this
  vendors real component source or runs a real install** — no
  `npm install <library>`'s component-add equivalent, no component files
  written anywhere in the user's project, just a theme file. Say this
  plainly for MUI/React-Bootstrap: the pick shapes a theme file, not
  actual installed/styled components.

  **Five exceptions, each only when the project also gets scaffolded
  (step 10) with a matching framework/design-language combination:**
  - **shadcn/ui on Next.js + Tailwind (`--shadcn`, built 2026-09-12, Layer 2
    Pattern B)**, **shadcn-vue on Vue.js + Tailwind (`--shadcn`, built
    2026-09-14)**, and **RNR on React Native + Tailwind (`--rnr`, built
    2026-09-14)** — each vendors that library's *entire* current registry
    for real (`shadcn`/`shadcn-vue`/`@react-native-reusables/cli`, each
    driven non-interactively), already styled with the real brand colors,
    plus `sdsgt-vendored-components.json` so a future re-vendor doesn't
    silently overwrite a component the user has since customized. Real
    component *source files* land in the project (`components/ui/` or
    `src/components/ui/`) — this is copy-paste vendoring, the actual
    library code becomes part of the user's own project. **RNR's own path
    to this was less direct than the other two** — its `init` command is
    still genuinely a blocked interactive wizard, re-confirmed the same
    day, and that finding was never wrong. What unblocked real vendoring
    was discovering `add` runs standalone without ever needing `init`,
    once a real `components.json` (RNR's own real schema) exists and the
    git working tree is committed — both real preconditions this pipeline
    now satisfies itself, not a workaround. If asked, it's fine to mention
    this took an extra investigation step; don't overstate it as fragile —
    the mechanism itself (`add` with real flags) is exactly as solid as
    shadcn's own `add --all`.
  - **Vuetify on Vue.js + Material Design (`--vuetify`, built 2026-09-14)**
    and **React Native Paper on React Native + Material Design
    (`--rn-paper`, built 2026-09-14)** — a different shape of "real," since
    neither is a copy-paste library: `npm install vuetify`/
    `react-native-paper` runs for real, and `createVuetify()`/
    `PaperProvider` gets wired for real into the generated project, using
    the real generated theme colors. No component source files get copied
    anywhere — the whole point of a complete package like Vuetify or Paper
    is that you import components from it directly, not vendor them. Don't
    describe this the same way as the three vendoring cases above; say
    plainly it's "installed and wired," not "vendored."

  A `files-only` run, or a `Scaffold` run for a framework/language
  combination step 10 doesn't support, still only gets that library's theme
  file — same as every other library, for all five of these.
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
   reference), using the field mappings in the table's last column —
   including `componentLibrary`, using the exact string value from the
   "Suggestion logic" table above. Include `scaffoldMode` too even though
   nothing consumes it yet (see "Known gaps").
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
   `targetDesignLanguage`, `componentLibrary`) is already sitting in the
   seed from rows 2/3/4.
   Pick the base platform flag:
   - `targetFramework` is `swiftui` → `--swiftui` (native iOS has its own
     generator, independent of whatever design language was picked in row 3
     purely for preset values).
   - **`targetFramework` is `react-native` → no base platform flag at all,
     regardless of `targetDesignLanguage`.** This is a real exception, not
     an oversight: React Native's own generate output never uses `--tailwind`
     (Tailwind v4-shaped, incompatible with NativeWind v4's real Tailwind v3
     peer dependency — see `docs/layer2-layer3-plan.md`, Subject 5) or
     `--md2`/`--md3` (React Native Paper's theme comes entirely from
     `--rn-paper`, not from the base MD2/MD3 platform generators). Every
     React Native seed's only two `componentLibrary` choices (`rnr`/
     `rn-paper` — see "Suggestion logic," row 2's table has no
     "no-library" option for this framework) already produce everything
     `scaffold --framework react-native` needs on their own. Passing
     `--tailwind`/`--md2`/`--md3` here too wouldn't break anything, it would
     just generate an extra file nothing reads — skip it.
   - Otherwise, whichever flag matches `targetDesignLanguage`: `tailwind` →
     `--tailwind`, `bootstrap` → `--bootstrap`, `md2` → `--md2`, `md3` →
     `--md3`.
   Then, if `componentLibrary` is set, also pass its extra flag — these are
   additive to the base platform flag above, not a replacement for it (e.g.
   a Next.js/Tailwind/shadcn project passes `--tailwind --shadcn` together;
   a React Native project passes ONLY its componentLibrary flag, per the
   exception above — e.g. just `--rnr`, not `--tailwind --rnr`):
   `"shadcn"` → also `--shadcn`, `"rnr"` → also `--rnr`, `"rn-paper"` → also
   `--rn-paper`, `"vuetify"` → also `--vuetify`. `"mui"`,
   `"react-bootstrap"`, `"compose-material3"`, and `"swiftui-native"` add no
   extra flag — they're already fully covered by the base platform flag
   alone (see "Suggestion logic," above).
   Always also pass `--framework <targetFramework>` (the exact same string
   value already sitting in the seed) — this is what lets `AGENTS.md`'s
   NativeWind rule apply correctly for a React Native + Tailwind project;
   it's a no-op for every other target. Note: `generate` has no `--fonts-dir`
   flag today, so the demo HTML this step produces always renders its type
   specimens in the system-font fallback, even if step 5 fetched real font
   files for `promote`'s `report.html` — a known inconsistency between the
   two reports, not something to try to work around here.
   ```
   node src/cli.ts generate --tokens-dir "out/DTCG Token spec (non-consumables)/<short-project-slug>" --out "out/Code tokens (consumables)/<short-project-slug>" --<platform-flag> [--<component-library-flag>] --framework <targetFramework>
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
   - **If `targetFramework` is `kotlin`: also send `md3/SCAFFOLD_GUIDE.md`**
     (`SendUserFile`, `status: "normal"`, `display: "render"` — same
     treatment as the demo HTML above, since this is the next real thing
     the user needs to read, not just a reference doc). Say plainly: unlike
     Next.js/Vue.js/React Native, Kotlin/Jetpack Compose has no official
     non-interactive scaffolding CLI to drive (verified — no `android
     create` command exists, `gradle init` only makes generic Kotlin JVM
     apps, not real Android apps, and Android Studio has no headless
     project-creation mode), so there's no step 10 to run for this
     framework — this guide **is** Kotlin's equivalent of step 10, with
     your own real generated colors already filled in, not a generic
     tutorial. Point the user at it explicitly as "where to continue" —
     don't let it get lost among the other three files in the same message.
     Written unconditionally whenever `--md3` ran (both `scaffoldMode`
     values), since it's useful either way — for `files-only`, frame it as
     "in case you want to wire this into a real project yourself later"
     rather than "here's your next required step."
   - **If `targetFramework` is `swiftui`: also send `swiftui/SCAFFOLD_GUIDE.md`
     AND `swiftui/Theme.swift`** (`SendUserFile`, `status: "normal"`, one
     call — `display: "render"` for the guide, `display: "attach"` for
     `Theme.swift` since it's a source file to drop into Xcode, not
     something to read inline). Same reasoning as the Kotlin case above:
     unlike Next.js/Vue.js/React Native, Xcode/SwiftUI has no official
     non-interactive scaffolding CLI either (verified on a real Xcode 26.4
     install — no `xcodebuild` project-creation action, `swift package
     init` has no iOS-app template type, Xcode's own templates aren't
     exposed via any documented CLI), so this guide **is** SwiftUI's
     equivalent of step 10. One extra thing to say here that Kotlin's case
     didn't need: `generate --swiftui`'s own `DesignTokens.swift` is just
     flat static color constants with no built-in light/dark switching
     (unlike Compose's `ColorScheme` or Vuetify's theme object, which
     switch themselves) — `Theme.swift` is a real, working SwiftUI
     Environment-based wrapper solving that, with this project's own actual
     token names already wired in, not a generic pattern the user has to
     adapt themselves. Same unconditional-regardless-of-`scaffoldMode`
     treatment as Kotlin's guide.
10. *(Only if row 1 = `Scaffold`)* Real scaffolding exists for five
    `targetFramework`/`targetDesignLanguage` combinations so far:
    - `nextjs` + `tailwind`
    - `vuejs` + `tailwind`
    - `vuejs` + `md3` or `md2` (Vue.js's "Material Design" path — Vuetify)
    - `react-native` + `tailwind` (NativeWind)
    - `react-native` + `md3` or `md2` (React Native's "Material Design" path
      — React Native Paper)

    If the seed doesn't match one of these, stop here — don't ask the
    question below. **If `targetFramework` is `kotlin` OR `swiftui`
    specifically**, don't say "not built yet" the way every other
    unsupported combination gets described — that would undersell what
    actually happened. Instead point back to step 9's own
    `md3/SCAFFOLD_GUIDE.md` (Kotlin) or `swiftui/SCAFFOLD_GUIDE.md` +
    `swiftui/Theme.swift` (SwiftUI): neither framework has an automatable
    scaffold step by design (no official non-interactive CLI exists to
    drive, for either — see step 9's own notes), and that guide is each
    one's real, filled-in answer already sent, not a placeholder. For every
    other unmatched combination (Next.js/Vue.js/React Native with
    Bootstrap, etc.), say plainly that scaffolding isn't built for that
    combination yet (`docs/layer2-layer3-plan.md`, Subjects 3–7, has the
    status) — the design-system files from step 9 are still fully usable on
    their own, they just won't get dropped into a running project
    automatically.

    Otherwise, ask the user, with `AskUserQuestion`, whether to continue on
    to `scaffold` now — e.g. "Ready to scaffold a real
    `<Next.js|Vue.js|Expo>` project with this design system wired in?",
    options `Yes, scaffold now` / `Not yet`. Same "needs a real answer,
    don't proceed on a timeout or assumption" rule as step 8. If `Not yet`,
    stop here — mention the command below can be run later, and don't run
    it in this session.

    If they confirm, ask in chat where they want the new project folder
    created — a real path on their own machine, not inside this tool's own
    `out/` folders (see `pipeline-plan.md`, "Who this is for, and the bar
    for 'done'" — a scaffolded project is meant to become the user's own
    independent project, not live inside SDSGT's repo). The path must not
    already exist yet; the official CLI being driven creates it fresh. Then
    run the command matching the seed's combination:

    **`nextjs` + `tailwind`:**
    ```
    node src/cli.ts scaffold --framework nextjs --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--shadcn] [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    Pass `--shadcn` if and only if `componentLibrary` is `shadcn` — the
    step 8 `generate` run must also have had `--shadcn` passed for this to
    work (it will have, since row 4's flag mapping already adds it
    alongside `--tailwind` — see "Suggestion logic," above).

    **`vuejs` + `tailwind`:**
    ```
    node src/cli.ts scaffold --framework vuejs --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--shadcn] [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    Same `--shadcn` rule as the Next.js case above (`componentLibrary` is
    `shadcn` for `shadcn-vue` too — see the "Suggestion logic" value table).

    **`vuejs` + `md3`/`md2` (Vuetify):**
    ```
    node src/cli.ts scaffold --framework vuejs --vuetify --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    No `--shadcn` equivalent here — Vuetify's own full component library is
    always installed as part of this path, there's no vendored-vs-not
    branch the way the two Tailwind paths have. The step 8 `generate` run
    must have had `--vuetify` passed (it will have, since `componentLibrary`
    `"vuetify"` maps to it — see "Suggestion logic," above).

    **`react-native` + `tailwind` (NativeWind):**
    ```
    node src/cli.ts scaffold --framework react-native --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--rnr]
    ```
    Pass `--rnr` if and only if `componentLibrary` is `rnr` — real vendoring,
    built 2026-09-14 (see "Known gaps" for the full story: RNR's own `init`
    is still blocked, but `add` runs standalone once this pipeline writes a
    real `components.json` and commits the git tree, both handled
    automatically). No `--fonts-dir` — see the note below.

    **`react-native` + `md3`/`md2` (React Native Paper):**
    ```
    node src/cli.ts scaffold --framework react-native --rn-paper --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>"
    ```
    No `--fonts-dir` here either — same reason.

    For the Next.js/Vue.js paths: pass `--fonts-dir` only if step 5
    actually fetched font files (same directory already used for
    `promote --fonts-dir`). **Never pass `--fonts-dir` for either React
    Native combination — it isn't a supported flag for them.** This is a
    real, deliberate gap, not an oversight: React Native has no CSS/
    `@font-face`, so it can't consume the `.woff2` files step 5 fetches —
    real custom fonts there need `.ttf`/`.otf` files loaded via
    `expo-font`, a mechanism this pipeline doesn't build yet. Say this
    plainly if the user asks why their chosen font isn't showing up in the
    scaffolded React Native project: the system font is used instead, same
    "falls back to a system font" treatment every other scaffold uses when
    font files aren't available, just unconditional here.

    Each combination runs real `npm install`s (or `expo install`s) over the
    network — with `--shadcn` (Next.js/Vue.js) it also vendors that
    library's entire current registry (60–70+ components), so say up front
    it'll take a bit longer than without it (roughly a minute or two, not
    the under-a-minute estimate for a plain scaffold); the Vuetify and
    React Native Paper paths each install one real package, so they're
    closer to the plain-scaffold timing — don't let the user think any of
    these is hung.

    If it fails, don't lose the code-token result over it — the files from
    step 8 still exist either way — say plainly that scaffolding hit an
    error, quoting the message.

    If it succeeds, report back in plain language, and be explicit about
    all three of these (per `pipeline-plan.md`'s "Who this is for" bar —
    the user should never have to go figure this out themselves):
    - Which files got written into the new project (the file list
      `scaffold` prints).
    - The exact steps to run it — these genuinely differ by framework:
      - Next.js/Vue.js: `cd` into the project folder, then `npm run dev`,
        then open **http://localhost:3000** (Next.js or the Vuetify path)
        or **http://localhost:5173** (Vite's own default, the Vue.js +
        Tailwind path) in a browser.
      - React Native (either path): `cd` into the project folder, then
        `npm start`, then press `i` for iOS, `a` for Android, or `w` for
        web — or scan the QR code with the Expo Go app on a phone. No
        localhost URL the way the web frameworks have.
    - That this same information lives in the new project's own
      `README.md`, any time they need it again later.

    What to say about the component library, branched by which combination
    ran:
    - **`nextjs`/`vuejs` + `tailwind`, `--shadcn` not passed:** say plainly
      this is a themed, *empty* project — no component library is vendored
      into it, even if `componentLibrary` is `shadcn` (vendoring only
      happens for these two Tailwind combinations, per the gate at the top
      of this step).
    - **`nextjs`/`vuejs` + `tailwind`, `--shadcn` passed:** say every
      shadcn/ui (or shadcn-vue) component is already vendored into
      `src/components/ui/` and already styled with the real brand colors,
      and mention `sdsgt-vendored-components.json` at the project root —
      the mechanism that stops a future re-vendor from silently
      overwriting a component the user has since customized (see
      `docs/layer2-layer3-plan.md`, Subject 2, "the ACIM lesson").
    - **`vuejs` + `md3`/`md2` (Vuetify):** say Vuetify's own full Material
      Design component library is already installed as a real dependency
      and already wired to your brand colors (`src/plugins/vuetify.ts`,
      `src/plugins/theme.ts`) — nothing to vendor separately, since Vuetify
      (unlike shadcn) ships as one complete package you import components
      from directly, not individual files copied into the project.
    - **`react-native` + `tailwind` (NativeWind), `--rnr` not passed:** say
      plainly this is a themed, *empty* project — colors are wired in via
      Tailwind classes (`bg-primary`, `text-foreground`, etc.), but no
      component library is vendored into it, even if `componentLibrary` is
      `rnr` (vendoring only happens when `--rnr` is actually passed).
    - **`react-native` + `tailwind` (NativeWind), `--rnr` passed:** say
      every RNR component is already vendored into `components/ui/` and
      already styled with the real brand colors, and mention
      `sdsgt-vendored-components.json` at the project root — same
      customization-guard mechanism as shadcn/shadcn-vue (see
      `docs/layer2-layer3-plan.md`, Subject 2, "the ACIM lesson").
    - **`react-native` + `md3`/`md2` (React Native Paper):** say React
      Native Paper's own full Material Design component library is already
      installed as a real dependency and already wired to your brand colors
      (`theme.ts`, wrapped in `PaperProvider` in `App.tsx`) — same
      "installed and wired, not vendored" framing as Vuetify above, since
      Paper also ships as one complete package.

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
