# Figma MCP Write Capabilities (tested)

This project can push tokens/components through two different Figma MCP
integrations, selected by the seed's `figmaMcp` choice — see
`contracts-and-seeds.md`, "Which Figma MCP." Both sections below are
independently verified; see `SDSGT-figma-push`'s step 0 for how the push
skill actually branches between them.

## Southleft Figma MCP (`mcp__figma-southleft__*`)

**Tested:** 2026-08-10 against the SDSGT Figma file (`s9IbbpprCKxxD2sCaL2IBl`).

The Southleft Figma MCP (`mcp__figma-southleft__*`) can **create, edit, and delete** both variables and text/font styles. The full create → edit → delete cycle was verified end-to-end and cleanly reverted.

## Working operations

- **Variables** (dedicated tools): `figma_create_variable_collection`, `figma_create_variable`, `figma_batch_create_variables`, `figma_update_variable`, `figma_delete_variable`.
- **Text / font styles** (no dedicated tool): done via raw `figma_execute` Plugin API — `figma.createTextStyle()`, edit props, `style.remove()`. Works, but means custom code for the style side of any automation.
- **Effect styles / shadows** (no dedicated tool): verified 2026-08-10 — read via `getLocalEffectStylesAsync()` and create via `figma.createEffectStyle()` through `figma_execute`. Read an existing drop-shadow style and created a new one (`elevation/md`), both successful. Effects expose a `boundVariables` field, so shadow sub-properties (blur/spread/offset/color) can bind to variables — meaning a shadow token = primitive variables composed into an effect style.

**Takeaway:** Figma variables only cover color/number/string/boolean; shadows, fonts, etc. live as *styles*, but those styles are still fully readable/writable and therefore tokenizable.

## Implication for SDSGT

It's viable to author a design system in Claude Code (**code = source of truth**) and **push** tokens into Figma as variables/styles (code → Figma direction), using Figma as a rendered mirror for designers rather than the master. This informs the still-open "token source of truth" scoping decision, and points toward code-as-source.

## Three caveats (matter for automation)

1. **Connection is manual + desktop-only.** The MCP reaches the file only via the **Desktop Bridge plugin running in Figma Desktop** (not the file URL, not the browser). If the plugin isn't open, all tools fail with *"No active file connected."* This is a human-in-the-loop step — friction for a fully automated pipeline. Server runs a local WebSocket on port `9223`; plugin manifest at `/Users/migjulio/.figma-console-mcp/plugin/manifest.json`.
2. **Multi-mode collections silently capped to 1 mode.** Requested Light + Dark; only Light was created, with no error. Almost certainly Figma's free-plan limit (theming / multiple modes need Professional+). Keep themes/modes in code; verify the file's plan before relying on Figma variable modes. Another reason to prefer code-as-source.
3. **Read-after-write is stale by default.** `figma_get_variables` returns cached data right after a write — must pass `refreshCache: true` to see new state. A sync pipeline must force refreshes.

## Official Figma MCP (`mcp__plugin_figma_figma__*`)

**Tested:** 2026-09-23, OAuth-authenticated and exercised live against a real Enterprise-plan Figma file (a Publicis Sapient work file, used with the file owner's explicit direction — every test artifact created was verified deleted afterward, confirmed via a fresh re-read showing the file back at its original state).

**Connects directly via OAuth to a file by its key — no desktop app, no plugin, no manual "open the file and run the bridge" step.** This is the single biggest capability difference from Southleft: a push can run without the user having Figma Desktop open at all.

### Tool surface — much smaller than Southleft's, by design

- **One general write primitive: `use_figma`** — executes raw JavaScript against the Plugin API, the exact same execution model as Southleft's `figma_execute`. There is no equivalent of Southleft's dedicated `figma_create_variable_collection`/`figma_batch_create_variables`/`figma_update_variable`/`figma_delete_variable` tools — every one of those operations is hand-written as raw JS instead (verified patterns in `SDSGT-figma-push`'s steps 3-4).
- **Read-only tools**: `get_metadata` (page/node structure), `get_variable_defs` (variables bound to a specific node), `search_design_system` (find components/variables/styles by name across libraries), `get_libraries`, `whoami` (reports the authenticated user's plans/seats — the fastest way to diagnose a permission or rate-limit error). No bulk "get every variable in every collection" tool the way Southleft's `figma_get_variables` is — a script using `figma.variables.getLocalVariableCollectionsAsync()` inside `use_figma` covers the same need directly.

### Working operations (verified live, create → read back fresh → delete, all cleanly reverted)

- **Variable collections with real multi-mode support**: created a collection with 2 named modes (`Light`/`Dark`), confirmed both persisted on a fresh re-fetch in a separate call (no silent 1-mode cap, at least on this Enterprise-plan file — see caveat 2 below).
- **Variables with distinct per-mode values**: a COLOR variable with different values for each of the 2 modes, both read back correctly.
- **Real variable aliases**: created a second variable whose value in both modes is a `VARIABLE_ALIAS` pointing at the first — read back fresh in a separate call and confirmed it resolved to a real alias reference, not a baked copy.
- **Batch variable creation**: a loop creating multiple variables (primitives + one alias) in a single `use_figma` call, mirroring the shape of a real `figma-push-plan.json` push.
- **Text styles**: `figma.createTextStyle()` via `use_figma` — identical to Southleft's own `figma_execute`-based approach, works the same way.
- **Effect styles**: `figma.createEffectStyle()` via `use_figma` — same, a real drop-shadow effect style created and removed cleanly.

### Three caveats (matter for automation)

1. **No dedicated bulk-read or batch-write tool** — everything beyond the handful of read-only tools listed above goes through hand-written `use_figma` JS. In practice this pushed `SDSGT-figma-push` toward a cleaner pattern anyway: carry the name→ID map forward from each creation call's own `return` value into the next call's script, rather than re-fetching by name — see that skill's step 4.
2. **Free-plan mode-cap behavior is unverified for this MCP specifically.** Southleft's silent 1-mode cap on free-plan files (caveat 2 above) was confirmed live through Southleft. This MCP's only live test so far was against an Enterprise-plan file, where 2 real modes landed correctly. There's no structural reason to expect different behavior — both MCPs write through the same underlying Figma variable semantics, just a different transport — but it hasn't actually been observed on a free-plan file through this specific MCP yet.
3. **No read-after-write staleness observed** — unlike Southleft's `figma_get_variables`, which caches and needs `refreshCache: true` to see a fresh write, a `use_figma` call in a fresh invocation reads live Plugin API state directly every time. Confirmed by reading back a just-created alias variable in a separate call and seeing the correct resolved value immediately, no refresh flag or equivalent needed.
4. **Rate limits are real and plan/seat-dependent**, unlike Southleft (which has none of its own beyond Figma Desktop performance). As low as 20 calls/month on a Starter-plan View/Collab seat, up to 600/day + 20/min on Enterprise Full/Dev seats (`whoami`'s attached `rate-limits-access.md` resource has the full table). Figma's own docs list some write tools as explicitly exempt (`create_new_file`, `add_code_connect_map`, `whoami`) but don't name `use_figma` either way — treat exemption as plausible, not confirmed, and check this first if a push errors out partway through with a rate-limit-shaped message.
