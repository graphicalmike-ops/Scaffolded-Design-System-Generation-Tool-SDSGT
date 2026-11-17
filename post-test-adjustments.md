# Post-test adjustments

Adjustments to the tool based on what the designer saw in the results of the
last full run (2026-10-24: `portfolio-2026` seed, Next.js + Tailwind + shadcn/ui,
Figma-managed, tokens and components pushed).

This file is a working list. Add each adjustment as it comes up; mark it done
once it's built. Settled decisions should then be folded into
`pipeline-plan.md` / `contracts-and-seeds.md` as usual.

## How to add an entry

- **What was seen:** the observation in the run's results.
- **Adjustment:** what should change in the tool.
- **Status:** `open` / `in progress` / `done`.

## Adjustments

### 1. Make both fonts required, and rename them to heading and body (UI) fonts

- **What was seen:** the seed treats the secondary font as optional, and the
  fonts are called "primary" and "secondary". In the last run, DM Serif Display
  was primary (headings) and Plus Jakarta Sans was secondary (body).
- **Adjustment:** to be thought through, not decided. Make both fonts required
  and rename them to heading font and body (UI) font. Open points to settle
  before building: the seed field names, the question wording in
  `SDSGT-start` (rows 11 and 12), `contracts-and-seeds.md`, and what happens
  to existing seeds that only have a primary font.
- **Status:** open (needs a decision)

### 2. shadcn components should use the body font, except heading-like ones

- **What was seen:** the vendored shadcn components don't clearly split fonts
  by role.
- **Adjustment:** shadcn's generated components use the body font by default.
  Components that act as headings (for example card titles, dialog titles) use
  the heading font. The list of which components count as headings still needs
  to be settled.
- **Status:** open
- **Related:** depends on adjustment 1 if the fonts get renamed.

### 3. Ask which AI tool the output is for, and name the rules file to match

- **What was seen:** the generated rules file is always `AGENTS.md`. Claude Code
  reads `CLAUDE.md`, not `AGENTS.md`, so the rules aren't picked up right away
  in a Claude Code project. The `CLAUDE.md` and `.cursor/rules` mirrors in the
  plan were never built.
- **Adjustment:** add a new question to the initial form, right after "Scaffold
  vs. design system files only": which tool will use this output — Claude Code,
  Cursor or Codex? The answer decides the rules file name:
  - Claude Code: the rules file is generated as `CLAUDE.md`.
  - Cursor: stays `AGENTS.md`.
  - Codex: `AGENTS.md` (Codex reads that file natively).
- **Open points:** the new seed field and its place in `contracts-and-seeds.md`;
  the wording inside the generated file, which currently says it is the
  canonical file "read natively by Codex"; every place that points to
  `AGENTS.md` by name (`foundations-rules.md`, `design.md`, the skill); and
  whether Cursor really needs `AGENTS.md` or its own `.cursor/rules` file
  (needs checking).
- **Status:** open

### 4. Regenerating must not delete what the designer added to design.md

- **What was seen:** `design.md` is rewritten on every `generate` run, so
  anything the designer added by hand would be lost when colors or other
  tokens are regenerated.
- **Adjustment:** when the tool regenerates, it keeps the designer's added
  content and only updates its own usual output. Where the two conflict, the
  tool's generated output takes precedence over the designer's added text.
- **Open points:** how the tool tells its own content from the designer's (for
  example fixed markers around the generated parts); what happens to a
  designer's note that now contradicts the new tokens; and how this fits the
  existing rule that regenerating is a deliberate reset (`AGENTS.md` rule 6).
- **Status:** open

### 5. Figma components should use the generated text styles

- **What was seen:** the text inside the components pushed to Figma isn't
  attached to the generated text styles (the 15 `typography/semantic/*` styles
  from the token push). The designer reports it uses font variants or raw font
  properties instead.
- **Adjustment:** text in the pushed components uses the generated text styles,
  not variable-bound font properties and not raw font family, size or weight
  values. Changing a text style in Figma should then update every component
  that uses it.
- **Open points:** which text style each component's text maps to (the plan
  would need to name one per text layer); where no generated style matches a
  component's text; how the pull (Figma to code) side reads a text style
  instead of individual properties; and how this fits the heading and body
  font changes in adjustments 1 and 2.
- **Status:** open

### 6. Rename "placeholder" text to "Labels"? (to decide)

- **What was seen:** the designer suggests "Labels" instead of "placeholder"
  for the sample text shown in fields.
