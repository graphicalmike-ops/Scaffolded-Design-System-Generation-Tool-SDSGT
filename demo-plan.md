# Director demo plan

## Goal

Demo SDSGT for directors without the dead air that a live Generation-stage
run would create (Generation takes too long to sit through live).

## Structure of the demo

1. **Live run, Promotion only.** Run the real tool live, through seed input
   and `promote`. Deliberately stop before `generate` — the `SDSGT-start`
   skill already pauses for confirmation right after showing `promote`'s
   `report.html` and before running `generate` (see the skill's "Running the
   flow," steps 6–8), so this needs no tool change: just decline to continue
   at that existing gate during the live demo.
2. **Pre-made full run, shown separately.** To show what the finished
   product actually looks like, show a Figma file from a real, complete run
   of the pipeline done ahead of time (tokens, components, the works) —
   not generated live.
3. **Prototypes from the pre-made run.** Using the components already
   pushed to Figma by that pre-made run, build a few prototype screens/
   flows in Figma, to show directors what an actual app screen looks like
   on top of the generated design system.

## `Demo/` folder

- New top-level folder, created 2026-10-07, sibling to `Tool/`, `cli`,
  `.claude`, `pipeline-plan.md`, etc.
- Holds **outputs only** from the one pre-made run (tokens, generated code,
  component push plan, etc.) — explicitly **not** a copy of the tool itself
  (no `Tool/cli`, no `.claude/skills` duplicated inside it).
- No code changes are needed to point pipeline output here — every
  `promote`/`generate`/`scaffold` command already takes an explicit
  `--out <path>` (`Tool/cli/src/cli.ts:396,452,544`), so the pre-made run's
  `--out` can just point into `Demo/`.
- `Demo/design.md` already created — currently empty, to be filled in
  later (not the pipeline's own placeholder `design.md` content; this is a
  separate file to fill in by hand).

## Still to do

- [ ] Run the actual full pipeline once for real (seed input → `promote
      --out Demo/...` → Figma push tokens → `generate`/`scaffold --out
      Demo/...` → Figma push components) to populate `Demo/` with the real
      pre-made assets.
- [ ] Spot-check generated docs (`AGENTS.md`, `foundations-rules.md`,
      scaffolded project) to confirm none of them reference `Tool/` or the
      SDSGT source itself.
- [ ] Build the prototype screens in Figma on top of the pre-made run's
      pushed components.
- [ ] Fill in `Demo/design.md`.

## Unrelated note from this session

Claude Code CLI update is pending (installed `2.1.198`, latest published
`2.1.292` — checked 2026-10-07) — deferred, update later via:

```
npm install -g @anthropic-ai/claude-code@latest
```
