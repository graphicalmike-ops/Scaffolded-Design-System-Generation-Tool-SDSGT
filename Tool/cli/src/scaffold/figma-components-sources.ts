// Component pull, step 1 (2026-10-15): the CODE ORIGIN of every variable binding the
// Figma component push applies — written as `figma-components-sources.json`, next to
// `figma-components-push-plan.json` (see pipeline-plan.md, "Tokens and components
// round-trip differently", and docs/component-pull-step1-progress.md).
//
// The push plan records WHICH Figma variable each property of each component / variant /
// axis option / state uses, but not where that came from in the vendored source. A later
// pull (step 3) needs that to turn "a designer swapped this binding in Figma" into "edit
// this exact class in this exact place". Reversing the push mapping is not reliable (nearest
// -token snaps, special-cased radius classes, user-decided overrides, solid-token
// substitutions, fallbacks, stand-ins), so the origin is recorded at the moment the plan is
// built, by the builders themselves.
//
// How it works, without changing the plan by a single byte:
//   1. Builders TAG the plan objects they create: `tag(obj, "fillVariable", origin)`. Tags
//      live in a module-level WeakMap keyed by the plan object, never on the object itself.
//   2. `collectFigmaComponentSources(plan)` walks the finished plan the way the
//      SDSGT-figma-push replay does (SKILL.md step 2c's merge, steps 1b/2/2b/2c/3's bindings),
//      tracking which plan object supplied each final value, and looks up that object's tag.
//      One record per bound property per Figma variant combination.
//   3. A binding whose supplying object carries no tag is returned in `unrecorded` (and left
//      out of the file), so the check script (`scripts/check-components-sources.ts`) flags it.

import type {
  FigmaComponentPlanItem,
  FigmaComponentsPushPlan,
  FigmaComponentStatePlanItem,
  FigmaComponentVariantPlanItem,
  FigmaComponentLayoutOverrides,
} from "./figma-components-plan.ts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// The bound property, named by what it is on the Figma node (see `part` for which node):
//   fill              fills[0] colour (a frame, a rectangle or an ellipse)
//   stroke            strokes[0] colour (for part "Icon", the icon vector's strokes)
//   textColor         a TEXT node's fills (part "InlineLink": the range fill at the end of SecondaryText)
//   ringColor         the drop-shadow ring effect's colour (Focus / Invalid rings)
//   radius            all four corner radii
//   paddingHorizontal paddingLeft + paddingRight
//   paddingVertical   paddingTop + paddingBottom (only paddingTop when the same combination also has a paddingBottom record)
//   paddingBottom     paddingBottom alone (Marker Border)
//   itemSpacing       auto-layout gap
//   height / width    a fixed, variable-bound size (an icon-only or square frame binds BOTH to one variable: two records)
//   fontSize / fontFamily
export type FigmaComponentSourceProperty =
  | "fill"
  | "stroke"
  | "textColor"
  | "ringColor"
  | "radius"
  | "paddingHorizontal"
  | "paddingVertical"
  | "paddingBottom"
  | "itemSpacing"
  | "height"
  | "width"
  | "fontSize"
  | "fontFamily";

export interface FigmaComponentSourceRecordBase {
  component: string; // plan component name, e.g. "Button"
  // Figma variant property -> value, exactly as the replay names the component, e.g.
  // { Variant: "Destructive", Size: "Sm", State: "Hover" } for "Variant=Destructive, Size=Sm, State=Hover".
  combination: Record<string, string>;
  // The node inside the component; ABSENT = the component's own root node. Values: "PrimaryText",
  // "SecondaryText", "InlineLink", a sections text line's labelPropertyName (e.g. "Title"),
  // "Section:<first line's label>" (a section frame), "Line", "CenterLabelText", "FlankLine",
  // "Indicator", "Thumb", "Icon", "CenterDot".
  part?: string;
  property: FigmaComponentSourceProperty;
  variable: string; // the Figma variable bound, e.g. "color/semantic/action/primary"
}

