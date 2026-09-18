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
session — the Southleft MCP requires the **Desktop Bridge plugin, running
in Figma Desktop, connected to that specific file** (confirmed in
`docs/figma-mcp-capabilities.md` — "not the file URL, not the browser").
There is no way for a plain Node process to do this without a live agent
session and a human who has that file open. See contracts-and-seeds.md,
"Figma push," for the full contract this skill implements.

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

**Real ground truth, proven live against a real test file for all seven
components this plan covers today:** Button (2026-09-15), Badge
(2026-09-16), Toggle, Alert, Input, Textarea, and Card (all 2026-09-17).
shadcn/ui's `Button`, `Badge`, `Toggle`, `Alert`, `Input`, `Textarea`,
`Card` — one size each, rest states only (see `cli/src/scaffold/
figma-components-plan.ts`'s own header for the full scope decision,
including the three real component shapes this plan handles —
multi-variant `cva()` components via `buildVariantsFromCva`, single-state
no-`cva()` components via `scanClassesForColors`, and Card's own real
compound-component support via `sections` — and why most other real
components don't fit any of these yet). This step's own mechanism (`for
each item in plan.components`, no component-specific branching) is
confirmed to genuinely generalize across seven structurally different
components, covering all three shapes — real bugs were caught doing this,
not just claimed to have been avoided: the same-tone-trap fix (below)
used to fire for ANY variant named "destructive" regardless of its fill,
which was correct for Button/Badge but would have produced invisible
white-on-light-card text for Alert's real neutral-background destructive
variant; and every `rounded-lg`-using component's radius was bound to the
wrong real value for two full sessions (a real 2px mismatch, confirmed
live via `getComputedStyle` — see `exactRadiusMd`'s own comment) before
being caught while scoping Card's own different radius formula. Both
caught by checking real generated output/real rendered pages, not
assuming the existing mechanism was safe. Extending this plan to more
components is real, separate CLI work (a new plan-generator entry, not a
change to this skill) — this step's job is only ever to replay whatever
the plan actually contains, never to improvise a component the plan
doesn't describe. Any component added to the plan should still get the
SAME full screenshot-validate treatment the first time it's pushed live —
passing plan computation alone isn't sufficient proof, as this section
used to (incorrectly) imply was close enough for Badge.

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
2. **Build each real variant as its own auto-layout frame**, via
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
   frame.primaryAxisSizingMode = "AUTO";   // hug contents
   frame.counterAxisSizingMode = "AUTO";
   frame.primaryAxisAlignItems = "CENTER";
   frame.counterAxisAlignItems = "CENTER";
   frame.setBoundVariable("paddingLeft", getVar(item.paddingHorizontalVariable));
   frame.setBoundVariable("paddingRight", getVar(item.paddingHorizontalVariable));
   frame.setBoundVariable("paddingTop", getVar(item.paddingVerticalVariable));
   frame.setBoundVariable("paddingBottom", getVar(item.paddingVerticalVariable));
   frame.setBoundVariable("topLeftRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("topRightRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("bottomLeftRadius", getVar(item.radiusVariable));
   frame.setBoundVariable("bottomRightRadius", getVar(item.radiusVariable));
   // fills/strokes bind on the PAINT, never via frame.setBoundVariable("fills", ...)
   // directly — that call fails outright (confirmed live). Omit fills entirely
   // for a transparent variant (Ghost/Link) rather than binding a fake one.
   if (variant.fillVariable) frame.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variant.fillVariable))];
   else frame.fills = [];
   if (variant.strokeVariable) {
     frame.strokes = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variant.strokeVariable))];
     frame.strokeWeight = 1; // or bind to a real border-width/* variable if the plan names one
   }
   ```
   Text child, same call:
   ```js
   await figma.loadFontAsync({ family: fontFamilyValue, style: "Medium" }); // resolve fontFamilyValue from the fontFamily variable's own value first
   const text = figma.createText();
   text.name = "PrimaryText"; // lets step 4 find this specific node once a variant can have two
   text.fontName = { family: fontFamilyValue, style: "Medium" };
   text.characters = component.defaultLabel;
   text.setBoundVariable("fontSize", getVar(component.fontSizeVariable));
   text.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(variant.textVariable))];
   try { text.setBoundVariable("fontFamily", getVar(component.fontFamilyVariable)); } catch (e) {} // real Figma versions support this; wrap anyway
   if (variant.underline) text.textDecoration = "UNDERLINE";
   frame.appendChild(text);
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
   frame becomes a VERTICAL stack of sections instead of one horizontal
   frame around a text node:
   ```js
   frame.layoutMode = "VERTICAL"; // overrides the HORIZONTAL default from step 1
   frame.paddingLeft = 0;
   frame.paddingRight = 0; // Card's real root has no horizontal padding of its own — each section supplies its own
   frame.setBoundVariable("paddingTop", getVar(component.sectionGapVariable));
   frame.setBoundVariable("paddingBottom", getVar(component.sectionGapVariable));
   frame.itemSpacing = 0;
   frame.setBoundVariable("itemSpacing", getVar(component.sectionGapVariable)); // real Plugin API: bind itemSpacing the same way as padding

   for (const section of component.sections) {
     const sectionFrame = figma.createFrame();
     sectionFrame.layoutMode = "VERTICAL";
     sectionFrame.primaryAxisSizingMode = "AUTO";
     sectionFrame.counterAxisSizingMode = "AUTO";
     sectionFrame.fills = []; // sections have no fill/stroke of their own in this pass (Card's real Footer would need one — not modeled, see buildCardPlan's own comment)
     sectionFrame.setBoundVariable("paddingLeft", getVar(section.paddingHorizontalVariable));
     sectionFrame.setBoundVariable("paddingRight", getVar(section.paddingHorizontalVariable));
     for (const line of section.textLines) {
       const lineText = figma.createText();
       lineText.name = line.labelPropertyName; // e.g. "Title", "Description", "Content" — distinct per line, for step 4's property binding
       lineText.fontName = { family: fontFamilyValue, style: line.weight }; // "Medium" or "Regular", per the plan
       lineText.characters = line.defaultLabel;
       lineText.setBoundVariable("fontSize", getVar(line.fontSizeVariable));
       lineText.fills = [bindPaint({ r: 0, g: 0, b: 0 }, getVar(line.textVariable))];
       sectionFrame.appendChild(lineText);
     }
     frame.appendChild(sectionFrame);
   }
   ```
   Every text line across every section still needs a real component
   property in step 4, same as any other label — just more of them, named
   per `line.labelPropertyName` instead of the fixed `Label`/`Description`
   pair.
