// design.md section 5's component inventory — see contracts-and-seeds.md,
// "design.md (contract decided — not built)."
//
// Reads what's physically in a scaffolded project: the component files listed
// in `sdsgt-vendored-components.json` (written by `scaffold` at vendor time),
// and each file's variant axes from its own `cva(...)` calls and typed
// props. Re-read on every design.md refresh (`scaffold --update`), so it
// reflects the components folder as of the last refresh.
//
// Variants are read straight from each file's source, so every vendored
// component is covered the same way — not just the ones the Figma component
// plan knows about. A file with no `cva()` is listed with no axes; nothing is
// ever invented. Parsing is a small bracket-aware scanner (strings and
// comments skipped), not a full TS parser — enough for cva's plain object
// literal shape, and it fails soft: anything it can't read is left out.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

import { collectFilesRecursive } from "../../shared/scaffold-common.ts";

export const VENDORED_MANIFEST = "sdsgt-vendored-components.json";

export interface VariantAxis {
  axis: string; // e.g. "variant", "size"
  options: string[]; // in source order
  defaultOption?: string; // from defaultVariants, when set
}

export interface CvaGroup {
  name: string; // the variable the cva() call is assigned to, e.g. "buttonVariants"
  axes: VariantAxis[];
}

// A variant declared as a plain typed prop instead of through cva(), e.g.
// Avatar's `size?: "default" | "sm" | "lg"` or DropdownMenuItem's
// `variant?: "default" | "destructive"`.
export interface PropVariant {
  part: string; // the function component declaring it, e.g. "DropdownMenuItem"
  prop: string; // e.g. "size"
  options: string[]; // in source order
  defaultOption?: string; // from the destructuring default, e.g. `size = "default"`
}

export interface ComponentEntry {
  name: string; // file name without extension, e.g. "button", "alert-dialog"
  path: string; // relative to the project root, e.g. "src/components/ui/button.tsx"
  cva: CvaGroup[]; // empty when the file has no cva() variants
  props: PropVariant[]; // empty when the file declares no string-union props
}

export interface ComponentInventory {
  library: string; // the manifest's top-level key, e.g. "shadcn"
  folder: string; // relative to the project root, e.g. "src/components/ui"
  components: ComponentEntry[]; // alphabetical by name
}

// Returns null when the project has no vendored-components manifest (not
// scaffolded yet, or a library that doesn't vendor components — MUI,
// Vuetify, etc.). design.md handles both cases with fixed text.
export function readComponentInventory(projectDir: string): ComponentInventory | null {
  const manifestPath = join(projectDir, VENDORED_MANIFEST);
  if (!existsSync(manifestPath)) return null;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, Record<string, { path: string }>>;
  const [library] = Object.keys(manifest);
  if (!library) return null;

  // The manifest is written once, at vendor time, and isn't updated after —
  // so it's only used to learn WHERE the components folder is. The folder
  // itself is what's listed, so components added or removed since show up.
  const firstPath = Object.entries(manifest[library]).find(([name]) => name !== "utils")?.[1].path;
  if (!firstPath) return { library, folder: "", components: [] };
  const folder = dirname(firstPath);

  const components: ComponentEntry[] = [];
  for (const full of collectFilesRecursive(join(projectDir, folder))) {
    if (!/\.(tsx|ts|vue|jsx)$/.test(full)) continue;
    const path = relative(projectDir, full);
    const name = basename(full, extname(full));
    const source = readFileSync(full, "utf-8");
    const cva = readCvaGroups(source);
    components.push({ name, path, cva, props: readPropVariants(source, cva) });
  }
  components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { library, folder, components };
}

// ---------------------------------------------------------------------------
// cva() reading
// ---------------------------------------------------------------------------