- **Found when checking:** no token is named "placeholder". The word appears
  only in the Figma Input and Textarea components, which show placeholder text
  instead of typed content, and in the generated demo page. There is already a
  separate `Label` component, and the plan uses "label" for other things
  (Button text, a disabled-label color token), so "Labels" could be confused
  with those.
- **Adjustment:** to be decided. Open points: what exactly gets renamed (the
  Figma text layer, a component property, the demo page); and whether another
  name avoids the clash with the `Label` component.
- **Status:** open (needs a decision)

### 7. Name the default body text size "md"

- **What was seen:** the Figma text styles for the middle body size have no
  size in their name (`body-regular`, `body-semibold`), while the small and
  large ones do (`body-sm-*`, `body-lg-*`). Headings do use `md`
  (`heading-md-*`).
- **Checked in the code tokens:** the same inconsistency is there. The names
  come from `typography.semantic.json`, so the CSS variables are
  `--typography-semantic-body-regular` and `--typography-semantic-body-semibold`,
  with no `md`. Figma and code share one source, so the fix is in one place.
- **Adjustment:** rename the middle body size to `body-md-regular` and
  `body-md-semibold` in the token spec, which carries through to Figma and all
  code tokens.
- **Open points:** everything that refers to the old names (the Figma push
  plan, the component plan, `design.md`, `AGENTS.md`, the sync snapshots);
  existing projects keep the old names unless renamed by hand; and whether
  `caption-*` and `display-*` (one size each) should stay as they are.
- **Status:** open

### 8. Attachment size variants look the same size but have different corner radii

- **What was seen:** in Figma, the Attachment size variants look the same size
  while their corner radii differ.
- **Found when checking the push plan and the vendored code** (not yet checked
  by measuring the Figma file):
  - Radius: Default and Sm use `radius/xl`, Xs uses `radius/lg`. This matches
    the code, where only `xs` has a smaller radius (`rounded-xl` for default and
    sm, `rounded-lg` for xs). So the radius difference is not a mistake.
  - Size: Default and Sm both use 12px text and the same horizontal padding
    (`spacing/2`). The code gives Default 14px text and 10px horizontal padding
    and Sm 12px and 8px. This type scale has no 14px step, so the push snapped
    Default's text to 12px, which makes Default and Sm nearly identical. Only
    their inner gap differs (`spacing/2` vs. `spacing/1`). That is the likely
    cause of the "same size" look.
- **Adjustment:** to be decided. Either make Default visibly larger than Sm in
  Figma (for example a larger text size or padding), or keep the snapping and
  state it in the component's disclosures. Worth checking whether other
  components have the same snapping problem (not checked).
- **Status:** open (needs a decision)

### 9. The scaffolded project should come with Storybook set up

- **What was seen:** the scaffolded project has no Storybook. The designer
  wants Storybook set up in the end output.
- **Adjustment:** the scaffold step sets up Storybook in the new project, wired
  to the generated design system (the generated tokens, fonts and theme file),
  so the vendored components can be viewed and tried out right away.
- **Open points (not looked at yet):** which frameworks and component libraries
  get it (the run was Next.js + Tailwind + shadcn/ui; Vue.js and React Native
  need their own Storybook setups, and Kotlin and SwiftUI have no scaffold
  step); whether it is always on or an extra question in the form; whether it
  includes a story for each vendored component or only the setup; how the
  scaffold gets the setup without prompts (Storybook has its own init command,
  which would need checking, as with the other official CLIs); and what it adds
  to the agent rules (`AGENTS.md`) and `design.md`.
- **Status:** open

### 11. Create tokens for every weight a font offers

- **What was seen:** the tool only uses a fixed set of weights. In the last
  run the font weight primitives were `regular` (400), `semibold` (600) and
  `bold` (700), and the semantic text styles are built only from those. If a
  font has other weights (for example light, medium or extra bold), they are
  ignored.
- **Related case from the run:** DM Serif Display only ships Regular, so the
  heading text styles named semibold and bold fell back to Regular weight.
- **Adjustment:** when a font offers more weights, the tool creates the extra
  tokens, Figma variables and text styles for those weights too, in code and
  in Figma.
- **Open points:**
  - How the tool learns which weights each chosen font really has (the font
    fetch step would need to report them).
  - The naming of the new weights, and whether they all get semantic text
    styles or only primitives. Adding every weight to every text role would
    multiply the number of styles.
  - How this interacts with the fixed set of semantic roles (caption, body,
    heading, display) and with adjustments 1, 5 and 7.
  - Existing projects keep the old set of weights.
