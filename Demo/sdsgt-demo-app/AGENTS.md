# AGENTS.md

Read this file before writing any UI code in this project. It's the
canonical agent-rules file — read natively by Codex; other tools' rule
files (`CLAUDE.md`, `.cursor/rules`) are meant to mirror it, not restate it.

- Accessibility/UX rules (how the UI should behave): see
  `foundations-rules.md`.
- This project's actual tokens, resolved presets, and components (how to
  use *this* project's design system specifically): see `design.md`.

## Core rule

Use semantic tokens, not primitives, for color and typography. Every other
token group — spacing, radius, opacity, border-width, shadow, breakpoints,
grid — is flat by design, so referencing it directly is expected, not a
violation. No hardcoded hex/px where a token already covers the value. If
no semantic token fits, add one — don't fall back to a primitive or a
magic number to route around the gap.

## Always / never

1. Never blindly re-run a vendored component's install/add command once it's been customized. There's no merge logic — it silently overwrites. Mark customized files clearly.
2. shadcn/ui's own CSS variable names (`--primary`, `--card`, etc.) are aliased to this project's semantic tokens in `shadcn/theme.css`. Edit the semantic tokens and re-run `generate`, don't hand-edit `theme.css`'s values directly. *(This project targets shadcn/ui.)*
3. Never blindly re-run `shadcn add <component>` on a component that's already been customized — same reasoning as the general vendored-component rule above, called out explicitly since shadcn is this project's component library. If this project was scaffolded with real components vendored, check `sdsgt-vendored-components.json` at the project root first: it lists each vendored file's original content hash. A hash that still matches means the file is untouched and safe to re-vendor; a hash that no longer matches means it's been customized — leave it alone and tell the user, don't silently overwrite it. *(This project targets shadcn/ui.)*
4. `tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups (e.g. `px-4` vs. `pl-5`) — component variants need to account for this rather than assuming overrides always "just work." *(This project targets Tailwind.)*
5. Never re-run the token generator expecting it to "update" the project. Regenerating is a deliberate, destructive reset — it replaces manual edits made since the last run. To fix or adjust something, edit the specific token; don't regenerate.
6. A token is only ever edited in one place at a time. If a value already exists as a token, change the token — don't hardcode a local override in a component to work around it.
7. Don't cross-wire another design language's conventions into this project (e.g. hand-rolling Tailwind-style shade computation into a Bootstrap-targeted project, or approximating MD3's tonal palette with a plain color ramp). Trust the tokens already generated for this project's actual chosen stack — if something seems missing, flag it as a gap rather than importing a different system's approach.
