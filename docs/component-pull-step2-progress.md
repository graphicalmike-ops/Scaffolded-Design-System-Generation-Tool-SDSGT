# Component pull, step 2 — build log (2026-10-19)

Step 2 of "Tokens and components round-trip differently" (`pipeline-plan.md`): at the end of the
component push (`SDSGT-figma-push` step 7), save a BASELINE of which variable every bound property
of every pushed component layer actually uses in Figma, so step 3 (the pull, NOT built here) can
later diff live Figma against it.

## Design (agreed with the user)

1. **Name every bound layer in the push** (SKILL.md step 7 replay): each node that carries a
   binding gets the same `part` name `figma-components-sources.ts` uses (PrimaryText,
   SecondaryText, a sections line's labelPropertyName, `Section:<first line's label>`, Line,
   CenterLabelText, FlankLine, Indicator, Thumb, Icon, CenterDot). Names only, nothing drawn
   differently. `InlineLink` is a text RANGE inside SecondaryText, not a node.
2. **A fixed read-back script stored in the CLI** (`scaffold/figma-components-readback.ts`),
   printed per component set by `node src/cli.ts figma-components-readback-script --component <Name>`;
   the skill pastes it verbatim into `figma_execute` / `use_figma`.
3. **`node src/cli.ts figma-components-pull --project-dir <p> --live-data <dir> --init`** writes
   `figma-components-sync-snapshot.json` and prints a plain report. Without `--init` it refuses
   (the pull itself is step 3). Logic: `scaffold/figma-components-pull.ts`.
4. **SKILL.md step 7 hook**: after all components are pushed and validated, run the read-back per
   set, save each output to `<temp dir>/<Component>.json`, run `figma-components-pull --init`,
   relay the report. Both MCP branches.
5. **Offline test** `scripts/check-components-baseline.ts` (`npm run check:components-baseline`):
   a mock of the Plugin API surface the script uses, built from the Demo plan + sources.
6. **Docs**: `pipeline-plan.md` step 2 marked built; this log.

## Read-back output shape (decided)

One JSON object per component set (compact; numbers index tables):

```
{
  "v": 1, "set": "Button", "id": "<set node id>",       // "missing": true when no set has that name
  "also": ["<id>"],                                     // only when more than one set has the name
  "vars": ["color/semantic/action/primary", ...],       // bound variable names
  "axes": [["Variant", ["Default", ...]], ["Size", [...]], ["State", [...]]],
  "parts": ["PrimaryText", ...],                        // layer-name table
  "c": [ [[0,3,1], "<component id>", {rootProps}, [[partIdx, "<node id>", {props}], ...]], ... ]
}
```

- `c[i][0]` = the variant's combination as indexes into `axes` (or the raw name string if it
  could not be parsed).
- props keys: `f` fill, `s` stroke, `k` ring (first drop shadow) colour, `r` corner radii,
  `x` padding left/right, `y` padding top/bottom, `g` itemSpacing, `w` width, `h` height,
  `t` text colour, `l` inline-link range colour (on a text layer whose last segment is
  underlined), `z` font size, `n` font family.
- a value: an integer = bound variable (`vars[i]`); a string = an UNBOUND raw value
  (`"#rrggbb"` / `"#rrggbbaa"`, `"13"`, `"Inter"`); an array = per-side values that differ
  (r: tl,tr,br,bl; x: left,right; y: top,bottom) or a text value that differs across segments.
  Equal sides are folded to one value by the script (lossless).
- Omitted when unbound AND empty (no visible paint, 0 padding/gap/radius, no drop shadow;
  width/height when the layer hugs its content).
- Layers emitted: root (the variant component) + every descendant that is a TEXT layer, has a
  known part name / `Section:` prefix, or carries any variable binding.

## Files

- `Tool/cli/src/scaffold/figma-components-readback.ts` — the script text + builder.
- `Tool/cli/src/scaffold/figma-components-pull.ts` — `--init` logic, snapshot, report.
- `Tool/cli/src/cli.ts` — `figma-components-readback-script`, `figma-components-pull` + help text.
- `Tool/cli/scripts/check-components-baseline.ts` + `package.json` script `check:components-baseline`.
- `Tool/.claude/skills/SDSGT-figma-push/SKILL.md` — step 7 naming + baseline subsection.
- `pipeline-plan.md` — step 2 + Build status line.

## Verification (from `Tool/cli`)

```
node scripts/regen-components-plan.ts --out ../../.tmp/component-pull-step2/plan.json --sources-out ../../.tmp/component-pull-step2/sources.json
cmp ../../.tmp/component-pull-step2/plan.json ../../.tmp/component-pull-step2/plan.before.json
cmp ../../.tmp/component-pull-step2/sources.json ../../.tmp/component-pull-step2/sources.before.json
npm run check:components-roundtrip
npm run check:components-sources -- --plan ../../.tmp/component-pull-step2/plan.json --sources ../../.tmp/component-pull-step2/sources.json
npm run check:components-baseline
npm run typecheck
```

## Checklist

- [x] 1 naming in SKILL.md step 7 (vector "Icon", rect "Line", "Indicator", "Thumb", "CenterDot", "FlankLine", section frames "Section:<label>")
- [x] 2 read-back script + print command
- [x] 3 `figma-components-pull --init`
- [x] 4 SKILL.md step 7 baseline hook ("Component pull baseline" subsection after item 7; item 7 relays its report)
- [x] 5 offline test (a) faithful mock, (b) faulty mock — both PASS. Read-back size (mock, Demo): 52,194 bytes total for 29 sets / 3011 bindings; largest Button 17,850, Item 4,434, Attachment 3,510, Toggle 3,470, Bubble 3,131
- [x] 6 docs (pipeline-plan.md step 2 + Build status line, this log)

All verification commands above pass (plan + sources byte-identical, roundtrip 241/241, sources OK, baseline (a)+(b) PASS, typecheck clean). DONE apart from the live test.

## Live test still needed (what the mock assumed)

- `createComponentFromNode` on a bare RECTANGLE (Separator) converts it in place (fill on the component root). If it wraps it instead, the CLI falls back to the child named `Line`.
- Text `boundVariables.fontSize` / `fontFamily` read back as an alias or an array of aliases (both handled).
- `getStyledTextSegments(["fills","textDecoration"])` splits Alert's description at the underlined link and each segment's paint keeps `boundVariables.color`.
- A bound paint / drop-shadow effect keeps `boundVariables.color` on read; `node.boundVariables` holds padding / radius / itemSpacing / width / height aliases.
- How each MCP returns the script's object (raw object, `{result}` wrapper, or JSON string; all accepted) and how large Button's ~18 KB result is in practice; the ~30 s timeout is not a concern for a read.
- Layer names survive `combineAsVariants` and the build-adjust loop.


## How to resume

Read this file, then the checklist. Baselines of the plan/sources before any change are in
`.tmp/component-pull-step2/*.before.json` (regenerate them from a clean checkout if `.tmp` was
wiped: `git stash` is NOT needed, since step 2 never touches the plan builders). Continue at the
first unchecked item. Don't commit.
