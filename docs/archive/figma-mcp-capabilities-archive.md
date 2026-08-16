# Southleft Figma MCP — Write Capabilities (tested)

**Tested:** 2026-08-10 against the DSAT Figma file (`s9IbbpprCKxxD2sCaL2IBl`).

The Southleft Figma MCP (`mcp__figma-southleft__*`) can **create, edit, and delete** both variables and text/font styles. The full create → edit → delete cycle was verified end-to-end and cleanly reverted.

## Working operations

- **Variables** (dedicated tools): `figma_create_variable_collection`, `figma_create_variable`, `figma_batch_create_variables`, `figma_update_variable`, `figma_delete_variable`.
- **Text / font styles** (no dedicated tool): done via raw `figma_execute` Plugin API — `figma.createTextStyle()`, edit props, `style.remove()`. Works, but means custom code for the style side of any automation.
- **Effect styles / shadows** (no dedicated tool): verified 2026-08-10 — read via `getLocalEffectStylesAsync()` and create via `figma.createEffectStyle()` through `figma_execute`. Read an existing drop-shadow style and created a new one (`elevation/md`), both successful. Effects expose a `boundVariables` field, so shadow sub-properties (blur/spread/offset/color) can bind to variables — meaning a shadow token = primitive variables composed into an effect style.

**Takeaway:** Figma variables only cover color/number/string/boolean; shadows, fonts, etc. live as *styles*, but those styles are still fully readable/writable and therefore tokenizable.

## Implication for DSAT

It's viable to author a design system in Claude Code (**code = source of truth**) and **push** tokens into Figma as variables/styles (code → Figma direction), using Figma as a rendered mirror for designers rather than the master. This informs the still-open "token source of truth" scoping decision, and points toward code-as-source.

## Three caveats (matter for automation)

1. **Connection is manual + desktop-only.** The MCP reaches the file only via the **Desktop Bridge plugin running in Figma Desktop** (not the file URL, not the browser). If the plugin isn't open, all tools fail with *"No active file connected."* This is a human-in-the-loop step — friction for a fully automated pipeline. Server runs a local WebSocket on port `9223`; plugin manifest at `/Users/migjulio/.figma-console-mcp/plugin/manifest.json`.
2. **Multi-mode collections silently capped to 1 mode.** Requested Light + Dark; only Light was created, with no error. Almost certainly Figma's free-plan limit (theming / multiple modes need Professional+). Keep themes/modes in code; verify the file's plan before relying on Figma variable modes. Another reason to prefer code-as-source.
3. **Read-after-write is stale by default.** `figma_get_variables` returns cached data right after a write — must pass `refreshCache: true` to see new state. A sync pipeline must force refreshes.
