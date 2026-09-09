---
name: SDSGT-figma-push
description: Push a project's generated token spec into a connected Figma file as variables/styles, using the figma-push-plan.json that `promote` writes. Triggers when the SDSGT-start flow reaches its Figma-push step (figmaManaged is true), or when the user explicitly asks to push/sync tokens into Figma for an already-promoted project.
---

# SDSGT-figma-push: replay a project's token spec into Figma

This skill is the "push" half of the pipeline described in `pipeline-plan.md`
("Tool architecture") — the mechanical execution of a plan the CLI core
already computed, over the `mcp__figma-southleft__*` tools. It does not
decide *what* to create (that's `cli/src/promote/figma-plan.ts`, run
automatically by every `promote`, written as `figma-push-plan.json`
alongside `report.html`) — it only replays that plan against a live Figma
connection, verifying what actually landed rather than assuming success.

**Why this has to be a skill, not CLI code:** Figma's variable-write
surface is only reachable through an MCP tool running inside an agent
session — the Southleft MCP requires the **Desktop Bridge plugin, running
in Figma Desktop, connected to that specific file** (confirmed in
`docs/figma-mcp-capabilities.md` — "not the file URL, not the browser").
There is no way for a plain Node process to do this without a live agent
session and a human who has that file open. See contracts-and-seeds.md,
"Figma push," for the full contract this skill implements.

**This is a first push, not the ongoing sync engine.** Re-running this
skill against a file that already has a previous push's variables will
create a second, differently-suffixed set rather than update the first —
Figma variable names aren't globally unique the way file paths are. If the
user is re-pushing to the same file, tell them plainly and suggest deleting
the old `Tokens`/`Tokens - Light`/`Tokens - Dark` collections first (via
`figma_delete_variable_collection`) rather than silently doubling up. The
real token-sync engine (bidirectional, incremental) is separate, future
work — see `pipeline-plan.md`, "Token-sync staying live."

## Inputs

- `tokensDir` — the folder `promote` wrote to (contains
  `figma-push-plan.json`, `color.primitive.json`, etc.).
- `figmaFileUrl` — the seed's `figmaFileUrl` (e.g.
  `https://www.figma.com/design/<fileKey>/<name>`), collected during seed
  input when `figmaManaged` was chosen (see `SDSGT-start`'s question table,
  row 5a).
- `figmaMcp` — the seed's `figmaMcp` (`"official"` or `"southleft"`,
  row 5b). See step 0 — this input is honored for disclosure purposes, not
  for branching, during the internal-testing phase.
- `figmaPlan` — the seed's `figmaPlan` (`"free"` or `"paid"`, row 5c).
  Unlike `figmaMcp`, this one DOES drive real branching — see step 3. Only
  actually matters if the token spec has both `color.semantic.light.json`
  and `color.semantic.dark.json` (i.e. the seed's `lightDarkMode` was
  `"both"`) — a single-mode project has nothing to branch on regardless of
  this value.

## Procedure

### 0. Which MCP — pinned to Southleft during internal testing, disclosed either way

Two Figma MCP integrations are real and available to this project:

- **`mcp__figma-southleft__*`** — connects via the Desktop Bridge plugin in
  Figma Desktop. This is the one every step below actually uses. Fully
  confirmed working for variable/style writes (`docs/figma-mcp-
  capabilities.md`).
- **`mcp__plugin_figma_figma__*`** — Figma's own official remote MCP
  (`https://mcp.figma.com/mcp`), gated behind OAuth. Confirmed *real*
  (only `authenticate`/`complete_authentication` are visible pre-auth,
  which is exactly what an OAuth-gated server looks like) — but its real
  tool surface only appears *after* a user completes that OAuth flow in
  their browser, and nobody has done that from this project yet. There is
  currently no verified equivalent of `figma_create_variable_collection`/
  `figma_batch_create_variables`/`figma_execute` on this server to build
  against — guessing at tool names/shapes that have never been seen would
  be worse than not building it.

**Regardless of `figmaMcp`'s value, this skill always executes through
Southleft right now.** If `figmaMcp === "official"`, say so plainly before
starting step 1: something like "You picked the official Figma MCP, but
this build only has a working push path through Southleft today — I'll
use that instead." Don't call `mcp__plugin_figma_figma__authenticate` on
the strength of this seed answer alone — starting an OAuth grant flow is
a real, user-facing permission action, and the seed answer from earlier in
the conversation isn't the same as the user asking for it *right now*. If
a user explicitly asks, in the moment, to actually try the official MCP,
that's a separate, deliberate request to take at face value — but nothing
in this skill should assume that's what a `figmaMcp: "official"` seed
value alone means.

**🚩 Flagged in `pipeline-plan.md`'s "Pre-launch validation" as a must-fix
before public release** — this whole step exists to make an internal-
testing shortcut honest, not to be the tool's permanent behavior. Once the
official MCP's post-auth tools have actually been inspected, either wire
up a real official-MCP push path and remove this pin, or drop row 5b's
question entirely if it still can't be honored. Don't let "always
Southleft" quietly become the shipped behavior by default.