- **Status:** open

### 12. Body "semibold" text shows up as medium weight

- **What was seen:** in the last run, the body semibold text appears to be
  medium weight.
- **Found when checking (cause not confirmed):**
  - The tokens are correct on paper. `body-semibold` points at the semibold
    primitive (600), the Figma text style data says 600, and the project loads
    a real Plus Jakarta Sans 600 file.
  - The vendored shadcn components use `font-medium` (weight 500) in 40 places
    instead of the semibold token. The font setup only has files for 400, 600
    and 700, so a 500 request falls back to a neighbouring weight in the browser.
  - The Figma component plan also sets some component text to "Medium" (for
    example Attachment titles).
  - I haven't checked which place showed the medium weight (a Figma text style,
    component text in Figma, or the running site).
- **Adjustment:** body semibold text should render as semibold everywhere. Find
  where the medium weight comes from and fix it. If it comes from the shadcn
  components' `font-medium`, decide whether those map to the semibold token,
  whether a medium weight gets its own token (see adjustment 11), or whether the
  vendored components are changed.
- **Status:** open (cause to confirm)

### 13. Figma text style names don't match their actual font weights

- **What was seen:** in Figma, the text style names mention a weight (semibold,
  bold) that doesn't match the weight the style actually has.
- **Found when checking the data from the last run (Figma itself not
  re-checked):**
  - Heading and display styles: `heading-sm-semibold`, `heading-sm-bold`,
    `heading-md-semibold`, `heading-md-bold`, `heading-lg-semibold`,
    `heading-lg-bold` and `display-bold` all use DM Serif Display at weight 400,
    because that font only ships Regular. The names say semibold or bold, but
    the style is Regular.
  - The body and caption styles (`*-semibold`) are 600 in the data. Whether
    Figma shows them as SemiBold or something else was not checked. This may
    be the same problem as adjustment 12.
- **Adjustment:** a text style's name should always match its real weight. Open
  points: whether weight names are dropped from heading styles when the font
  has only one weight, or the names follow the weight the font really has;
  whether the tool should read the weights a font offers (adjustment 11) and
  name styles from that; and whether the name is checked against the weight
  Figma actually applied after the push, so a mismatch is caught during the
  push.
- **Status:** open

### 14. Storybook only shows Button and Badge

- **What was seen:** in Storybook (set up in the project by a separate agent
  session, not by the tool), only Button and Badge appear. The designer asked
  why the other components are missing.
- **Cause, from that session's answer (not re-checked here):** only two story
  files exist, `button.stories.tsx` and `badge.stories.tsx`, written as examples
  to prove Storybook works. Storybook only lists components that have a story
  file, and the other roughly 60 components in `src/components/ui/` have none.
- **Adjustment:** when the tool sets up Storybook (adjustment 9), it also
  creates a story for every vendored component, not just two examples. This
  answers adjustment 9's open point about stories: the designer expects all of
  them.
- **Status:** open

### 15. Component sizes and spacing in code are off the generated token scale

- **What was seen:** the Button `lg` size is 36px high in code, while Figma says
  32px. The generated spacing scale has no 36px step.
- **Cause, from that session's answer and the vendored code:**
  - The sizes come from shadcn's own defaults in `button.tsx`: xs `h-6` (24px),
    sm `h-7` (28px), default `h-8` (32px), lg `h-9` (36px).
  - The spacing tokens are 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 and 96.
    So 28px and 36px are not on the scale, and neither is `px-2.5` (10px) or
    `gap-1.5` (6px). Several other paddings and gaps are off the scale too.
  - The Figma push snapped these values to the nearest token (Button `Sm` draws
    at 24px, Default at 32px), which is why Figma and code disagree. This
    snapping is mentioned in `AGENTS.md` rule 4 and in the component
    disclosures, but the designer didn't expect the mismatch.
- **Adjustment:** to be decided. The designer wants components to follow the
  generated tokens. Options: (a) change the vendored components so heights,
  paddings and gaps use only spacing tokens, so code and Figma match; (b) keep
  shadcn's values and make Figma match the code with the exact pixels (then
  they are not token-bound); (c) keep both as they are and disclose the
  difference more visibly.
- **Open points:** this is the same cause as adjustment 8 (Attachment
  Default and Sm look alike) and probably explains other size surprises, so the
  fix should be one general rule for off-scale values, not one per component;
  and how it affects the "never re-run `shadcn add`" rule when the vendored
  code is edited.
- **Status:** open (needs a decision)

