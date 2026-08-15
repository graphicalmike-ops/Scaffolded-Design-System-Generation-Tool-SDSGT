# Scaffolded Design System Generation Tool (SDSGT)

## Purpose

A reusable template/tooling project for quickly bootstrapping a design system for a new app or website — built from two sources of experience:

1. **Professional practice** — the user manages the design system for a service website's production team, currently migrating that team's workflows and DS to be used with Cursor and AI coding agents.
2. **The ACIM app project** — the user's first shipped app (Expo/React Native, NativeWind + react-native-reusables), which surfaced concrete lessons about what makes a design system easy vs. painful for an AI agent to build correctly against. See "Learnings carried over" below.

**End goal:** once this template is solid, integrate it into a broader scaffolding tool for spinning up future apps/websites — the design system piece is the first slice of that larger scaffold, not a standalone deliverable.

## Status

Just created (2026-08-10). No code yet — next session starts from a blank folder. Scope, stack, and output format are still open (see below).

## Project docs

Findings and reference notes live in `docs/`. Read the relevant one when it applies:

- `docs/pipeline-plan.md` — the working plan: the explore→promote→generate process loop, settled decisions (code-as-source in DTCG JSON via Style Dictionary, platform-agnostic outputs, light/dark handling on free Figma plan, layer-split editing, formula bake-once resolution), the tooling still to build, and open decisions. **Start here for project direction.** ⏳ Known intentional TODO: the **naming & structure conventions** contract is deferred but must be sorted before any tooling is built — see the plan's "Pending" section.
- `docs/figma-mcp-capabilities.md` — verified (2026-08-10) that the Southleft Figma MCP can create/edit/delete variables and text styles, enabling a code-as-source → push-to-Figma pipeline. Includes caveats: manual desktop-bridge connection, free-plan 1-mode cap, stale read-after-write cache.

## Open questions to resolve at kickoff

- **Target surface:** is this template for web (the service website's stack), native apps (Expo/RN, like ACIM), or both? Does it need to be platform-agnostic at the token layer with platform-specific component layers on top?
- **Token format:** hand-rolled (like ACIM's `constants/Colors.ts`/`Typography.ts`) vs. a standard like W3C Design Tokens / Style Dictionary — worth deciding given the "automation" goal implies tooling should generate/sync tokens, not hand-maintain them.
- **Figma → code pipeline:** ACIM used the Southleft MCP Desktop Bridge for manual token/asset pulls (see learnings below). Does the professional workflow already have (or want) a more automated Figma → code sync, e.g. via Code Connect or a token-sync pipeline?
- **Cursor/agent-facing artifacts:** since the professional migration is specifically "for use with Cursor and AI agents," this template probably needs to output not just code but agent-readable rules/docs (`.cursor/rules`, a `CLAUDE.md`/`AGENTS.md` pattern, Code Connect mappings) describing the DS so an agent can use it correctly without re-deriving conventions each time.
- **Component library base:** does this assume a specific base (e.g. shadcn/RNR-style CLI-vendored components, like ACIM) or stay library-agnostic?
- **"Automatization" scope:** what's actually meant to be automated — token generation, component scaffolding, a CLI/generator script, or a starter repo the user manually clones and customizes each time?

## Learnings carried over from ACIM app

Full retrospective lives in the ACIM app project's memory (`feedback_cross_project_learnings` and linked memories, in the `-Users-migjulio-ACIM-app` project). Highlights most relevant to a design-system template specifically:

- **NativeWind's default `inlineRem` is 14, not 16** — silently shrinks every rem-based utility class with no error. If this template touches NativeWind, bake the correct config in from the start rather than relying on someone rediscovering it.
- **`tailwind-merge` doesn't reliably cancel classes across differently-shaped Tailwind groups** (e.g. `px-4` vs `pl-5`, or a `has-[>svg]:px-3` variant vs a plain `px-*` override) — a template that generates component variants should account for this or provide a verified merge pattern, not leave it to be discovered per-component.
- **CLI-vendored components (shadcn/RNR-style) should be trimmed to actually-used variants, not kept as full unused scaffolding** — and once customized, never blindly re-run the vendor CLI to "update" (no merge mechanism, silently overwrites). A template optimized for AI-agent use should probably mark customized files clearly (e.g. a `// CUSTOMIZED` convention) so an agent doesn't reflexively "fix" them by re-pulling.
- **Design tool credentials/accounts should be cleanly separated per project** from the start to avoid silent access failures.
- **Avoid over-engineering / premature abstraction** (standing principle from ACIM's CLAUDE.md, worth carrying forward explicitly into a template meant to prevent future rework): don't scaffold variants, tokens, or components "just in case" — a template should make it easy to add what's needed, not pre-generate what might be needed.
- **Token/style decisions worth settling once and documenting** (font sizes, spacing, color roles) so an agent doesn't re-litigate them per screen/component — ACIM's `feedback_reader_features`-style "settled decision" memories are effectively what a good DS template's documentation should look like baked in, rather than accumulated ad hoc over a project's lifetime.

## Working style

Same as established with this user on ACIM: for hands-on execution, explain a step in plain English before doing it and confirm before proceeding — this user is not a developer by background and prefers to follow along step by step rather than have large changes made at once. Confirm at kickoff whether that still applies here or whether this project (more tooling/template-focused, less live-user-risk) warrants a faster pace.