### 1. Verify the connection before touching anything

Call `figma_get_status` with `probe: true`. If `setup.valid` is false or
the probe fails:

- Tell the user plainly what's needed: open Figma Desktop with their file,
  go to **Plugins → Development → Figma Desktop Bridge**, click Run, wait
  ~3 seconds. Don't retry silently in a loop — ask them to confirm they've
  done it, then check status again once.
- Do not proceed to writing anything while disconnected. There's nothing
  to fall back to here — no REST API path exists for this (see file
  header) — so a failed connection means the push simply doesn't happen
  this turn, not a degraded alternative.

Once connected, call `figma_list_open_files` and extract the file key from
`figmaFileUrl` (the path segment right after `/design/` or `/file/`).
Compare it against the connected file(s):

- If none of the connected files match, tell the user which file is
  currently active and ask them to open the right one in Figma Desktop
  with the bridge plugin, instead of guessing they meant the wrong file.
- If it matches but isn't the *active* target and `figma_list_open_files`
  exposes a way to select it, do so; otherwise use `figma_navigate` with
  `figmaFileUrl` or ask the user to bring that file's window forward, then
  `figma_reconnect`.

### 2. Read the plan

Read `<tokensDir>/figma-push-plan.json` (shape: `FigmaPushPlan` in
`cli/src/promote/figma-plan.ts`) — `modes`, `variables`, `textStyles`,
`effectStyles`, `elevationVariables`, `notes`. Say the `notes` array's
contents to the user in plain language before pushing (e.g. "grid isn't
pushed to Figma — that's expected").

### 3. Create the variable collection(s) — driven by `figmaPlan`, verified only where it might be wrong

`figmaPlan` (row 5c) tells you which structure to build directly — no need
to discover it by trial the way earlier versions of this skill did.
Figma's variable-write API silently caps multi-mode collections at 1 mode
on a free-plan file, with **no error raised** (`docs/figma-mcp-
capabilities.md`, caveat 2), which is exactly why that discovery-by-trial
approach existed before — but now that the user states their plan up
front at seed input, there's no reason to spend an API call attempting a
structure you already expect to fail.

- If `plan.modes.length === 1`: call `figma_create_variable_collection({
  name: "Tokens", initialModeName: Capitalize(plan.modes[0]) })`. One
  collection, no ambiguity, `figmaPlan` doesn't matter here — skip
  straight to step 4.
- If `plan.modes.length === 2` and `figmaPlan === "free"`: skip the
  2-mode attempt entirely — go straight to building two collections.
  Call `figma_create_variable_collection({ name: "Tokens - Light",
  initialModeName: "Light" })`, then
  `figma_create_variable_collection({ name: "Tokens - Dark",
  initialModeName: "Dark" })` — per contracts-proposals.md's decided
  naming (`Tokens - Light` / `Tokens - Dark`, space-dash, never a `/`).
  From here on, "the Light collection" and "the Dark collection" are two
  separate collections, each with one mode.
- If `plan.modes.length === 2` and `figmaPlan === "paid"`: call
  `figma_create_variable_collection({ name: "Tokens", initialModeName:
  "Light", additionalModes: ["Dark"] })` directly, expecting it to work.
  **Still verify afterward** — call `figma_get_variables({ format:
  "summary", collection: "Tokens", refreshCache: true })` and check how
  many modes actually landed. This isn't the primary decision mechanism
  anymore (the user's answer is), it's a safety net for a possibly-wrong
  self-report:
  - **Both modes present:** proceed with this single collection as
    planned. Record its `Light`/`Dark` mode IDs.
  - **Only `Light` present, despite `figmaPlan === "paid"`:** the file
    didn't behave like a paid workspace — tell the user plainly ("your
    file capped at one mode even though you said paid — falling back to
    two collections instead"), then fall back to the same two-collection
    structure as the free-plan branch above (rename this collection to
    `Tokens - Light`, create a new `Tokens - Dark`). Don't leave a
    half-built single-mode `Tokens` collection silently missing dark
    values.

Either way, tell the user plainly which structure actually got built —
it's genuinely informative (their Figma plan's real capability), not
just a status update.

### 4. Push variables (literals first, then aliases/alpha)

Split `plan.variables` (plus `plan.elevationVariables`, same treatment as a
plain FLOAT foundation variable) into:

- **Literal-only** items (no `aliasByMode`, no `alphaByMode`) — the large
  majority (every primitive, every foundation, and the two baked semantic
  exceptions before their alpha step is applied).
- **Alias or alpha** items — every other semantic color token.

For literal items, batch by target collection using
`figma_batch_create_variables` (chunk into groups of ≤100 — the tool's own
limit; this project's typical token count is ~150-200 variables, so expect
2 chunks). Map `valuesByMode` onto the real mode IDs from step 3: a
`{"value": x}` entry (primitives/foundations) goes to **every** mode in
that collection; a `{"light": x, "dark": y}` entry goes to its matching
mode only (and, in the two-collection case, `light`'s value goes to the
Light collection, `dark`'s to the Dark collection — same variable *name* in
both, per contracts-proposals.md, "Figma push").

For alias/alpha items, create them the same way first (using their
placeholder literal value — the plan always includes one, precisely so
creation never fails on a missing value), then immediately correct them
via `figma_execute`:

```js
// Alias: point this mode's value at another variable in the same file.
const target = await figma.variables.getVariableByIdAsync(targetVariableId); // resolved by name via figma_get_variables first
thisVariable.setValueForMode(modeId, { type: "VARIABLE_ALIAS", id: target.id });
```

```js
// Alpha (overlay.scrim only): a real RGBA value, not a hex string —
// the dedicated tools have no way to express this.
thisVariable.setValueForMode(modeId, { r: 0.114, g: 0.125, b: 0.106, a: 0.5 });
```

Resolve `targetVariableId` by name via `figma_get_variables({ format:
"filtered", namePattern: "^color/primitive/", refreshCache: true,
returnAsLinks: true })` (or similar) run once after the literal batch
lands — remember caveat 3 from `docs/figma-mcp-capabilities.md`:
**read-after-write is stale without `refreshCache: true`.**

### 5. Text styles and effect styles (via `figma_execute` — no dedicated tool exists for either)

**Font loading is the slow, timeout-prone part of this whole skill — treat
it with more care than the rest.** `figma_execute` caps at 30000ms even at
its max, and `loadFontAsync` across several distinct weights routinely
exceeds that when creating all 15 text styles in one call. Exercised live
(2026-09-09): the first attempt timed out at the default 5000ms having
created 7/15; a second attempt (max 30000ms) *also* reported a timeout —
but both times, the JS kept running inside the Figma plugin sandbox after
the tool call gave up waiting, and kept creating styles in the background.
Retrying the same batch naively raced against that still-running
background work and produced 2 duplicate styles (same name, two style
objects) that had to be found and deleted afterward.

**The safe procedure, in this order — don't skip the check-before-retry
step:**

1. Split `plan.textStyles` into small sub-batches (5-6 items) rather than
   one call for all 15 — reduces how much background work can still be
   in flight if a call times out, and each font family/weight only needs
   `loadFontAsync` once per sub-batch's lifetime of the plugin session.
2. Map weight to a real font style name rather than assuming one exists:
   `{400: "Regular", 600: "Medium", 700: "Bold"}` is the mapping that
   actually worked for Roboto — a font may not have every one of these
   (e.g. no "Medium"), so wrap each `loadFontAsync` in try/catch and fall
   back to `"Regular"` on failure, noting the fallback rather than erroring
   the whole push.
3. **If a call reports a timeout, don't immediately retry the same
   sub-batch.** First query current state — `figma.getLocalTextStylesAsync()`
   filtered to names starting with `typography/semantic/` — to see what
   actually landed (it may be more than the timeout suggests, since
   background work keeps running). Only create whatever's still genuinely
   missing, not the whole sub-batch again.
4. **After all sub-batches report done, always run one final duplicate
   check** — `figma.getLocalTextStylesAsync()` again, count occurrences per
   name, and for any name with count > 1, keep one and
   `(await figma.getStyleByIdAsync(id)).remove()` the rest. Do this even if
   nothing appeared to time out — a duplicate can originate from an earlier
   call's background work finishing later than expected.

Per-item creation, once you're past the loading step:

```js
const style = figma.createTextStyle();
style.name = item.figmaName;               // e.g. "typography/semantic/body-regular"
style.fontName = { family: item.fontFamily, style: usedStyleName }; // whatever actually loaded — see step 2 above
style.fontSize = item.fontSize;
style.lineHeight = { unit: "PIXELS", value: item.lineHeight };
```

For each `plan.effectStyles` item:

```js
const style = figma.createEffectStyle();
style.name = item.figmaName;               // e.g. "shadow/md"
style.effects = item.layers.map(l => ({
  type: "DROP_SHADOW",
  color: parseRgba(l.color),               // {r,g,b,a} 0-1 floats
  offset: { x: l.offsetX, y: l.offsetY },
  radius: l.blur,
  spread: l.spread,
  visible: true,
  blendMode: "NORMAL",
}));
```

No font loading here, so no timeout/duplicate risk — effect styles create
in one pass, no sub-batching or duplicate check needed.

### 6. Report back

Summarize in plain language: how many variables/text styles/effect styles
were created, which collection structure was used (one collection with two
modes, or two separate collections), anything skipped (e.g. a font weight
that fell back to Regular), and — if step 5's timeout handling actually
kicked in — say so plainly (e.g. "one step timed out and needed a
duplicate cleaned up afterward") rather than presenting the run as
perfectly clean when it wasn't. Remind the user this is a one-time push
— editing a variable's value in Figma from here on is fine (that's the
whole point), but re-running `promote`/`generate` doesn't pull those edits
back, and re-running this skill against the same file creates duplicates
rather than updating in place (see "This is a first push" above).
