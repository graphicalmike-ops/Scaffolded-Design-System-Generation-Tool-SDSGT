# Scaffolded Design System Generation Tool (SDSGT)

## What this is

A tool that generates a complete tokenized design system from a small set of user inputs, then scaffolds a new project (in the user's chosen framework/stack) with that design system already wired in.

**Terminology note:** when the user refers to SDSGT as "the tool" (or similar), that is not specifying its actual implementation form (skill, CLI command, GUI, etc.) — that form is a separate, still-open decision (see "Architecture decisions so far" below).

## Why this project exists

Two experiences motivate it:

1. **Professional practice** — the user manages the design system for a service website's production team, and is migrating that team's workflows and design system to work well with Cursor and AI coding agents.
2. **The ACIM app** — the user's first shipped app (Expo/React Native, NativeWind + react-native-reusables), which surfaced concrete lessons about what makes a design system easy or painful for an AI agent to build against correctly (see "Lessons from a previous project" below).

The long-term goal is bigger than a design system generator: once this piece is solid, it becomes the first slice of a broader scaffolding tool for spinning up new apps/websites in general.

## Status

Restarting under Sonnet (2026-08-15), after an initial planning pass under Opus. That earlier work has been reviewed and merged back into this file and into `pipeline-plan.md`, rewritten in plainer language. The original Opus-authored files are kept verbatim in `docs/archive/` as a historical record — nothing there is more current or authoritative than what's written here now.

## The pipeline (high level)

**Input:** a small set of user-supplied "pretokens" — brand colors and a base font, explored directly (e.g. as `#hex` values, a screenshot, or an optional Figma file), plus a few style choices picked from small preset menus (corner-roundness, spacing rhythm, type scale).

**Output**, generated from those inputs plus a chosen framework/stack:
- Code design tokens (primitive + semantic) in the target platform's syntax
- A Figma file populated with matching variables/styles — **optional**, since the design system is fully usable from code alone
- Components from the user's chosen component library, styled to the generated design system
- Agent-facing rules, so an AI coding agent uses the design system correctly without re-deriving conventions
- A full project scaffold, in the chosen framework, with all of the above wired in

There's also an ongoing editing/management layer: once a project is generated, its tokens stay editable (see "Architecture decisions" below) rather than the tool being purely one-shot.

## Architecture decisions so far

- **The generated output is a normal, ready-to-code project** — nothing exotic, just a real repo in the chosen framework with the design system already wired in.
- **The generator drives the official scaffolding CLI** for whichever framework is chosen (`create-next-app`, `create-expo-app`, `vue create`, etc.) rather than maintaining our own copies of framework boilerplate, then layers design-system generation on top. Keeps every generated project on a current base without us having to maintain N stale boilerplates.
- **The generator's actual logic lives in a CLI core, not inside any single agent's instructions.** A standalone command-line program holds 100% of the pipeline logic (token generation, Style Dictionary conversion, scaffold orchestration, agent-rules writing). Every AI assistant — Claude Code, Codex, Cursor — gets a thin wrapper that just tells it to run that program, rather than each one containing its own copy of the logic. The Claude Code skill (`/SDSGT-start`) is today's development interface and stays that way, but it's an adapter over the CLI, not the tool itself. This is more deterministic than a skill-only design (real code runs identically every time; an AI interpreting instructions can vary run to run), works across multiple agent platforms by construction, and means a future GUI can call the same CLI directly instead of needing a rewrite. Full reasoning in `pipeline-plan.md`, "Tool architecture."
- **Determinism is a project-wide goal, not just the reasoning behind the CLI-core decision.** Given the same inputs, the pipeline should produce the same output every run. This shows up in more than one settled decision: the CLI-over-skill architecture above, and formulas (e.g. brand color → full palette) running once at promotion time and then getting baked into plain values instead of staying "live" (see "Formulas run once" in `pipeline-plan.md`). Where a step genuinely needs an AI's judgment — interpreting a screenshot into brand colors, the Figma component build-screenshot-check-adjust loop — that's a deliberate, scoped exception, not the default posture.
- **Code is the source of truth, not Figma.** The tool starts in code and pushes into Figma — never the other way around. Figma is a generated mirror, useful for visual editing, not the master copy.
- **Tokens are stored in the W3C "DTCG" JSON format** (a standard, not something hand-rolled) and converted into each platform's real code — CSS, TypeScript, etc. — using a conversion tool called Style Dictionary.
- **Figma push is optional.** Someone who doesn't want to touch Figma can manage every token directly in code.
- **A generated project doesn't receive future tool updates** — if the SDSGT generator itself improves later, already-generated projects don't retroactively benefit (each one is frozen relative to the tool itself). But every generated project keeps a live **token sync** feature, so token *values* can keep being edited — in Figma or in code — and kept in sync with each other, going forward. This is different from re-running the whole generator, which is a deliberate, destructive "start over" action, not part of routine use.
- **Corner-roundness ships as a small preset menu** (square / lowly-round / highly-round), chosen at generation time — the same mechanism used for spacing rhythm and type scale — rather than freeform input. A more exotic "squircle" shape (the smoothed corner style used on iOS app icons) is a deferred future addition, since it needs real extra drawing work on each platform, not just a bigger radius number.

Full reasoning behind these, plus the rest of the settled decisions, live in `pipeline-plan.md`.

## Lessons from a previous project (ACIM app)

Concrete, non-obvious things worth not re-learning the hard way:

- **NativeWind's default `inlineRem` is 14, not 16** — it silently shrinks every rem-based size with no warning. If this project touches NativeWind, set this correctly from the start.
- **`tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups** (e.g. `px-4` vs. `pl-5`) — component variants need to account for this rather than assuming overrides always "just work."
- **Vendored/CLI-installed components (shadcn-style) should be trimmed to only the variants actually used.** Once customized, never blindly re-run the install command to "update" them — there's no merge logic, it silently overwrites. Mark customized files clearly so an agent doesn't "fix" them by reflexively re-pulling.
- **Keep design-tool credentials/accounts cleanly separate per project**, to avoid silent access failures.
- **Settle token/style decisions once and document them** (font sizes, spacing, color roles) so they don't get re-argued per screen or component later.

## Open questions

- Which component library/libraries to support first — not chosen yet.
- Token naming & structure conventions (how tokens are named, and how Figma variables map back to them) — deliberately not designed yet. Nothing else can really be built until this is sorted; see `pipeline-plan.md`.
- Squircle support — deferred until there's time to build proper per-platform drawing logic.

Full list of remaining open and deferred items: see `pipeline-plan.md`.

## Project docs

- `pipeline-plan.md` — the full working plan: how the generation pipeline works end to end, what's decided, what's still open. Start here for the detail behind the summary above.
- `docs/figma-mcp-capabilities.md` — verified capabilities and caveats of the Figma MCP integration this project uses. Read when working on the Figma side of the pipeline.
- `docs/archive/` — the original Opus-authored planning docs, kept verbatim as a historical record. Their content has been reviewed and folded into the files above, in plainer language.

## Working style

- Keep explanations plain and non-technical where possible. The user is not a developer by background.
- Explain a step in plain English before doing it, and confirm before making changes — prefer small, followable steps over large batched changes.
- Avoid over-engineering — don't build things "just in case." Add what's needed when it's needed.
