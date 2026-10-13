---
name: SDSGT-figma-push
description: Push a project's generated token spec — and, once a component library has been vendored, its real components too — into a connected Figma file, using the figma-push-plan.json and figma-components-push-plan.json that `promote`/`scaffold` write. Also handles the reverse direction — pulling token EDITS made in Figma back into the project's code tokens (see step 8). Triggers when the SDSGT-start flow reaches its Figma-push step (figmaManaged is true, right after `promote` for tokens and again right after `scaffold` for components), or when the user explicitly asks to push/pull/sync tokens or components between Figma and an already-promoted/scaffolded project.
---

# SDSGT-figma-push: replay a project's tokens and components into Figma

This skill is the "push" half of the pipeline described in `pipeline-plan.md`
("Tool architecture") — the mechanical execution of a plan the CLI core
already computed, over the `mcp__figma-southleft__*` tools. It does not
decide *what* to create (that's `cli/src/promote/figma-plan.ts` for tokens,
run automatically by every `promote`, written as `figma-push-plan.json`
alongside `report.html`; and `cli/src/scaffold/figma-components-plan.ts` for
components, run automatically by `scaffold --shadcn`, written as
`figma-components-push-plan.json` in the scaffolded project's root) — it
only replays whichever plan(s) exist against a live Figma connection,
verifying what actually landed rather than assuming success.

**Why this has to be a skill, not CLI code:** Figma's variable-write
surface is only reachable through an MCP tool running inside an agent
session. The Southleft MCP requires the **Desktop Bridge plugin, running
in Figma Desktop, connected to that specific file** (confirmed in
`docs/figma-mcp-capabilities.md` — "not the file URL, not the browser").
The official Figma MCP (built 2026-09-23, see step 0) has no such
requirement — it's a remote, OAuth-gated server that connects straight to
a file by its key, no desktop app or plugin needed — but it's still an MCP
tool call inside an agent session either way, so the "not plain CLI code"
reasoning holds for both paths. See contracts-and-seeds.md, "Figma push,"
for the full contract this skill implements.

**Pushing (steps 1-7) is still a first push, not a re-sync.** Re-running
those steps against a file that already has a previous push's variables
will create a second, differently-suffixed set rather than update the
first — Figma variable names aren't globally unique the way file paths
are. If the user is re-pushing to the same file, tell them plainly and
suggest deleting the old `Tokens`/`Tokens - Light`/`Tokens - Dark`
collections first (via `figma_delete_variable_collection`) rather than
silently doubling up.

**Pulling (step 8, added 2026-09-17) is the real, ongoing sync-back half
`pipeline-plan.md`'s "Token-sync staying live" describes** — ask if the
user wants to check for Figma-side edits and pull them into code, any time
after an initial push has happened. Covers every VARIABLE (color/spacing/
radius/opacity/border-width/breakpoint/typography primitives, MD3/MD2
elevation floats) and every STYLE (text styles, shadow effect styles) this
pipeline pushes — nothing pushed is un-pullable. Only the values change; a
token's own STRUCTURE (new tokens, renamed groups, restructured files) is
never inferred from a pull — that stays a `promote`-time decision. By
design, this never detects or reconciles code-side drift — it only ever
asks what changed on Figma's side, since the expectation is that everyday
token editing happens in Figma.

## Inputs

- `tokensDir` — the folder `promote` wrote to (contains
  `figma-push-plan.json`, `color.primitive.json`, etc.).
- `projectDir` — the scaffolded project's own root (`scaffold`'s `--out`
  directory), if one exists. Only relevant for step 7 (components) — contains
  `figma-components-push-plan.json`, written automatically whenever
  `scaffold` ran with `--shadcn`. Not every project has this: `files-only`
  mode, a non-vendoring component library (Vuetify/RN Paper/bootstrap-
  vue-next/React-Bootstrap/MUI — installed-and-wired, no vendored source to
  read), or a framework this plan generator doesn't cover yet (only Next.js
  + shadcn/ui today — see step 7's own note) all mean step 7 has nothing to
  do. That's expected, not an error.
- `figmaFileUrl` — the seed's `figmaFileUrl` (e.g.
  `https://www.figma.com/design/<fileKey>/<name>`), collected during seed
  input when `figmaManaged` was chosen (see `SDSGT-start`'s question table,
  row 5a).
- `figmaMcp` — the seed's `figmaMcp` (`"official"` or `"southleft"`,
  row 5b). **Drives real branching as of 2026-09-23** — see step 0 for
  the capability differences and steps 1/3/4/5/7/8 for where the actual
  tool calls diverge.
- `figmaPlan` — the seed's `figmaPlan` (`"free"` or `"paid"`, row 5c).
  Unlike `figmaMcp`, this one DOES drive real branching — see step 3. Only
  actually matters if the token spec has both `color.semantic.light.json`
  and `color.semantic.dark.json` (i.e. the seed's `lightDarkMode` was
  `"both"`) — a single-mode project has nothing to branch on regardless of
  this value.

## Procedure

### 0. Which MCP — a real branch now, built and verified 2026-09-23

Two Figma MCP integrations are real and available to this project, and
`figmaMcp`'s value genuinely picks between them — no more disclosed
"always Southleft" shortcut.

- **`mcp__figma-southleft__*`** (`figmaMcp === "southleft"`) — connects
  via the Desktop Bridge plugin in Figma Desktop. Fully confirmed working
  for variable/style/component writes (`docs/figma-mcp-capabilities.md`).
- **`mcp__plugin_figma_figma__*`** (`figmaMcp === "official"`) — Figma's
  own official remote MCP (`https://mcp.figma.com/mcp`), OAuth-gated.
  **Built and verified live 2026-09-23** against a real Enterprise-plan
  file (variables across 2 real modes, aliases, text styles, effect
  styles — all created, read back fresh, and cleanly deleted). Its real
  tool surface is much smaller than Southleft's: **one** general write
  primitive, `use_figma` (raw Plugin API JS — the exact same execution
  model as Southleft's `figma_execute`), plus a handful of read-only
  tools (`get_metadata`, `get_variable_defs`, `search_design_system`,
  `get_libraries`, `whoami`). There is no dedicated
  `create_variable_collection`/`batch_create_variables`/bulk
  `get_variables` tool the way Southleft has — every one of those
  operations is written as raw JS via `use_figma` instead. See steps 3-4
  below for the exact patterns; steps 5/7/8 already used raw JS via
  `figma_execute` for Southleft, so those need no new logic at all — just
  swap the wrapper tool.

**Real differences worth knowing, not just a tool-name swap:**

- **No Desktop Bridge, no manual "open the file and run the plugin" step**
  — the official MCP connects straight to a file by its key, from
  anywhere. This removes Southleft's single biggest piece of human-in-
  the-loop friction (see step 1).
- **No read-after-write staleness.** Southleft's `figma_get_variables`
  caches and needs `refreshCache: true` to see a fresh write (`docs/
  figma-mcp-capabilities.md`, caveat 3). `use_figma` has no such cache —
  every call reads live Plugin API state directly, confirmed by reading
  back a just-created alias variable in a separate call and seeing the
  correct resolved value immediately, no refresh flag needed.
- **Rate limits are real and plan/seat-dependent** (`whoami`'s attached
  `rate-limits-access.md` resource) — as low as 20 calls/month on a
  Starter+View seat, up to 600/day on Enterprise Full/Dev. Figma's own
  docs list `use_figma`-style write tools as *likely* exempt from this
  (explicitly named exemptions are `create_new_file`/`add_code_connect_
  map`/`whoami`, not `use_figma` by name) — treat this as probable, not
  confirmed, and if a push hits a rate-limit error mid-way, that's the
  first thing to check, not a bug in this skill's own logic.
- **Free-plan mode-cap behavior is unverified for this MCP specifically.**
  Southleft's free-plan cap (multi-mode collections silently capped to 1,
  no error) was confirmed live against a real free-plan file. The official
  MCP's only live test so far was against a real Enterprise-plan file,
  where 2 real modes landed correctly — there's no reason to expect
  different behavior (both go through the same underlying Figma variable-
  write semantics, just a different transport), but it hasn't actually
  been observed on a free-plan file through this specific MCP. Step 3's
  existing `figmaPlan`-driven strategy (ask up front, verify-as-safety-net
  on the paid branch) already covers this regardless of which MCP is
  active — no new logic needed, just don't claim this specific
  combination as "verified" when it hasn't been.

Starting the OAuth flow (`mcp__plugin_figma_figma__authenticate`) is still
a real, user-facing permission action — do it when `figmaMcp ===
"official"` and a push is actually starting, not speculatively earlier in
a conversation.

### 1. Verify the connection before touching anything

**If `figmaMcp === "southleft"`:** call `figma_get_status` with `probe:
true`. If `setup.valid` is false or the probe fails:

- Tell the user plainly what's needed: open Figma Desktop with their file,
  go to **Plugins → Development → Figma Desktop Bridge**, click Run, wait
  ~3 seconds. Don't retry silently in a loop — ask them to confirm they've
  done it, then check status again once.