### 16. Font family variables in Figma are plain text, not font selections

- **What was seen:** in Figma, the primitive font family variables
  (`typography/primitive/fontFamily/primary` and `secondary`) hold plain text,
  such as "DM Serif Display". They are not actual font selections the designer
  can pick from the font list.
- **Found when checking the push plan:** each one is a text (`STRING`) variable
  limited to the font family scope. The font name is written as a string, so
  Figma shows a text field instead of a font picker. I haven't checked whether
  Figma has any other kind of variable that can hold a real font selection.
- **Adjustment:** to be investigated. Make the font family tokens usable as real
  font choices in Figma, so changing a font is done by picking a font, not by
  typing its name correctly.
- **Open points:**
  - What Figma's variable types allow for fonts (needs checking against the
    current Plugin API).
  - If Figma cannot hold a real font selection in a variable, the fallback is
    to document this limit and, if possible, check at push time that the typed
    name matches a font Figma can use, so a typo is caught.
  - How this relates to adjustments 1, 5 and 11 (heading and body fonts, text
    styles, font weights).
  - The sync of Figma edits back to code (the pull) reads this value as text
    today.
- **Status:** open

### 17. A font with only one weight still gets semibold and bold tokens

- **What was seen:** DM Serif Display only has Regular, but the tool still
  generates semibold and bold tokens for it, built on that single weight.
- **Found when checking the generated tokens:**
  - The weight primitives are always `regular` (400), `semibold` (600) and
    `bold` (700), whatever the fonts really offer.
  - `heading-*-semibold`, `heading-*-bold` and `display-bold` are always
    generated. In the code tokens, `heading-md-bold` is `700 28px/34px 'DM Serif
    Display'`, so the browser is asked for weight 700 from a font that only has
    400 (the browser then fakes a bold). In Figma, the same styles fall back to
    Regular (see adjustment 13).
  - So the tokens, the code and Figma don't agree, and several styles are
    duplicates of each other that look the same or fake the weight.
- **Adjustment:** the tool only creates weight tokens and text styles for
  weights the chosen font really has. For a one-weight font, there would be
  only the regular styles. This is the other side of adjustment 11 (create
  tokens for extra weights a font does have).
- **Open points:**
  - The tool has to learn which weights a font offers (see adjustment 11).
  - What the heading and display style names become when only one weight
    exists (for example `heading-md` with no weight in the name), and what
    components that ask for a bold or semibold heading use instead.
  - Existing projects keep the old tokens.
- **Status:** open

### 18. Spacing token names should equal their pixel values

- **What was seen:** the spacing tokens are named by step, not by value. For
  example `spacing/3` is 12px and `spacing/4` is 16px. The designer wants the
  name to match the value (`spacing/12` is 12px).
- **Found when checking the last run:** the spacing tokens are `0, 1, 2, 3, 4,
  5, 6, 8, 10, 12, 16, 20, 24` with values 0, 4, 8, 12, 16, 20, 24, 32, 40, 48,
  64, 80 and 96. So the name and the value only match by coincidence (`spacing/0`,
  and `spacing/12` is 48, not 12). The font size and line height primitives
  already use their pixel value as the name (`fontSize/16`), so there is a
  precedent.
- **Adjustment:** spacing tokens are named by their pixel value in the token
  spec, Figma variables and all code tokens: `spacing/4`, `spacing/8`,
  `spacing/12`, `spacing/16` and so on.
- **Open points (not looked at yet):**
  - The Tailwind spacing classes (`p-4`, `gap-2`) work by step number, not by
    pixels. Renaming the tokens to pixels means the class names stop matching
    the token names, so the vendored components and the Tailwind theme mapping
    need a decision.
  - The other presets (Bootstrap, Material Design) and `contracts-and-seeds.md`,
    which explains the "step vs. pixel" difference today and would need
    rewriting.
  - Everything that points to the old names (the Figma push plan, the component
    plan with its `spacing/2` style references, `design.md`, `AGENTS.md`, the
    sync snapshots). Existing projects keep the old names.
  - Whether radius, border width and other scales should follow the same
    value-based naming rule.
- **Status:** open

### 19. Scaffolding should include Storybook, and the tool opens it at the end

- **What was seen:** in the 2026-11-02 run (Publicis Sapient seed, Next.js +
  Tailwind + shadcn/ui, Figma-managed), the scaffold finished with no Storybook
  in the project. The run ended by pointing to the HTML reports and the
  `npm run dev` steps, so there was no place to see the generated components
  in the browser right away.
