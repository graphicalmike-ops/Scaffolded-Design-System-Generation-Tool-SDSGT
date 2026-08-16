# Scaffolded Design System Generation Tool (SDSGT)

## What this is

A tool that generates a complete design system from a small set of user inputs, then scaffolds a new project (in the user's chosen framework/stack) with that design system already wired in.

## Status

Restarting from scratch (2026-08-15) under Sonnet, after an initial pass under Opus. Prior planning work from that earlier session exists in `docs/archive/` for reference, but nothing there is binding — we're re-deciding scope and approach here.

## The pipeline (high level)

**Input:** "pretokens" — a small set of user-supplied inputs (main brand colors, corner-roundness style e.g. square/lowly-round/highly-round/squircle, etc. — full list still TBD).

**Output**, generated from those pretokens plus a chosen framework/stack:
- Code design tokens (primitive + semantic) in the target platform's syntax
- A Figma file populated with matching variables/styles — **optional step**, since the DS is fully usable from code tokens alone; useful when the user wants a visual/Figma-based way to manage the DS rather than hand-editing token code
- Components from the user's chosen component library, styled to the generated DS
- Agent-facing rules (so an AI coding agent uses the DS correctly)
- A full project scaffold, in the chosen framework, with all of the above wired in

Also needed: a way to edit/manage the DS after initial generation, not just a one-time generator (treated as a distinct phase from first-time generation).

## Architecture decisions so far

- **The generated output (what a run produces)** is a normal, ready-to-code project — nothing exotic, just a real repo in the chosen framework with the DS already wired in.
- **The generator doesn't maintain its own framework boilerplate.** It drives the *official* scaffolding CLI for whichever framework the user picks (`create-next-app`, `create-expo-app`, `vue create`, etc.) to get a fresh, current base, then layers DS generation on top. This avoids maintaining N stale framework boilerplates ourselves.
- **The generator itself runs as a Claude Code skill for now**, not a standalone published CLI/package. It uses tools already available in a Claude Code session (shell commands, file writes, the Figma MCP). This matches the current "agent chat" interface and avoids building distribution/packaging machinery before the core DS-generation logic is proven out. Can be extracted into a standalone CLI later without losing the underlying logic.

## Open questions

- Full list of pretokens beyond brand colors + corner-roundness style.
- Which component library/libraries to support first (not yet chosen).
- Whether a generated project can pull later DS updates ("re-sync"), or is frozen at generation time and only hand-edited after.
- Token format standard for the code tokens (e.g. W3C Design Tokens / Style Dictionary vs. something hand-rolled) — not yet re-decided.

## Project docs

- `docs/figma-mcp-capabilities.md` — verified capabilities and caveats of the Figma MCP integration this project uses. Read when working on the Figma side of the pipeline.

## Working style

- Keep explanations plain and non-technical where possible. The user is not a developer by background.
- Explain a step in plain English before doing it, and confirm before making changes.
- Avoid over-engineering — don't build things "just in case." Add what's needed when it's needed.