export interface FigmaComponentClassOrigin {
  origin: "class";
  file: string; // vendored file name, e.g. "button.tsx"
  class: string; // the exact full class as written in source, e.g. "hover:bg-primary/80"
  // Where the class string lives: "cva <const> base", "cva <const> variants.<axis>.<key>", or
  // "function <Name>" (anywhere in that component function's own class strings).
  location: string;
  // True when more than one record (binding) traces to this same file + location + class, so
  // editing the class changes more than the one binding a designer touched.
  shared: boolean;
  // Present only when the class's real px was snapped to a token of a different px value.
  snapped?: { classPx: number; tokenPx: number };
}

export interface FigmaComponentDerivedOrigin {
  origin: "derived";
  // Plain language: why no single class can be edited to reproduce this binding (a user
  // decision, a solid-token substitution, a fallback, a hardcoded or stand-in value, ...).
  // A pull FLAGS edits to these instead of editing code.
  reason: string;
}

export type FigmaComponentSourceRecord = FigmaComponentSourceRecordBase & (FigmaComponentClassOrigin | FigmaComponentDerivedOrigin);

export interface FigmaComponentsSources {
  version: 1;
  records: FigmaComponentSourceRecord[];
}

// What a builder tags a field with. `shared` is computed by the walker, not by the builder.
export type FigmaSourceOrigin = Omit<FigmaComponentClassOrigin, "shared"> | FigmaComponentDerivedOrigin;

// ---------------------------------------------------------------------------
// Origin registry (tags on plan objects, kept outside the objects)
// ---------------------------------------------------------------------------

const ORIGINS = new WeakMap<object, Record<string, FigmaSourceOrigin>>();

// `field` may also be "<field>@<property>" (e.g. "sectionGapVariable@itemSpacing") for a plan field
// the replay binds to two properties whose real origins differ; the walker tries that key first.
export function tag(obj: object, field: string, origin: FigmaSourceOrigin): void {
  let fields = ORIGINS.get(obj);
  if (!fields) {
    fields = {};
    ORIGINS.set(obj, fields);
  }
  fields[field] = origin;
}

export function getTag(obj: object, field: string): FigmaSourceOrigin | undefined {
  return ORIGINS.get(obj)?.[field];
}

// Copies every tag of `from` onto `to` (for `{ ...colors }`-style spreads, which copy the
// values but not the WeakMap tags).
export function copyTags(from: object, to: object): void {
  const fields = ORIGINS.get(from);
  if (!fields) return;
  for (const [field, origin] of Object.entries(fields)) tag(to, field, origin);
}

export function derivedOrigin(reason: string): FigmaComponentDerivedOrigin {
  return { origin: "derived", reason };
}

// ---------------------------------------------------------------------------
// Locating a class in the vendored source
// ---------------------------------------------------------------------------

interface SourceLiteral {
  index: number;
  tokens: string[];
  location: string;
}

interface SourceContext {
  file: string;
  literals: SourceLiteral[];
  // Bubble only: its states are read from a SYNTHETIC cva source whose classes are rewritten
  // (`hover:` for the real `[&>[data-slot=bubble-content]:is(button,a):hover]:`). Maps a
  // rewritten class string / class back to the real one.
  alias?: { classString: (s: string) => string; cls: (c: string) => string };
}

let context: SourceContext | null = null;