- **Adjustment:** two parts.
  - The scaffolded project comes with Storybook installed and wired to the
    generated design system.
  - At the end of generation, the components are shown in Storybook, and the
    tool/agent opens Storybook itself (starts it and opens it in the browser)
    instead of leaving the designer to start it.
- **Related:** adjustment 9 already covers Storybook being set up in the
  scaffold, and adjustment 14 covers a story for every vendored component, not
  just two. This entry adds the last part: showing the components and opening
  Storybook as the final step. The three should be built as one piece of work.
- **Open points (not looked at yet):**
  - Where it sits in the flow: after the scaffold and after the Figma push, as
    the last thing the designer sees, or before the Figma push.
  - How it opens: the agent starts the Storybook server in the background and
    opens the browser at its address (Storybook's usual address is
    `http://localhost:6006`). What happens if that port is already in use, and
    who stops the server afterwards.
  - Whether the opening is done by the CLI or by the `SDSGT-start` skill. The
    rule so far is that the CLI holds the logic and the skill is a thin
    adapter, but opening a browser is something an agent session does.
  - What happens for a `Design system files only` run (no project, so nothing
    to open), and for frameworks other than Next.js + shadcn/ui (Vue.js and
    React Native need their own setups; Kotlin and SwiftUI have no scaffold).
  - Whether the designer can turn the automatic opening off.
- **Status:** open

### 20. Text style tokens have no classes to apply them with

- **What was seen:** building the AI Caravan landing page on the 2026-11-02
  project (Next.js + Tailwind + shadcn/ui). `design.md` says "Pick a type role,
  not a raw font size", and `src/app/theme.css` defines each role as a variable
  (for example `--typography-semantic-body-sm-regular: 400 14px/21px Roboto`).
  The project has no class that applies those variables, so a page has no direct
  way to use a type role. The page had to hand-write 11 classes for them
  (`type-heading-lg`, `type-body-sm` and so on, in `caravan.css`). None of them
  are specific to that page, so every project would hit the same gap.
- **Adjustment:** the tool generates one ready-made class per text style token,
  named after the token, as part of the project's theme, and `design.md` names
  those classes in its type scale table.
- **Related:** adjustment 15 covers the generated components' own sizes being off
  the token scale. Their text uses Tailwind's sizes (`text-sm`, `text-base`) and
  not these type roles, so the two could be looked at together.
- **Open points (not looked at yet):**
  - The class names, and whether they keep the token's full name
    (`body-sm-regular`).
  - Letter spacing: the tokens don't carry it, so the page's hand-written classes
    added it by hand.
  - Other design languages and frameworks: this was seen on Next.js + Tailwind
    only, and they may need a different form.
- **Status:** open

### 21. The generated Button's hover doesn't use the hover token

- **What was seen:** on the same 2026-11-02 project, the default Button's hover
  in `src/components/ui/button.tsx` is `hover:bg-primary/80`, the primary color
  at 80% opacity. The tokens include `action.primary-hover`, listed in
  `design.md`, but the Button doesn't use it. Editing that token wouldn't change
  the Button's hover.
- **Adjustment:** the generated Button's default hover uses
  `action.primary-hover`, so the token controls it.
- **Related:** adjustment 15 covers the generated components' sizes and spacing
  being off the token scale. This is the same kind of gap, for a color state.
- **Open points (not looked at yet):**
  - Pressed and disabled: the tokens also include `action.primary-pressed`,
    `-active` and `-disabled`, and the Button's own pressed and disabled looks
    weren't compared against them.
  - The other Button variants (`secondary`, `outline`, `ghost`) and other
    components with hover states.
  - What the Figma Button's hover uses, and whether it would still match the code
    after this change.
- **Status:** open

### 22. The generated outline Button has no text color of its own

- **What was seen:** on the same project, the `outline` variant in `button.tsx`
  sets a light background but no text color, so it takes its text color from
  whatever surrounds it. In the AI Caravan hero, which sets white text on red, it
  would have shown white text on a near-white button. The comparison site
  (`Demo/publicis-demo-generated`) works around this by setting a dark text color
  on the container around the buttons.
- **Adjustment:** the `outline` variant sets a text color that matches its own
  background, so it stays readable on any section.
- **Related:** adjustment 21 is also about the generated Button's styling.
- **Open points (not looked at yet):**
  - Whether the `ghost` variant has the same behavior on purpose, since it has no
    background of its own and has to read against whatever is behind it.
  - Other generated components with a background but no text color.
- **Status:** open