3. **Convert each variant frame to a component, then `combineAsVariants`** —
   name each component `"<variantPropertyName>=<variant.name>"` (e.g.
   `"Variant=Destructive"`) before combining; Figma derives the variant
   property and its options from that naming convention automatically, no
   separate property-creation call needed for the variant axis itself.
   ```js
   const comp = figma.createComponentFromNode(frame);
   comp.name = `${plan.variantPropertyName}=${variant.name}`;
   // ...repeat per variant, then:
   const componentSet = figma.combineAsVariants(components, section); // section = a real Section, never blank canvas — see figma_execute's own housekeeping rules
   componentSet.name = component.name; // "Button"
   componentSet.layoutMode = "HORIZONTAL"; // combineAsVariants stacks at (0,0) — always re-layout after
   componentSet.itemSpacing = 24;
   ```
4. **Add the label as a real TEXT component property**, bound to every
   variant's text node — not just set on one. Name each text node when
   creating it (`text.name = "PrimaryText"`, and if present,
   `secondaryText.name = "SecondaryText"` — see step 2 above) so this step
   can find the right one by name instead of `findOne(n => n.type ===
   "TEXT")`, which becomes ambiguous the moment a variant has TWO text
   nodes (Alert's own secondary line):
   ```js
   const propName = componentSet.addComponentProperty(component.labelPropertyName, "TEXT", component.defaultLabel);
   for (const variant of componentSet.children) {
     variant.findOne(n => n.type === "TEXT" && n.name === "PrimaryText").componentPropertyReferences = { characters: propName };
   }
   if (component.secondaryLabelPropertyName) {
     const secondaryPropName = componentSet.addComponentProperty(component.secondaryLabelPropertyName, "TEXT", component.defaultSecondaryLabel);
     for (const variant of componentSet.children) {
       variant.findOne(n => n.type === "TEXT" && n.name === "SecondaryText").componentPropertyReferences = { characters: secondaryPropName };
     }
   }
   ```
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
5. **Validate before moving to the next component — never batch multiple
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
     `Name=Value` naming convention in step 3) keeps its plain name
     (`"Variant"`), but an explicitly-added TEXT property (step 4, e.g.
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
6. **Report back**: which component(s) got built, how many real variants
   each has (and which were skipped, with the plan's own stated reason),
   and — if any binding needed a nearest-token approximation per the plan's
   `notes` — say so plainly, the same "don't present an approximate result
   as pixel-perfect" honesty step 6 already applies to tokens.

**Not yet built, real and disclosed:** re-running this step against a file
that already has one of these component sets will create a second,
differently-named one (same "first push, not sync" limitation as tokens,
above) — no update-in-place logic exists yet. Also not yet built: any
component beyond Button/Badge/Toggle/Alert/Input/Textarea/Card, any size
beyond `default`, Alert's real destructive-tinted `AlertDescription` color
(its description is modeled, but always in `text.secondary` — the real
translucent-red tint on the destructive variant isn't bound, see
`buildAlertPlan`'s own comment), Input/Textarea's real typed-text state
(they show their PLACEHOLDER text, not typed content — see
`buildInputPlan`'s own comment), Card's real `CardFooter` (a separate
background/border treatment, not modeled — see `buildCardPlan`'s own
comment) and its real `ring-1` border (approximated as `border.subtle`,
not a true partially-transparent ring), and any framework's component
source beyond Next.js + shadcn/ui (shadcn-vue's `.vue` files and RNR's
React Native source both need their own real verification before this
same mechanism can be trusted against them — don't assume the parser
generalizes without checking). Most of shadcn/ui's own remaining real
components either have no size-independent color "variant" axis at all
(Checkbox, Switch, Label, Separator, ...) or are compound/multi-part
components needing MORE than Card's own two-section, text-only structure
(Dialog, Sheet, Table, Sidebar — nested interactive sub-components, not
just more text lines) — real, larger, separate work, checked and
deliberately not attempted yet, not an oversight.

**State after this round (2026-09-17):** all seven components — Button,
Badge, Toggle, Alert, Input, Textarea, Card — are now proven live, not
just plan-computed. Every one went through the full build → screenshot →
instance-swap → screenshot cycle, same bar throughout — including
confirming live that Alert's same-tone-trap fix actually renders readable
red text on both variants, that the radius bug fix's `radius/md` binding
renders at the same real pixel value a live browser check showed, and
that Card's own three independent text properties (`Title`/`Description`/
`Content`) all bind and swap correctly on a real instance.

### 8. Pull token edits back from Figma (added 2026-09-17, extended to cover styles the same day)

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