// Splits a vendored file into its string literals, each with the place it sits in:
// "cva <const> base" (the first string of a `const X = cva(` call), "cva <const>
// variants.<axis>.<key>", "function <Name>", or "const <Name>". Targeted at shadcn's own
// consistent formatting (top-level declarations start at column 0), like parseCvaAxis.
export function indexSourceLiterals(source: string): SourceLiteral[] {
  const decls: Array<{ index: number; kind: "function" | "cva" | "const"; name: string }> = [];
  const declPattern = /^(?:export\s+)?(?:async\s+)?(function|const)\s+([A-Za-z0-9_]+)(\s*=\s*cva\()?/gm;
  let d: RegExpExecArray | null;
  while ((d = declPattern.exec(source)) !== null) {
    decls.push({ index: d.index, kind: d[1] === "function" ? "function" : d[3] ? "cva" : "const", name: d[2] });
  }
  const literals: SourceLiteral[] = [];
  const literalPattern = /"([^"\n]*)"|`([^`]*)`/g;
  let m: RegExpExecArray | null;
  const cvaBaseSeen = new Set<string>();
  while ((m = literalPattern.exec(source)) !== null) {
    const text = m[1] ?? m[2] ?? "";
    const decl = [...decls].reverse().find((x) => x.index <= m!.index);
    let location = decl ? `${decl.kind === "cva" ? "cva" : decl.kind} ${decl.name}` : "top level";
    if (decl?.kind === "cva") {
      if (!cvaBaseSeen.has(decl.name)) {
        cvaBaseSeen.add(decl.name);
        location = `cva ${decl.name} base`;
      } else {
        const before = source.slice(decl.index, m.index);
        const key = before.match(/(["']?)([A-Za-z0-9-]+)\1:\s*$/)?.[2];
        const blocks = [...before.matchAll(/^\s*([A-Za-z0-9]+):\s*\{\s*$/gm)].map((b) => b[1]).filter((b) => b !== "variants");
        const axis = blocks[blocks.length - 1];
        location = key && axis ? `cva ${decl.name} variants.${axis}.${key}` : `cva ${decl.name}`;
      }
    }
    literals.push({ index: m.index, tokens: text.split(/\s+/).filter(Boolean), location });
  }
  return literals;
}

export function setSourceContext(file: string, source: string): void {
  context = { file, literals: indexSourceLiterals(source) };
}

export function clearSourceContext(): void {
  context = null;
}

export function setSourceAlias(alias: SourceContext["alias"]): void {
  if (context) context.alias = alias;
}

// The "class" origin of `cls` in the current component's file. `within` is the class string
// the builder actually parsed it from: when the class appears in more than one place, only
// string literals whose classes all sit inside `within` (or that hold all of `within`) count. `locationSuffix` (e.g.
// "variants.size.sm") narrows further, for identical strings in two cva entries. Never throws:
// a class that can't be pinned to exactly one place becomes a "derived" origin saying so.
export function classOrigin(cls: string, within?: string, snapped?: { classPx: number; tokenPx: number }, locationSuffix?: string): FigmaSourceOrigin {
  if (!context) return derivedOrigin(`class '${cls}' could not be located (no source file in context)`);
  const realCls = context.alias ? context.alias.cls(cls) : cls;
  const realWithin = within !== undefined && context.alias ? context.alias.classString(within) : within;
  let candidates = context.literals.filter((l) => l.tokens.includes(realCls));
  if (realWithin !== undefined && candidates.length > 1) {
    // A literal matches `within` when one holds all of the other's classes: `within` is a whole
    // literal, several literals joined (Tabs' trigger), or a few classes picked out of one (Bubble).
    const allowed = new Set(realWithin.split(/\s+/).filter(Boolean));
    const narrowed = candidates.filter((l) => l.tokens.every((t) => allowed.has(t)) || [...allowed].every((t) => l.tokens.includes(t)));
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (locationSuffix !== undefined && candidates.length > 1) {
    const narrowed = candidates.filter((l) => l.location.endsWith(locationSuffix));
    if (narrowed.length > 0) candidates = narrowed;
  }
  const locations = [...new Set(candidates.map((l) => l.location))];
  if (locations.length === 0) return derivedOrigin(`class '${realCls}' was not found in ${context.file}, so there is no class to edit`);
  if (locations.length > 1) return derivedOrigin(`class '${realCls}' appears in more than one place in ${context.file} (${locations.join(", ")}), so the exact class to edit is ambiguous`);
  const origin: Omit<FigmaComponentClassOrigin, "shared"> = { origin: "class", file: context.file, class: realCls, location: locations[0] };
  if (snapped && Math.abs(snapped.classPx - snapped.tokenPx) > 1e-9) origin.snapped = snapped;
  return origin;
}

// `snapped` for a nearestToken match: the class's real px vs the chosen token's px.
export function snapOf(classPx: number, match: { figmaName: string }, scale: Record<string, number>): { classPx: number; tokenPx: number } | undefined {
  const tokenPx = scale[match.figmaName.split("/").pop() as string];
  if (tokenPx === undefined || Math.abs(tokenPx - classPx) < 1e-9) return undefined;
  return { classPx, tokenPx };
}

// ---------------------------------------------------------------------------
// The walker: emulates the SDSGT-figma-push replay and emits one record per binding
// ---------------------------------------------------------------------------

type Merged = { v: Record<string, unknown>; src: Record<string, object> };

// Object.assign that remembers which source object supplied each final key. `undefined`
// values are skipped (the replay reads the plan JSON, where they don't exist).
function provenanceMerge(parts: Array<{ obj: object; skip?: string[] }>): Merged {
  const v: Record<string, unknown> = {};
  const src: Record<string, object> = {};
  for (const { obj, skip } of parts) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || skip?.includes(key)) continue;
      v[key] = value;
      src[key] = obj;
    }
  }
  return { v, src };
}

export interface UnrecordedBinding {
  component: string;
  combination: Record<string, string>;
  part?: string;
  property: FigmaComponentSourceProperty;
  variable: string;
}

export function collectFigmaComponentSources(plan: FigmaComponentsPushPlan): { sources: FigmaComponentsSources; unrecorded: UnrecordedBinding[] } {
  const records: FigmaComponentSourceRecord[] = [];
  const unrecorded: UnrecordedBinding[] = [];

  for (const c of plan.components) {
    const axes = c.extraAxes ?? [];
    let combos: Array<Array<{ axis: (typeof axes)[number]; option: (typeof axes)[number]["options"][number] }>> = [[]];
    for (const axis of axes) combos = combos.flatMap((combo) => axis.options.map((option) => [...combo, { axis, option }]));

    for (const combo of combos) {
      const comboOverrides = combo.flatMap((a) =>
        combo.filter((o) => o !== a).map((o) => a.option.combinationOverrides?.[`${o.axis.propertyName}=${o.option.name}`]).filter((x): x is FigmaComponentLayoutOverrides => Boolean(x)),
      );
      const allOverrides: FigmaComponentLayoutOverrides[] = [...combo.map((a) => a.option.overrides), ...comboOverrides];
      const itemM = provenanceMerge([{ obj: c }, ...allOverrides.map((o) => ({ obj: o }))]);
      const stateNames = c.statePropertyName ? [null, ...((c.variants[0]?.states ?? []).map((s) => s.name))] : [null];

      for (const stateName of stateNames) {
        for (const variant of c.variants) {
          const state = stateName ? (variant.states ?? []).find((s) => s.name === stateName) : undefined;
          const ignored = state !== undefined && allOverrides.some((o) => (o.ignoreStates ?? []).includes(state.name));
          const vm = provenanceMerge([
            { obj: variant },
            ...allOverrides.map((o) => ({ obj: (o.variantOverrides ?? {})[variant.name] ?? {} })),
            ...(state && !ignored ? [{ obj: state as object, skip: ["name"] }] : []),
          ]);
          const combination: Record<string, string> = { [c.variantPropertyName]: variant.name };
          for (const a of combo) combination[a.axis.propertyName] = a.option.name;
          if (c.statePropertyName) combination[c.statePropertyName] = stateName ?? "Default";

          const emit = (property: FigmaComponentSourceProperty, part: string | undefined, variable: unknown, srcObj: object | undefined, srcKey: string) => {
            if (typeof variable !== "string" || variable === "") return;
            const origin = srcObj ? (getTag(srcObj, `${srcKey}@${property}`) ?? getTag(srcObj, srcKey)) : undefined;
            const base: FigmaComponentSourceRecordBase = { component: c.name, combination, ...(part ? { part } : {}), property, variable };
            if (!origin) unrecorded.push(base);
            else records.push({ ...base, ...(origin.origin === "class" ? { ...origin, shared: false } : origin) } as FigmaComponentSourceRecord);
          };
          emitBindings(c, itemM, vm, variant, emit);
        }
      }
    }
  }

  // `shared`: more than one record traces to the same file + location + class.
  const counts = new Map<string, number>();
  const keyOf = (r: FigmaComponentClassOrigin) => `${r.file}|${r.location}|${r.class}`;
  for (const r of records) if (r.origin === "class") counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1);
  for (const r of records) if (r.origin === "class") r.shared = (counts.get(keyOf(r)) ?? 0) > 1;

  return { sources: { version: 1, records }, unrecorded };
}