- Do not proceed to writing anything while disconnected. There's nothing
  to fall back to here for this MCP — no REST API path exists (see file
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

**If `figmaMcp === "official"`:** there's no bridge/desktop step at all.
Extract the file key from `figmaFileUrl` the same way (the path segment
after `/design/`, or after `/design/<key>/branch/<branchKey>/` for a
branch URL — use the branch key as the file key in that case, confirmed
live 2026-09-23 against a real branch URL). Confirm access with a cheap
read call, `get_metadata` with no `nodeId` (lists top-level pages) or
`whoami` (also useful if this errors — it reports exactly which plans/
seats the authenticated user has, the fastest way to diagnose a
permission or rate-limit problem per that tool's own description):

- If it errors with a permission-shaped message, call `whoami` and relay
  its plan/seat info to the user — the likely cause is the authenticated
  Figma account not having access to that specific file's team/plan, not
  a broken connection.
- If it succeeds, proceed — no further connection setup needed. This is
  genuinely simpler than the Southleft path, not just "different."

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

**If `figmaMcp === "official"`:** same decision logic (`figmaPlan`,
1-mode vs. 2-mode vs. fallback), but there's no dedicated collection tool
— do it as raw JS via `use_figma`, verified live 2026-09-23:

```js
// 1-mode, or the free-plan 2-collection case (call twice, once per collection):
const collection = figma.variables.createVariableCollection("Tokens"); // or "Tokens - Light" / "Tokens - Dark"
collection.renameMode(collection.modes[0].modeId, "Light"); // or the plan's single mode name
return { collectionId: collection.id, modeId: collection.modes[0].modeId };
```

```js
// paid-plan single-collection, 2-mode case:
const collection = figma.variables.createVariableCollection("Tokens");
const lightModeId = collection.modes[0].modeId;
collection.renameMode(lightModeId, "Light");
const darkModeId = collection.addMode("Dark");
return { collectionId: collection.id, lightModeId, darkModeId };
```

Verify the same way — a **separate, subsequent** `use_figma` call
re-fetching by ID (`figma.variables.getVariableCollectionByIdAsync(id)`)
and checking `collection.modes.length`. No `refreshCache` flag needed
(see step 0) — a fresh call already sees live state. If only 1 mode
persisted despite requesting 2, apply the exact same fallback as the
Southleft branch above (rename to `Tokens - Light`, create a new
`Tokens - Dark`) — this exact scenario (free-plan file, official MCP)
hasn't been observed live yet, so treat a cap here as plausible, not
surprising, and handle it the same way regardless of which MCP produced
it.

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

**If `figmaMcp === "official"`:** there's no `figma_batch_create_variables`
or bulk `figma_get_variables` — do both the literal batch and the alias
resolution as raw JS via `use_figma`, verified live 2026-09-23 against a
real Enterprise-plan file (2 literal variables + 1 real alias, read back
fresh and confirmed resolved):

```js
// Literal batch — embed the chunk's data directly in the script (no
// separate "data" param exists for use_figma). Chunk into groups of
// ~100 to mirror Southleft's own limit and stay comfortably under the
// 50000-char code cap.
const collection = await figma.variables.getVariableCollectionByIdAsync(COLLECTION_ID);
const items = [
  { name: "color/primitive/brand/600", type: "COLOR", valuesByMode: { LIGHT_MODE_ID: {r:0.2,g:0.4,b:0.9}, DARK_MODE_ID: {r:0.2,g:0.4,b:0.9} } },
  // ...rest of this chunk's literal-only variables from plan.variables/plan.elevationVariables
];
const createdIds = {};
for (const item of items) {
  const v = figma.variables.createVariable(item.name, collection, item.type);
  v.scopes = item.scopes; // set explicitly per variable-patterns.md — never leave ALL_SCOPES
  for (const [modeId, value] of Object.entries(item.valuesByMode)) {
    v.setValueForMode(modeId, value);
  }
  createdIds[item.name] = v.id;
}
return createdIds; // MUST return this — it's the name->ID map the alias step below needs
```

```js
// Alias/alpha batch — runs AFTER the literal batch, using the name->ID
// map that call returned (passed in as a literal object here, not
// re-fetched — no bulk-read tool exists to re-fetch by name pattern, and
// none is needed: the creation call already told us every ID).
const primitiveIds = { "color/primitive/brand/600": "VariableID:...", /* ...from the previous call's return value */ };
const collection = await figma.variables.getVariableCollectionByIdAsync(COLLECTION_ID);
const aliasItems = [
  { name: "color/semantic/action/primary", targetName: "color/primitive/brand/600", scopes: ["ALL_FILLS"] },
];
const createdAliasIds = {};
for (const item of aliasItems) {
  const v = figma.variables.createVariable(item.name, collection, "COLOR");
  v.scopes = item.scopes;
  const target = await figma.variables.getVariableByIdAsync(primitiveIds[item.targetName]);
  for (const modeId of Object.keys(collection.modes.map(m => m.modeId).reduce((a,id)=>({...a,[id]:1}),{}))) {
    v.setValueForMode(modeId, { type: "VARIABLE_ALIAS", id: target.id });
  }
  createdAliasIds[item.name] = v.id;
}
return createdAliasIds;
```

The alpha case (`overlay.scrim`) is identical to Southleft's — same
`{r,g,b,a}` object, just inside a `use_figma` call instead of
`figma_execute`. **A genuine simplification versus Southleft, not just a
different tool**: because there's no bulk `figma_get_variables` to lean
on, the natural pattern is to carry the name→ID map forward from each
creation call's own `return` value into the next call's script (as a
literal object, per the pre-flight checklist's "IDs from previous calls
are passed as string literals" rule) — this sidesteps the entire
read-after-write staleness question for THIS specific lookup, since
nothing is being re-fetched by name at all.

### 5. Text styles and effect styles (via `figma_execute` — no dedicated tool exists for either)

**If `figmaMcp === "official"`:** this step's own JS is already MCP-
agnostic raw Plugin API code (`figma.createTextStyle()`/
`figma.createEffectStyle()`) — verified live 2026-09-23 that both work
identically through `use_figma` (create → read back fresh → delete, no
divergence from what's documented below). The only change is the wrapper
tool call (`use_figma` instead of `figma_execute`); every code sample and
the whole sub-batching/duplicate-check procedure below applies unchanged.
**One assumption still unverified, not confirmed either way**: whether
`use_figma` has the same ~30000ms timeout ceiling that drives this step's
own sub-batching discipline — that number is documented for
`figma_execute` specifically (`docs/figma-mcp-capabilities.md`), and
hasn't been separately measured for `use_figma`. Keep the same
small-sub-batch, check-before-retry discipline regardless until that's
actually observed one way or the other — the cost of doing so
unnecessarily is low, the cost of assuming a bigger timeout and being
wrong (duplicate styles, same as the 2026-09-09 finding below) isn't.

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

**Once variables, text styles, and effect styles have all landed, write
the pull baseline** — needed for step 8 to ever work, so don't skip it.
Read every real value back from Figma itself (not the plan's own
placeholder literals for alias/alpha entries, and not the plan's own
computed text-style/shadow values either — the point is to snapshot
what's ACTUALLY in Figma right now):

```js
// Variables — same call used to resolve alias target IDs above.
const vars = await figma.variables.getLocalVariablesAsync();
// Reshape into { figmaName, mode, value }[] — "value" for a variable with
// one shared value across every mode in its collection, else the real
// mode name ("light"/"dark") per entry in variable.valuesByMode.

// Text styles.
const textStyles = (await figma.getLocalTextStylesAsync())
  .filter(s => s.name.startsWith("typography/semantic/"))
  .map(s => ({
    figmaName: s.name,
    fontFamily: s.fontName.family,
    fontWeight: ({ Regular: 400, Medium: 600, Bold: 700 })[s.fontName.style] ?? 400, // reverse of step 2's own weight->style map; unrecognized style names fall back to 400 rather than crash
    fontSize: s.fontSize,
    lineHeight: s.lineHeight.unit === "PIXELS" ? s.lineHeight.value : s.fontSize * 1.2, // styles are always created with PIXELS (step 5 above) — the fallback is defensive, not expected to fire
  }));

// Effect styles.
const effectStyles = (await figma.getLocalEffectStylesAsync())
  .filter(s => s.name.startsWith("shadow/"))
  .map(s => ({
    figmaName: s.name,
    layers: s.effects.filter(e => e.type === "DROP_SHADOW").map(e => ({
      offsetX: e.offset.x,
      offsetY: e.offset.y,
      blur: e.radius,
      spread: e.spread,
      color: `rgba(${Math.round(e.color.r * 255)},${Math.round(e.color.g * 255)},${Math.round(e.color.b * 255)},${e.color.a})`, // must match shadow.json's own "rgba(r,g,b,a)" format exactly, no spaces — figma-pull.ts tolerates minor float noise in the alpha channel, but not a different string shape
    })),
  }));
```

Assemble `{ variables, textStyles, effectStyles }`, write it to a temp JSON
file, then run:

```
node src/cli.ts figma-pull --tokens-dir "<tokensDir>" --live-data "<path>" --init
```

This writes `<tokensDir>/figma-sync-snapshot.json` — the baseline every
future step-8 pull diffs against. Do this every time steps 1-5 run for a
given file (including a re-push to a fresh file after deleting old
collections) — an initial push with no snapshot means step 8 has nothing
to compare against later and will refuse to run.

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

If `projectDir` has no `figma-components-push-plan.json` (no `--shadcn`
scaffold ran, or `files-only` mode), stop here — steps 1–6 above are the
whole job for this project. Otherwise, continue to step 7 automatically in
the same session, right after `scaffold` completes — this isn't a separate
thing the user has to remember to ask for, same as steps 1–6 aren't.

### 7. Push components (only when `figma-components-push-plan.json` exists)

**If `figmaMcp === "official"`:** every code sample in this step is
already raw Plugin API JS via `figma_execute` — same MCP-agnostic
situation as step 5, ports to `use_figma` with no logic change, just the
wrapper swap. **One real substitution, not just a swap**: this step's own
validation calls `figma_capture_screenshot` (Southleft's dedicated
export tool, chosen specifically over `figma_take_screenshot` for the
REST-token-staleness reason documented at that call site below). The
official MCP has no equivalent dedicated tool, but `use_figma` scripts can
call `await node.screenshot()` inline and get the image back in the same
response — actually more direct than either Southleft option (no second
tool call at all). Not yet exercised against a real component build
through this MCP (only variables/text styles/effect styles have been
verified live so far, 2026-09-23) — treat the mechanism as sound (it's
the same underlying Plugin API screenshot capability step 0 already
confirmed works for arbitrary nodes) but confirm on the first real
component pushed through this path rather than assuming zero surprises,
same discipline this whole step already applies to every new component
shape.

**Real ground truth, proven live for all twenty-nine components this plan
covers today — the figure-out-shadcn/ui effort is now fully closed, per
`figma-remaining-components-plan.md`'s own "Definition of done"** —
twenty-four are the FULL, closed `figma-remaining-components-plan.md`
12-batch scope; Checkbox, Spinner, Switch, RadioGroup, and Attachment are
separate, same-day follow-on work (real icon-drawing capability, plus two
components needing none at all once re-read — see that plan's own
NEEDS-ICON bucket entry for the full detail) — though not all in the SAME
test file,
disclosed precisely rather than glossed over: Button, Badge, Toggle,
Alert, Input, Textarea, and Card were each first proven live 2026-09-15
through 2026-09-17 in an earlier session's test file; Kbd, NativeSelect,
Avatar, Label, and Skeleton (2026-09-18) and Breadcrumb, Empty, Field,
Separator, FieldSeparator, Item, and Marker (2026-09-21) were proven live
directly in the CURRENT real test file ("SDSGT test file"); and — also
2026-09-21 —
Button, Badge, Toggle, and Alert were built fresh a SECOND time, directly
in "SDSGT test file," specifically to re-validate Batch 9's own
selector-prefix-stripping/arbitrary-value-skip changes against real
`cva()`-based components (see that batch's own note below), with Bubble
pushed alongside them as the first real consumer of that same
infrastructure. Input/Textarea/Card remain the only three of twenty-nine
not present in "SDSGT test file" specifically — a real, disclosed gap in
WHERE they were pushed, not an unproven mechanism (their own real
mechanisms, `scanClassesForColors` and `sections`, are independently
proven live in this same file via Kbd/NativeSelect/Avatar/Label/Marker
and Breadcrumb/Empty/Field/Item respectively). **Progress (added
2026-09-22, "Batch 11") was pushed live directly in "SDSGT test file"
the same day** — the new `bar` replay branch (step 2b) built a real
Track+Indicator component set with exact 240×4px/144×4px real dimensions
(confirmed via `preConvertInfo`, captured BEFORE `createComponentFromNode`
per this step's own documented node-invalidation gotcha), a real instance
created from it and screenshotted matching the component exactly, then
removed cleanly. One real, new finding from this specific push, not
previously documented for `line`: `combineAsVariants` throwing partway
through a script (here, from a now-removed manual
`addComponentProperty("Variant", ...)` call — variant properties are
already auto-derived from variant names, the same precedent Skeleton/
Avatar/Label/Separator already established, so this call was always
redundant) does NOT roll back the `createComponentFromNode`/
`combineAsVariants` mutations that already ran earlier in that same
script — contrary to this skill's own general "atomic, all-or-nothing"
framing for `figma_execute`. A real orphaned "Progress" component set was
left behind by the failed attempt and had to be found and deleted
manually before the retry. **Take this as the operating assumption for
every future push, not a one-off**: after ANY `figma_execute` error during
component creation, explicitly check for and remove partial nodes it may
have already created — don't assume the failed call left the file
untouched just because it returned an error. **Tabs, Accordion, and
Tooltip (added 2026-09-22, "Batch 12" — the last batch in the plan) were
all three pushed live the same day, directly in "SDSGT test file"**:
Tabs as a real, manual two-variant Active/Inactive set (no `cva()` to
route through `buildVariantsFromCva`) — screenshotted (a filled white
pill for Active beside plain gray text for Inactive), instance-validated
swapping BOTH `Variant` and `Label` together in one `setProperties()`
call; Accordion as a flat label-only box, screenshotted (plain text, no
visible frame, matching its real zero-padding/transparent-fill source),
`Label` swap confirmed; Tooltip as a flat box, screenshotted (a dark
filled box with light text — the real, disclosed fg/bg inversion
rendering exactly as expected), `Label` swap confirmed. All three cleaned
up correctly, final section check: 21 component sets, zero orphans, no
regressions to any of the 18 prior components visible in the full-section
screenshot. One real, repeatable mistake caught and fixed here, worth
flagging for every future manual (non-generic-loop) component build:
`combineAsVariants` leaves its result stacked at `(0,0)` with every
variant fully overlapping — Tabs' own component set initially
screenshotted as a single "Tab" because BOTH variants sat at the exact
same position. Step 4's own documented pattern
(`componentSet.layoutMode = "HORIZONTAL"; componentSet.itemSpacing = 24;`,
immediately after `combineAsVariants`) already covers this — the miss was
skipping it in a one-off script, not a gap in the documented procedure
itself. Real, disclosed simplification confirmed by a live
`getComputedStyle` check (not just the plan JSON) before pushing: Tabs'
own Active and Inactive variants render with the exact SAME computed text
color in the real browser (`rgb(29, 32, 29)` vs. the real
`oklab(...alpha 0.6)`, confirming the 60%-opacity difference this plan
drops, per `buildTabsPlan`'s own comment) — live proof the disclosed gap
is real and not overstated.
shadcn/ui's `Button`, `Badge`, `Toggle`, `Alert`, `Input`, `Textarea`,
`Card`, `Kbd`, `NativeSelect`, `Avatar`, `Label`, `Skeleton`, `Breadcrumb`,
`Empty`, `Field`, `Separator`, `FieldSeparator`, `Item`, `Marker`,
`Bubble`, `Progress`, `Tabs`, `Accordion`, `Tooltip`, `Checkbox`,
`Spinner`, `Switch`, `RadioGroup`, `Attachment` — one size each EXCEPT Button
(which has a `Size` axis as of 2026-10-08; sizes are being added component
by component per `figma-component-variations-plan.md`; Separator and Field
also have an `Orientation` axis as of Batch 7), rest
states only (see
`cli/src/scaffold/figma-components-plan.ts`'s own header for the full
scope decision, including the real component shapes this plan handles —
multi-variant `cva()` components via `buildVariantsFromCva`, single-state
no-`cva()` components via `scanClassesForColors`
(Input/Textarea/Kbd/NativeSelect/Avatar/Label/Marker), Card's own real
compound-component support via `sections` (vertical, and — since
Breadcrumb — horizontal too), a genuinely non-box fixed-size `line` shape
(Separator/FieldSeparator), a real `cva()` color-variant axis COMBINED
with `sections` in the same component set (Item), a genuinely NESTED
fixed-size `bar` shape (Progress — a track containing a narrower,
same-height indicator), a real MANUAL multi-variant axis with no `cva()`
behind it at all (Tabs), a real IMPORTED VECTOR icon bound via a Lucide
SVG path table (Checkbox's own per-variant `icon`, Spinner's own
whole-component `icon`), a literal FIXED-pixel box size instead of a
hug-content-plus-padding approximation (Checkbox's own `fixedSizePx`), a
genuinely NESTED fixed-size shape with a DISCRETELY-POSITIONED thumb
rather than a continuously-growing fill (Switch's own per-variant
`thumb`), and a plain solid dot needing no vector import at all
(RadioGroup's own `centerDot`) — and why most other real components don't
fit any of these yet). This step's own mechanism (`for each item in
plan.components`, no component-specific branching) is confirmed to
genuinely generalize across twenty-nine structurally different
components, covering every shape above plus
real structural variations (Skeleton has no text at all; Breadcrumb's
`sections` lay out horizontally instead of vertically;
Separator/FieldSeparator are fixed-size rectangles/rows, not auto-layout
frames at all; Item's `sections` render correctly across three real
independently-colored variants in one component set, not just a single
"Default"; Marker reuses `scanClassesForColors` against a real `cva()`
component's own BASE classes, deliberately ignoring its own real variant
axis entirely) — real bugs were caught doing this, not just claimed to
have been avoided: the same-tone-trap fix (below) used to fire for ANY variant
named "destructive" regardless of its fill, which was correct for
Button/Badge but would have produced invisible white-on-light-card text
for Alert's real neutral-background destructive variant; every
`rounded-lg`-using component's radius was bound to the wrong real value
for two full sessions (a real 2px mismatch, confirmed live via
`getComputedStyle` — see `exactRadiusMd`'s own comment) before being
caught while scoping Card's own different radius formula; and
`createComponentFromNode(node)` was found live (2026-09-21, pushing
Breadcrumb) to invalidate the ORIGINAL node reference passed into it —
reading a property off that stale reference afterward (e.g. `frame.name`)
throws an internal "node does not exist" error rather than a clear one.
Fix: capture anything needed from the pre-conversion node (like the
variant's own name) into a plain variable BEFORE calling
`createComponentFromNode`, never read it off the node reference
afterward — the code samples throughout this step already reflect this.
All caught by checking real generated output/real rendered pages, not
assuming the existing mechanism was safe. Extending this plan to more
components is real, separate CLI work (a new plan-generator entry, not a
change to this skill) — this step's job is only ever to replay whatever
the plan actually contains, never to improvise a component the plan
doesn't describe. Any component added to the plan should still get the
SAME full screenshot-validate treatment the first time it's pushed live —
passing plan computation alone isn't sufficient proof, as this section
used to (incorrectly) imply was close enough for Badge.

- **Breadcrumb** is the first `sections`-based component whose items lay
  out HORIZONTALLY (a row) rather than stacking vertically the way Card's
  own Header/Content do — see the `sections` branch below and
  `FigmaComponentSectionPlanItem.textLineDirection`'s own comment in
  `figma-components-plan.ts`. It also introduces a real, disclosed
  decorative-only text glyph (`separatorGlyph`) standing in for
  Breadcrumb's actual separator, a real SVG `<ChevronRightIcon>`
  (lucide-react) this pipeline doesn't draw — see `buildBreadcrumbPlan`'s
  own comment for the full reasoning. Live-proven: all three text
  properties (`Item1`/`Item2`/`CurrentPage`) bind and swap independently
  on a real instance, and the outer frame genuinely lays out its items in
  a row with the "›" glyphs landing between items, never after the last.
- **Empty and Field** reuse the existing `sections` mechanism exactly as
  Card established it, with no schema change — Empty proving Card's own
  Header/Content shape a second time, Field proving a simpler "N
  independent one-line sections" shape nothing had exercised yet. Live-
  proven: every text property on both (Title/Description/Content for
  Empty; Label/Description/Error for Field) binds and swaps independently.
- **A component can now be a genuinely non-box shape** (Separator and
  `field.tsx`'s FieldSeparator — see `FigmaComponentLinePlanItem`'s own
  comment in `figma-components-plan.ts` for the full reasoning). Step 2
  above is the new branch: a fixed-size, non-auto-layout rectangle
  (`figma.createRectangle()`, never an auto-layout frame), or a
  `[line, text, line]` row when `component.line.centerLabel` is present
  (FieldSeparator only — a real, confirmed feature, not speculative; bare
  Separator never supports a label). Live-proven: `createComponentFromNode`
  works directly on a `RECTANGLE` (Separator) and on a `FRAME` wrapping one
  (FieldSeparator's row), both combine into a real variant set, and
  FieldSeparator's `Label` property swaps independently on a real
  instance.
- **Item combines a real `cva()` color-variant axis with `sections` in the
  same component set for the first time** — three real variants
  (Default/Outline/Muted, via `buildVariantsFromCva`) each carrying their
  own real fill/stroke, with `sections` supplying the Title/Description
  body inside every one of them. Live-proven per the plan's own flagged
  risk: `sections` genuinely renders correctly across all three variants
  in one set, not just a single "Default" the way Card/Breadcrumb/Empty/
  Field/FieldSeparator each only ever exercised — each variant's own real
  fill/stroke (transparent/`border.default`/`background.secondary`) AND
  its `Title`/`Description` text properties all swap correctly and
  independently on real per-variant instances. Also confirms `rounded-lg`
  binds to `radius.md` — a real exact alias, not `radius.lg` — via
  `exactRadiusMd`, the same discipline that already caught a real 2px
  mismatch bug once (see this section's own opening paragraph).
- **Marker is a real `cva()`-based component reframed to ignore its own
  color-variant axis entirely** — per the user's own decision, modeled as
  a single colorless "Default" box via `scanClassesForColors` against just
  its `default` option's own (empty, no-op) base classes, the same
  mechanism Input/Textarea/Kbd/NativeSelect/Avatar/Label already use, not
  `buildVariantsFromCva`. Live-proven: renders as plain, unstyled text
  (`text.secondary`, no fill/stroke/padding/radius — the same bare-text
  treatment Label already established), and its `Label` property swaps
  independently on a real instance.
- **Batch 9 extends `classToFigmaVariable`/`buildVariantsFromCva`
  (the most-reused code in this file) with selector-prefix stripping and a
  generalized arbitrary-value skip rule** — pure infrastructure, no new
  component of its own. Live-revalidated directly: rather than trust a
  plan-JSON diff alone, Button, Badge, Toggle, and Alert were built FRESH
  a second time, directly in "SDSGT test file," using the post-Batch-9
  code — every variant (including both same-tone-trap pairs, Badge's and
  Alert's own Destructive) rendered and swapped exactly as before, real,
  live confirmation of zero regression.
- **Bubble is the first real consumer of Batch 9's own infrastructure** —
  a real `cva()` axis with 5 built variants (Default/Muted/Outline/Ghost/
  Destructive) via `buildVariantsFromCva`, all six non-skipped-by-default
  color classes gated behind a real `*:data-[slot=bubble-content]:`
  selector prefix Batch 9's stripping was built for. Live-proven: all 5
  variants render correctly (including Destructive's own same-tone-trap
  fix), and `Label` swaps independently on real Default/Destructive
  instances. `secondary` (an existing, unconditional `bg-secondary` skip)
  and `tinted` (Batch 9's own arbitrary-value skip, firing correctly on
  the prefix-stripped class per that batch's own bug-fix) are both
  disclosed as skipped, not built.
- **Progress introduces a genuinely NESTED fixed-size shape** (`bar` — a
  track containing a narrower, same-height indicator; see
  `FigmaComponentBarPlanItem`'s own comment in `figma-components-plan.ts`
  for the full reasoning). Step 2b below is the new branch: a fixed-size
  track frame with `clipsContent = true`, containing a fixed-size,
  perfectly SQUARE indicator rectangle docked at its left edge — the
  indicator's own rounded look in a real browser comes entirely from the
  track's clip, not a radius binding on the indicator itself, which would
  incorrectly round its right edge too whenever the fill is under 100%.
  Plan computation is confirmed (real `bg-muted`/`bg-primary` classes,
  `rounded-full`, and `h-1` all resolving correctly with zero deltas), and
  live-proven (2026-09-22): a real 240×4px track and 144×4px indicator
  (exactly 60% of 240, per `representativeFillFraction`) were built,
  confirmed via `preConvertInfo` captured before `createComponentFromNode`,
  screenshotted (a green pill-shaped fill over a light gray track, rounded
  ends), instantiated, screenshotted again matching the component exactly,
  then cleanly removed. See this section's own opening ledger for the real
  orphaned-node finding this specific push surfaced (a failed
  `figma_execute` call does NOT necessarily roll back mutations it already
  made earlier in the same script).
- **Tabs is the first real MANUAL multi-variant axis with no `cva()`
  behind it at all** — `TabsTrigger`'s own real active/inactive state
  lives on a single className string gated by a bare `data-active:`
  pseudo-class prefix (no `key=value` brackets, a different shape from
  Batch 9's own stripping), built by hand into two variants ("Inactive"/
  "Active") rather than routed through `buildVariantsFromCva`. Live-proven
  (2026-09-22): a real white filled pill for Active beside plain
  (transparent, gray) text for Inactive, matching a live
  `getComputedStyle` check taken before pushing. A real, repeatable
  mistake caught here on the first attempt: `combineAsVariants` leaves
  its variants stacked at `(0,0)`, fully overlapping, until
  `componentSet.layoutMode = "HORIZONTAL"` is set explicitly (step 4's own
  documented pattern) — skipped in the first build script, causing both
  variants to render on top of each other; fixed by setting it on the
  already-created component set rather than rebuilding from scratch.
  Instance validation swapped `Variant` and `Label` together in one
  `setProperties()` call, confirmed correct.
- **Accordion is a flat label-only box**, per a real, disclosed deviation
  from this batch's own "(chevron + label)" framing — see
  `buildAccordionPlan`'s own comment in `figma-components-plan.ts` for why
  (the `sections`/horizontal mechanism that could place a trailing
  chevron glyph beside a label has no field for this component's own real
  vertical padding). Live-proven: renders as plain text with no visible
  frame at all (confirmed transparent fill, zero horizontal padding,
  matching real source), `Label` swap confirmed on a real instance.
- **Tooltip confirms a real, load-bearing fg/bg role inversion live, not
  just in the plan JSON** — its real `bg-foreground`/`text-background`
  classes resolve through the existing token table into a dark filled box
  with light text, screenshotted exactly as expected (a real, confirmed
  correct-value-confusing-name finding, same disclosure treatment as
  `buildAlertPlan`'s own destructive-gate comment). `Label` swap confirmed
  on a real instance.
- **Checkbox and Spinner are the first components using a real IMPORTED
  VECTOR icon** — separate, same-day follow-on work after this plan's own
  12 batches closed, unlocking part of `figma-remaining-components-plan.md`'s
  own NEEDS-ICON bucket (that bucket's own closing note named this exact
  capability as pending). Both use `figma.createNodeFromSvg()` against a
  small, curated, hardcoded 2-icon table (`LUCIDE_ICONS` in
  `figma-components-plan.ts`, real path data extracted directly from an
  installed `lucide-react` package's own bundled source, not typed from
  memory) — no new CLI dependency, no new MCP tool, the same
  `figma_execute` mechanism as everything else in this step. **Real,
  live-confirmed finding, smoke-tested before any component was built**:
  `node.rescale()` must be used to resize an imported icon, never
  `resize()` — `resize()` scales the vector's geometry but leaves
  `strokeWeight` a literal, UNSCALED `2`, which renders disproportionately
  thick at any target size smaller than the icon's native 24px; `rescale()`
  correctly scales both together (confirmed live: `2 → 1.167` for a
  24→14px scale, exactly `2 × 14/24`). `setBoundVariableForPaint` on the
  imported vector's own `.strokes` works identically to every other
  fill/stroke binding in this file — the first time it's been exercised on
  a VECTOR node specifically, not just a FRAME/RECTANGLE. Checkbox also
  introduces `fixedSizePx` — a literal FIXED 16×16px square (real,
  unconditional `size-4`), the first box-shaped component in this file NOT
  using the hug-content-plus-padding approximation every earlier one uses
  (Avatar's own comment had already named this exact missing shape).
  Live-proven 2026-09-22: Checkbox screenshotted correctly (an outlined
  empty square for Unchecked, a filled green square with a proportional
  white checkmark for Checked), `Variant` swap confirmed on a real
  instance; Spinner screenshotted correctly (a dark, real loader-arc
  shape, its real `animate-spin` rotation disclosed as not reproduced,
  same treatment as Skeleton's own `animate-pulse`), instantiated and
  confirmed matching. Both cleaned up correctly, final section check: 23
  component sets, zero orphans, no regressions to any of the 21 prior
  components.
- **Switch, RadioGroup, and Attachment close out the NEEDS-ICON bucket for
  good — and with it, `figma-remaining-components-plan.md`'s entire
  "Definition of done"** (see that plan's own closing statement). Switch
  introduces the per-variant `thumb` shape — a fixed track (real
  32×18.4px, confirmed arbitrary-bracket values) containing a fixed,
  DISCRETELY-POSITIONED circular thumb (16px, `figma.createEllipse()`,
  positioned via a computed geometric equivalent of the real CSS
  `translate-x` transform, not a literal replication of it) — genuinely
  different from `bar`'s own continuously-growing fill, hence living on
  the VARIANT (Switch's own two real states each need a different track
  color and thumb position) rather than the top level. Screenshotted
  correctly (thumb left on a gray track when Unchecked, thumb right on a
  green track when Checked), `Variant` swap confirmed on a real instance.
  RadioGroup reuses Checkbox's exact fixed-square/`data-checked:`-split
  shape but swaps the icon for a `centerDot` — a plain solid circle, no
  `createNodeFromSvg`/`rescale` at all — screenshotted correctly (an
  outlined ring, and a filled ring with a centered white dot), `Variant`
  swap confirmed. Attachment reuses Item's own outer-frame-plus-`sections`
  shape exactly (Media/Actions excluded, same reasons as Item's own
  Media/Actions) — screenshotted correctly (a bordered card with
  Title/Description stacked), both `Title` and `Description` swap
  independently on a real instance. **A real bug was caught and fixed
  BEFORE any live push, not after**: `buildAttachmentPlan`'s first draft
  passed its base class string straight to `scanClassesForColors` without
  filtering out two inline `data-[state=error]:`/`data-[state=idle]:`
  classes first — Batch 9's own selector-prefix stripping silently
  stripped the bracket prefix and matched the REMAINING `border-
  destructive` as if unconditional, producing a wrong `status.error`
  stroke instead of the real `border.default`. Caught by inspecting the
  generated plan JSON before touching Figma at all (this project's own
  "verify plan computation, not just that it doesn't crash" discipline),
  fixed by filtering colon-prefixed tokens first — the same technique
  Tabs/Checkbox/RadioGroup already use for their own bare-prefix axes.
  Final full-page check: 26 component sets, zero orphans, no regressions
  to any of the 23 prior components.
- **Button now has a `Size` axis (Batch 1 of
  `figma-component-variations-plan.md`, 2026-10-08) — the first component
  using `extraAxes`** (see step 2c below and `FigmaComponentAxisPlanItem`'s
  own comment in `figma-components-plan.ts`). Four options (Default/Xs/Sm/
  Lg) x the five built variants = 20 component variants named
  `Variant=Default, Size=Sm`. Each size's `h-N` binds a fixed frame height
  to a spacing token, so Button Default is now a fixed 32px where it used
  to hug its content (disclosed). Real, disclosed snaps: Sm (28px) -> 24px
  and Lg (36px) -> 32px, so Sm renders identical to Xs and Lg identical to
  Default — all four are still created so Figma values match code `size=`
  values. **Live proof (2026-10-08, same day, "SDSGT test file", Southleft
  Desktop Bridge): done.** Smoke test: `counterAxisSizingMode = "FIXED"`
  then `frame.setBoundVariable("height", spacing/8)` bound cleanly and read
  back exactly 32 (no fallback needed). Full push: all 20 variants built as
  a NEW set "Button (sizes test)" in its own sibling Section (the existing
  Button set was untouched, plan rule 6); every variant's height read back
  at 32 (Default/Lg) or 24 (Xs/Sm) with the height, radius, font size, fill,
  stroke and text color all still variable-bound (no invisible-text
  regression on Ghost/Destructive/Link); `Size` came out with options
  Default/Xs/Sm/Lg; `componentSet.description` landed (verified by read-back);
  a test instance took `setProperties({Variant: "Destructive", Size: "Lg",
  Label: "Delete account"})`, rendered correctly, and was deleted. Measured:
  10 variant frames built+converted in ~450ms, and the other 10 plus
  `combineAsVariants` and layout in ~315ms — i.e. all 20 fit in a single
  `figma_execute` call with huge headroom (roughly 20-45ms per frame), so
  chunking is not needed at Button's current 20 variants.
- **Button's `Size` axis now also has the four icon-only sizes (Batch 2 of
  `figma-component-variations-plan.md`, 2026-10-08)**: Icon, Icon-xs,
  Icon-sm, Icon-lg, so 8 Size options x 5 variants = 40 component variants.
  Each is a SQUARE frame (`size-N` -> one spacing token used for both width
  and height) with a centered, variant-colored "plus" icon (representative
  placeholder, disclosed; real code passes any icon as children). Real
  snaps, disclosed: Icon-sm (28px) -> 24px, Icon-lg (36px) -> 32px, so
  Icon-lg renders identical to Icon (Icon-sm differs from Icon-xs only in
  icon size, 16px vs 12px). **Live proof (2026-10-08, "SDSGT test file",
  Southleft Desktop Bridge): done.** All 40 variants built in ONE
  `figma_execute` call in ~760ms (~19ms per frame, whole call incl.
  combine+Label ~820ms) — no chunking needed. Binding
  `frame.setBoundVariable("width", ...)` works (after sizing both axes
  `"FIXED"`), and every icon-only variant reads back exactly its token
  size (32/24/24/32) with fill, stroke, radius and icon stroke all
  variable-bound. A test instance `setProperties({Variant: "Outline", Size:
  "Icon-sm"})` plus a `Label` value works (Label is simply not rendered by
  icon-only variants, and the value survives swapping Size icon->text and
  back). Step 5's `findOne(...PrimaryText).componentPropertyReferences =`
  throws on a variant with no text node, so it is now null-guarded (live:
  20 text variants bound, 20 icon-only skipped, no error). New finding: a
  wrapped auto-layout set packs by width, so narrow icon variants break the
  5-column grid; see step 2c's layout note (manual grid instead).
- **Toggle and Item now have a `Size` axis too (Batch 3 of
  `figma-component-variations-plan.md`, 2026-10-08)**, both through the
  shared `buildCvaSizeAxis` / the Item-specific `buildItemSizeAxis`.
  **Toggle** (Default/Outline x Default/Sm/Lg = 6 variants): `h-8/h-7/h-9`
  -> fixed heights 32/24/32 (Sm 28px and Lg 36px snap, so Lg renders
  identical to Default), text 14/12/14 (`text-[0.8rem]` = 12.8px snaps to
  12), radius `radius/md`; `min-w-N` and the icon-related classes are
  disclosed as not modeled. **Item** (Default/Outline/Muted x Default/Sm/Xs
  = 9 variants, the first `sections` + `extraAxes` combination): each size
  option carries a replacement `sections` plus `sectionGapVariable`; the
  replay's `sections` branch now reads `item.sections` /
  `item.sectionGapVariable` (not `component.`), which is identical when
  there is no `extraAxes`. Xs changes the horizontal padding (spacing/2) and
  the Description to 12px; Sm is identical to Default (the real classes
  that differ sit on Item parts this plan doesn't model, disclosed).
  **Live proof (2026-10-08, "SDSGT test file", Southleft Desktop Bridge):
  done.** Built NEW sets "Toggle (sizes test)" and "Item (sizes test)" in a
  NEW Section "Toggle and Item sizes test" (15 frames in ~390ms, one call;
  existing sets untouched). Read-back: every Toggle height 32/24/32 bound
  to the spacing token, every Item's Title and Description present and
  bound in every size (Xs Description 12px, section padding 8px, frame 176
  wide vs 211), fills/strokes/text all still variable-bound. Test
  instances took `setProperties` on Variant, Size, and the Label / Title /
  Description text properties (including a longer description), then were
  deleted; no orphans. Both sets' descriptions carry their disclosure lines
  (13 and 9).
- **Avatar and Switch now have a `Size` axis too (Batch 4 of
  `figma-component-variations-plan.md`, 2026-10-08)**, the first consumers of
  `parseDataSizeClasses` for components without a `cva()` size axis.
  **Avatar** (Default/Sm/Lg): each size is a TRUE square, `item.square` +
  `item.heightVariable` (`spacing/8`, `/6`, `/10`; width AND height bound,
  padding zeroed, label centered), fallback text 14/12/14px. This replaces
  the old hug-content-with-padding approximation, so Default is now a fixed
  32px circle (disclosed). **Switch** (Default/Sm): per-size
  `variantOverrides.<Variant>.thumb` supplies a COMPLETE replacement `thumb`
  object (track 32x18.4 / 24x14, thumb 16 / 12px, offsets 1/15 and 1/11);
  step 2c's thumb branch reads `variantItem.thumb` (the merged object), and
  the `Object.assign` merge is shallow so nothing is deep-merged. **Live
  proof (2026-10-08, "SDSGT test file", Southleft Desktop Bridge): done.**
  NEW sets "Avatar (sizes test)" (3 variants) and "Switch (sizes test)" (4)
  in a NEW Section "Avatar and Switch sizes test" at y=2270, built in one
  call (~240ms); existing sets untouched. Read-back: Avatar frames 32/24/40
  with width, height, radius, fill, stroke, font size and text fill all
  variable-bound, the Label property bound to every variant's text (a test
  instance took `{Variant, Size: Lg, Label: "AB"}`); Switch thumbs at x=1
  (Unchecked) and 15 / 11 (Checked, Default / Sm), flush against the right
  edge, track and thumb colors bound; a Checked Sm instance rendered 24x14
  with the thumb at x=11. Instances deleted, no orphans. Descriptions carry
  the 3 (Avatar) and 1 (Switch) disclosure lines. Layout: sets this small
  (3 and 4 variants) used a manual grid (Avatar one row, Switch 2x2).
- **Card and NativeSelect now have a `Size` axis too (Batch 5 of
  `figma-component-variations-plan.md`, 2026-10-08).** Both read their real
  `data-[size=X]:` classes via `parseDataSizeClasses`. **Card** (Default/Sm)
  uses the `sections` + `extraAxes` path unchanged: each option carries a
  full replacement `sections` plus `sectionGapVariable`. Sm's
  `[--card-spacing:--spacing(3)]` becomes `spacing/3` for the root top/bottom
  padding, the gap between sections AND each section's horizontal padding
  (Default stays `spacing/4`); Title text 16 -> 14px (Description and Content
  are 14px in both). Every option keeps the same `labelPropertyName`s
  (Title/Description/Content), so step 5's binding finds them in every
  variant. **NativeSelect** (Default/Sm) uses the existing `heightVariable`
  branch (fixed height, content centered, vertical padding ignored): Default
  `spacing/8`, Sm `spacing/6` (h-7 28px snaps to 24px); no replay change was
  needed. **Live proof (2026-10-08, "SDSGT test file", Southleft Desktop
  Bridge): done.** NEW sets "Card (sizes test)" (2 variants) and
  "NativeSelect (sizes test)" (2) in a NEW Section "Card and NativeSelect
  sizes test" at y=2500 (below "Avatar and Switch sizes test", which ends at
  y=2411); all 4 frames built in one call; existing sets untouched.
  Read-back: Card Default 243x106 (identical to the old Card set's variant),
  Sm 235x92 with 12px top/bottom padding, 12px gap, 12px section padding, all
  bound; NativeSelect 32 / 24px high bound to `spacing/8` / `spacing/6`.
  Text size, text fill, fill and stroke bound on every variant; Title,
  Description, Content and Label properties exist and are bound. Test
  instances (`{Size: Default, Title, Description, Content}` on Card,
  `{Size: Sm, Label}` on NativeSelect) rendered correctly and were deleted;
  no orphans. Descriptions carry the 2 (Card) and 5 (NativeSelect)
  disclosure lines. Layout: manual row per set.
- **Attachment now has TWO extra axes, `Size` and `Orientation` (Batch 6 of
  `figma-component-variations-plan.md`, 2026-10-08).** First component with
  two `extraAxes`: 1 variant x 3 sizes x 2 orientations = 6 components named
  `Variant=Default, Size=Sm, Orientation=Vertical`. Size (default/sm/xs)
  swaps the content padding, Title size and (xs) radius via full replacement
  `sections` + `sectionGapVariable` + `radiusVariable`; Orientation's Vertical
  adds `widthVariable` (a fixed width, replay in step 3's `sections` code) and
  a `combinationOverrides` entry per Size (the content's extra `px-1` adds to
  each size's own padding), which step 2c's combination code applies after
  every axis's own overrides. **Live proof (2026-10-08, "SDSGT test file",
  Southleft Desktop Bridge): done.** NEW set "Attachment (sizes test)" in a
  NEW Section "Attachment sizes test" at y=2850 (below "Card and NativeSelect
  sizes test", which ends at y=2758); 6 frames built and combined in one call
  (~475ms); existing sets untouched. Figma reported three VARIANT properties
  (Variant, Size, Orientation: Default / Default, Sm, Xs / Horizontal,
  Vertical) and the Title and Description TEXT properties. Read-back:
  Default/Horizontal 93x51 (identical to the old Attachment), Sm 83x40, Xs
  75x40, every Vertical 96 wide (`spacing/24`; the real 120px snaps down,
  disclosed); padding, gap, radius, width, font size and fills all
  variable-bound; Vertical text is FILL with ending truncation (Default
  Vertical shows "receipt.p..." at 96px). A test instance took
  `setProperties` on Variant, Size, Orientation, Title and Description (Size
  and Orientation round trips resized it correctly) and was deleted; no
  orphans. Description: 17 disclosure lines. Layout: manual grid, columns =
  Size, rows = Orientation, positioned by PARSING each child's name
  (`combineAsVariants` keeps creation order, so index math puts them in the
  wrong cells).
- **Separator and Field now have an `Orientation` axis (Batch 7 of
  `figma-component-variations-plan.md`, 2026-10-08).** Separator
  (`buildSeparatorAxes`, read from the real `data-horizontal:` /
  `data-vertical:` classes): Horizontal is today's line (empty overrides);
  Vertical carries a complete replacement `line` with `orientation:
  "vertical"` (1px wide, `representativeLengthPx` tall). The line branch of
  step 2 now reads the MERGED `item.line` (the only replay change for it);
  both lengths are a disclosed representative stand-in (the real classes are
  `w-full` / `self-stretch`). Field (`buildFieldOrientationAxis`, read from
  the real `fieldVariants` cva `orientation` axis): Vertical = empty overrides
  (reproduces the old Field exactly, 195x86), Horizontal = the same three
  sections with `textLineDirection: "horizontal"` (Breadcrumb's existing
  row branch, no code change), `responsive` -> `skippedOptions` ("breakpoint-
  driven layout (container query); Figma components have no viewport"), and
  the real classes not modeled (`flex-auto` label, `items-start`, the
  checkbox `mt-px`, vertical `*:w-full`) are listed verbatim in the
  disclosures. **Live proof (2026-10-08, "SDSGT test file", Southleft Desktop
  Bridge): done.** NEW sets "Separator (orientation test)" (2 variants) and
  "Field (orientation test)" (2 variants) in a NEW Section "Separator and
  Field orientation test" at y=3150 (below "Attachment sizes test", which
  ends at y=3056); both sets built in one call; existing sets untouched.
  Read-back: Separator Horizontal 200x1, Vertical 1x200, both fills bound to
  `color/semantic/border/default`; Field Vertical 195x86 (same as the old
  Field; padding top/bottom and gap bound to `spacing/2`), Horizontal 449x18
  (HORIZONTAL, gap bound to `spacing/2`, no padding); every text node's size
  and fill is variable-bound and bound to the Label/Description/Error
  properties in BOTH orientations. Test instances took `setProperties` on
  Orientation and all three Field text properties (Separator Vertical 1x200,
  Field Horizontal 247x18 with short text, Vertical 97x86) and were deleted;
  no orphans. Descriptions: 4 lines (Separator), 5 (Field). Layout: a manual
  row per set, positioned by parsing each child's name.
- **Tabs has a `Style` axis and Marker has Separator/Border variants (Batch 8
  of `figma-component-variations-plan.md`, 2026-10-08).** Tabs
  (`buildTabsStyleAxis`, read from the trigger's real
  `group-data-[variant=line]/tabs-list:` classes): Default = empty overrides
  (today's Tabs); Line = `variantOverrides.Active` with `fillVariable: ""`
  (no fill), `strokeVariable` text.primary, `strokeSides: "bottom"`,
  `strokeWeightPx: 2` (the real `after:` bar, nearest look: flush bottom
  stroke instead of a bar 3-5px below the tab). Marker
  (`buildMarkerStyleVariants`, read from the real cva options) extends the
  existing `Variant` list: Separator = `flankLines` ([80px line, text, 80px
  line], gap `spacing/3` = gap-2 + mr-1), Border = bottom-only 1px
  border.default stroke + `paddingBottomVariable` `spacing/2` (pb-2). New
  replay pieces in step 3: per-side stroke weights, bottom padding override,
  flank rectangles; step 2c's description write now includes the
  component-level `disclosures`. **Live proof (2026-10-08, "SDSGT test file",
  Southleft Desktop Bridge): done.** NEW sets "Tabs (style test)" (4 variants)
  and "Marker (variants test)" (3) in a NEW Section "Tabs and Marker test" at
  y=3730 (below "Separator and Field orientation test", which ends at y=3636);
  built in two calls (~90ms each); existing sets untouched. Read-back: Tabs
  Active/Default fill background.primary 33x18; Active/Line no fill, stroke
  text.primary, per-side weights [0,0,2,0], 33x20 (the stroke adds 2px height,
  disclosed); Inactive identical in both styles (disclosed); Marker Default
  50x18, Separator 234x18 (two 80x1 rects, gap 12 bound), Border 50x27 (bottom
  padding 8 bound, weights [0,0,1,0]); all text and fills variable-bound,
  Label bound. Test instances took `setProperties` on every property, then
  were deleted; no orphans. Descriptions: 6 (Tabs), 4 (Marker). Surprises:
  the bottom stroke follows the tab's rounded corners (curved ends), also
  disclosed.
- **Button has a `State` property (Batch 9 of
  `figma-component-variations-plan.md`, 2026-10-08, plus the 2026-10-09 user
  decisions): PROVEN LIVE 2026-10-09 ("SDSGT test file", Southleft Desktop
  Bridge).** `statePropertyName: "State"`, per-variant `states` (Hover / Focus /
  Disabled / Invalid, sparse overrides; Default is the rest look) and
  `skippedStates`, built by `buildStatesForVariants` from the real `hover:` /
  `focus-visible:` / `disabled:` / `aria-invalid:` classes of the vendored
  button.tsx (200 components = 5 variants x 8 sizes x 5 states). Step 2c's State
  loop and name suffix, step 3's `fillOpacity` / `strokeOpacity`, `nodeOpacity`,
  `focusRing` and `strokesIncludedInLayout = false` all work, with two
  CORRECTIONS found by the smoke tests (now written into step 3): paint opacity
  and the ring's `spread` / alpha must be applied in a SECOND pass (read back,
  clone, set, reassign), because setting them before binding silently drops them
  (the binding itself is kept). **Live result:** NEW set "Button (states test)"
  (200 variants, properties Variant / Size / State plus the Label TEXT property;
  716x2296, widest variant 124px, 5 columns x 40 rows) in a NEW Section "Button
  states test" at y=4060 (below "Tabs and Marker test", whose bottom edge is
  3959), built in two calls: 50 frames in 960ms, then 150 frames in 3135ms
  (about 19-21ms per frame), then 834ms for combine + Label + description + grid.
  Read-back: Default Hover fill action.primary at opacity 0.8; Outline/Ghost
  Hover fill background.secondary, text text.primary; Destructive Hover fill
  status/error-bg + text status/error; Destructive Focus identical to its rest
  look; Link rest not underlined, Link Hover UNDERLINE; Disabled frame opacity
  0.5 on every variant; Focus: stroke border.focus + DROP_SHADOW spread 3, alpha
  0.5, colour bound to border.focus; Invalid: stroke status/error + ring alpha
  0.2 bound to status/error; Focus/Invalid on a no-rest-stroke variant keep the
  Default width (122, `strokesIncludedInLayout` false); Outline keeps 124. All
  text fills / font sizes / icon strokes variable-bound; Label bound on the 100
  text variants. Screenshots: all five states visibly distinct per Variant, text
  and icons legible at every size including Icon-xs. Test instance took
  `setProperties` on Variant, Size, State and Label (live key `Label#115:223`)
  and was deleted; no orphans; description verified (25 lines, exact match).
  **Next for the user:** swap the test set in for the old Button set when happy.
- **Toggle and Badge have a `State` property (Batch 10 of
  `figma-component-variations-plan.md`, 2026-10-09): PROVEN LIVE 2026-10-09
  ("SDSGT test file", Southleft Desktop Bridge).** Same mechanism as Button, no
  replay changes: Toggle = Variant x Size x State (Default, Hover, Focus,
  Disabled, Invalid, Pressed) = 36 variants; Badge = Variant x State (Default,
  Hover, Focus, Invalid, no extraAxes) = 20 variants. New NEW sets "Toggle (states
  test)" (160x1044) and "Badge (states test)" (327x164) in a NEW Section "Toggle
  and Badge states test" at y=6540 (below "Button states test", bottom edge 6436);
  36 frames in ~870ms and 20 in ~490ms, one call each. Figma reports Variant /
  Size / State (Toggle) and Variant / State (Badge) as VARIANT properties plus
  the Label TEXT property. Read-back matched the plan (fills, paint opacity 0.8
  on Badge Default Hover, strokes, ring effects spread 3 alpha 0.5 bound to
  border/focus, Disabled frame opacity 0.5, Link rest NONE decoration vs Hover
  UNDERLINE, Destructive Hover status/error-bg + status/error, Destructive Focus
  identical to rest, `strokesIncludedInLayout` false on state-added strokes,
  Focus/Invalid widths unchanged). **LIVE FINDING (applies to any component with
  a Focus ring): Figma draws a drop shadow only for a frame that HAS a fill.** On a
  fill-less frame (Toggle Default/Outline, Badge Outline/Ghost/Link, and Button's
  Ghost/Link) the ring effect is set correctly but nothing renders, even with a
  stroke and `showShadowBehindNode`; a fill with ANY transparency instead draws the
  ring through the whole box (tested on throwaway frames, deleted). So for those
  variants Focus shows as the border-focus stroke only; the plan now discloses it
  (`buildCommonStateDisclosures`). Test instances took `setProperties` on every
  property (Toggle Outline/Lg/Pressed/"Bold" 49x32; Badge Destructive/Hover/
  "Delete" 54x15, pale-red tint with red text), screenshots correct, deleted; page
  children were exactly the 14 earlier nodes plus the one new Section.
- **Input and Textarea have a `State` property (Batch 11 of
  `figma-component-variations-plan.md`, 2026-10-09): PROVEN LIVE 2026-10-09
  ("SDSGT test file", Southleft Desktop Bridge).** Same mechanism, no replay
  changes: each is one "Default" variant x State (Default, Focus, Disabled,
  Invalid) = 4 variants, no extraAxes. NEW sets "Input (states test)" (117x216)
  and "Textarea (states test)" (117x248) in a NEW Section "Input and Textarea
  states test" at y=7770 (below "Toggle and Badge states test", bottom edge 7664),
  one call each (4 frames, ~150ms). Figma reports Variant / State as VARIANT
  properties plus the Label TEXT property. Read-back matched the plan: rest
  Input 111x30 and Textarea 111x38 (identical to the existing sets), Focus stroke
  border/focus + DROP_SHADOW spread 3 alpha 0.5 bound to border/focus, Invalid
  stroke status/error + ring alpha 0.2 bound to status/error, Disabled frame
  opacity 0.5 with a border/default fill at paint opacity 0.5 (the two multiply),
  no frame widened, text fill / font size / Label bound on all 8. As predicted
  (both fields are fill-less at rest), the Focus and Invalid rings are set but do
  NOT render; the states show as a border-colour change (disclosed, plan notes and
  descriptions). Test instances took `setProperties` on Label, State and Variant
  (Disabled, then Invalid / Focus), screenshots correct, deleted; page children
  were the earlier nodes plus the one new Section.
- **NativeSelect and Item have a `State` property (Batch 12 of
  `figma-component-variations-plan.md`, 2026-10-09): PROVEN LIVE 2026-10-09
  ("SDSGT test file", Southleft Desktop Bridge).** Same mechanism, no replay
  changes. NEW sets "NativeSelect (states test)" (137x556; Variant, Size, State as
  VARIANT properties plus the Label TEXT property; 10 variants, 131x32 / 131x24) and
  "Item (states test)" (693x723; Variant, Size, State plus the Title and Description
  TEXT properties; 27 variants) in a NEW Section "NativeSelect and Item states test" at
  y=8200 (below "Input and Textarea states test", bottom edge 8098), one call each
  (10 frames 841ms, 27 frames 1883ms). Read-back matched the plan: NativeSelect Focus
  stroke border/focus + ring spread 3 alpha 0.5, Invalid stroke status/error + ring
  alpha 0.2, Disabled frame opacity 0.5, Hover identical to Default, no frame widened;
  Item Hover fill background/secondary (Default and Outline; Muted unchanged), Focus
  stroke border/focus with `strokesIncludedInLayout` false where the rest look has no
  stroke, ring on the outer frame, one section intact and Title/Description present,
  bound and property-referenced in all 27, Xs Description 12px. Screenshot: Hover
  visible on Default/Outline, Focus a border change (the ring only shows on Muted,
  which has a fill), as disclosed. Instances took `setProperties` on every property
  (NativeSelect Sm/Invalid/Label; Item Outline/Xs/Focus/Title/Description), screenshots
  correct, deleted; the Section holds exactly the two sets, no orphans.
- **Checkbox and RadioGroup have a `State` property (Batch 13 of
  `figma-component-variations-plan.md`, 2026-10-13): PROVEN LIVE 2026-10-13 ("SDSGT test file").**
  Same mechanism, no replay changes expected: Variant (Unchecked/Checked) x State
  (Default, Focus, Disabled, Invalid) = 8 frames per component, both `fixedSizePx` 16x16,
  Checkbox's Checked variant with its check `icon`, RadioGroup's with its `centerDot`.
  Things to check when pushing: a Checked frame's Focus/Invalid carries ONLY the ring (no
  `strokeVariable`; its border stays `action/primary`), Unchecked's Focus/Invalid carry the
  stroke change plus a ring that will not render (fill-less at rest, disclosed), Disabled is
  frame opacity 0.5, the icon/dot survive every state, and a ring on a 16x16 fixed frame
  draws (drop shadow, spread 3). Neither component has a `Label` property to bind.
  Result: NEW sets "Checkbox (states test)" and "RadioGroup (states test)" (8 variants each, 62x160)
  in a NEW Section "Checkbox and RadioGroup states test" at y=9103, one call (16 frames, 369ms); read-back
  matched the plan. **Grid note:** a component set clips its content, so the manual grid must leave 3px of
  ring room on the LEFT and RIGHT as well as above/below (shift every column +3px, widen the set +6px) or the
  right-hand column's ring is cut off. **Known limit (all ring states, batches 9-13), FIXED 2026-10-13:** a
  bound ring's colour alpha (and a fill's paint opacity) is correct on the main component but reads back as 1
  on an INSTANCE. The plan now binds ring effects to the baked tokens `color/semantic/border/focus-ring` and
  `color/semantic/status/error-ring` (the effect's own alpha is set EQUAL to the token's alpha, 0.5 / 0.2, so
  set and instances agree; scope `EFFECT_COLOR`) and the Default hover fill of Button/Badge to the solid
  token `color/semantic/action/primary-hover-soft`; nothing in the replay code changed (ring.colorVariable is
  just a different variable). Push the three variables with the token push first, or `getVar` throws. See
  `contracts-and-seeds.md`, "Figma instances lose a fill's or ring's transparency". The Input/Textarea
  Disabled state was fixed the same day too: its fill, stroke and placeholder text bind the solid tokens
  `color/semantic/background/field-disabled`, `border/field-disabled`, `text/field-disabled` and the frame
  is NOT dimmed (frame opacity 1) for that one state; the replay needs nothing new (`variantItem.fillVariable`
  / `strokeVariable` / `textVariable` are read as for any state). Push the variables first. Attachment's
  Hover binds `color/semantic/background/surface-hover` (solid) the same way; in dark mode it equals the
  card at rest.
- **Field Invalid and Bubble Clickable (2026-10-13): PROVEN LIVE ("SDSGT test file").** Two small additive replay
  pieces, both documented where they live: step 3's `sections` loop reads `variantItem.textLineOverrides` (Field's
  Invalid recolours only the Label line), and step 2c's combination code skips a state's fields when an axis option
  lists it in `ignoreStates` (Bubble's `Clickable=Default` builds Hover and Focus identical to rest). New sets
  "Field (states test)" (4 variants) and "Bubble (states test)" (30 variants) were built by CLONING the existing
  rest variants (so the rest look is identical) and then applying each state's bindings; ring alpha on an instance
  equals the main component's (the ring tokens). Field Disabled (the Label line takes `color/semantic/text/label-disabled`, no opacity) was added to the
  Field set the same day by cloning the Default variants INTO the set (`set.appendChild(clone)` is required, a bare
  `clone()` does not land in the set) and re-laying the grid; Bubble Muted's Hover is identical to rest by decision.
- **Alert inline link + Hover (2026-10-13): PROVEN LIVE.** The Alert description ends with an underlined inline link
  (a styled range in the SAME text layer) and Hover recolours only that range (`linkTextVariable`). **Figma limit:** a
  text node bound to a TEXT component property is flattened and all instances share the property's styled default, so
  the Alert has NO `Description` TEXT property when `inlineLink` is present (step 5 skips it because
  `secondaryLabelPropertyName` is absent); apply the range styling per variant, and designers edit the text in place.
- **Switch and Tabs have a `State` property (Batch 14 of
  `figma-component-variations-plan.md`, 2026-10-13): PROVEN LIVE 2026-10-13 ("SDSGT test file").**
  Switch: Variant (Unchecked/Checked) x Size (Default/Sm) x State (Default, Focus, Disabled, Invalid)
  = 16 frames; Tabs: Variant (Inactive/Active) x Style (Default/Line) x State (Default, Hover, Focus,
  Disabled) = 16 frames. Two SMALL replay points (both written into step 2c's code above and
  below as notes, nothing else changed):
  (1) **The `variant.thumb` branch (Switch) skips the whole step 3 frame code, so it must apply the
  merged state fields itself, on the TRACK frame:** `variantItem.strokeVariable` (a 1px stroke, `strokeWeight`
  1, `strokesIncludedInLayout = false` in a try/catch), `variantItem.nodeOpacity` (`track.opacity`) and
  `variantItem.focusRing` (the same DROP_SHADOW two-pass as step 3; the track has a fill, so the ring renders).
  The thumb child is untouched, so it is the same in every state. A Switch state frame stays 32x18.4 / 24x14.
  (2) **Tabs Line / Active / Focus:** the state carries `strokeSides: "all"` + `strokeWeightPx: 1` (new on
  `FigmaComponentStatePlanItem`, merged AFTER the Style override), so the replay's existing non-"bottom"
  branch draws a uniform 1px focus border INSTEAD of the 2px bottom bar (a frame has one stroke colour).
  Use the MERGED REST look to decide `strokesIncludedInLayout`: set it to `false` when the REST look
  (variant + Style override, before the state) has no stroke, or when the state's `strokeSides === "all"`;
  step 3's `!variant.strokeVariable` test alone would also switch it off for the Line Active REST frame
  (33x20 in Batch 8, the bar adds 2px by design). Result: Line Active Default/Hover/Disabled 33x20,
  Line Active Focus 33x18.
  Result: NEW sets "Switch (states test)" (182x123) and "Tabs (states test)" (186x134, plus a Label TEXT
  property bound on all 16) in a NEW Section "Switch and Tabs states test" at y=9443 (previous bottom edge 9343),
  one call each (16 frames, ~300ms and ~410ms). Read-back matched the plan on every frame (fills, strokes,
  ring effects spread 3 / alpha 0.5 and 0.2 bound to the ring tokens, frame opacity 0.5, thumb positions
  1/15 and 1/11, Tabs text/radius/padding/font bound). Instances took `setProperties` on every property
  (Switch Variant/Size/State; Tabs Variant/Style/State/Label), the instance ring alpha equals the main
  component's (0.2 / 0.5), instances were deleted, no orphans (19 top-level nodes).
- **Accordion, Label and Attachment have a `State` property (Batch 15 of
  `figma-component-variations-plan.md`, 2026-10-13): PROVEN LIVE 2026-10-13 ("SDSGT test file"), with NO replay
  change at all** (steps 2c and 3 as written). Accordion = Variant x State (Default, Hover, Focus, Disabled) = 4
  frames (Hover is `state.underline: true`, which step 3's text code already reads from `variantItem`; Focus adds a
  1px `border/focus` stroke with `strokesIncludedInLayout = false` plus the 3px ring, which does NOT render because
  the frame has no fill, disclosed; Disabled is frame opacity 0.5). Label = Variant x State (Default, Disabled) = 2
  frames (frame opacity 0.5 on a bare text frame). Attachment = Variant x Size (Default/Sm/Xs) x Orientation
  (Horizontal/Vertical) x State (Default, Hover, Focus) = 18 frames through the same `sections` + `extraAxes` path as
  Item (Focus = a 1px `border/focus-ring` ring on the filled frame, which renders; Hover is an EMPTY state, identical
  to Default, listed in `skippedStates` with the exact class and the open decision). Result: NEW sets "Accordion (states
  test)" (116x235), "Label (states test)" (45x75) and "Attachment (states test)" (342x421) in a NEW Section
  "Accordion, Label and Attachment states test" at y=9920 (previous bottom edge 9820), one call for Accordion + Label
  (~170ms) and one for Attachment (~590ms). Read-back matched the plan on all 24 frames (bound fills, strokes, radius,
  padding, font size; ring spread 3 / 1 at alpha 0.5 bound to `border/focus-ring`; opacity 0.5; Vertical width bound
  to `spacing/24`; Accordion Hover text underlined; all Label/Title/Description text bound to the TEXT properties; set
  descriptions 11, 4 and 25 lines). Instances took `setProperties` on every property, instance ring alpha equals the
  main component's (0.5 / 0.5), instances deleted, no orphans (20 top-level nodes: the 19 earlier plus the new Section).
  The five triaged components (Alert, Breadcrumb, Field, Marker, Bubble) get no State property, only `disclosures`.

**A component can now have NO text at all** (Skeleton, added 2026-09-18 —
see `FigmaComponentVariantPlanItem.textVariable`'s own comment in
`figma-components-plan.ts` for why it's optional as of this addition).
Every step below that touches a text node is now gated on
`variant.textVariable`/`component.labelPropertyName` actually being
present — a text-less variant gets a frame with only its fill/stroke/
radius, no text child, no component property. This is purely additive:
every one of the eleven earlier components always sets both fields, so
they pass through these same guards completely unaffected.

**Read `<projectDir>/figma-components-push-plan.json`** (shape:
`FigmaComponentsPushPlan` in `figma-components-plan.ts`) — `components`,
`notes`. Say the `notes` array's contents to the user in plain language
before pushing (e.g. "Button's padding is 2px off shadcn's own exact
value — nearest real token, not a fabricated one").

**Variables must already exist** — this step only ever binds to variable
names the plan references; it never creates new ones. If step 1–6 didn't
run in this same session (e.g. the user asks for a components-only push
later), verify first via `figma_get_variables({ format: "summary",
refreshCache: true })` that a real token push already exists in the target
file. If it doesn't, stop and say so — there's nothing to bind to.

For each item in `plan.components`, in order:

1. **Say the skipped-variant reasons in plain language before building**
   (e.g. "skipping the Secondary variant — this project's tokens don't
   have a secondary brand color"). Don't build a fallback/approximation for
   a skipped variant — the plan already decided it shouldn't exist.
1b. **Check `component.icon` FIRST, before `line`/`bar`/`sections`/the
   normal box procedure** (Spinner — added 2026-09-22, icon-support work;
   see `FigmaComponentIconPlanItem`'s own comment in
   `figma-components-plan.ts`). This is the most extreme bypass this file
   has — not even a frame gets created, only the icon itself, which IS the
   whole component:
   ```js
   function buildLucideIcon(icon) { // icon: { viewBox, pathData, sizePx, colorVariable }
     const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.pathData}"/></svg>`;
     const iconNode = figma.createNodeFromSvg(svg); // returns a FRAME wrapping one VECTOR child — confirmed live 2026-09-22 via a real smoke test, not assumed
     const nativeSize = iconNode.width; // real lucide icons always import at their native square viewBox size (24 for every icon this file uses so far)
     iconNode.rescale(icon.sizePx / nativeSize); // NEVER resize() here — resize() scales the vector's geometry but leaves strokeWeight a literal, UNSCALED value (confirmed live: stayed exactly 2 after a resize() from 24px down to 14px, rendering disproportionately thick); rescale() correctly scales both together (confirmed live: 2 → 1.167 for a 24→14px scale, exactly `2 × 14/24`)
     const vector = iconNode.findOne(n => n.type === "VECTOR");
     vector.strokes = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(icon.colorVariable))]; // real, confirmed: setBoundVariableForPaint works identically on a VECTOR's own .strokes as it does on a FRAME's fills/strokes
     return iconNode;
   }

   if (component.icon) {
     const iconNode = buildLucideIcon(component.icon);
     const comp = figma.createComponentFromNode(iconNode);
     comp.name = `${plan.variantPropertyName}=${variant.name}`; // "Variant=Default" — same single-"Default"-variant precedent as Separator/Skeleton
     // ...append `comp` to this component's own `components` array, then go
     // straight to step 4's combineAsVariants. Skip everything else below —
     // no frame, no fill/stroke/radius binding, no text-child step, none of
     // it applies to a bare icon.
   }
   ```
   In step 5, an icon-only component never has `component.labelPropertyName`
   set, so the whole TEXT-property block is skipped automatically — same as
   bare Separator and Progress.
2. **Check `component.line` next, before doing anything else in this
   step** (Separator/`field.tsx`'s FieldSeparator — added 2026-09-21, the
   first genuinely non-box shape this plan produces; see
   `FigmaComponentLinePlanItem`'s own comment in `figma-components-plan.ts`
   for the full reasoning). If present, this REPLACES the entire
   auto-layout-frame procedure below for this component — skip straight to
   this branch instead, then jump directly to step 4
   (`combineAsVariants`)/step 5 (label properties) using whichever node
   this produces in place of the usual auto-layout `frame`:
   ```js
   // `item` === `component` unless `extraAxes` is present (step 2c merges the
   // chosen options into `item`); Separator's Orientation axis (Batch 7)
   // overrides `line` per option, so this branch reads the MERGED `item.line`,
   // never `component.line`, for every field below.
   if (item.line) {
     const lineColor = getVar(item.line.colorVariable);
     function makeLineRect(lengthPx) {
       const rect = figma.createRectangle();
       // Vertical (Batch 7, `item.line.orientation === "vertical"`): width = thickness, height = length.
       if (item.line.orientation === "vertical") rect.resize(item.line.thicknessPx, lengthPx);
       else rect.resize(lengthPx, item.line.thicknessPx); // fixed size, NOT auto-layout — a bare line has no content to "hug"
       rect.fills = [bindPaint({ r: 0, g: 0, b: 0 }, lineColor)];
       return rect;
     }

     let node; // plays the same role `frame` plays for every other component below
     if (item.line.centerLabel) {
       // [line, text, line] row — a disclosed, non-overlapping approximation
       // of FieldSeparator's real absolute-position + background-mask
       // technique (see FigmaComponentLinePlanItem's own comment). Only
       // FieldSeparator sets centerLabel — bare Separator never does.
       const row = figma.createFrame();
       row.layoutMode = "HORIZONTAL";
       row.primaryAxisSizingMode = "AUTO"; // hug contents — the two fixed-size line segments plus the text node
       row.counterAxisSizingMode = "AUTO";
       row.primaryAxisAlignItems = "CENTER";
       row.counterAxisAlignItems = "CENTER";
       row.fills = [];
       row.setBoundVariable("itemSpacing", getVar(item.line.centerLabel.gapVariable));
       row.appendChild(makeLineRect(item.line.representativeLengthPx));

       await figma.loadFontAsync({ family: fontFamilyValue, style: "Regular" });
       const label = figma.createText();
       label.name = "CenterLabelText"; // lets step 5 find this specific node by name, same convention as PrimaryText/SecondaryText
       label.fontName = { family: fontFamilyValue, style: "Regular" };
       label.characters = item.line.centerLabel.defaultLabel;
       label.setBoundVariable("fontSize", getVar(item.line.centerLabel.fontSizeVariable));
       label.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(item.line.centerLabel.textVariable))];
       row.appendChild(label);

       row.appendChild(makeLineRect(item.line.representativeLengthPx));
       node = row;
     } else {
       // Separator's own default case — the rectangle itself IS the
       // component; no wrapping frame needed at all.
       node = makeLineRect(item.line.representativeLengthPx);
     }

     const comp = figma.createComponentFromNode(node); // works directly on a RECTANGLE, not just a FRAME — confirmed real Plugin API behavior
     comp.name = `${plan.variantPropertyName}=${variant.name}`; // "Variant=Default" — same naming convention as every other component, even with only one real variant (Skeleton/Avatar/Label/... precedent)
     // ...append `comp` to this component's own `components` array exactly
     // like every other variant below, then go straight to step 4's
     // combineAsVariants. Skip the ENTIRE auto-layout frame procedure
     // below (fills/strokes/padding/radius binding, the text-child step,
     // the secondaryTextVariable/sections branches) for this component —
     // none of it applies to a line.
   }
   ```
   In step 5, a `line`-based component never has `component.labelPropertyName`
   set (neither Separator nor FieldSeparator's plan sets it at the top
   level), so that whole TEXT-property block is skipped automatically —
   but if `item.line.centerLabel` is present, add ONE additional TEXT
   property for it, bound to the `CenterLabelText` node by name (same
   by-name lookup step 5 already uses for `PrimaryText`/`SecondaryText`):
   ```js
   if (component.line?.centerLabel) { // `component`, not `item`: step 5 runs once per set, and no axis ever overrides centerLabel
     const centerPropName = componentSet.addComponentProperty(component.line.centerLabel.labelPropertyName, "TEXT", component.line.centerLabel.defaultLabel);
     for (const variant of componentSet.children) {
       variant.findOne(n => n.type === "TEXT" && n.name === "CenterLabelText").componentPropertyReferences = { characters: centerPropName };
     }
   }
   ```
   Separator itself (no `centerLabel`) gets no TEXT property at all — same
   as Skeleton, the automatically-derived `Variant` property (`"Default"`)
   is the only real property to swap during step 6's validation.
2b. **Check `component.bar` next** (Progress — added 2026-09-22, "Batch 11"
   of figma-remaining-components-plan.md, the first genuinely NESTED
   fixed-size shape this plan produces; see `FigmaComponentBarPlanItem`'s
   own comment in `figma-components-plan.ts` for the full reasoning). If
   present, this REPLACES the entire auto-layout-frame procedure below for
   this component, same as `component.line` above — build the track+
   indicator pair, then jump straight to step 4 (`combineAsVariants`)/step
   5 (label properties, though Progress sets no `labelPropertyName` at the
   top level, so that whole TEXT-property block is skipped automatically,
   same as bare Separator):
   ```js
   if (component.bar) {
     const trackColor = getVar(component.bar.trackColorVariable);
     const indicatorColor = getVar(component.bar.indicatorColorVariable);
     const heightVar = getVar(component.bar.heightVariable);
     const radiusVar = getVar(component.bar.radiusVariable);

     const track = figma.createFrame(); // FIXED-size, not auto-layout — a real fixed h-1 track, not something hugging content
     track.resize(component.bar.widthPx, 1); // real height set via setBoundVariable below; 1 is a placeholder pre-bind
     track.setBoundVariable("topLeftRadius", radiusVar);
     track.setBoundVariable("topRightRadius", radiusVar);
     track.setBoundVariable("bottomLeftRadius", radiusVar);
     track.setBoundVariable("bottomRightRadius", radiusVar);
     track.fills = [bindPaint({ r: 0, g: 0, b: 0 }, trackColor)];
     track.clipsContent = true; // reproduces the real overflow-x-hidden clip — this, not a radius on the indicator, is what gives the indicator its real rounded-left/square-right look

     const indicator = figma.createRectangle(); // deliberately NO radius binding — see this branch's own comment above for why
     indicator.resize(Math.max(1, component.bar.widthPx * component.bar.representativeFillFraction), 1); // real height bound below, matching the track's
     indicator.x = 0;
     indicator.y = 0;
     indicator.fills = [bindPaint({ r: 0, g: 0, b: 0 }, indicatorColor)];
     track.appendChild(indicator);

     // Real Plugin API constraint (confirmed live for Separator/
     // FieldSeparator's own fixed-size nodes): a variable-bound height
     // must be set via setBoundVariable, which requires the node support
     // it — bind track and indicator to the SAME heightVariable so they
     // stay in lockstep if it's ever edited in Figma, matching the real
     // indicator's own h-full (100% of track height).
     track.setBoundVariable("height", heightVar);
     indicator.setBoundVariable("height", heightVar);

     const comp = figma.createComponentFromNode(track);
     comp.name = `${plan.variantPropertyName}=${variant.name}`; // same naming convention as every other component
     // ...append `comp` to this component's own `components` array exactly
     // like every other variant below, then go straight to step 4's
     // combineAsVariants. Skip the ENTIRE auto-layout frame procedure
     // below (fills/strokes/padding/radius binding, the text-child step,
     // the secondaryTextVariable/sections branches) for this component —
     // none of it applies to a bar.
   }
   ```
   **Live-proven (2026-09-22)** — `setBoundVariable("height", ...)` works
   directly on both a FRAME (track) and a RECTANGLE (indicator), no
   fallback needed; the real resulting sizes (240×4px track, 144×4px
   indicator) were confirmed via a `preConvertInfo` object captured BEFORE
   `createComponentFromNode` (see this step's own general node-
   invalidation gotcha, further down) — reading `track.height`/
   `indicator.height` AFTER conversion throws `"The node with id ... does
   not exist"`, the exact same failure mode already documented there for
   reading `frame.name` post-conversion, just hitting a numeric property
   instead of a string one this time. Also: do NOT call
   `componentSet.addComponentProperty(plan.variantPropertyName, "VARIANT",
   ...)` for a bar (or any) component — `combineAsVariants` already
   auto-derives the variant property from each component's own
   `Variant=<name>` prefix (the same precedent Skeleton/Avatar/Label/
   Separator's own bare "Default" variant already established); calling it
   again throws `"Node already has a variant property with name Variant"`.
   That failed call surfaced a real, separate finding worth generalizing:
   the `createComponentFromNode`/`combineAsVariants` mutations earlier in
   that SAME script were NOT rolled back by the later throw, leaving a real
   orphaned component set in the file — despite this skill's own general
   framing of `figma_execute` as atomic. Treat every future
   component-creation error the same way: after fixing and retrying,
   explicitly check for and delete any partial node the failed attempt may
   have already created, rather than assuming a thrown error means nothing
   happened.
2c. **Check `variant.thumb` FIRST, before anything else in the per-variant
   step below** (when the component has `extraAxes`, read it from the
   MERGED `variantItem` instead — see the next numbered block's merge:
   `variantItem.thumb` is the size option's own complete `thumb` object,
   which fully REPLACES the variant's, because `Object.assign` is shallow.
   Switch's plan supplies the whole object, colors and radius included,
   for every size; Batch 4. Name the component with the axis suffix, e.g.
   `Variant=Checked, Size=Sm`) (Switch — added 2026-09-22, final NEEDS-ICON batch; see
   `FigmaComponentVariantPlanItem.thumb`'s own comment in
   `figma-components-plan.ts`). Unlike `icon`/`centerDot` below (content
   INSIDE an otherwise-normal frame), a `thumb`-bearing variant REPLACES
   its own entire frame-building procedure — the track itself plays the
   role every other variant's padded/fixed-size frame plays, with a
   discretely-positioned circular thumb inside it, never a color/radius
   binding on an outer box the usual way:
   ```js
   if (variantItem.thumb) { // `variantItem` === `variant` when there is no `extraAxes`
     const t = variantItem.thumb;
     const track = figma.createFrame();
     track.resize(t.trackWidthPx, t.trackHeightPx);
     track.setBoundVariable("topLeftRadius", getVar(t.radiusVariable));
     track.setBoundVariable("topRightRadius", getVar(t.radiusVariable));
     track.setBoundVariable("bottomLeftRadius", getVar(t.radiusVariable));
     track.setBoundVariable("bottomRightRadius", getVar(t.radiusVariable));
     track.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(t.trackColorVariable))];

     const thumb = figma.createEllipse(); // a real circle — Switch's own thumb is always perfectly round (rounded-full, equal width/height), not just a rounded rectangle
     thumb.resize(t.thumbSizePx, t.thumbSizePx);
     thumb.x = t.thumbOffsetXPx;
     thumb.y = (t.trackHeightPx - t.thumbSizePx) / 2; // vertically centered, matching the real items-center flex behavior
     thumb.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(t.thumbColorVariable))];
     track.appendChild(thumb);

     const variantName = variant.name;
     const comp = figma.createComponentFromNode(track);
     comp.name = `${plan.variantPropertyName}=${variantName}`;
     // ...append `comp` to this component's own `components` array exactly
     // like every other variant, then continue the loop to the NEXT
     // variant — skip the entire auto-layout frame procedure below for
     // THIS variant only (another `thumb`-less variant in the same
     // component would still go through it normally, though Switch's own
     // two real variants both set `thumb`).
   }
   ```
   If `variant.thumb` was present, that fully replaces this variant's own
   build — continue the loop to the next variant, skipping step 3 below
   entirely for this one. **Exception (Batch 14, Switch States):** apply the
   merged STATE fields to `track` before `createComponentFromNode`: a state
   stroke (`track.strokes = [bindPaint(..., getVar(variantItem.strokeVariable))]`,
   `track.strokeWeight = 1`, `strokesIncludedInLayout = false` in a try/catch),
   `track.opacity = variantItem.nodeOpacity` and the `variantItem.focusRing`
   drop shadow exactly as step 3 does it (the track has a fill, so the ring
   draws). Proven live 2026-10-13.
2c. **If `component.extraAxes` OR `component.statePropertyName` is present** (Button's `Size` — added
   2026-10-08, component-variations Batch 1; see
   `FigmaComponentLayoutOverrides`/`FigmaComponentAxisPlanItem` in
   `figma-components-plan.ts`), this component produces MORE than one
   Figma component per `variant`: one per combination of `extraAxes`
   options. A component WITHOUT `extraAxes` skips this whole block and
   replays exactly as before (`item` below is just `component`).
   - **Combinations.** The cartesian product of every axis's `options`
     (axes in plan order). Iterate the axis combination in the OUTER loop
     and `component.variants` in the INNER loop, so the finished set reads
     as one row per size, one column per variant. When the component has
     `statePropertyName` (Batch 9: Button), the STATE loop sits between them:
     axis combinations (outer) -> states (`Default` first, then `variant.states`
     in plan order) -> variants (inner), so a row is one Size x State pair and a
     column is one Variant. For each (combination, state, variant) triple, build
     the merged objects and then run step 3's existing, unchanged frame code on
     them:
     ```js
     // `combo` = [{axis, option}, ...] in plan order, one entry per axis.
     // `combinationOverrides` (Batch 6; absent on every earlier component) are
     // extra overrides an option applies ONLY alongside one specific option of
     // another axis, keyed "<otherAxis.propertyName>=<otherOption.name>"
     // (e.g. Attachment's Vertical has "Size=Sm"); they come last so they win.
     const comboOverrides = combo.flatMap(c => combo.filter(o => o !== c)
       .map(o => (c.option.combinationOverrides || {})[`${o.axis.propertyName}=${o.option.name}`]).filter(Boolean));
     const allOverrides = [...combo.map(c => c.option.overrides), ...comboOverrides]; // later axes win; overrides only carry the fields they change
     const item = Object.assign({}, component, ...allOverrides);
     // Batch 9: `state` is null for the implicit Default state (the variant's rest
     // values), else one entry of `variant.states`. Drop its `name` before merging
     // (it would overwrite the variant's own name); every other field is a sparse
     // override (fillVariable/fillOpacity/textVariable/strokeVariable/strokeOpacity/
     // underline/nodeOpacity/focusRing) laid on top of the variant AFTER the axis
     // `variantOverrides`, so a state wins over a Size/Style tweak.
     // 2026-10-13 (Bubble's Clickable axis): an axis option may list `ignoreStates` (e.g. ["Hover","Focus"]); for those
     // State values the state's fields are NOT applied, so the frame is built identical to the rest look.
     const stateIgnored = state && allOverrides.some(o => (o.ignoreStates || []).includes(state.name));
     const stateFields = state && !stateIgnored ? (({ name, ...rest }) => rest)(state) : {};
     const variantItem = Object.assign({}, variant, ...allOverrides.map(o => (o.variantOverrides || {})[variant.name] || {}), stateFields);
     ```
     In step 3's code, `item` supplies the padding/radius/font/height
     values and `variantItem` the fill/stroke/text values.
   - **line + extraAxes (Separator's Orientation, Batch 7).** A `line`
     component skips step 3's frame code but still goes through this
     combination code: the merged `item.line` (the option's own `line`
     replaces the base one wholesale) is what step 2's line branch reads, so
     Vertical (`item.line.orientation === "vertical"`) draws a fixed
     rectangle `thicknessPx` wide and `representativeLengthPx` tall, with the
     same color-variable binding as Horizontal. Name each component
     `Variant=Default, Orientation=Vertical`; place the two in a simple row.
   - **Horizontal sections (Field's Orientation, Batch 7).** An option may
     replace `sections` with the same sections carrying `textLineDirection:
     "horizontal"` (Field Horizontal); step 3's existing `sections` code then
     builds Breadcrumb's side-by-side row: the frame's padding is zeroed and
     `itemSpacing` binds `item.sectionGapVariable`, while the Vertical option
     (empty overrides) keeps the stacked layout and its disclosed top/bottom
     padding. Every `textLines[].labelPropertyName` is identical in both
     orientations, so step 5 binds the same Label/Description/Error
     properties on every variant.
   - **variantOverrides with fill/stroke (Tabs' Style, Batch 8).** Tabs' Style
     axis (Default / Line) is a `variantOverrides` entry per variant name
     ("Inactive"/"Active"): Line's Active has `fillVariable: ""` (the empty
     string means "remove the base value"; JSON can't carry `undefined`, and
     step 3 already tests truthiness, so no fill is drawn) plus `strokeVariable`,
     `strokeSides: "bottom"` and `strokeWeightPx: 2`, which step 3 draws as a
     bottom-edge-only stroke (`strokeBottomWeight`; the other three sides 0).
     This is the nearest representable look to the real `after:` underline bar
     (the real bar sits 3-5px below the tab; the stroke is flush on its edge),
     disclosed in the axis. Combinations are named `Variant=Active, Style=Line`;
     one variant-property pair per row, `columns = component.variants.length`.
   - **Marker's variants (Batch 8) are NOT an axis.** They extend the existing
     `Variant` list (Default / Separator / Border), so no combination code runs.
     Separator carries `flankLines` ([line, text, line], gap bound to a spacing
     token) and Border carries `strokeSides: "bottom"` + `paddingBottomVariable`;
     both are read from `variantItem` in step 3. The set's `description` comes
     from the component-level `disclosures` (see "Description" below).
   - **Names.** `"<variantPropertyName>=<variant.name>, <axis.propertyName>=<option.name>"`
     in plan order, e.g. `"Variant=Default, Size=Sm"`; with states the State
     property comes LAST (`"Variant=Default, Size=Sm, State=Hover"`, the
     implicit one is `State=Default`). Figma derives the
     `Size` property and its options from this convention exactly like
     `Variant`, no separate property call. Skipped options
     (`axis.skippedOptions`) get no component — say their reasons in plain
     language first, like skipped variants.
   - **Height (verified live 2026-10-08).** When `item.heightVariable` is set, step 3's frame
     keeps horizontal auto-layout with hugging width, but its height is
     FIXED and bound to the spacing token, with vertical padding zeroed
     (content stays centered via `counterAxisAlignItems = "CENTER"`):
     `frame.counterAxisSizingMode = "FIXED"; frame.setBoundVariable("height", getVar(item.heightVariable));`.
     Confirmed live: the bind takes and the frame's height reads back exactly
     the token value (32 for `spacing/8`). Set `counterAxisSizingMode` to
     `"AUTO"` first with the rest of the layout and then flip it to
     `"FIXED"` right before the height bind, exactly as the step 3 sample
     does. (Fallback if a future Figma build rejects it: `frame.resize(frame.width,
     <token px>)` plus a disclosure — not needed so far.)
   - **iconOnly (verified live 2026-10-08, Batch 2).** When `item.iconOnly`
     is set (Button's Icon sizes): a SQUARE frame, no text node. Size both
     axes `"FIXED"`, zero all four paddings, bind BOTH `width` and `height`
     to `getVar(item.heightVariable)` (verified: both bind and read back
     exactly the token value), center via the same `primaryAxisAlignItems`/
     `counterAxisAlignItems = "CENTER"`, then append the icon:
     `frame.appendChild(buildLucideIcon(Object.assign({}, item.iconOnly, { colorVariable: variantItem.textVariable || item.iconOnly.colorVariable })));`
     — the plan's `iconOnly.colorVariable` is only a fallback; each variant's
     own `textVariable` colors the icon (Destructive/Default white, Outline/
     Ghost dark, Link brand color; none invisible against its fill). The
     icon lands centered (e.g. 16px icon at x=8,y=8 in a 32px square).
     Instances: the `Label` TEXT property still exists on the set but
     icon-only variants have no node bound to it, so step 5 must skip them
     (see its null guard). `setProperties({Label: ...})` on an icon-only
     instance does not error, it just renders nothing.
   - **square (Avatar's Size, Batch 4).** When `item.square` is set together
     with `item.heightVariable`: a true square that KEEPS its text label.
     Horizontal auto-layout, both axes `"FIXED"`, all four paddings 0,
     content centered, then bind BOTH `width` and `height` to
     `getVar(item.heightVariable)` (same binding as `iconOnly`, verified
     live there). Radius (`radius/full`), fill, stroke, text and
     `item.fontSizeVariable` bind exactly as in step 3 — the stroke is the
     ring. A label longer than a couple of initials is clipped/overflows
     rather than widening the circle, like the real component.
   - **Two or more axes (Attachment's Size x Orientation, Batch 6).** The
     combination loop above is already the full cartesian product, so a
     second axis needs no new loop: Attachment builds 1 variant x 3 sizes x 2
     orientations = 6 components, each named
     `Variant=Default, Size=Sm, Orientation=Vertical` (variant property
     first, then each axis in plan order; Figma then reports THREE VARIANT
     properties). Any option field a later axis sets replaces the earlier
     axis's (e.g. Orientation never sets `sections`, so Size's per-size
     `sections` survive; only the `combinationOverrides` entry swaps them
     for the Vertical-plus-this-size version).
   - **widthVariable (Attachment's Vertical, Batch 6).** When `item.widthVariable`
     is set together with `item.sections`: after step 3's sections code has
     made the outer frame VERTICAL, set `frame.counterAxisSizingMode = "FIXED"`
     and `frame.setBoundVariable("width", getVar(item.widthVariable))`; each
     `sectionFrame` then gets `layoutSizingHorizontal = "FILL"` and each
     text line `layoutSizingHorizontal = "FILL"`, `textTruncation = "ENDING"`,
     `maxLines = 1` (the real `truncate`). See step 3's `sections` code.
   - **Timeout chunking (measured live 2026-10-08).**
     `figma_execute` caps at ~30s (pass `timeout: 30000`). Measured: 10
     variant frames took ~450ms and the next 10 plus combine/layout ~315ms,
     so Button's 20 variants fit in ONE call with huge margin (roughly
     20-45ms per frame; an untested extrapolation puts the ~30s cap in the
     hundreds of frames). Keep chunks to ~50 frames per call to stay safe
     until a larger set (Batch 15's 200) measures otherwise. Batch 2
     measured 40 frames (including 20 with `createNodeFromSvg` icons) at
     ~760ms in one call (~19ms per frame), so even 40 needs no chunking.
     For Button's 20 one call is fine; a chunked version still works the same
     way (the 20 above were actually built as two 10-frame calls and combined
     in the second). Each chunk call converts its frames with
     `createComponentFromNode` into a Section and RETURNS the new component
     node IDs; the LAST call re-fetches those IDs with
     `figma.getNodeByIdAsync`, runs `combineAsVariants`, lays the set out,
     adds the label property (step 5) and writes the description. On any
     error, follow this step's existing orphan-cleanup rule (find and remove
     partial components from earlier chunks too — they're real nodes now,
     not rolled back).
   - **Layout of the finished set.** 20 variants in one horizontal row is
     far too wide. If every variant is about the same width, after
     `combineAsVariants` use a wrapping grid —
     `componentSet.layoutMode = "HORIZONTAL"; componentSet.layoutWrap = "WRAP"; componentSet.primaryAxisSizingMode = "FIXED"; componentSet.resize(columns * widestVariantWidth + (columns - 1) * 24 + 2 * padding, componentSet.height); componentSet.itemSpacing = 24; componentSet.counterAxisSpacing = 24; componentSet.counterAxisSizingMode = "AUTO"`
     with `columns = component.variants.length` (verified live: gave a clean
     5-column x 4-row grid, 716x184, no overlaps; `set.paddingLeft` came
     back 0 after `combineAsVariants`, so no padding term was needed in
     practice; the widest variant was Outline at 124px because its 1px
     stroke adds width).
   - **Mixed widths (Batch 2, verified live): use a manual grid instead.**
     When the set mixes wide text variants with narrow icon-only ones, an
     auto-layout wrap packs by width and the icon rows break across
     columns (seen live). Switch to absolute positions:
     `set.layoutMode = "NONE"`, then for each row of `columns` children
     (row = one `extraAxes` combination) set `child.x = col * (widest + 24)`
     and `child.y = rowTop + (rowHeight - child.height) / 2`, and
     `set.resize(columns * widest + (columns - 1) * 24, totalHeight)`.
     Gave a clean 5 x 8 grid, 716x392; resize the parent Section to
     `set.width + 80` x `set.height + 80` and put the set at (40, 40).
   - **Few variants x several axes (Attachment, Batch 6).** With one
     variant, `columns = component.variants.length` would give a single
     column. Use the FIRST extra axis (Size) as the columns instead and the
     last (Orientation) as the rows, in the same manual-grid style
     (widths differ per size and orientation, so absolute positions again).
   - **Sections + extraAxes (Item's Size, verified live 2026-10-08).** An
     option may carry a replacement `sections` array and `sectionGapVariable`
     (Item Xs: narrower horizontal padding, 12px Description). Because
     `item = Object.assign({}, component, ...overrides)`, the `sections`
     branch of step 3 must read `item.sections` / `item.sectionGapVariable`
     so each size's own sections take effect (validated per size, not only
     Default). Step 5's per-line label binding still iterates
     `component.sections` (the labels are the same in every size). Card's
     Size (Batch 5) works the same way, with the extra detail that the root's
     top/bottom padding and `itemSpacing` also bind to the option's own
     `sectionGapVariable`.
   - **States (Batch 9, Button; PROVEN LIVE 2026-10-09, "SDSGT test file": 200
     variants, all checks passed; the smoke-test results are recorded below, and
     two of the original assumptions were wrong and are corrected in step 3).** When
     `component.statePropertyName` is set, every variant carries `states`
     (Hover / Focus / Disabled / Invalid, sparse overrides; Default is the
     rest look) and maybe `skippedStates` (states that render identical to
     Default, or lost a class: say these reasons in plain language before
     building, like skipped variants). Two Button decisions made by the user
     on 2026-10-09 are already in the plan data, so the replay needs no special
     code for them: Destructive's Hover is fill `status/error-bg` + text
     `status/error` (a token-based approximation of the real 20%-over-10% tint,
     disclosed), and Link has NO underline at rest (`underline: false`) with
     `underline: true` on its Hover state. **Batch 10 (Toggle, Badge; PROVEN
     LIVE 2026-10-09) reuses all of this unchanged:** Toggle adds a Pressed state
     and Badge has no extraAxes (rows = the State values only, 4 x 5 columns);
     the manual grid and chunking work as written (36 and 20 frames, one call each).
     **Batch 11 (Input, Textarea; PROVEN LIVE 2026-10-09) also reuses it unchanged**
     (one variant x 4 states, 4 frames per call).
     **Batch 12 (NativeSelect, Item; PROVEN LIVE 2026-10-09) also reuses it unchanged:**
     NativeSelect = Size x State (10 frames, one call, ~840ms); Item = Variant x Size x
     State (27 frames, one call, ~1.9s). Step 3's existing `sections` branch plus the
     fill / stroke / opacity / ring code apply a state to Item's OUTER frame with no
     change (the Title and Description sections are built as before).
     **Known Figma limit:** the Focus ring (drop shadow) is not drawn on a frame
     with NO fill, so it is invisible on variants that are transparent at rest
     (the plan discloses which); do not try to work around it with a transparent
     fill (the shadow then fills the whole box). After building, screenshot and
     confirm Destructive Default vs Hover and Link Default vs Hover visibly
     differ. 5 variants x 8 sizes x 5 states = 200
     components for Button, all named
     `Variant=Default, Size=Sm, State=Hover` (State last). Step 3 reads these
     merged fields (all absent for a component without states, so nothing
     changes for the other 28):
       - `fillOpacity` / `strokeOpacity`: paint opacity on the bound fill /
         stroke (`paints[0].opacity`).
       - `nodeOpacity`: `frame.opacity` (Disabled's 50%).
       - `focusRing` `{colorVariable, widthPx, opacity}`: a DROP_SHADOW effect,
         `spread = widthPx`, `radius = 0` (no blur), offset 0,0, colour bound to
         the variable.
       - `textVariable` / `underline`: step 3's text code reads `variantItem`.
       - `linkTextVariable` (2026-10-13, Alert Hover): recolours the component's inline link range (`inlineLink`).
       - `textLineOverrides` `{ <labelPropertyName>: { textVariable } }` (2026-10-13, Field Invalid): recolours
         ONE named text line of a `sections` component (step 3's `sections` loop reads it).
     **Smoke tests (run live 2026-10-09 on throwaway frames, deleted afterward).**
     (1) *Paint opacity:* `opacity: 0.8` put on the paint before assigning it is
     DROPPED (reads back 1; the binding stays). Applying it as a second pass
     (read `frame.fills` back, clone, set `opacity`, assign) gives 0.8 with
     `boundVariables.color` kept. Step 3 uses the second pass.
     (2) *Ring effect:* `setBoundVariableForEffect` binds fine but returns the effect
     with `spread` reset to 0 and the alpha reads back as the variable's own (1).
     A second pass (read `frame.effects` back, clone, set `spread` and `color.a`,
     assign) keeps the binding AND the alpha: a 0.5-alpha bound ring renders as a
     50% band in a screenshot. So the literal-alpha fallback (and its extra
     disclosure) is NOT needed; the ring colour stays variable-bound.
     (3) *`strokesIncludedInLayout = false`:* works. A 66x28 hugging frame grows to
     68x30 with a 1px stroke and stays 66x28 with the flag, in either order.
     **Chunking (measured live 2026-10-09).** Chunk by whole Size x State rows
     (5 frames per row; row index = size index x 5 + state index), `timeout: 30000`.
     Measured: 50 frames in 960ms, then 150 frames in 3135ms (about 19-21ms per
     frame, the same as earlier batches), so ~50-per-call is very conservative; the
     200 fit in 2 calls with huge margin. Each chunk appends its components to the
     NEW Section and the last call finds them with
     `section.children.filter(n => n.type === "COMPONENT")` (no ID passing needed),
     then runs `combineAsVariants`, the Label property, the description and the grid
     (834ms for 200). On error each chunk removes only the nodes it created.
     **Layout (manual grid, 200 variants).** One row per Size x State pair
     (8 x 5 = 40 rows), one column per Variant (5), placed by PARSING each
     child's NAME, never by index (Figma keeps creation order, so this is a
     safeguard):
     ```js
     const parse = (n) => Object.fromEntries(n.split(", ").map(p => p.split("=")));
     const variantNames = component.variants.map(v => v.name);
     const rowKeyOf = (props) => Object.entries(props).filter(([k]) => k !== component.variantPropertyName).map(([k, v]) => v).join("|");
     // rowKeys in plan order: axis combinations (outer), then Default + each state name (inner).
     const colW = widestChildWidth + 24; // widest of ALL children, not per column
     const rowH = {}; for (const c of set.children) { const k = rowKeyOf(parse(c.name)); rowH[k] = Math.max(rowH[k] || 0, c.height); }
     let y = 0; const rowY = {}; for (const k of rowKeys) { rowY[k] = y; y += (rowH[k] || 0) + 24 + 6; } // +6: room for the 3px ring on each side
     set.layoutMode = "NONE";
     for (const c of set.children) { const props = parse(c.name); c.x = variantNames.indexOf(props[component.variantPropertyName]) * colW; c.y = rowY[rowKeyOf(props)] + 3 + (rowH[rowKeyOf(props)] - c.height) / 2; }
     set.resize(variantNames.length * colW - 24, y - 24); // y already includes each row's 24 gap + 6 ring room
     ```
     Then size the parent Section to `set.width + 80` x `set.height + 80`, set at
     (40, 40), and put the NEW Section below everything already on the page:
     `Math.max(...figma.currentPage.children.map(n => n.y + n.height)) + 100`.
     **Focus/Invalid on a variant with no rest stroke** (Default, Ghost,
     Destructive, Link): the state adds a 1px stroke, which an auto-layout frame
     counts toward its width. To keep these frames the same width as their
     Default state, set `frame.strokesIncludedInLayout = false` (in a try/catch)
     when `variantItem.strokeVariable` is set and the REST `variant.strokeVariable`
     is not. Outline (a rest stroke) is untouched.
     Step 5's Label binding is unchanged (it loops all children and already
     null-guards variants with no PrimaryText node; live: 100 text variants bound,
     100 icon-only skipped). Step 6's instance check should `setProperties()`
     Variant, Size, State and Label together (live: keys were
     `Label#115:223`, `Variant`, `Size`, `State`; setting Destructive / Lg / Hover /
     "Delete account" rendered the pale-red Hover look with red text). Live grid:
     716x2296 set (widest variant 124px, 5 columns x 40 rows), Section 796x2376.
   - **Description (disclosure, the second of the "disclose twice"
     places).** After `combineAsVariants`:
     `componentSet.description = [...(component.disclosures || []), ...(component.extraAxes || []).flatMap(a => a.disclosures || [])].join("\n");`
     (`component.disclosures`, Batch 8, carries fidelity gaps that belong to no
     axis, e.g. Marker's Separator/Border variants; a component with a
     `disclosures` list but NO `extraAxes` still gets this description, so do
     this write for it too, even though the rest of step 2c is skipped.)
     Read it back and confirm it landed (verified live: exact match).
   - **Placement used in the live test.** The test set went into a NEW
     sibling Section ("Button sizes test", below the existing "Components"
     Section) instead of growing the existing Section, so no existing node
     was resized or touched. When the set replaces the old Button for real,
     move it into "Components" at the old Button's slot.
   - Step 5's label binding is unchanged (it already loops every child of
     the set), and step 6's instance check should `setProperties()` the
     `Variant`, `Size` and `Label` keys together (read
     `Object.keys(instance.componentProperties)` first, as step 6 says).

3. **Build each real variant as its own auto-layout frame** (skip this
   entire step for a `component.icon`, `component.line`, `component.bar`
   component, or a variant that already went through the `variant.thumb`
   branch above —
   handled above instead), via
   `figma_execute` (no dedicated component-creation tool exists — same
   "raw Plugin API through `figma_execute`" treatment as text/effect
   styles in step 5). Real, verified pattern:
   ```js
   const allVars = await figma.variables.getLocalVariablesAsync();
   const getVar = (name) => {
     const v = allVars.find(v => v.name === name && v.variableCollectionId === TOKENS_COLLECTION_ID);
     if (!v) throw new Error("Missing variable: " + name); // fail loudly — never silently skip a binding
     return v;
   };
   function bindPaint(color, variable) {
     return figma.variables.setBoundVariableForPaint({ type: "SOLID", color }, "color", variable);
   }
   const frame = figma.createFrame();
   frame.layoutMode = "HORIZONTAL";
   frame.primaryAxisAlignItems = "CENTER";
   frame.counterAxisAlignItems = "CENTER";
   if (component.fixedSizePx) {
     // Real, genuinely new sizing shape, added 2026-09-22 for Checkbox
     // (icon-support work) — a literal FIXED square (real size-4, exactly
     // 16×16px unconditionally), not the hug-content-plus-padding
     // approximation every earlier box-shaped component in this file
     // uses. `resize()` flips both sizing modes to `"FIXED"` as a side
     // effect (the same real finding already documented below for
     // Skeleton's own text-less case) — no separate sizing-mode calls
     // needed. Padding fields are UNUSED here (real, honest
     // incompatibility — see `FigmaComponentPlanItem.fixedSizePx`'s own
     // comment in `figma-components-plan.ts`).
     frame.resize(component.fixedSizePx, component.fixedSizePx);
   } else {
     frame.primaryAxisSizingMode = "AUTO";   // hug contents
     frame.counterAxisSizingMode = "AUTO";
     if (item.square && item.heightVariable) {
       // Avatar's Size (Batch 4): a true square — never bind padding here
       // (setting a raw 0 on a bound padding would be ambiguous), just zero
       // it, size both axes FIXED and bind width AND height to the token.
       frame.paddingLeft = 0;
       frame.paddingRight = 0;
       frame.paddingTop = 0;
       frame.paddingBottom = 0;
       frame.primaryAxisSizingMode = "FIXED";
       frame.counterAxisSizingMode = "FIXED";
       frame.setBoundVariable("width", getVar(item.heightVariable));
       frame.setBoundVariable("height", getVar(item.heightVariable));
     } else {
       frame.setBoundVariable("paddingLeft", getVar(item.paddingHorizontalVariable));
       frame.setBoundVariable("paddingRight", getVar(item.paddingHorizontalVariable));
       if (item.heightVariable) {
         // Only set by an `extraAxes` Size option (step 2c) — a fixed token-bound
         // height instead of hugging; vertical padding is ignored (content is
         // centered). Verified live 2026-10-08 — see step 2c.
         frame.paddingTop = 0;
         frame.paddingBottom = 0;
         frame.counterAxisSizingMode = "FIXED";
         frame.setBoundVariable("height", getVar(item.heightVariable));
       } else {
         frame.setBoundVariable("paddingTop", getVar(item.paddingVerticalVariable));
         frame.setBoundVariable("paddingBottom", getVar(item.paddingVerticalVariable));
       }
     }
   }
   frame.setBoundVariable("topLeftRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("topRightRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("bottomLeftRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("bottomRightRadius", getVar(item.radiusVariable));
   // fills/strokes bind on the PAINT, never via frame.setBoundVariable("fills", ...)
   // directly — that call fails outright (confirmed live). Omit fills entirely
   // for a transparent variant (Ghost/Link) rather than binding a fake one.
   // `variantItem` === `variant` unless `extraAxes` merged a `variantOverrides`
   // entry (step 2c). An empty-string `fillVariable`/`strokeVariable` from such an
   // override means "none" (Tabs Line's Active drops its fill) and is falsy here.
   // Batch 9 (states; VERIFIED live 2026-10-09): paint opacity from `fillOpacity` /
   // `strokeOpacity`. An `opacity` put on the paint BEFORE it is assigned is silently
   // DROPPED when the paint carries a variable binding (reads back 1, with the binding
   // intact). It only sticks as a SECOND pass: assign the bound paint, then read
   // `frame.fills` back, clone it, set `opacity` on the clone and assign that
   // (reads back 0.8 and keeps `boundVariables.color`). So never put `opacity` on the
   // paint passed to `setBoundVariableForPaint` / the first assignment.
   const withPaintOpacity = (paints, opacity) => {
     if (opacity === undefined) return paints;
     const c = JSON.parse(JSON.stringify(paints)); c[0].opacity = opacity; return c;
   };
   if (variantItem.fillVariable) {
     frame.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variantItem.fillVariable))];
     if (variantItem.fillOpacity !== undefined) frame.fills = withPaintOpacity(frame.fills, variantItem.fillOpacity);
   } else frame.fills = [];
   if (variantItem.strokeVariable) {
     frame.strokes = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variantItem.strokeVariable))];
     if (variantItem.strokeOpacity !== undefined) frame.strokes = withPaintOpacity(frame.strokes, variantItem.strokeOpacity);
     // A state that ADDS a stroke the rest look doesn't have (Focus/Invalid on Default,
     // Ghost, Destructive, Link) must not widen the frame: strokes count toward an
     // auto-layout frame's size, so exclude them (VERIFIED live 2026-10-09: a 1px stroke
     // took a 66x28 frame to 68x30; with `strokesIncludedInLayout = false` it stays 66x28,
     // set before or after the stroke).
     // Batch 14 refinement: "rest has no stroke" means the MERGED rest look (variant + Style override, no state),
     // so Tabs Line / Active (rest bar stroke, 33x20 by design) is not switched off for its non-Focus states; a
     // state with `strokeSides === "all"` (Tabs Line / Active / Focus: border replaces the bar) is also set false.
     const restStrokeVariable = Object.assign({}, variant, ...(typeof allOverrides === "undefined" ? [] : allOverrides.map(o => (o.variantOverrides || {})[variant.name] || {}))).strokeVariable;
     if (!restStrokeVariable || variantItem.strokeSides === "all") { try { frame.strokesIncludedInLayout = false; } catch (e) {} }
     if (variantItem.strokeSides === "bottom") {
       // Batch 8 (Tabs Line's active bar, Marker Border's rule): BOTTOM edge only,
       // via Figma's per-side stroke weights. Absent `strokeSides` = all four sides.
       frame.strokeTopWeight = 0;
       frame.strokeLeftWeight = 0;
       frame.strokeRightWeight = 0;
       frame.strokeBottomWeight = variantItem.strokeWeightPx ?? 1;
     } else {
       frame.strokeWeight = variantItem.strokeWeightPx ?? 1; // or bind to a real border-width/* variable if the plan names one
     }
   }
   // Marker Border (Batch 8): bottom padding only, after the component-level padding above.
   if (variantItem.paddingBottomVariable) frame.setBoundVariable("paddingBottom", getVar(variantItem.paddingBottomVariable));
   // Disabled (Batch 9): the whole frame, children included, at the real `disabled:opacity-50`.
   if (variantItem.nodeOpacity !== undefined) frame.opacity = variantItem.nodeOpacity;
   // Focus / Invalid ring (Batch 9; VERIFIED live 2026-10-09, step 2c's smoke test 2): a
   // 3px band outside the frame = a DROP_SHADOW with spread = widthPx and no blur,
   // colour bound to the ring variable, alpha = the real ring opacity. LIVE FINDING:
   // `setBoundVariableForEffect` returns the effect with `spread` reset to 0 and, once
   // assigned, the colour alpha reads back as the VARIABLE's own alpha (1). The binding
   // is kept, though, so fix both in a SECOND pass: read `frame.effects` back, clone,
   // set `spread` and `color.a`, assign again (binding kept, alpha 0.5/0.2 renders as
   // 50%/20%, confirmed by screenshot). No literal-colour fallback is needed.
   if (variantItem.focusRing) {
     const ring = variantItem.focusRing;
     const ringEffect = { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: ring.opacity }, offset: { x: 0, y: 0 }, radius: 0, spread: ring.widthPx, visible: true, blendMode: "NORMAL" };
     frame.effects = [figma.variables.setBoundVariableForEffect(ringEffect, "color", getVar(ring.colorVariable))];
     const fx = JSON.parse(JSON.stringify(frame.effects)); fx[0].spread = ring.widthPx; fx[0].color.a = ring.opacity; frame.effects = fx;
   }
   ```
   **Icon child — only when `variant.icon` is present** (Checkbox's own
   Checked variant — added 2026-09-22, icon-support work; see
   `FigmaComponentVariantPlanItem.icon`'s own comment). Takes priority over
   the text-child step below — no component built so far needs both on one
   variant. Reuses the exact same `buildLucideIcon` helper step 1b defines:
   ```js
   if (variant.icon) {
     const iconNode = buildLucideIcon(variant.icon); // same helper as step 1b's top-level icon bypass — see its own comment for the real rescale()-vs-resize() and stroke-binding findings
     frame.appendChild(iconNode);
   } else if (variant.centerDot) {
   ```
   **Center dot child — only when `variant.centerDot` is present**
   (RadioGroup's own Checked variant — added 2026-09-22, final NEEDS-ICON
   batch; see `FigmaComponentVariantPlanItem.centerDot`'s own comment).
   Genuinely cheaper than the icon branch above — a plain solid circle,
   no `createNodeFromSvg`/`rescale` involved at all:
   ```js
     const dot = figma.createEllipse();
     dot.resize(variant.centerDot.sizePx, variant.centerDot.sizePx);
     dot.x = (frame.width - variant.centerDot.sizePx) / 2;
     dot.y = (frame.height - variant.centerDot.sizePx) / 2;
     dot.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variant.centerDot.colorVariable))];
     frame.appendChild(dot);
   } else if (variant.textVariable) {
   ```
   **Text child — only when `variant.textVariable` is present** (continues
   the `if`/`else if` above). Skeleton (added 2026-09-18) is the first
   component with NO text at all — its variant sets no `textVariable`, and
   the whole text-child step is skipped for it, not run with an empty
   string:
   ```js
     await figma.loadFontAsync({ family: fontFamilyValue, style: "Medium" }); // resolve fontFamilyValue from the fontFamily variable's own value first
     // Marker Separator (Batch 8): `variantItem.flankLines` = [line, text, line]. The
     // first line goes in before the text; the second is appended after it below.
     // Fixed-size rectangles in a horizontal auto-layout frame (cross-axis centered
     // already), gap bound to the token; `makeFlank` fills are variable-bound.
     const makeFlank = () => { const r = figma.createRectangle(); r.resize(variantItem.flankLines.representativeLengthPx, variantItem.flankLines.thicknessPx); r.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variantItem.flankLines.colorVariable))]; return r; };
     if (variantItem.flankLines) { frame.setBoundVariable("itemSpacing", getVar(variantItem.flankLines.gapVariable)); frame.appendChild(makeFlank()); }
     const text = figma.createText();
     text.name = "PrimaryText"; // lets step 5 find this specific node once a variant can have two
     text.fontName = { family: fontFamilyValue, style: "Medium" };
     text.characters = component.defaultLabel;
     text.setBoundVariable("fontSize", getVar(item.fontSizeVariable)); // `item` === `component` unless an extraAxes option overrides the font size (step 2c)
     text.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variantItem.textVariable))]; // `variantItem` (not `variant`) since Batch 9: a state can override the text colour (Outline/Ghost hover)
     try { text.setBoundVariable("fontFamily", getVar(component.fontFamilyVariable)); } catch (e) {} // real Figma versions support this; wrap anyway
     if (variantItem.underline) text.textDecoration = "UNDERLINE"; // `variantItem` since Batch 9 (a state can set `underline`)
     frame.appendChild(text);
     if (variantItem.flankLines) frame.appendChild(makeFlank());
   } else if (!component.fixedSizePx) {
     // Real, live-only finding (Skeleton, 2026-09-18) — don't skip this
     // else-branch even though it looks like it should be a no-op. A
     // hug-contents (`primaryAxisSizingMode`/`counterAxisSizingMode` both
     // `"AUTO"`) frame with ZERO children does NOT shrink itself to its
     // own padding sum the way it does once a child exists — confirmed
     // live, it silently keeps `figma.createFrame()`'s own raw 100x100
     // default instead, an invisible-content-but-wrong-size bug, not a
     // crash, so it's easy to miss without a real screenshot check (which
     // is exactly how this was caught). Fix: explicitly resize to the
     // padding-derived size once there's no text child to hug around —
     // `node.resize()` flips both sizing modes to `"FIXED"` as a side
     // effect (confirmed live), which is the semantically CORRECT mode
     // here anyway, since there's no content left to hug to:
     const w = frame.paddingLeft + frame.paddingRight;
     const h = frame.paddingTop + frame.paddingBottom;
     frame.resize(Math.max(w, 1), Math.max(h, 1));
   }
   // else: component.fixedSizePx already gave the frame its correct real
   // size (Checkbox's own Unchecked variant — no icon, no text, but
   // already the right 16×16px via the fixedSizePx resize() above) — no
   // further fix needed, and re-running the padding-sum computation here
   // would read undefined paddingLeft/Right/Top/Bottom (fixedSizePx
   // components never set them) and produce a wrong or NaN size.
   ```
   **After combining into a `componentSet`** (step 4, below), re-check its
   own `counterAxisSizingMode` for a text-less component — confirmed live,
   `combineAsVariants` left the SET's own `counterAxisSizingMode` at
   whatever `"FIXED"`-at-100 value it inherited, even though
   `primaryAxisSizingMode` correctly went `"AUTO"` and hugged the width to
   the single variant's real 96px. Set it explicitly:
   ```js
   componentSet.counterAxisSizingMode = "AUTO"; // only needed when the component has no text child — every text-bearing component already hugs correctly without this
   ```
   **If `component.secondaryTextVariable` is present** (Alert's own real
   `AlertDescription` — added 2026-09-17), the frame gets a VERTICAL inner
   stack instead of the single text node going straight in, so the two
   lines lay out top-to-bottom regardless of the outer frame's own
   horizontal auto-layout:
   ```js
   const stack = figma.createFrame();
   stack.layoutMode = "VERTICAL";
   stack.primaryAxisSizingMode = "AUTO";
   stack.counterAxisSizingMode = "AUTO";
   stack.fills = []; // purely a layout container, no visible fill of its own
   stack.appendChild(text); // the primary label text node from above
   const secondaryText = figma.createText();
   secondaryText.name = "SecondaryText";
   secondaryText.fontName = { family: fontFamilyValue, style: "Regular" }; // body text, not the label's own weight
   secondaryText.characters = component.defaultSecondaryLabel;
   secondaryText.setBoundVariable("fontSize", getVar(component.secondaryFontSizeVariable));
   secondaryText.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(component.secondaryTextVariable))];
   // 2026-10-13 (Alert): `component.inlineLink` = the description ENDS with a link, a styled RANGE inside this
   // same text layer. Underline it and colour it with `variantItem.linkTextVariable` (a state, e.g. Hover) or, at
   // rest, the description's own colour (verified live: a range keeps both the underline and a variable-bound fill).
   // NOTE: a component with `inlineLink` has NO `secondaryLabelPropertyName` (Option A, decided 2026-10-13): step 5 therefore
   // never binds this node to a TEXT property, which would flatten the range styling and make every instance share one
   // styled default (found live). Designers edit the description text in place and restyle the link.
   if (component.inlineLink) {
     const end = secondaryText.characters.length, start = end - component.inlineLink.text.length;
     secondaryText.setRangeTextDecoration(start, end, "UNDERLINE");
     secondaryText.setRangeFills(start, end, [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variantItem.linkTextVariable || component.secondaryTextVariable))]);
   }
   stack.appendChild(secondaryText);
   frame.appendChild(stack); // instead of frame.appendChild(text) directly
   ```
   Note `component.secondaryTextVariable` is the SAME value for every
   variant (not per-variant like `variant.textVariable`) — bind it once,
   not per-variant.

   **If `component.sections` is present** (Card — added 2026-09-17, real
   compound-component support, one level beyond the secondary-text-line
   case above), it REPLACES the text-child step entirely — don't also do
   the single/double text-line steps above for this component. The outer
   frame becomes a stack of sections instead of one horizontal frame
   around a text node — **VERTICAL by default** (Card's own real shape),
   **HORIZONTAL when a section's own `textLineDirection` is `"horizontal"`**
   (Breadcrumb — added 2026-09-21, "Batch 6" of
   figma-remaining-components-plan.md, the first `sections` consumer whose
   items lay out side by side instead of stacking). Every section within
   one component always carries the SAME `textLineDirection` value, so
   checking the first section's own field is enough to decide the whole
   component's stacking axis:
   ```js
   const sectionsAreHorizontal = item.sections[0]?.textLineDirection === "horizontal";
   frame.layoutMode = sectionsAreHorizontal ? "HORIZONTAL" : "VERTICAL"; // overrides the HORIZONTAL default from step 1; absent textLineDirection (every component before Breadcrumb) always resolves to "VERTICAL" — Card's own original line, unchanged
   if (sectionsAreHorizontal) {
     // Breadcrumb's own real shape — its root <nav> has no padding of its
     // own at all (see buildBreadcrumbPlan's own comment); the only real
     // spacing value is the GAP between items.
     frame.paddingLeft = 0;
     frame.paddingRight = 0;
     frame.paddingTop = 0;
     frame.paddingBottom = 0;
     frame.itemSpacing = 0;
     frame.setBoundVariable("itemSpacing", getVar(item.sectionGapVariable));
   } else {
     // Card's own original vertical stack — UNCHANGED from before this
     // batch, byte-for-byte, so Card's existing live-proven replay isn't
     // at risk from this addition.
     frame.paddingLeft = 0;
     frame.paddingRight = 0; // Card's real root has no horizontal padding of its own — each section supplies its own
     frame.setBoundVariable("paddingTop", getVar(item.sectionGapVariable));
     frame.setBoundVariable("paddingBottom", getVar(item.sectionGapVariable));
     frame.itemSpacing = 0;
     frame.setBoundVariable("itemSpacing", getVar(item.sectionGapVariable)); // real Plugin API: bind itemSpacing the same way as padding
   }

   // Attachment's Vertical (Batch 6): a FIXED, token-bound width (the vertical
   // frame's counter axis is horizontal). Absent on every earlier component.
   if (item.widthVariable) {
     frame.counterAxisSizingMode = "FIXED";
     frame.setBoundVariable("width", getVar(item.widthVariable));
   }

   // `item` === `component` unless an extraAxes option overrides `sections` /
   // `sectionGapVariable` (Item's Size, step 2c) — the frame code above and
   // this loop therefore read `item.`, never `component.`, for those two fields.
   for (const section of item.sections) {
     const sectionFrame = figma.createFrame();
     sectionFrame.layoutMode = section.textLineDirection === "horizontal" ? "HORIZONTAL" : "VERTICAL"; // absent (every section before Breadcrumb) always resolves to "VERTICAL" — Card's own original line, unchanged
     sectionFrame.primaryAxisSizingMode = "AUTO";
     sectionFrame.counterAxisSizingMode = "AUTO";
     sectionFrame.fills = []; // sections have no fill/stroke of their own in this pass (Card's real Footer would need one — not modeled, see buildCardPlan's own comment)
     sectionFrame.setBoundVariable("paddingLeft", getVar(section.paddingHorizontalVariable));
     sectionFrame.setBoundVariable("paddingRight", getVar(section.paddingHorizontalVariable));
     for (const line of section.textLines) {
       const lineText = figma.createText();
       lineText.name = line.labelPropertyName; // e.g. "Title", "Description", "Content", or Breadcrumb's own "Item1"/"Item2"/"CurrentPage" — distinct per line, for step 5's property binding
       lineText.fontName = { family: fontFamilyValue, style: line.weight }; // "Medium" or "Regular", per the plan
       lineText.characters = line.defaultLabel;
       lineText.setBoundVariable("fontSize", getVar(line.fontSizeVariable));
       // 2026-10-13 (Field Invalid): a state may recolour ONE named line via `variantItem.textLineOverrides`
      // (keyed by the line's labelPropertyName); every other line keeps its own colour.
      lineText.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar((variantItem.textLineOverrides && variantItem.textLineOverrides[line.labelPropertyName] && variantItem.textLineOverrides[line.labelPropertyName].textVariable) || line.textVariable))];
       sectionFrame.appendChild(lineText);
       if (item.widthVariable) {
         // Fixed-width frame (Attachment Vertical): the text fills the section
         // and truncates with an ellipsis like the real `truncate`. Set after
         // appendChild — FILL needs an auto-layout parent.
         lineText.layoutSizingHorizontal = "FILL";
         lineText.textTruncation = "ENDING";
         lineText.maxLines = 1;
       }
     }
     frame.appendChild(sectionFrame);
     if (item.widthVariable) sectionFrame.layoutSizingHorizontal = "FILL"; // set after appendChild — FILL needs an auto-layout parent

     // Decorative separator glyph — only when `section.separatorGlyph` is
     // present (Breadcrumb's own real separator, an SVG <ChevronRightIcon>
     // this pipeline doesn't draw — see
     // FigmaComponentSectionPlanItem.separatorGlyph's own comment). A
     // plain sibling text node, its own child of the OUTER frame (not
     // `sectionFrame`), so it sits between items rather than inside one.
     // Deliberately NOT given a component property in step 4 below, and
     // not bound to any color/size variable — purely decorative, matching
     // the plan's own explicit disclosure that it isn't wired to anything
     // editable. No component built before Breadcrumb ever sets this
     // field, so this whole block never runs for them.
     if (section.separatorGlyph) {
       const sep = figma.createText();
       sep.name = "Separator";
       sep.fontName = { family: fontFamilyValue, style: "Regular" };
       sep.characters = section.separatorGlyph;
       frame.appendChild(sep);
     }
   }
   ```
   Every text line across every section still needs a real component
   property in step 5, same as any other label — just more of them, named
   per `line.labelPropertyName` instead of the fixed `Label`/`Description`
   pair. A `Separator` text node is never one of them (see above) — step
   5's own `sections` loop only ever iterates `section.textLines`, never
   touches separator nodes.
4. **Convert each variant frame to a component, then `combineAsVariants`** —
   name each component `"<variantPropertyName>=<variant.name>"` (e.g.
   `"Variant=Destructive"`) before combining; Figma derives the variant
   property and its options from that naming convention automatically, no
   separate property-creation call needed for the variant axis itself.
   ```js
   const comp = figma.createComponentFromNode(frame);
   comp.name = `${plan.variantPropertyName}=${variant.name}`; // with extraAxes: "Variant=Default, Size=Sm" — see step 2c
   // ...repeat per variant, then:
   const componentSet = figma.combineAsVariants(components, section); // section = a real Section, never blank canvas — see figma_execute's own housekeeping rules
   componentSet.name = component.name; // "Button"
   componentSet.layoutMode = "HORIZONTAL"; // combineAsVariants stacks at (0,0) — always re-layout after
   componentSet.itemSpacing = 24;
   ```
5. **Add the label as a real TEXT component property — only when
   `component.labelPropertyName` is present.** Skeleton (added 2026-09-18)
   has no label at all, so this whole step is skipped for it — there's no
   property to add and no text node to bind it to. For every component
   that DOES have one, bound to every variant's text node, not just set on
   one. Name each text node when creating it (`text.name = "PrimaryText"`,
   and if present, `secondaryText.name = "SecondaryText"` — see step 3
   above) so this step can find the right one by name instead of
   `findOne(n => n.type === "TEXT")`, which becomes ambiguous the moment a
   variant has TWO text nodes (Alert's own secondary line):
   ```js
   if (component.labelPropertyName) {
     const propName = componentSet.addComponentProperty(component.labelPropertyName, "TEXT", component.defaultLabel);
     for (const variant of componentSet.children) {
       // Null guard: an `extraAxes` icon-only variant (Button's Icon sizes) has NO text node,
       // so `findOne` returns null and a bare `.componentPropertyReferences =` would throw.
       const labelNode = variant.findOne(n => n.type === "TEXT" && n.name === "PrimaryText");
       if (labelNode) labelNode.componentPropertyReferences = { characters: propName };
     }
     if (component.secondaryLabelPropertyName) {
       const secondaryPropName = componentSet.addComponentProperty(component.secondaryLabelPropertyName, "TEXT", component.defaultSecondaryLabel);
       for (const variant of componentSet.children) {
         variant.findOne(n => n.type === "TEXT" && n.name === "SecondaryText").componentPropertyReferences = { characters: secondaryPropName };
       }
     }
   }
   ```
   A text-less component's instances still get the real, automatically-
   derived `Variant` property from step 4's own naming convention (e.g.
   Skeleton's own `"Default"` value) — `setProperties()` still has
   something real to swap even with zero TEXT properties added here.
   **For a `sections`-based component** (Card), skip the two blocks above
   entirely and instead loop every section's every text line — there's no
   fixed `Label`/`Description` pair, just however many real lines the
   plan actually has:
   ```js
   for (const section of component.sections) {
     for (const line of section.textLines) {
       const linePropName = componentSet.addComponentProperty(line.labelPropertyName, "TEXT", line.defaultLabel);
       for (const variant of componentSet.children) {
         variant.findOne(n => n.type === "TEXT" && n.name === line.labelPropertyName).componentPropertyReferences = { characters: linePropName };
       }
     }
   }
   ```
6. **Validate before moving to the next component — never batch multiple
   components in one unvalidated pass:**
   - `figma_capture_screenshot` (plugin `exportAsync`, NOT
     `figma_take_screenshot` — that one goes through the REST API and can
     fail with a stale/expired token even when the live Desktop Bridge
     connection itself is fine, confirmed live) on the component set.
     Check every variant is visible and legible — a same-tone fill/text
     pairing (real bug hit live: `status/error`-derived fill +
     `status/error-text` text rendered invisible red-on-red, because that
     token aliases to the exact same variable as `status/error` itself —
     see `contracts-and-seeds.md`'s shadcn theming section for the same
     trap already documented for code output) is a silent, screenshot-only
     failure — nothing in the API call itself errors.
   - Create one real instance, call `setProperties()` to swap both the
     variant and the label, and screenshot that too — confirms the
     component actually behaves like a component, not just that the base
     shapes look right in isolation. Remove the validation instance
     afterward (`instance.remove()`) — it's a check, not part of the
     deliverable.
   - **`setProperties()` keys aren't always the plain property name** —
     confirmed live on Badge: the variant axis (derived from the
     `Name=Value` naming convention in step 4) keeps its plain name
     (`"Variant"`), but an explicitly-added TEXT property (step 5, e.g.
     `labelPropertyName`) comes back from Figma with an
     auto-appended `#<nodeId>` suffix (e.g. `"Label#15:0"`). Calling
     `setProperties({ Label: ... })` fails outright
     (`Could not find a component property with name: 'Label'`). Always
     read `Object.keys(instance.componentProperties)` first and match by
     prefix (`propKeys.find(k => k.startsWith(labelPropertyName))`) rather
     than assuming the plan's plain name works as the live key. **And
     because the instance is created before this lookup, a failed
     `setProperties()` call here leaves an orphaned instance on the
     canvas** — wrap the swap-and-screenshot block so a thrown error still
     reaches `instance.remove()`, or explicitly check for and clean up a
     leftover validation instance in the final full-page screenshot before
     reporting done (a real orphan of exactly this kind was caught and
     removed during Badge's own live validation).
7. **Report back**: which component(s) got built, how many real variants
   each has (and which were skipped, with the plan's own stated reason),
   and — if any binding needed a nearest-token approximation per the plan's
   `notes` — say so plainly, the same "don't present an approximate result
   as pixel-perfect" honesty step 6 already applies to tokens.

**Not yet built, real and disclosed:** re-running this step against a file
that already has one of these component sets will create a second,
differently-named one (same "first push, not sync" limitation as tokens,
above) — no update-in-place logic exists yet. Also not yet built: any
component beyond Button/Badge/Toggle/Alert/Input/Textarea/Card/Kbd/
NativeSelect/Avatar/Label/Skeleton/Breadcrumb/Empty/Field/Separator/
FieldSeparator/Item/Marker/Bubble, any size beyond `default` except Button's
sizes, Toggle's and Item's (every other component's extra sizes
are still pending — `figma-component-variations-plan.md`), Breadcrumb's real
`BreadcrumbEllipsis` (a collapsed-items affordance with its own icon, not
modeled — see `buildBreadcrumbPlan`'s own comment), its support for any
item count beyond a fixed three-item trail, its real
`hover:text-foreground` link color (rest state only, per this whole
file's own scope), and its real `<ChevronRightIcon>` separator (a plain
decorative "›" text glyph stands in for it — not wired to any component
property, not a faithful reproduction of the chevron shape); Empty's real
`EmptyMedia` icon slot (not modeled — the same declared NEEDS-ICON gap as
every other icon-bearing component); Field's real `orientation` axis
(vertical/horizontal/responsive — always its default vertical shape) and
its `FieldSet`/`FieldLegend`/`FieldGroup`/`FieldContent`/`FieldTitle`
sub-parts (not modeled at all); Separator's real vertical orientation
(only the horizontal line is modeled — see `FigmaComponentLinePlanItem`'s
own comment), FieldSeparator's real absolute-position + background-mask
label technique (approximated here as three non-overlapping
`[line, text, line]` segments instead), Alert's
real destructive-tinted `AlertDescription` color (its description is
modeled, but always in `text.secondary` — the real translucent-red tint on
the destructive variant isn't bound, see `buildAlertPlan`'s own comment),
Input/Textarea's real typed-text state (they show their PLACEHOLDER text,
not typed content — see `buildInputPlan`'s own comment), Card's real
`CardFooter` (a separate background/border treatment, not modeled — see
`buildCardPlan`'s own comment) and its real `ring-1` border (approximated
as `border.subtle`, not a true partially-transparent ring), Avatar's real
`AvatarImage` (a real photo, not modeled — only `AvatarFallback` is),
Skeleton's real `animate-pulse` shimmer (pushed as a static box — see
`buildSkeletonPlan`'s own comment) and its own representative, NOT
real-class-derived ~96x24px placeholder size (it has no padding/sizing
class of its own to bind at all — same comment), Item's real `ItemMedia`
(an icon/image slot) and `ItemActions` (real interactive buttons, not
modeled at all — the same declared NEEDS-ICON/NEEDS-INTERACTIVE-STRUCTURE
gaps as elsewhere), its real `size` axis (default/sm/xs — always its
default size), and its real `gap-1` (4px) between Title and Description
(no home in this schema's `sections`/`textLines` shape — the two lines
stack directly adjacent, relying only on line-height for spacing);
Marker's real `separator`/`border` variant options (its own real `cva()`
axis is ignored entirely, per the user's own decision, not just its
color-bearing parts — `border`'s own real `border-border` class, a
genuine parseable color match, is disclosed but not represented);
Bubble's real per-variant geometry override on `ghost` (`rounded-none
p-0` — real computed `0px` radius/padding, versus every other variant's
shared component-wide values; this schema has no per-variant geometry
field, so the pushed Ghost variant shares the same rounded/padded box as
the rest, not its real flush rendering) and its real `secondary` variant
(skipped by the existing `bg-secondary` rule, same as Button/Badge's own
`secondary`, even though it isn't a token-availability question for
Bubble specifically — the skip is a pipeline-wide existing behavior, not
something disclosed as Bubble's own new gap), and any framework's
component source beyond Next.js + shadcn/ui (shadcn-vue's `.vue` files
and RNR's React Native source both need their own real verification
before this same mechanism can be trusted against them — don't assume the
parser generalizes without checking). Most of shadcn/ui's own remaining
real components either have no size-independent color "variant" axis at
all (Checkbox, Switch, ...) or are compound/multi-part
components needing MORE than Card's own two-section, text-only structure
(Dialog, Sheet, Table, Sidebar — nested interactive sub-components, not
just more text lines) — real, larger, separate work, checked and
deliberately not attempted yet, not an oversight.

**State after this round (2026-09-18):** all twelve components — Button,
Badge, Toggle, Alert, Input, Textarea, Card, Kbd, NativeSelect, Avatar,
Label, Skeleton — are now proven live, not just plan-computed. Every one
went through the full build → screenshot → instance-swap → screenshot
cycle, same bar throughout — including confirming live that Alert's
same-tone-trap fix actually renders readable red text on both variants,
that the radius bug fix's `radius/md` binding renders at the same real
pixel value a live browser check showed, that Card's own three
independent text properties (`Title`/`Description`/`Content`) all bind
and swap correctly on a real instance, that Avatar's `radius/full` binding
guarantees a true circle by construction across every real preset, that
Label's real bare-text shape (no fill/stroke/padding/radius at all) pushes
and swaps cleanly with no frame styling to get wrong, and — new this
round — that a genuinely text-less component (Skeleton) builds,
screenshots, and instance-swaps cleanly through the newly-guarded step 3/5
code paths, with zero visible or structural regression on any of the
eleven earlier components. This round also caught and fixed a real,
live-only bug the plan JSON alone could never have revealed: a
hug-contents frame with zero children doesn't self-size from its own
padding (see step 3's own comment) — only found by actually screenshotting
the first text-less component ever pushed, confirming once again why this
section's own bar requires a real screenshot pass per component, not just
successful API calls.

**State after this round (2026-09-21):** all five remaining components —
Breadcrumb, Empty, Field, Separator, and FieldSeparator (Batches 4-6 of
`figma-remaining-components-plan.md`, built concurrently in three isolated
worktrees, merged in, then pushed live in one session against "SDSGT test
file") — are now proven live too, folded into the "all seventeen... proven
live" statement above. Every one went through the same full build →
screenshot → instance-swap → screenshot cycle: Breadcrumb's three text
properties (`Item1`/`Item2`/`CurrentPage`) swapped independently and its
outer frame genuinely laid out in a row with the "›" glyphs landing
between items, never after the last; Empty's and Field's every section
text property swapped independently with the right colors/weights; and
both `line`-shaped components confirmed `createComponentFromNode` works
directly on a bare `RECTANGLE` (Separator) and on a `FRAME` wrapping one
(FieldSeparator's row), with FieldSeparator's `Label` property swapping
independently. This round also caught and fixed a new real, live-only
bug: `createComponentFromNode(node)` invalidates the original node
reference it's given — see this section's own opening paragraph for the
fix. A final full-page check confirmed all ten of this file's component
sets (the five above, plus Skeleton/Label/Kbd/NativeSelect/Avatar from
prior rounds — Button/Badge/Toggle/Alert/Input/Textarea/Card were proven
live in an earlier session/file, not this one) sit correctly inside the
shared "Components" section, with zero orphaned instances left behind.

**State after this round (2026-09-21, "Batch 7"):** Item — the first
component to combine a real `cva()` color-variant axis with `sections` in
the same component set — is now proven live too, folded into the "all
eighteen... proven live" statement above. Built all three real variants
(Default/Outline/Muted) as their own frames (fill/stroke bound per
variant, `sections` supplying the shared Title/Description body in each),
combined into one component set, then validated the plan's own explicitly
flagged risk directly: created one real instance PER variant, confirmed
each variant's own fill/stroke rendered correctly, and swapped
`Title`/`Description` independently on all three — `sections` genuinely
works across N>1 variants in one set, not just a single "Default" the way
every earlier `sections`-based component only ever exercised. Also
confirmed live that `rounded-lg` renders at a real computed
`border-radius: 6px`, matching `radius.md`'s own value exactly (not the
8px `radius.lg` a naive nearest-value search would have picked) — direct
live confirmation of the `exactRadiusMd` discipline holding for a fifth
real component. A final full-page check confirmed all eleven of this
file's component sets sit correctly inside the shared "Components"
section, with zero orphaned instances left behind.

**State after this round (2026-09-21, "Batch 8"):** Marker is now proven
live too, folded into the "all nineteen... proven live" statement above —
a real `cva()`-based component (three real variant options:
default/separator/border) deliberately reframed to ignore its own
variant axis entirely, per the user's own decision, and modeled instead
via `scanClassesForColors` against the `default` option's own (empty)
base classes — the same single-flat-variant mechanism Input/Kbd/Label
already use, not `buildVariantsFromCva`. Built as a single "Default" box
(no fill/stroke/padding/radius, `radius/none` and `spacing/0` both real
exact zeros, not guesses), screenshotted (plain gray text, no box styling
at all — matching the disclosed bare-text treatment), created one real
instance, swapped its `Label` property independently, screenshotted
again, and removed the validation instance. A final full-page check
confirmed all twelve of this file's component sets sit correctly inside
the shared "Components" section, with zero orphaned instances left
behind.

**State after this round (2026-09-21, "Batch 9 re-validation" + "Batch
10"):** Bubble is now proven live too, folded into the "all twenty...
proven live" statement above. Before pushing it, Batch 9's own explicitly
-stated bar was satisfied directly: rather than assume a plan-JSON diff
was sufficient, Button, Badge, Toggle, and Alert were built FRESH,
directly in "SDSGT test file" (none of the four had ever actually been
pushed to this specific file before — a real correction to this file's
own prior "proven live against SDSGT test file" claim, which had
conflated an earlier session's different file with this one). All 5
Button variants, all 5 Badge variants, both Toggle variants, and both
Alert variants (including its secondary description line) rendered
correctly; instance `setProperties()` swaps confirmed on Default and
Destructive for each — both same-tone-trap-fixed pairs (Badge's and
Alert's own Destructive) render with genuinely readable text, live
confirmation the parser change didn't regress them. Bubble was then
built the same way: 5 real variants via `buildVariantsFromCva`, all
correctly colored (including its own Destructive same-tone fix), `Label`
swapping independently on real Default/Destructive instances. A final
full-page check confirmed all seventeen of this file's own component
sets (the twelve above, plus Button/Badge/Toggle/Alert/Bubble) sit
correctly inside the shared "Components" section, with zero orphaned
instances left behind. Input/Textarea/Card remain the only three of
twenty real components not present in this specific file — see this
step's own opening paragraph for the full, precise disclosure of what
that does and doesn't mean.

### 8. Pull token edits back from Figma (added 2026-09-17, extended to cover styles the same day)

**If `figmaMcp === "official"`:** the three reads this step uses
(`getLocalVariablesAsync()`/`getLocalTextStylesAsync()`/
`getLocalEffectStylesAsync()`) are the exact same raw Plugin API calls
step 5 already confirmed work identically through `use_figma` — the CLI
diffing step downstream (`figma-pull.ts`) is already MCP-agnostic, since
it only ever consumes the assembled `{ variables, textStyles,
effectStyles }` JSON, never a Southleft-specific shape. Assemble that
object the same way, via `use_figma` instead of `figma_execute`, and pass
it to `figma-pull` unchanged. Not yet exercised live end-to-end through
this MCP specifically (only the underlying reads were verified
individually, 2026-09-23) — same "sound mechanism, confirm on first real
use" caveat as step 7 above.

Run this whenever the user asks to check for or pull Figma-side token
edits into code — not automatically as part of every push, and not
something to do proactively without being asked. Requires step 5's own
`--init` snapshot to already exist for this `tokensDir` — if it doesn't
(a project pushed before this step existed, or the snapshot file was
deleted), say so plainly and stop; there's no baseline to diff against,
and guessing one would risk reporting fake "changes" for every token.

**Read every current variable AND style's live value** — the exact same
three reads step 5's own snapshot-write uses (variables via
`figma.variables.getLocalVariablesAsync()`, text styles via
`getLocalTextStylesAsync()`, effect styles via `getLocalEffectStylesAsync()`
— see that step for the full reshape code, including the weight-name
reverse-mapping and the `rgba(r,g,b,a)` color formatting, both of which
matter for correct diffing). Assemble the same
`{ variables, textStyles, effectStyles }` shape, write to a temp JSON
file, then run:

```
node src/cli.ts figma-pull --tokens-dir "<tokensDir>" --live-data "<path>"
```

This is the whole mechanism — the CLI does the actual diffing and file
writing (`promote/figma-pull.ts`), not this skill. It:

- Compares every live value (variables, text style fields, effect style
  layers) against the snapshot from the last push/pull.
- Writes ONLY the tokens/fields that genuinely changed since then straight
  into the DTCG spec (`<tokensDir>/*.json`) — not a copy, the real files
  `generate` reads from.
- **Follows aliases, doesn't break them for no reason — applies to BOTH
  semantic colors AND, per-field, text styles.** If a semantic color token
  (e.g. `action.primary`) only changed because the PRIMITIVE it points to
  changed in Figma, that's reported once, under the primitive's own name —
  the semantic token's alias is left intact. The exact same logic applies
  to each of a text style's four fields (`fontFamily`/`fontWeight`/
  `fontSize`/`lineHeight`) — each is its own alias into a typography
  primitive, so a style's `fontSize` that changed only because
  `typography/primitive/fontSize/16` changed is left alone; only a field
  overridden INDEPENDENTLY of its primitive (its own live value no longer
  matches the primitive's) gets converted to a literal — and the printed
  output says so plainly when that happens, don't let it pass as an
  unremarkable value change. Shadow effect styles have no alias concept
  (shadow.json's layer values were never aliases to a primitive scale to
  begin with) — a changed layer value always gets written directly, no
  alias-following logic applies there.
- Refreshes the snapshot to the new live state either way, so the next
  pull's baseline is current.
- Prints any live Figma variable/style name it doesn't recognize
  (something added by hand outside this pipeline's own naming convention)
  — never guessed at or written anywhere, just disclosed.

**Relay the CLI's own output to the user in plain language** — which
tokens/styles changed (old value → new value), which ones got converted
from an alias to a literal and why, and anything unmapped. Then say
plainly: this only updated the token SPEC — the actual code
(`theme.css`/`theme.ts`/component files) won't reflect these values until
`generate` is re-run with the project's original flags, and that's a
separate, explicit step, not something this command chains into
automatically (same promote-then-generate confirmation gate the rest of
this pipeline already uses — don't silently regenerate on the user's
behalf).

**If the project has already been scaffolded (not files-only), there is a
third, equally explicit step after that**: `generate`'s own output only
lives in the code-tokens directory, not inside the real scaffolded
project, until `scaffold --update` (built 2026-09-17 — see
`docs/layer2-layer3-plan.md`'s dated entry) copies it in. Ask whether the
user wants to run it, name the exact command (same `--framework`/library
flags the project's original scaffold used, `--code-dir` pointing at the
just-refreshed `generate` output, `--out` pointing at the existing
project, plus `--update`), and run it only on confirmation — same
"explicit, confirmed, no auto-chaining" discipline as the `generate` step
before it, not a third link automatically bolted onto the first two. If a
theme file was hand-edited since SDSGT last wrote it, `--update` will warn
and leave that one file alone rather than overwriting it — relay that
warning verbatim rather than silently retrying with `--force` on the
user's behalf.

**Real, disclosed scope — don't overstate what this does:**

- Covers every variable AND style category this pipeline pushes today
  (color/spacing/radius/opacity/border-width/breakpoint/typography
  primitives, MD3/MD2 elevation floats, text styles, box-shadow effect
  styles) — nothing pushed is left un-pullable as of 2026-09-17.
- Never infers structural changes — a new variable/style added in Figma
  outside this pipeline's own naming convention doesn't create a new
  token; it's reported as unmapped, nothing more. Renaming or
  restructuring tokens is a `promote`-time decision, not something a pull
  should improvise.
- One-directional per run, by design, and this is intentional, not a gap
  to close later — this never also re-pushes anything back to Figma, and
  never detects or reconciles code-side drift (hand-edited tokens, or a
  fresh `promote`/`generate` since the last sync). It only ever asks "what
  changed on Figma's side," using Figma's own last-known state as the sole
  point of comparison — the expectation is that day-to-day token editing
  happens in Figma, and this is how that flows into code, not the other
  way around.
