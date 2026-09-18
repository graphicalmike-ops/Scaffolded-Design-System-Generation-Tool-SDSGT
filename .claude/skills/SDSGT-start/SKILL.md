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
| 1 | Full new project, or just the design-system files? | Menu — `Scaffold` / `Design system files only` | Framework is still asked next either way — see row 2. `promote` never reads this either way. Real scaffolding exists for Next.js (its Tailwind path and its Bootstrap/React-Bootstrap path); for Vue.js (its Tailwind path, its Material Design/Vuetify path, and its Bootstrap/bootstrap-vue-next path); and for React Native/Expo (both its Tailwind/NativeWind path and its Material Design/React Native Paper path) — see step 10, "Running the flow," and "Known gaps." Kotlin and SwiftUI are both real exceptions, not "no effect" cases: neither has an official scaffolding CLI at all (Android/Compose and Xcode/SwiftUI, checked independently, same conclusion), so `generate` itself always writes a real setup guide (`md3/SCAFFOLD_GUIDE.md` or `swiftui/SCAFFOLD_GUIDE.md`) regardless of this answer — see step 9. Next.js with MD3/MD2 (MUI) still records this answer with genuinely no effect (React Native has no Bootstrap option at all — see "Suggestion logic"). | `scaffoldMode` (`"scaffold"` \| `"files-only"`) |
| 2 | Which framework/platform? | Menu — `Next.js` (React, web) / `Vue.js` (web) / `React Native (Expo)` / `Kotlin` (Jetpack Compose, native Android) / `SwiftUI` (native iOS) | Fixed list. Selecting one marks a suggested Component library in row 4 (see "Suggestion logic," below). `promote` doesn't branch on this — every token preset it writes is platform-agnostic DTCG JSON. `generate` does read it, though, to pick between `--swiftui` and everything else, and to set `--framework` — see "Running the flow," step 8. | `targetFramework` |
| 3 | Which design language? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Marks Type-scale (row 13), Spacing (row 14), Border-roundness (row 15), Shadows (row 18), and Component library (row 4) as "(Suggested)" further down — see "Suggestion logic." Not read by `promote` — each preset choice below is independent, this just seeds their defaults. `generate` does read it, to pick which platform flag to pass (`--tailwind`/`--bootstrap`/`--md2`/`--md3`) — see "Running the flow," step 8. | `targetDesignLanguage` |
| 4 | Which component library? | Menu, filtered by framework + design language — see "Suggestion logic" | `generate` now reads this. `shadcn/ui` (and `shadcn-vue`), `RNR`, `React Native Paper`, and `Vuetify` each add their own extra flag (`--shadcn`/`--rnr`/`--rn-paper`/`--vuetify`) — for React Native, this is the ONLY flag passed (no base platform flag — see step 8's real exception, below); for every other framework it's additive alongside the base platform flag from row 3. Every other option (`MUI`, `React-Bootstrap`, `bootstrap-vue-next`, `Jetpack Compose Material3`, `SwiftUI native components`) already gets its theming from the base platform flag alone (`--md2`/`--bootstrap`/`--md3`/`--swiftui`) — no extra flag exists or is needed. At `generate` time this only ever affects the *theme* file, regardless of library — whether real component source or a real install also happens depends on whether the project later gets *scaffolded* (row 1) with that same library, and now for eight combinations (shadcn/ui on Next.js+Tailwind, shadcn-vue on Vue.js+Tailwind, RNR on React Native+Tailwind, Vuetify on Vue.js+Material Design, React Native Paper on React Native+Material Design, bootstrap-vue-next on Vue.js+Bootstrap, React-Bootstrap on Next.js+Bootstrap, MUI on Next.js+Material Design) — see "Known gaps" for exactly what each does, and step 10 below for when it runs. No component library option is theme-only-forever anymore: `Jetpack Compose Material3`/`SwiftUI native components` get a real filled-in `SCAFFOLD_GUIDE.md` instead of a scaffold (see step 9/10's own Kotlin/SwiftUI handling), a different mechanism from the eight above but still more than a theme file. **Disclose the real, current fidelity gap right here, before they pick — this now covers all eight combinations, not just the five "installed and wired" libraries, and spans radius/padding/typography-size/shadow/opacity, not just geometry** — see "Known gaps," **"Geometry, shadow, and opacity fidelity, by library"** for the full exact per-library detail. The short version: React-Bootstrap/bootstrap-vue-next, MUI, Vuetify, and React Native Paper all have color/radius/padding/typography-size/opacity fully real-token-bound (as of 2026-09-16) — nothing left open on those five dimensions for any of those four. shadcn/ui and shadcn-vue have shadow bound for every preset, and spacing bound for every preset including `bootstrap` now (2026-09-16) — though `bootstrap`'s own fix only covers the exact keys it defines (0-5); any fractional class or key beyond 5 still falls back to Tailwind's raw default, disclosed same as RNR's own spacing gap. RNR has spacing (partial) and typography size (complete) bound, but its shadow classes are structurally unfixable — the underlying native CSS-to-RN translation library drops multi-layer shadows outright, independent of any token binding. MUI's and Vuetify's own SHADOW/elevation systems are a genuinely different, physically-modeled numeric depth scale (not a named size scale) with no real, non-arbitrary mapping from this pipeline's own 5-tier scale — disclosed, not fabricated. RN Paper's own elevation is already correct via a different, real MD3-appropriate mechanism (surface tinting, not box-shadow). Don't wait until step 8/10 to say this for the first time — it should inform the pick, not just narrate it afterward. **Separately, if row 5 might end up `Figma-managed`, also mention here that only `nextjs` + `tailwind` + shadcn/ui gets a real components push to Figma today — every other pick here still gets tokens-as-variables only, see "Known gaps," "Figma component push — scope, not just fidelity."** | `componentLibrary` |
| 5 | Manage tokens via Figma, or code only? | Menu — `Figma-managed` / `Code-only` | `pipeline-plan.md` says this is meant to be asked at Generate, not seed input — but `SeedConfig.figmaManaged` is a required field today, so ask it now as a stand-in until Generate is its own step. **Disclose here, not just at row 4 or step 10, since this is the question a "will my components show up in Figma too?" assumption actually attaches to**: `Figma-managed` today only ever pushes real component structure for one combination — `nextjs` + `tailwind` + shadcn/ui — everything else (every other framework/library, `files-only` mode) still gets tokens-as-variables in Figma, nothing more, regardless of this answer. See "Known gaps," "Figma component push — scope, not just fidelity" for the exact current wording. | `figmaManaged` (boolean) |
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
| 17 | Opacity preset? | Menu — `Tailwind` / `Bootstrap` only | Neither Material Design variant has a preset opacity scale — say so if the user picked MD3/MD2 in row 3, since there's no "(Suggested)" match here. **Real-token-bound everywhere it can actually apply** (verified 2026-09-16): Bootstrap-family's `$btn-disabled-opacity`, MUI's `theme.palette.action.*Opacity`, and Vuetify's `theme.variables` opacity constants are all bound to the nearest real token; RNR/shadcn's own Tailwind opacity classes need no binding at all — Tailwind's real default scale already exactly matches both this pipeline's own presets at every key either defines, confirmed by checking, not assumed. Nothing left open here. | `opacityPreset` (`"tailwind"` \| `"bootstrap"`) |
| 18 | Shadow preset? | Menu — `Tailwind` / `Bootstrap` / `Material Design 3` / `Material Design 2` | Recommend the row-3 match. Show the scale (`contracts-and-seeds.md`, "Shadow"). **Disclose here, not just at library pick (row 4)**: real-token-bound for Bootstrap-family (`$box-shadow-*`, 3 of this scale's 5 tiers — Bootstrap has no 4th/5th) and for shadcn/ui + shadcn-vue on the web (Tailwind v4 `@theme` block, real per-preset values). **Two real, permanent exceptions, not oversights**: MUI's and Vuetify's own shadow/elevation systems are a physically-modeled numeric depth scale (25 levels for MUI, a two-layer MD3 depth model for Vuetify), not a named 5-tier scale like this one — no real, non-arbitrary mapping exists, so neither is bound. RNR (React Native) can't render this scale's `md`/`lg`/`xl`/`2xl` tiers on native AT ALL regardless of binding — the underlying `react-native-css-interop` library drops any multi-layer shadow outright (confirmed against its own real source), a structural limitation of the native CSS-to-shadow translation itself, not something this pipeline's tokens can fix. React Native Paper needs no shadow token at all — MD3's own real elevation model uses surface-color tinting instead of box-shadow, already correctly implemented. | `shadowPreset` |
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

- **`scaffoldMode` now DOES have a real effect — for eight combinations.**
  Picking `Scaffold` triggers a real `scaffold` step (see step 10, below)
  when `targetFramework`/`targetDesignLanguage` is one of:
  - `nextjs` + `tailwind` — `cli/src/scaffold/nextjs.ts`, driving
    `create-next-app` non-interactively.
  - `nextjs` + `bootstrap` — `cli/src/scaffold/nextjs-bootstrap.ts`, built
    right after the Vue.js Bootstrap addition below closed the same gap
    there. Same base CLI as the Tailwind path (`create-next-app`), driven
    with `--no-tailwind` instead (confirmed current convention: Tailwind
    now defaults ON, so this needs the real negation flag) plus the same
    real Sass build pattern as Vue.js's own Bootstrap path (`generate
    --bootstrap`'s `_variables.scss` compiled before Bootstrap's own Sass).
    No component files get vendored — react-bootstrap is a plain npm
    package, and it ships no `"use client"` directive of its own (confirmed:
    open, unresolved upstream issue), so any file rendering one needs its
    own directive — this scaffold's own proof-of-tokens page has one. See
    `docs/layer2-layer3-plan.md`, Subject 3, for the full build detail.
  - `nextjs` + `md3` or `md2` — `cli/src/scaffold/nextjs-mui.ts`, built right
    after, closing the very last "not built" line in this pipeline's own
    Layer 3 tracking. Same base CLI again (`create-next-app --no-tailwind`),
    wires in `@mui/material-nextjs`'s `AppRouterCacheProvider` (a real,
    Next.js-major-specific subpath — `v16-appRouter` for the Next.js 16.x
    `create-next-app@latest` installs today, confirmed against the
    package's own real `exports` map, not its docs page's still-`v15`
    example) plus a real `createTheme()` using `generate --md2`'s own
    `palette.ts`. **`md3` routes here too, not to `--md3`** — see step 8's
    own real fix, same session: `generate --md3` is Kotlin/Compose-only,
    nothing web-consumable, so a Next.js Material Design seed always
    generates with `--md2` regardless of which of the two was picked, same
    "either one means Material Design" routing Vue.js's own Vuetify path
    already uses. One genuine, verified difference from react-bootstrap:
    MUI's own components (`Button`, `ThemeProvider`, every icon) already
    ship their own `"use client"` directive, so this scaffold's page needs
    none of its own. See `docs/layer2-layer3-plan.md`, Subject 3, for the
    full build detail, including a real font-family string-escaping bug
    this work found and fixed.
  - `vuejs` + `tailwind` — `cli/src/scaffold/vuejs.ts`, driving `create-vue`
    non-interactively (Tailwind wired in by hand, since create-vue has no
    built-in `--tailwind` flag the way `create-next-app` does).
  - `vuejs` + `md3` or `md2` — `cli/src/scaffold/vuejs-vuetify.ts`, a
    genuinely separate pipeline from the other two: drives `create-vuetify`
    instead of `create-vue`, Material Design via Vuetify's own component
    styling instead of Tailwind. (`md3`/`md2` are otherwise MUI/Compose
    territory elsewhere in this table — for Vue.js specifically, either one
    means "Material Design," which routes to Vuetify.)
  - `vuejs` + `bootstrap` — `cli/src/scaffold/vuejs-bootstrap.ts`, built
    2026-09-14. Closer to the `tailwind` path than to Vuetify's in one way
    (same base CLI — `create-vue` — since bootstrap-vue-next has no
    scaffolding CLI of its own, confirmed against its real npm/GitHub
    source) but still a genuinely separate design language: wires in a real
    `sass` devDependency and compiles this pipeline's generated
    `_variables.scss` into Bootstrap's own Sass (the "Lean Sass Imports"
    pattern Bootstrap's own docs prescribe) before bootstrap-vue-next's own
    component CSS loads, instead of Tailwind. No component files get
    vendored — bootstrap-vue-next is a plain npm package, not a copy-paste
    library. See `docs/layer2-layer3-plan.md`, Subject 4, for the full
    build detail.
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
  on each. **This is now every framework/design-language combination this
  pipeline can actually reach** — React Native's only remaining gap
  (Bootstrap) isn't a missing scaffold, it's that Bootstrap has no React
  Native option at all (see "Suggestion logic"), so there's no seed that
  could ever select it.

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
  three combinations, on `scaffold` too.** `shadcn/ui`/`shadcn-vue`, `RNR`,
  `React Native Paper`, and `Vuetify` each add an extra `generate` flag
  (`--shadcn`/`--rnr`/`--rn-paper`/`--vuetify`) that writes that library's
  theme file (CSS variables or a theme object) mapped from SDSGT's tokens —
  see "Suggestion logic," above, for the exact value/flag table, and step 8
  below for when it's passed. Every other component library option already
  gets its theming for free from the base platform flag alone (`--md2` for
  MUI, `--bootstrap` for React-Bootstrap/bootstrap-vue-next, `--md3` for
  Jetpack Compose Material3, `--swiftui` for SwiftUI native components) —
  no extra flag exists or is needed for those. **Only `Jetpack Compose
  Material3` and `SwiftUI native components` still get purely a theme file
  from `generate` itself** — every other option now also gets real
  component behavior once the project is actually scaffolded (see the
  eight exceptions below).

  **Eight exceptions, each only when the project also gets scaffolded
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
  - **Vuetify on Vue.js + Material Design (`--vuetify`, built 2026-09-14)**,
    **React Native Paper on React Native + Material Design (`--rn-paper`,
    built 2026-09-14)**, **bootstrap-vue-next on Vue.js + Bootstrap (built
    2026-09-14)**, **React-Bootstrap on Next.js + Bootstrap (built right
    after)**, and **MUI on Next.js + Material Design (built right after
    that, closing the last "not built" line in Layer 3)** — a different
    shape of "real," since none of the five is a copy-paste library:
    `npm install vuetify`/`react-native-paper`/`bootstrap-vue-next`/
    `react-bootstrap`/`@mui/material` runs for real, and
    `createVuetify()`/`PaperProvider`/`createBootstrap()`/a real `<Button>`
    import get wired for real into the generated project, using the real
    generated theme colors. No component source files get copied anywhere —
    the whole point of a complete package like these five is that you
    import components from it directly, not vendor them. Don't describe
    this the same way as the three vendoring cases above; say plainly it's
    "installed and wired," not "vendored." React-Bootstrap has one real
    wrinkle MUI doesn't: it ships no `"use client"` directive of its own
    (confirmed: open, unresolved upstream issue), so any file rendering one
    needs its own directive — MUI's own components (verified: a real 2023
    MUI blog post on exactly this) already ship the directive themselves,
    so a Next.js + MUI page needs none of its own.

  A `files-only` run, or a `Scaffold` run for a framework/language
  combination step 10 doesn't support, still only gets that library's theme
  file — same as every other library, for all eight of these.
- **Geometry, shadow, and opacity fidelity, by library — real, current,
  verified 2026-09-16, not assumed.** Color has always been bound exactly
  for every library that gets real theming. Radius, padding, typography
  size, shadow, and opacity are different — until 2026-09-15 only
  Bootstrap-family's radius was ever bound to this pipeline's own tokens;
  everything else silently used the library's own default regardless of
  the corner-roundness/spacing-rhythm/type-scale/shadow/opacity presets
  picked at seed input. Three real audit passes (2026-09-15 radius/
  spacing, 2026-09-16 button padding/typography size, then a full,
  explicit "check everything in Layer 2" pass the same day covering shadow
  and opacity specifically) have closed every gap that was structurally
  closeable — **the "installed and wired" libraries (React-Bootstrap/
  bootstrap-vue-next, MUI, Vuetify) now have every one of color/radius/
  padding/typography-size/opacity real-token-bound, and shadow bound
  everywhere a real, non-arbitrary mapping exists (Bootstrap-family's own
  3-tier `$box-shadow-*`; MUI's and Vuetify's own elevation SYSTEMS are a
  genuinely different, physically-modeled kind of scale — see their own
  bullets below for why those specifically are disclosed, not bound).**
  What's left is either a genuine structural ceiling (RN Paper's remaining
  components; MUI/Vuetify's own elevation arrays; RNR's native shadow
  rendering) or a scope this pipeline's own presets were never designed to
  reach fully (RNR/shadcn's `bootstrap` spacing preset, non-linear by
  design). **Say the real current state below to the user before they pick
  a library (row 4) AND again right before the step that actually applies
  it (step 8/10)** — never let Figma or the real app show a property that
  looks token-driven but isn't:
  - **React-Bootstrap / bootstrap-vue-next — color/radius/padding/button
    text size/shadow/disabled-opacity ALL exact (fixed 2026-09-15, then
    2026-09-16 in two rounds).** `$border-radius-*`, `$btn-padding-y`/
    `$btn-padding-x`, and `$btn-font-size` are all real Bootstrap Sass
    variables this pipeline binds to the nearest real spacing/radius/
    type-scale token (not always pixel-identical to Bootstrap's own
    literal default, since a preset's own scale doesn't always land
    exactly where Bootstrap's default does — see `generate/bootstrap.ts`'s
    own `nearestDimensionPx`). `$box-shadow-sm`/`$box-shadow`/
    `$box-shadow-lg` (Bootstrap's own real 3-tier shadow scale — no 4th/5th
    tier exists, so this pipeline's own `xl`/`2xl` shadow tokens have
    nothing to bind to, same "framework has fewer tiers" shape as the
    type-scale table) and `$btn-disabled-opacity` (real default `.65`) are
    also now bound, verified with a real compiled build. **Nothing left
    open for this library.**
  - **MUI — color/radius/button padding/typography size/action opacity
    all bound (radius 2026-09-15; padding and typography size 2026-09-16;
    action opacity 2026-09-16, same day).**
    `theme.shape.borderRadius` is bound to `radius.md`.
    `components.MuiButton.styleOverrides.root` is bound to the nearest
    real spacing tokens for MUI's own real medium/contained default
    (6px/16px) — verified live with a real Chrome computed-style check,
    not just a successful build. `theme.typography`'s `h1`–`h6`/
    `subtitle1`/`subtitle2`/`body1`/`body2`/`button`/`caption`/`overline`
    each bind to the nearest real type-scale token for MUI's own real
    per-variant default size (`generate`d from `createTypography.js`'s own
    real defaults) — also verified live. `theme.palette.action.
    {hoverOpacity,selectedOpacity,disabledOpacity,focusOpacity,
    activatedOpacity}` are bound to the nearest real opacity tokens, using
    MUI's own real LIGHT-mode defaults specifically (`createPalette.js`'s
    own `getLight()` — MUI's own dark-mode set is genuinely different, but
    `generate/md2.ts`'s own `palette.ts` never sets `mode` at all, so MUI's
    real default `mode: 'light'` silently applies regardless of the
    light/dark seed choice — a separate, already-disclosed MD2 generator
    limitation, not something this fix changes). Verified live: hovering a
    real `text`-variant Button in a real browser showed the exact bound
    alpha channel in its computed `background-color`. **Disclosed,
    narrower scope, not a bug:** the padding override only reaches the
    medium/contained case — every other variant/size combination
    (`outlined`, `text`, `small`, `large`) keeps MUI's own separate literal
    padding, since MUI defines each of those with its own separate style
    entry this pipeline doesn't also override. Typography sizing for
    `h1`/`h3` lands on the same `display` token (this pipeline's own
    type-scale tops out below both of MUI's real 96px/48px defaults) — an
    honest nearest-match outcome. **A real, structural gap, not fixed and
    not fixable the same way**: MUI's own `theme.shadows` is a fixed,
    physically-modeled 25-level elevation array (0–24, Material Design's
    real depth model), not a named 5-tier scale — different REAL
    components use different, specific elevation INDICES for structural
    reasons (Card=1, AppBar=4, Dialog=24, ...), not a "pick your shadow
    size" choice the way `sm`/`md`/`lg` are. Mapping this pipeline's own
    5-tier `shadow.json` onto 25 numeric levels would mean inventing a
    correspondence with no real source — checked, not attempted, disclosed
    instead of fabricated.
  - **Vuetify — color/radius/button padding/typography size/opacity all
    bound (radius 2026-09-15, genuinely pixel-exact; padding, typography
    size, and opacity 2026-09-16).** `$border-radius-root` is a real Sass
    variable every `rounded-*` class and component default derives from
    proportionally. Button padding is a different shape than
    Bootstrap/MUI's — Vuetify has no vertical button padding of its own at
    all (real default `padding: 0 roundEven($button-height /
    $button-padding-ratio)`, vertical sizing comes entirely from
    `$button-height`) — rather than also resizing the button, this
    pipeline solves for `$button-padding-ratio` alone, holding Vuetify's
    own real 36px default height fixed, landing exactly (not
    approximately) on the nearest real spacing token. `$typography`'s own
    15 real MD3 role names (`display-large` … `label-small`) each get
    their own `'size'` sub-key bound to the nearest real type-scale token
    via a real Sass `map-deep-merge`, leaving weight/line-height/
    letter-spacing/font-family untouched. `theme.variables`'s own 11 real
    opacity/emphasis constants (`hover-opacity`, `disabled-opacity`,
    `high-emphasis-opacity`, and more) are bound to the nearest real
    opacity tokens, using Vuetify's own real, genuinely DIFFERENT light vs.
    dark defaults (e.g. real `disabled-opacity` is 0.38 light / 0.50
    dark) — verified live: `getComputedStyle(document.documentElement).
    getPropertyValue('--v-hover-opacity')` in a real running app showed
    the exact bound value, confirming these are injected at RUNTIME by
    Vuetify's own JS (not visible in any static compiled CSS bundle — a
    real, load-bearing difference from radius/padding/typography, which
    verifying by only reading a compiled CSS file would have missed).
    Radius/padding/typography all verified with a real `vite build`'s
    compiled CSS. **Disclosed, narrower scope, not a bug:** the
    stacked-button variant (`$button-stacked-padding-ratio`) is untouched
    — its own separate real Sass variable, same "one reference variant"
    restraint as MUI's own padding fix. **A real, structural gap, same
    shape as MUI's own**: Vuetify's own elevation system (`$shadow-key`/
    `$shadow-ambient` Sass maps, a real two-layer physically-modeled depth
    scale matching MD3's own elevation spec) is not bound — same
    "physically-modeled numeric depth, not a named size scale" reasoning
    as MUI's `theme.shadows`, no real non-arbitrary mapping exists from
    this pipeline's own 5-tier `shadow.json`.
  - **React Native Paper — radius now exact for ten components via
    generated wrapper components, button padding and the full typography
    size scale ALSO now bound (all 2026-09-16, across three rounds); every
    OTHER component's radius still only approximates via `roundness`
    alone.** Paper's own
    `roundness` theme value is a single global multiplier every component
    type multiplies by its OWN different internal factor (confirmed against
    Paper's real source: Button `5×`, Card `3×`, Chip `2×`, TextInput `1×`,
    Snackbar/Menu/ToggleButton `1×`, DrawerItem/Dialog `7×`, FAB `3×/4×/7×`
    by size, Searchbar `7×`/`0×` by mode, ...) — calibrating `roundness`
    alone (still done, for Button) can only ever match ONE of these at a
    time. **The real unlock, found by checking rather than assuming it was
    a dead end**: Button, Card, Chip, TextInput, Snackbar, Menu,
    ToggleButton, DrawerItem, FAB, Searchbar, and Dialog each already
    expose a real, PUBLIC, documented per-instance override — a `style`
    prop (several: the library's own source extracts `border*Radius` keys
    or appends `style` last in its own internal array, either way the
    caller wins), a dedicated `contentStyle` prop (Menu), or a dedicated
    `outlineStyle` prop (TextInput outlined mode, Paper's own JSDoc:
    "override the default style of outlined wrapper"). This is Paper's own
    intended customization mechanism, not an unsupported hack.
    `generate --rn-paper` now writes ten files under
    `rn-paper/components/` — thin wrappers that bake `radius.md` in via
    these real props, still overridable further by the caller — and
    `scaffold --rn-paper` copies them into the real project's own
    `components/`. **Real, disclosed narrower scopes, not silently smoothed
    over**:
    - Card's own wrapper needs a well-commented `as any` at one spread —
      confirmed with a real `tsc` run that this is a structural limitation
      of Paper's OWN exported `CardProps` type (a discriminated union keyed
      on `mode`) that breaks even an unmodified passthrough wrapper, not
      anything about this pipeline's code; every other wrapper's types
      don't have this problem and needed no cast.
    - FAB and Searchbar have MODE/SIZE-dependent real defaults (FAB: small/
      medium/large use different multipliers; Searchbar: `"bar"` mode is
      `7×`, `"view"` mode is a deliberately square `0`) — rather than
      inventing a scaling formula this pipeline has no real source for,
      only each one's real DEFAULT case (`size="medium"`, `mode="bar"`) is
      bound; other sizes/modes keep Paper's own real, unmodified defaults.
    - A real, functional bug caught and fixed before shipping, not just a
      style nit: Card, Menu, ToggleButton, FAB, and Dialog all have real
      compound sub-components (`Card.Content`, `Menu.Item`,
      `ToggleButton.Group`/`.Row`, `FAB.Group`, `Dialog.Actions`/etc.) —
      an early cut of the Menu/ToggleButton/FAB wrappers omitted these
      entirely, which would have silently broken `<Menu.Item>` and similar
      for anyone using those wrappers. Found by systematically checking
      every wrapped component's own real barrel/index file for
      `Object.assign`-style compound exports, not assumed absent. Every
      compound piece is now re-exported as-is on each wrapper.
    - The wrappers don't forward a `ref`, unlike Paper's own `Card`/
      `TextInput` (both internally `forwardRef`) — a real, narrower scope
      than Paper's own API, not an oversight.
    - `ToggleButton.Row`'s own real per-position corner-squaring (rounding
      only the outer corners of a horizontal group) was checked for a
      conflict with this wrapper's own uniform default — none: React
      Native keeps the shorthand `borderRadius` and the Row's own longhand
      corner overrides as separate style keys, so the Row's positional
      logic still applies correctly on top.
    AGENTS.md now tells an AI coding agent to import all ten from
    `./components/`, not directly from `react-native-paper`. **Confirmed
    exhaustively (2026-09-16, not just assumed from the ones already
    wrapped): grepped Paper's ENTIRE real component source tree for every
    file that references `roundness` at all** — exactly 13 real components
    do, and this list (plus Button) covers all 11 of them. Every other real
    Paper component (Avatar, Badge, IconButton, and more) either has no
    radius concept at all or uses a deliberately fixed circular shape
    (`size / 2`, independent of any roundness preset — confirmed for
    Avatar/Badge/IconButton specifically) — correct Material Design
    behavior, not a gap. **Two real, confirmed exceptions, not just
    unchecked**: Tooltip exposes no style-customization prop of any kind
    for its own bubble, and SegmentedButtons computes each segment's
    radius specially (rounded ends, square middle) with no visible
    override path in its own source —
    don't assume the pattern generalizes to those two without rechecking.
    **Button padding and the full typography size scale ALSO now closed
    (2026-09-16, same day as the radius work).** Button has no literal
    `padding` at all — its real visual spacing is `marginVertical`/
    `marginHorizontal` on its LABEL TEXT (confirmed against Paper's real
    source), overridable via a real public `labelStyle` prop (appended
    last, same "caller wins" pattern as the ten radius wrappers). A new
    eleventh wrapper, `components/Button.tsx`, binds this to the nearest
    real spacing tokens — but ONLY for modes other than `"text"` (Button's
    own actual default when `mode` is omitted), since Paper's own
    text-mode margin is genuinely smaller by design, not a value to
    flatten into the same spacing as contained/outlined/elevated. Separately,
    `theme.fonts` — a real, plain, spreadable theme key, confirmed against
    Paper's own `MD3LightTheme`/`MD3DarkTheme` source, no wrapper needed for
    this one — now overrides every real MD3 typescale role's `fontSize`
    (`displayLarge` through `bodySmall`, 15 roles) with the nearest real
    type-scale token, same "size only, leave family/weight/lineHeight/
    letterSpacing at the library's real default" restraint as this
    pipeline's own MUI/Vuetify typography-size fixes. Font FAMILY stays
    unbound — a separate, unrelated, still-real gap (React Native needs
    actual .ttf/.otf files via `expo-font`, which this pipeline doesn't
    fetch for any RN scaffold). **With this, RN Paper is no longer behind
    MUI/Vuetify** — every gap those two had (padding, typography size) now
    has an equivalent fix here too, just via a different real mechanism
    (wrapper component for padding, theme key for typography, vs. their own
    `styleOverrides`/Sass-map approach). **Shadow and opacity checked
    2026-09-16, both genuinely non-issues, not overlooked**: Paper's own
    MD3 elevation is ALREADY correctly handled — real HCT-computed surface
    tinting at fixed dp levels (`generate/rn-paper.ts`'s own
    `surfaceColorAtElevation`, built earlier), the actually-correct MD3
    mobile approach (no `box-shadow` concept exists in MD3 or React
    Native), not something this pipeline's own `shadow.json` should
    override. Opacity has nothing real to bind either — MD3 design
    languages never offer an opacity PRESET choice at seed input in the
    first place (Tailwind/Bootstrap only), so there's no user-facing
    opacity decision this pipeline is silently ignoring for Paper.
  - **shadcn/ui, shadcn-vue — radius was always fine, spacing had a real,
    silent bug, fixed 2026-09-15, then extended 2026-09-16 for the
    `bootstrap` preset.** Unlike the three above, these vendor real
    component *source files* directly — real, unmodified `button.tsx`/
    `Button.vue` uses raw Tailwind spacing classes. Tailwind v4 resolves any
    of these that ISN'T an explicit named override via its own base
    `--spacing` variable (`calc(var(--spacing) * N)`) — this pipeline never
    wrote that variable at all, so every project silently used Tailwind's
    raw 4px default regardless of the spacing-rhythm preset actually
    chosen. Confirmed with a real compiled build before fixing, and
    confirmed the fix with a real browser's computed style on a real
    vendored `Button`, for both frameworks. **Real-token-bound for every
    spacing preset whose scale is a constant multiplier** (`tailwind`/
    `md3`/`md2` — all 4px/step), via that single `--spacing` variable.
    **The `bootstrap` preset (0/4/8/16/24/48px — not a constant-multiplier
    scale) got a DIFFERENT, second mechanism (2026-09-16)**, since no
    single constant can stand in for a non-linear scale: a NAMED
    `--spacing-<N>` override for each exact key `spacing.json` itself
    defines (0-5), written into a real `@theme { }` block (a per-key
    named override, unlike the base constant, only takes effect there —
    Tailwind only recognizes it as a utility-generating key when it's
    inside a real `@theme` block its own build step scans; a plain `:root`
    declaration is inert for this specific mechanism, confirmed live).
    Verified with a real compiled build showing `.px-4{padding-inline:
    var(--spacing-4)}` resolving to the bootstrap preset's real 24px value
    (genuinely different from Tailwind's own 16px default, not a
    coincidental match), for whichever real vendored component happens to
    use that exact key. **Still disclosed, not fixed**: any class using a
    key beyond what the preset defines (e.g. `h-8`, `gap-6`+), and any
    FRACTIONAL class (`px-2.5`, `gap-1.5`) — both still fall back to
    Tailwind's raw default; same partial-but-honest shape as RNR's own fix
    below. Confirmed against a fresh `shadcn add`, real Button's default
    size is `h-8 gap-1.5 px-2.5` (fractional, outside this fix's scope) and
    Badge's real `px-2` is exactly the shape this fix now covers — both
    match what this project's own Figma-push plan (`figma-components-
    plan.ts`'s `buildButtonPlan`) already assumed, confirmed via that
    file's own git history, not a new mismatch this fix surfaced. Radius
    was never affected by any of this — `--radius` was always a single
    real value, not part of this bug. **Shadow ALSO now
    bound (2026-09-16), and needed its own real fix, not a copy of the
    `--spacing` mechanism**: a real, non-obvious finding — Tailwind v4
    RESHUFFLED its own shadow scale relative to v3 (added a new `2xs`
    tier, shifted names: v3's `sm` is v4's `xs`; v3's bare `DEFAULT`
    is v4's `sm`) — this pipeline's own `shadow.tailwind.json` was built
    matching v3, so it binds to `--shadow-xs`, NOT `--shadow-sm`, for its
    own `sm` token (confirmed against the real npm-published
    `tailwindcss@^4` package's own `theme.css`). A second, more important
    finding: unlike `--spacing` (referenced live via `calc()`), Tailwind
    v4 BAKES shadow lengths as literal numbers into each utility class at
    build time — a later plain `:root` override (the `--spacing`
    mechanism) has ZERO effect on `shadow-md` etc., confirmed by an actual
    failed browser check before finding the real fix: the binding has to
    live inside a real `@theme { }` block instead, which Tailwind's own
    build step actually processes. Verified live with two real, different
    shadow presets (not just the coincidentally-matching `tailwind` one)
    that the compiled `.shadow-md` rule reflects OUR real values.
  - **RNR — different mechanism, real fix 2026-09-16 (partial for
    `bootstrap`, complete for the other three presets).** NativeWind here
    is pinned to Tailwind v3 (a hard peer-dependency requirement, not this
    pipeline's choice), a fully-enumerated JS config object, not v4's CSS
    base-multiplier system. A real, non-obvious finding while fixing the
    "never overridden" gap flagged 2026-09-14: three of this pipeline's
    four spacing presets (`tailwind`/`md3`/`md2`) are, by this pipeline's
    own design, already numerically identical to Tailwind v3's real
    default scale — so for those three, no override was ever actually
    needed; only `bootstrap` (non-linear, keys 0-5 only) was ever really
    mismatched. `scaffold/react-native.ts` now extends `theme.spacing` with
    whatever real keys this run's own `spacing.json` defines — a real,
    verified fix for `bootstrap` (its own real vendored classes in the 0-5
    range, e.g. `px-3`/`px-4`, now bind correctly — confirmed live with the
    real `tailwindcss` CLI, `px-3` compiling to `16px` instead of Tailwind's
    mismatched 12px default), and a correct, explicit no-op for the other
    three. **Disclosed, not fixed:** `bootstrap`'s own keys beyond 5 still
    fall back to Tailwind's real default, since `spacing.bootstrap.json`
    itself was never scoped past key 5 — the same structural ceiling as the
    shadcn/shadcn-vue case above, reached by an object-merge instead of a
    single-CSS-variable mechanism. **RNR's own typography size scale ALSO
    now bound (fixed 2026-09-16, same day) — and this one is a COMPLETE
    fix, unlike spacing.** Confirmed real vendored `components/ui/` already
    uses real `text-sm`/`text-lg`/`text-2xl`/etc. classes (36 real uses of
    `text-sm` alone in one real vendored project). `scaffold/react-native.ts`
    now extends `theme.fontSize` with all 13 of Tailwind's real named keys
    (`xs` through `9xl` — confirmed against the real npm-published
    `tailwindcss@^3` package's own default config), each bound to the
    nearest real type-scale token for THAT key's own real default px
    target. Unlike spacing, there's no "keys beyond 5" gap here — Tailwind's
    real fontSize scale has exactly these 13 keys and nothing else to fall
    through to, so binding all 13 is complete, not partial. Verified live
    with the real `tailwindcss` CLI against two different presets: `tailwind`
    (a correct no-op, matching Tailwind's own real defaults at every key
    this pipeline's scale defines) and `md3` (genuinely different real
    values — `text-sm` compiling to `12px` instead of Tailwind's `14px`
    default, `text-lg` to `19px`, `text-3xl` to `28px`). **Disclosed, not a
    bug:** this pipeline's own curated 8-value type-scale mapped onto
    Tailwind's 13 real keys means the larger keys (`4xl` and up) often
    share the same nearest value — confirmed in the real compiled output
    (`4xl`/`3xl` identical for the `tailwind` preset; `6xl` through `9xl`
    all identical to `5xl`), an honest nearest-match outcome given the
    scale's own real cardinality, not something to "fix" further without
    fabricating extra tokens this pipeline has no real source for.
    **Shadow checked 2026-09-16, real, structural, NOT fixed — a
    different, more fundamental limitation than spacing/typography's own
    gaps.** Real vendored RNR classes DO use `shadow-sm`/`shadow-md`/etc.,
    but checked the real npm-published `react-native-css-interop@0.2.7`
    tarball (the actual library NativeWind pins for CSS-to-native
    translation) rather than assume binding `theme.boxShadow` would help:
    its own `parseBoxShadow` REJECTS any shadow with more than one layer
    outright (`options.addValueWarning("multiple box shadows")`, then
    drops it entirely), and even a single-layer shadow only carries over
    `shadowColor`/`shadowRadius` — no offset, no opacity, no Android
    `elevation`. Since this pipeline's own `md`/`lg`/`xl` shadow tokens are
    real multi-layer definitions (matching Tailwind's own real multi-layer
    defaults), they'd be silently dropped by NativeWind regardless of
    whether this pipeline binds them or not — this is a structural
    limitation of the underlying translation library, not something
    `theme.boxShadow` binding can fix, so it wasn't attempted. **Opacity
    and border-width checked too, found to need NO fix at all** — real
    Tailwind v3 defaults for both already exactly match this pipeline's
    own tokens at every key either defines (confirmed against the real
    npm-published `tailwindcss@^3` package's own default config), unlike
    spacing/fontSize/shadow, which all had a real, silent mismatch for at
    least one preset. **With this, RNR's spacing and typography size gaps
    are both closed** (spacing partially, typography size completely);
    shadow is a real, disclosed, structural limitation, not fixable by
    this pipeline; opacity/border-width were never actually broken; the
    already-known font-FAMILY gap (real .ttf/.otf files, not fetched for
    any RN scaffold) remains, unrelated to any of this.
  - **Kotlin (Jetpack Compose) / SwiftUI — a different category, not on
    this list's own scale.** There is no automated component library or
    application step for either — `generate --md3`/`--swiftui` produce
    correct token files and a real `SCAFFOLD_GUIDE.md`, but every component
    gets built by a human (or an AI coding agent) following that guide by
    hand. Whether tokens end up "completely applied" depends entirely on
    how carefully that happens, every single time — it's not a fixed,
    disclosable gap the way the others above are, it's fully manual by
    design. Say this plainly if `targetFramework` is `kotlin` or `swiftui`:
    fidelity here is a property of how the guide gets followed, not
    something this pipeline can bind or fail to bind.
- **Figma component push — scope, not just fidelity.** Everything above is
  about whether an already-*applied* component's geometry matches its real
  tokens. This is a separate question: which libraries get a component
  *pushed to Figma* at all. Today, only one combination does — `nextjs` +
  `tailwind` + shadcn/ui (see `cli/src/scaffold/figma-components-plan.ts`'s
  own real scope: **Button, Badge, Toggle, Alert, Input, Textarea, Card**,
  one size each, all seven proven with a real live push into a real test
  file (Button 2026-09-15, Badge 2026-09-16, the rest 2026-09-17). Card is
  the first real compound component (a real Header/Content structure with
  three independent text properties, not just one label). Every
  other combination — the other seven "real theming" combinations from
  row 4, `files-only` mode, Kotlin/SwiftUI — gets tokens pushed to Figma
  as variables when
  `figmaManaged` is true (see below), but no component ever shows up there,
  illustrative or otherwise. **Say this plainly wherever it's relevant**:
  at row 4 (so the pick is informed) and at row 5 (so a `Figma-managed`
  choice doesn't carry an assumption it doesn't earn) — don't let a user
  discover this by noticing Figma stayed empty (or only got a Button)
  after a scaffold finished.
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
   - **`targetFramework` is `nextjs` AND `targetDesignLanguage` is `md3` OR
     `md2` → always `--md2`, never `--md3`.** A real, load-bearing exception
     found and fixed 2026-09-14, alongside the Next.js + MUI scaffold this
     pairs with (`scaffold --framework nextjs --md2`): `--md3` generates
     Kotlin/Jetpack Compose `Color.kt` (confirmed by reading
     `generate/md3.ts`'s own header — real HCT tonal palettes for
     `androidx.compose.material3`, nothing web-consumable at all), so
     passing it for a Next.js project would wire Kotlin files into a React
     app. For Next.js specifically, either Material Design pick means
     "MUI," same as Vue.js's own MD3/MD2 → Vuetify routing above (see
     `ComponentLibrary`'s own `"mui"` comment in `seed-config.ts`: `// Next.js
     + MD3/MD2`) — this was always the intent, just never wired into this
     flag-picking step until now.
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

   **Right before running this command, restate the real geometry-fidelity
   gap from row 4's own disclosure for whichever `componentLibrary` was
   picked — five "installed and wired" libraries (`mui`, `vuetify`,
   `rn-paper`, `react-bootstrap`, `bootstrap-vue-next`) plus `shadcn`/RNR
   now too — don't assume the earlier mention at seed input was enough.**
   This is the actual moment the design system gets applied to real
   components; say plainly, in the moment, exactly what will and won't be
   token-driven (e.g. for React Native Paper: "Button's corners will match
   your real radius token exactly; every other Paper component — Card,
   Chip, TextInput — will use a different, approximated radius derived
   from the same value, and that's a real limit of Paper's own theming
   API, not something this run will fix"; for shadcn/shadcn-vue with a
   `bootstrap` spacing preset: "spacing tokens you've named explicitly are
   bound, but any spacing utility class outside that set — fractional
   ones especially — will fall back to Tailwind's own default, not your
   chosen rhythm"; for RNR: "spacing isn't token-driven at all here yet —
   this project will use NativeWind's own default spacing regardless of
   your spacing-rhythm choice"). See "Known gaps," "Geometry fidelity, by
   library," for the exact current wording per library — don't paraphrase
   it into something vaguer.

   **If `figmaManaged` is true, also restate the Figma-push-scope note here
   (not just geometry fidelity)** — unless this run is `nextjs` + `tailwind`
   + `--shadcn`, no component will be pushed to Figma regardless of how
   this step goes; only tokens will. See "Known gaps," "Figma component
   push — scope, not just fidelity."
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
10. *(Only if row 1 = `Scaffold`)* Real scaffolding exists for eight
    `targetFramework`/`targetDesignLanguage` combinations — every
    combination this pipeline's seed input can actually produce:
    - `nextjs` + `tailwind`
    - `nextjs` + `bootstrap` (React-Bootstrap)
    - `nextjs` + `md3` or `md2` (MUI — see step 8's own `md3`→`--md2`
      routing fix, same session)
    - `vuejs` + `tailwind`
    - `vuejs` + `md3` or `md2` (Vue.js's "Material Design" path — Vuetify)
    - `vuejs` + `bootstrap` (bootstrap-vue-next)
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
    one's real, filled-in answer already sent, not a placeholder. **There is
    no other unmatched combination left** — React Native's only remaining
    gap (Bootstrap) isn't reachable from seed input at all (see "Suggestion
    logic"), so every real seed either matches one of the eight above or is
    Kotlin/SwiftUI.

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

    **`nextjs` + `bootstrap` (React-Bootstrap):**
    ```
    node src/cli.ts scaffold --framework nextjs --bootstrap --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    No vendored-vs-not branch here — react-bootstrap's own full component
    set is always installed. The step 8 `generate` run must have had
    `--bootstrap` passed (it will have — `targetDesignLanguage` `"bootstrap"`
    already maps to it regardless of framework, see step 8 above).

    **`nextjs` + `md3` or `md2` (MUI):**
    ```
    node src/cli.ts scaffold --framework nextjs --md2 --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    Always `--md2` on the scaffold command too, regardless of whether the
    seed's `targetDesignLanguage` was `md3` or `md2` — the step 8
    `generate` run must have had `--md2` passed for the same reason (see
    step 8's own fix, above: `--md3` is Kotlin-only, not something this
    scaffold can consume). No vendored-vs-not branch — MUI's own full
    component set is always installed, same as Vuetify/bootstrap-vue-next/
    react-bootstrap above.

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

    **`vuejs` + `bootstrap` (bootstrap-vue-next):**
    ```
    node src/cli.ts scaffold --framework vuejs --bootstrap --code-dir "out/Code tokens (consumables)/<short-project-slug>" --out "<user-provided path>" [--fonts-dir seeds/<short-project-slug>-fonts]
    ```
    No vendored-vs-not branch here either — same reason as Vuetify above,
    bootstrap-vue-next's own full component set is always installed. The
    step 8 `generate` run must have had `--bootstrap` passed (it will have —
    `targetDesignLanguage` `"bootstrap"` already maps to it regardless of
    framework, see step 8 above).

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
      `docs/layer2-layer3-plan.md`, Subject 2, "the ACIM lesson"). Say
      plainly: spacing (fixed 2026-09-15, a real `--spacing` binding) AND
      shadow (fixed 2026-09-16, a real `@theme` block — NOT a plain
      `:root` override, which a real browser check showed has zero effect
      on Tailwind v4's own shadow utilities specifically) are now
      real-token-bound for every preset except `bootstrap`'s — that one's
      own spacing scale isn't a constant multiplier, so only its
      explicitly-named spacing keys bind (shadow has no such gap — see
      below); every fractional spacing class still falls back to
      Tailwind's own default. **Real, non-obvious detail on shadow
      specifically**: Tailwind v4 renamed its own scale relative to v3 —
      this pipeline's own `sm` token binds to `--shadow-xs`, not
      `--shadow-sm`, confirmed against Tailwind v4's real source, not
      assumed to carry over from v3's naming — see "Known gaps,"
      "Geometry, shadow, and opacity fidelity, by library."
    - **`nextjs` + `bootstrap` (React-Bootstrap):** say bootstrap's own full
      component library is already installed as a real dependency and
      already wired to your brand colors and real radius/spacing/type-scale
      tokens (`src/app/_variables.scss`, `src/app/globals.scss`) — nothing
      to vendor separately, ships as one complete package. Say plainly:
      radius, button padding, button text size (`$btn-font-size`), shadow
      (`$box-shadow-*`), AND disabled-button opacity (`$btn-disabled-
      opacity`, bound 2026-09-16) are all now real-token-bound, nearest
      real token where Bootstrap's own default doesn't land exactly on one
      — nothing left open for this library, see "Known gaps," "Geometry,
      shadow, and opacity fidelity, by library."
    - **`nextjs` + `md3`/`md2` (MUI):** say MUI's own full Material Design
      component library is already installed as a real dependency and
      already wired to your brand colors (`src/app/theme.ts`,
      `createTheme()`) — nothing to vendor separately. Say plainly: corner-
      roundness, button padding (medium/contained case), the full
      typography size scale (h1–h6/subtitle/body/button/caption/overline),
      AND the real action opacities (hover/selected/disabled/focus/
      activated, bound 2026-09-16) are all now real-token-bound — verified
      live in a real browser (including a real `:hover` interaction for
      the opacity fix), not just a successful build. Narrower, disclosed
      scope: only medium/contained gets the padding fix (other
      variant/size combos keep MUI's own literal padding), and h1/h3 land
      on the same `display` token since this pipeline's scale has nothing
      bigger. **One real, structural gap, not fixed and not fixable the
      same way**: MUI's own `theme.shadows` is a fixed 25-level
      physically-modeled elevation array, not a named 5-tier scale —
      different real components use different specific indices for
      structural reasons, so there's no honest mapping from this
      pipeline's own scale without fabricating one — see "Known gaps,"
      "Geometry, shadow, and opacity fidelity, by library."
    - **`vuejs` + `md3`/`md2` (Vuetify):** say Vuetify's own full Material
      Design component library is already installed as a real dependency
      and already wired to your brand colors (`src/plugins/vuetify.ts`,
      `src/plugins/theme.ts`) — nothing to vendor separately, since Vuetify
      (unlike shadcn) ships as one complete package you import components
      from directly, not individual files copied into the project. Say
      plainly: corner-roundness (pixel-exact), button padding, the full
      15-role MD3 typography size scale (each role's real default size
      bound to the nearest real type-scale token via a real Sass
      `map-deep-merge`), AND the real opacity/emphasis constants
      (hover/disabled/high-emphasis/etc., bound 2026-09-16) are all now
      real-token-bound — verified with a real compiled build for the first
      three, and a real running app's own `getComputedStyle` for opacity
      (these get injected at RUNTIME by Vuetify's own JS, invisible in any
      static compiled CSS file — checked properly, not assumed to work the
      same way as the others). Disclosed, narrower scope: the
      stacked-button variant's own separate padding ratio isn't touched.
      **One real, structural gap, same shape as MUI's own**: Vuetify's own
      elevation system is a physically-modeled depth scale (matching MD3's
      real spec), not a named size scale — no honest mapping exists from
      this pipeline's own 5-tier scale — see "Known gaps," "Geometry,
      shadow, and opacity fidelity, by library."
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
      `docs/layer2-layer3-plan.md`, Subject 2, "the ACIM lesson"). Say
      plainly: spacing AND the typography size scale are both now
      real-token-bound (fixed 2026-09-16). Spacing binds for classes in
      your spacing preset's own real key range (e.g. `px-3`, `px-4`) — for
      the `tailwind`/`md3`/`md2` spacing presets this was already correct
      by design (those presets are numerically identical to Tailwind's own
      real default scale), so the fix's real, visible effect is
      specifically for the `bootstrap` spacing preset. Typography size
      binds ALL 13 of Tailwind's real named `text-*` keys (`xs` through
      `9xl`) — a complete fix, not a partial one, since Tailwind's fontSize
      scale has no keys beyond these 13 to fall through to. **Still not
      bound:** the `bootstrap` spacing preset's own keys beyond 5 (its own
      scale was never scoped further). **Say this one plainly if they're
      using real shadow classes on native**: `shadow-md`/`lg`/`xl` won't
      actually render a visible shadow on a real device REGARDLESS of any
      token binding — checked the real underlying `react-native-css-
      interop` library, which drops any multi-layer box-shadow outright, a
      structural limitation of the native CSS-to-shadow translation this
      pipeline can't work around. Opacity and border-width classes need no
      disclosure at all — checked, and Tailwind's own real defaults already
      exactly match this pipeline's tokens. See "Known gaps," "Geometry,
      shadow, and opacity fidelity, by library," for the exact wording.
    - **`react-native` + `md3`/`md2` (React Native Paper):** say React
      Native Paper's own full Material Design component library is already
      installed as a real dependency and already wired to your brand colors
      (`theme.ts`, wrapped in `PaperProvider` in `App.tsx`) — same
      "installed and wired, not vendored" framing as Vuetify above, since
      Paper also ships as one complete package. **Say this one plainly and
      specifically, not just in passing:** Button's corners match your real
      radius token exactly via `roundness` alone (fixed 2026-09-15); ten
      more — Card, Chip, TextInput, Snackbar, Menu, ToggleButton,
      DrawerItem, FAB, Searchbar, and Dialog — ALSO now match exactly
      (fixed 2026-09-16, in two rounds), but via a different real mechanism
      — generated wrapper components under `components/` that use each real
      component's own real, public per-instance override prop, not
      `roundness`. **Tell them to import all ten of these from
      `./components/`, not directly from `react-native-paper`** — importing
      Paper's own versions directly skips the fix entirely (AGENTS.md
      already tells an AI coding agent this). Two real, narrower-scope
      details worth mentioning if they're using FAB or Searchbar
      specifically: only each one's real DEFAULT case is bound
      (`size="medium"` for FAB, `mode="bar"` for Searchbar) — other sizes/
      modes keep Paper's own real, unmodified proportional defaults, since
      this pipeline has no real source for what ratio they should keep
      instead. Every OTHER Paper component not in this list of eleven still
      isn't wrapped and will show a mismatched radius — most are real,
      checked-as-buildable, not-yet-scoped work (same override pattern
      confirmed to exist), but any not yet checked at all shouldn't be
      assumed either way; Tooltip and SegmentedButtons are real, confirmed
      exceptions with no override path at all in their own source, not just
      unchecked. This is no longer "Paper's own theme system has a genuine
      limit, full stop" — it has a limit for the SINGLE `roundness` value,
      but this pipeline now works around it for eleven components via
      Paper's own real per-instance API. See "Known gaps," "Geometry
      fidelity, by library," for the exact wording. **Button padding and
      the full typography size scale are ALSO now bound (fixed 2026-09-16,
      same day)** — `Button.tsx` is a twelfth wrapper, using Button's own
      real `labelStyle` prop (Button has no literal `padding`; its real
      spacing is `marginVertical`/`marginHorizontal` on its label), applied
      to every mode except `"text"` (Button's own real default when `mode`
      is omitted has a genuinely different, smaller margin by design).
      `theme.fonts` — a real, direct theme-level override, no wrapper
      needed — now binds every one of the 15 real MD3 typescale roles'
      `fontSize` to the nearest real type-scale token. Font FAMILY stays
      unbound, a separate, unrelated gap (React Native needs real .ttf/.otf
      files via `expo-font`, not fetched for any RN scaffold). **RN Paper
      is no longer behind MUI/Vuetify on this dimension** — all three now
      have color/radius/padding/typography-size fully closed.

    **If `figmaManaged` is true AND the scaffold just run wrote a real
    `figma-components-push-plan.json`** (today, only `nextjs` + `tailwind`
    + `--shadcn` does — see `cli/src/scaffold/figma-components-plan.ts`'s
    own scope), continue automatically into `SDSGT-figma-push`'s step 7
    right after reporting the above, in this same session — this isn't a
    separate thing to ask the user about first, same as the token push
    after `promote` isn't. Requires the same live Desktop Bridge connection
    as the token push (see that skill's own step 1) — if the connection
    isn't live, say so plainly and offer to run it once the user has Figma
    Desktop open with the bridge running, same as the token-push path
    already does. **Every other combination writes no components plan at
    all** (files-only mode, a non-vendoring library, or a framework this
    plan generator doesn't cover yet) — there's nothing to continue into,
    don't invent a component push for those.

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
