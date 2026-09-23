# Known issues — SDSGT Generate QA matrix

Confirmed bugs found by `cli/scripts/qa-matrix.ts`, logged here rather than
fixed immediately. Each entry is added only after a human/agent triages a
`FAIL` from a run and confirms it's a real bug, not environment noise (a
missing toolchain reports `SKIP`, not `FAIL`, so it shouldn't land here) —
the script itself never writes to this file.

Bug classes referenced below (see the plan at
`/Users/migjulio/.claude/plans/now-build-a-test-distributed-taco.md` for the
full reasoning behind each):

1. Achromatic-color hue math (zero-saturation edge case)
2. Shadow `$type` polymorphism (`"shadow"` composite vs. `"dimension"` bare dp)
3. Style Dictionary light/dark token merging
4. Missing-secondary-color/font handling
5. `@material/material-color-utilities` version pin (0.3.x vs. the broken 0.4.0)
6. CLI-level error handling (missing/malformed config, missing token spec)

## Template

```markdown
## KI-<n>: <one-line summary>
- **Status**: confirmed / investigating / fixed (link commit)
- **Discovered**: <date>, case `<id>` (`cli/qa-results/runs/<run-dir>/cases/<id>.json`)
- **Bug class**: <one of the 6 above, or "new">
- **Repro seed**: <inline minimal SeedConfig JSON>
- **Repro command**: <exact promote/generate invocation, or `npm run qa:matrix -- --case=<id>`>
- **Expected**: ...
- **Actual**: ...
- **Root cause**: ...
```

---

_No confirmed issues yet._