// The bindings SKILL.md's replay applies for one (combination, state, variant), in replay
// order: step 1b (component icon), 2 (line), 2b (bar), 2c (thumb), 3 (frame + content).
function emitBindings(
  c: FigmaComponentPlanItem,
  itemM: Merged,
  vm: Merged,
  variant: FigmaComponentVariantPlanItem,
  emit: (property: FigmaComponentSourceProperty, part: string | undefined, variable: unknown, srcObj: object | undefined, srcKey: string) => void,
): void {
  const item = itemM.v as Partial<FigmaComponentPlanItem> & FigmaComponentLayoutOverrides;
  const vi = vm.v as Partial<FigmaComponentVariantPlanItem> & Partial<Omit<FigmaComponentStatePlanItem, "name">>;
  const fromItem = (property: FigmaComponentSourceProperty, part: string | undefined, key: string) => emit(property, part, item[key as keyof typeof item], itemM.src[key], key);
  const fromVariant = (property: FigmaComponentSourceProperty, part: string | undefined, key: string) => emit(property, part, vi[key as keyof typeof vi], vm.src[key], key);

  // 1b. The whole component is one icon (Spinner).
  if (c.icon) {
    emit("stroke", "Icon", c.icon.colorVariable, c.icon, "colorVariable");
    return;
  }
  // 2. A line (Separator / FieldSeparator), from the MERGED item.
  if (item.line) {
    const line = item.line;
    emit("fill", line.centerLabel ? "Line" : undefined, line.colorVariable, line, "colorVariable");
    if (line.centerLabel) {
      const cl = line.centerLabel;
      emit("itemSpacing", undefined, cl.gapVariable, cl, "gapVariable");
      emit("fontSize", "CenterLabelText", cl.fontSizeVariable, cl, "fontSizeVariable");
      emit("textColor", "CenterLabelText", cl.textVariable, cl, "textVariable");
    }
    return;
  }
  // 2b. A bar (Progress), from the COMPONENT.
  if (c.bar) {
    const bar = c.bar;
    emit("fill", undefined, bar.trackColorVariable, bar, "trackColorVariable");
    emit("fill", "Indicator", bar.indicatorColorVariable, bar, "indicatorColorVariable");
    emit("height", undefined, bar.heightVariable, bar, "heightVariable");
    emit("height", "Indicator", bar.heightVariable, bar, "heightVariable");
    emit("radius", undefined, bar.radiusVariable, bar, "radiusVariable");
    return;
  }
  // 2c. A thumb-bearing variant (Switch): the track is the root; state stroke / ring go on it.
  if (vi.thumb) {
    const t = vi.thumb;
    emit("radius", undefined, t.radiusVariable, t, "radiusVariable");
    emit("fill", undefined, t.trackColorVariable, t, "trackColorVariable");
    emit("fill", "Thumb", t.thumbColorVariable, t, "thumbColorVariable");
    if (vi.strokeVariable) fromVariant("stroke", undefined, "strokeVariable");
    if (vi.focusRing) emit("ringColor", undefined, vi.focusRing.colorVariable, vi.focusRing, "colorVariable");
    return;
  }

  // 3. The frame.
  const sections = item.sections;
  if (!c.fixedSizePx) {
    if (item.iconOnly || (item.square && item.heightVariable)) {
      fromItem("width", undefined, "heightVariable");
      fromItem("height", undefined, "heightVariable");
    } else if (!sections) {
      fromItem("paddingHorizontal", undefined, "paddingHorizontalVariable");
      if (item.heightVariable) fromItem("height", undefined, "heightVariable");
      else fromItem("paddingVertical", undefined, "paddingVerticalVariable");
    }
  }
  if (sections) {
    const horizontal = sections[0]?.textLineDirection === "horizontal";
    if (!horizontal) fromItem("paddingVertical", undefined, "sectionGapVariable");
    fromItem("itemSpacing", undefined, "sectionGapVariable");
    if (item.widthVariable) fromItem("width", undefined, "widthVariable");
  }
  fromItem("radius", undefined, "radiusVariable");
  if (vi.fillVariable) fromVariant("fill", undefined, "fillVariable");
  if (vi.strokeVariable) fromVariant("stroke", undefined, "strokeVariable");
  if (vi.paddingBottomVariable) fromVariant("paddingBottom", undefined, "paddingBottomVariable");
  if (vi.focusRing) emit("ringColor", undefined, vi.focusRing.colorVariable, vi.focusRing, "colorVariable");

  // Content.
  if (item.iconOnly) {
    if (vi.textVariable) fromVariant("stroke", "Icon", "textVariable");
    else emit("stroke", "Icon", item.iconOnly.colorVariable, item.iconOnly, "colorVariable");
  } else if (sections) {
    for (const section of sections) {
      emit("paddingHorizontal", `Section:${section.textLines[0]?.labelPropertyName ?? "?"}`, section.paddingHorizontalVariable, section, "paddingHorizontalVariable");
      for (const line of section.textLines) {
        emit("fontSize", line.labelPropertyName, line.fontSizeVariable, line, "fontSizeVariable");
        const override = vi.textLineOverrides?.[line.labelPropertyName];
        if (override?.textVariable) emit("textColor", line.labelPropertyName, override.textVariable, override, "textVariable");
        else emit("textColor", line.labelPropertyName, line.textVariable, line, "textVariable");
      }
    }
  } else if (variant.icon) {
    emit("stroke", "Icon", variant.icon.colorVariable, variant.icon, "colorVariable");
  } else if (variant.centerDot) {
    emit("fill", "CenterDot", variant.centerDot.colorVariable, variant.centerDot, "colorVariable");
  } else if (variant.textVariable) {
    fromItem("fontSize", "PrimaryText", "fontSizeVariable");
    fromVariant("textColor", "PrimaryText", "textVariable");
    emit("fontFamily", "PrimaryText", c.fontFamilyVariable, c, "fontFamilyVariable");
    if (vi.flankLines) {
      emit("itemSpacing", undefined, vi.flankLines.gapVariable, vi.flankLines, "gapVariable");
      emit("fill", "FlankLine", vi.flankLines.colorVariable, vi.flankLines, "colorVariable");
    }
    if (c.secondaryTextVariable) {
      emit("fontSize", "SecondaryText", c.secondaryFontSizeVariable, c, "secondaryFontSizeVariable");
      emit("textColor", "SecondaryText", c.secondaryTextVariable, c, "secondaryTextVariable");
      if (c.inlineLink) {
        if (vi.linkTextVariable) fromVariant("textColor", "InlineLink", "linkTextVariable");
        else emit("textColor", "InlineLink", c.secondaryTextVariable, c.inlineLink, "textVariable"); // the rest link colour: tagged on the inlineLink object
      }
    }
  }
}

// One record per line, so the file stays readable and diffable without being huge.
export function serializeFigmaComponentsSources(sources: FigmaComponentsSources): string {
  return `{\n  "version": ${sources.version},\n  "records": [\n${sources.records.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
}