export function readCvaGroups(source: string): CvaGroup[] {
  const groups: CvaGroup[] = [];
  const callPattern = /(?:const|let|var)\s+(\w+)\s*=\s*cva\(/g;
  let m: RegExpExecArray | null;
  while ((m = callPattern.exec(source)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchingBracket(source, open);
    if (close < 0) continue;
    const args = splitTopLevel(source.slice(open + 1, close));
    const options = args[1]?.trim();
    if (!options?.startsWith("{")) continue;

    const optionFields = objectFields(options);
    const variantsObj = optionFields.get("variants");
    if (!variantsObj) continue;

    const defaults = new Map<string, string>();
    const defaultsObj = optionFields.get("defaultVariants");
    if (defaultsObj) {
      for (const [axis, value] of objectFields(defaultsObj)) {
        const literal = value.trim().match(/^(["'`])(.*)\1$/);
        if (literal) defaults.set(axis, literal[2]);
      }
    }

    const axes: VariantAxis[] = [];
    for (const [axis, value] of objectFields(variantsObj)) {
      const options = [...objectFields(value).keys()];
      if (options.length === 0) continue;
      const entry: VariantAxis = { axis, options };
      const def = defaults.get(axis);
      if (def !== undefined && options.includes(def)) entry.defaultOption = def;
      axes.push(entry);
    }
    if (axes.length > 0) groups.push({ name: m[1], axes });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Typed-prop variants (no cva)
// ---------------------------------------------------------------------------

// Finds props typed as a union of 2+ string literals (`size?: "sm" | "default"`,
// single- or multi-line), credits each to the nearest preceding
// `function Name(`, and reads its default from that function's destructuring
// (`size = "default"`). Skips a prop whose axis and options a cva() group in
// the same file already covers (e.g. Bubble's `side`/`align`, which are typed
// props AND cva axes), so nothing is listed twice.
export function readPropVariants(source: string, cva: CvaGroup[]): PropVariant[] {
  const covered = new Set(cva.flatMap((g) => g.axes.map((a) => `${a.axis}:${a.options.join("|")}`)));
  const found: PropVariant[] = [];
  const seen = new Set<string>();
  const unionProp = /(\w+)\?:\s*\|?\s*("[^"\n]+"(?:\s*\|\s*"[^"\n]+")+)/g;
  let m: RegExpExecArray | null;
  while ((m = unionProp.exec(source)) !== null) {
    const prop = m[1];
    const options = [...m[2].matchAll(/"([^"]+)"/g)].map((o) => o[1]);
    if (covered.has(`${prop}:${options.join("|")}`)) continue;

    const before = source.slice(0, m.index);
    const owners = [...before.matchAll(/function\s+([A-Z]\w*)\s*\(/g)];
    const owner = owners[owners.length - 1];
    if (!owner) continue;

    const key = `${owner[1]}.${prop}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry: PropVariant = { part: owner[1], prop, options };
    const def = source.slice(owner.index, m.index).match(new RegExp(`\\b${prop}\\s*=\\s*"([^"]+)"`));
    if (def && options.includes(def[1])) entry.defaultOption = def[1];
    found.push(entry);
  }
  return found;
}

// `{ a: 1, "b-c": { ... } }` -> Map { a -> "1", b-c -> "{ ... }" }, top-level
// keys only, in source order. Non-object text yields an empty map.
function objectFields(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  const t = text.trim();
  if (!t.startsWith("{")) return fields;
  const close = matchingBracket(t, 0);
  if (close < 0) return fields;
  for (const segment of splitTopLevel(t.slice(1, close))) {
    const s = stripLeadingComments(segment);
    const key = s.match(/^(["']?)([\w-]+)\1\s*:/);
    if (key) fields.set(key[2], s.slice(key[0].length));
  }
  return fields;
}

function stripLeadingComments(text: string): string {
  let s = text.trimStart();
  for (;;) {
    if (s.startsWith("//")) {
      const nl = s.indexOf("\n");
      s = nl < 0 ? "" : s.slice(nl + 1).trimStart();
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end < 0 ? "" : s.slice(end + 2).trimStart();
    } else {
      return s;
    }
  }
}

// Index just past a string/comment starting at i, or i itself if none starts there.
function skipNonCode(src: string, i: number): number {
  const c = src[i];
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "/" && src[i + 1] === "/") {
    const nl = src.indexOf("\n", i);
    return nl < 0 ? src.length : nl;
  }
  if (c === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end < 0 ? src.length : end + 2;
  }
  return i;
}

function matchingBracket(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const skipped = skipNonCode(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const skipped = skipNonCode(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const c = body[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  const last = body.slice(start);
  if (last.trim()) parts.push(last);
  return parts;
}
