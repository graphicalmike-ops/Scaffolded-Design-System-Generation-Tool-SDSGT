// Per-platform checkers. Each takes the run's tokensDir (Promote's output)
// and codeOutDir (Generate's output) plus the seed used, and returns a flat
// list of CheckResult — no aggregation here, that's report.ts's job (via
// verdictFromChecks in types.ts).
//
// Real toolchains are used where available (tsc for MD2's TS, swiftc for
// SwiftUI's Swift, both already validated against these exact generators
// earlier this session) — SKIP, not FAIL, when a toolchain genuinely isn't
// on PATH, so environment gaps never masquerade as regressions. Where no
// toolchain exists at all (Kotlin, Sass), the checks are real structural/
// value assertions grounded in each generator's own narrow, documented
// output contract, not a generic parse.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { SeedConfig } from "../../src/types/seed-config.ts";
import type { CheckResult } from "./types.ts";

// cli/scripts/qa-matrix/checks.ts -> cli/, resolved once from this file's
// own location so it's correct regardless of the run's tokensDir/codeOutDir
// (which live under cli/qa-results/runs/, not necessarily near cli/'s own
// node_modules).
const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function braceBalance(text: string): number {
  return (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
}

function parenBalance(text: string): number {
  return (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;
}

function extractCssProps(text: string): Map<string, string> {
  const props = new Map<string, string>();
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) props.set(m[1], m[2].trim());
  return props;
}

function pass(name: string, platform: CheckResult["platform"], detail?: string): CheckResult {
  return { name, platform, status: "PASS", detail };
}
function fail(name: string, platform: CheckResult["platform"], expected: string, actual: string, detail?: string): CheckResult {
  return { name, platform, status: "FAIL", expected, actual, detail };
}
function skip(name: string, platform: CheckResult["platform"], detail: string): CheckResult {
  return { name, platform, status: "SKIP", detail };
}

function modeExpectations(seed: SeedConfig) {
  return { hasLight: seed.lightDarkMode !== "dark", hasDark: seed.lightDarkMode !== "light" };
}

function isCompositeShadow(seed: SeedConfig): boolean {
  return seed.shadowPreset === "tailwind" || seed.shadowPreset === "bootstrap";
}

// Same px->rem formula as bootstrap.ts's pxToRem — recomputed independently
// here (not imported) so the check verifies the generator's actual output
// against the spec, not against its own helper always agreeing with itself.
function pxToRem(pxValue: string): string {
  const rem = parseFloat(pxValue) / 16;
  return `${rem.toString().replace(/^0\./, ".")}rem`;
}

interface ColorPrimitives {
  color: {
    primitive: {
      brand: Record<string, { $value: string }>;
      "brand-secondary"?: Record<string, { $value: string }>;
      neutral: Record<string, { $value: string }>;
      static: Record<string, { $value: string }>;
      status: Record<string, Record<string, { $value: string }>>;
    };
  };
}

function readPrimitives(tokensDir: string): ColorPrimitives {
  return JSON.parse(readFileSync(join(tokensDir, "color.primitive.json"), "utf-8")) as ColorPrimitives;
}

function readShadowTypes(tokensDir: string): Record<string, string> | null {
  const path = join(tokensDir, "shadow.json");
  if (!existsSync(path)) return null;
  const { shadow } = JSON.parse(readFileSync(path, "utf-8")) as { shadow: Record<string, { $type: string }> };
  return Object.fromEntries(Object.entries(shadow).map(([k, v]) => [k, v.$type]));
}

// ---------------------------------------------------------------------------
// Plain CSS (always-on base platform)
// ---------------------------------------------------------------------------

export function checkCss(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);
  const cssDir = join(codeOutDir, "css");

  const tokensCss = readIfExists(join(cssDir, "tokens.css"));
  results.push(tokensCss ? pass("tokens.css exists", "css") : fail("tokens.css exists", "css", "file present", "missing"));
  if (tokensCss) {
    const bal = braceBalance(tokensCss);
    results.push(bal === 0 ? pass("tokens.css braces balanced", "css") : fail("tokens.css braces balanced", "css", "0", String(bal)));
  }

  const lightCss = readIfExists(join(cssDir, "light.css"));
  results.push(
    hasLight
      ? (lightCss ? pass("light.css exists", "css") : fail("light.css exists", "css", "file present", "missing"))
      : (lightCss ? fail("light.css absent when lightDarkMode=dark", "css", "missing", "file present") : pass("light.css absent when lightDarkMode=dark", "css")),
  );

  const darkCss = readIfExists(join(cssDir, "dark.css"));
  results.push(
    hasDark
      ? (darkCss ? pass("dark.css exists", "css") : fail("dark.css exists", "css", "file present", "missing"))
      : (darkCss ? fail("dark.css absent when lightDarkMode=light", "css", "missing", "file present") : pass("dark.css absent when lightDarkMode=light", "css")),
  );

  for (const [name, text] of [["light.css", lightCss], ["dark.css", darkCss]] as const) {
    if (text) {
      const bal = braceBalance(text);
      results.push(bal === 0 ? pass(`${name} braces balanced`, "css") : fail(`${name} braces balanced`, "css", "0", String(bal)));
    }
  }

  // Style Dictionary merge-bug regression guard (bug class #3): key sets
  // must match between modes, and a known-divergent token must actually
  // differ — a partial or total merge would show up as either.
  if (hasLight && hasDark && lightCss && darkCss) {
    const lightProps = extractCssProps(lightCss);
    const darkProps = extractCssProps(darkCss);
    const lightKeys = [...lightProps.keys()].sort().join(",");
    const darkKeys = [...darkProps.keys()].sort().join(",");
    results.push(
      lightKeys === darkKeys
        ? pass("light/dark semantic key sets match", "css")
        : fail("light/dark semantic key sets match", "css", "identical key sets", "sets differ", "possible Style Dictionary merge bug — one mode partially dropped"),
    );
    const key = "color-semantic-background-primary";
    if (lightProps.has(key) && darkProps.has(key)) {
      results.push(
        lightProps.get(key) !== darkProps.get(key)
          ? pass("light/dark background-primary values differ", "css")
          : fail("light/dark background-primary values differ", "css", "different values", `both = ${lightProps.get(key)}`, "possible Style Dictionary merge bug — dark inherited light's value"),
      );
    }
  }

  // Shadow $type polymorphism (bug class #2), checked at the CSS-transform
  // level independent of md3.ts: dimension-shaped shadows never contain
  // rgba(), composite-shaped shadows always do.
  if (tokensCss) {
    const m = tokensCss.match(/--shadow-sm:\s*([^;]+);/);
    if (m) {
      const expectComposite = isCompositeShadow(seed);
      const isComposite = /rgba?\(/.test(m[1]);
      results.push(
        isComposite === expectComposite
          ? pass("shadow.sm CSS shape matches shadowPreset", "css")
          : fail("shadow.sm CSS shape matches shadowPreset", "css", expectComposite ? "contains rgba()" : "no rgba()", m[1]),
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tailwind
// ---------------------------------------------------------------------------

// The old (100-1100) and new (50-950) ramp scales overlap at 100-900 — a
// property literally named "...-100" is NOT evidence of a missed relabel,
// since 100 is also the real relabeled value for the OLD step 200. The only
// unambiguous old-only value is 1100 (the top step, which has no relabeled
// target and is dropped entirely) — its presence is the one real signal
// that relabeling didn't happen.
const IMPOSSIBLE_POST_RELABEL_KEY = /^color-primitive-(brand(-secondary)?|neutral)-1100$/;

export function checkTailwind(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);
  const twDir = join(codeOutDir, "tailwind");

  // theme.css always exists regardless of lightDarkMode — light-only and
  // both-mode runs write it directly; a dark-only run still writes it (see
  // tailwind.ts's "dark-only project: no light run happened to emit
  // theme.css" branch) to carry the mode-independent groups.
  const theme = readIfExists(join(twDir, "theme.css"));
  if (!theme) {
    results.push(fail("theme.css exists", "tailwind", "file present", "missing"));
    return results;
  }
  results.push(pass("theme.css exists", "tailwind"));
  const bal = braceBalance(theme);
  results.push(bal === 0 ? pass("theme.css braces balanced", "tailwind") : fail("theme.css braces balanced", "tailwind", "0", String(bal)));

  const themeProps = extractCssProps(theme);
  const impossibleKeyFound = [...themeProps.keys()].find((k) => IMPOSSIBLE_POST_RELABEL_KEY.test(k));
  results.push(
    impossibleKeyFound
      ? fail("no impossible post-relabel '...-1100' key in theme.css", "tailwind", "none", impossibleKeyFound)
      : pass("no impossible post-relabel '...-1100' key in theme.css", "tailwind"),
  );
  results.push(
    themeProps.has("color-primitive-brand-950")
      ? pass("relabeled brand-950 (old 1100's target) present", "tailwind")
      : fail("relabeled brand-950 (old 1100's target) present", "tailwind", "present", "missing"),
  );
  results.push(
    themeProps.has("color-primitive-brand-500")
      ? pass("relabeled brand-500 (base step) present", "tailwind")
      : fail("relabeled brand-500 (base step) present", "tailwind", "present", "missing"),
  );

  // Cross-check the relabeled var's VALUE against the real primitive — only
  // the NAME should change, not the value (catches "renamed but not
  // re-sourced").
  const primitives = readPrimitives(tokensDir);
  const expectedHex = primitives.color.primitive.brand["600"].$value.toLowerCase();
  const actualHex = (themeProps.get("color-primitive-brand-500") ?? "").toLowerCase();
  results.push(
    actualHex === expectedHex
      ? pass("relabeled brand-500 value matches brand.600 primitive", "tailwind")
      : fail("relabeled brand-500 value matches brand.600 primitive", "tailwind", expectedHex, actualHex),
  );

  for (const [file, expected] of [
    ["theme-light.css", hasLight],
    ["theme-dark.css", hasDark],
  ] as const) {
    const text = readIfExists(join(twDir, file));
    results.push(
      expected
        ? (text ? pass(`${file} exists`, "tailwind") : fail(`${file} exists`, "tailwind", "file present", "missing"))
        : (text ? fail(`${file} absent`, "tailwind", "missing", "file present") : pass(`${file} absent`, "tailwind")),
    );
    if (text) {
      const b = braceBalance(text);
      results.push(b === 0 ? pass(`${file} braces balanced`, "tailwind") : fail(`${file} braces balanced`, "tailwind", "0", String(b)));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const BOOTSTRAP_LINE = /^\$[\w-]+:\s*(#[0-9A-Fa-f]{3,8}|[\d.]+rem);$/;

export function checkBootstrap(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const scss = readIfExists(join(codeOutDir, "bootstrap", "_variables.scss"));
  if (!scss) {
    results.push(fail("_variables.scss exists", "bootstrap", "file present", "missing"));
    return results;
  }
  results.push(pass("_variables.scss exists", "bootstrap"));

  const lines = scss.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
  const badLine = lines.find((l) => !BOOTSTRAP_LINE.test(l.trim()));
  results.push(
    badLine === undefined
      ? pass("every Sass line matches $name: value; shape", "bootstrap")
      : fail("every Sass line matches $name: value; shape", "bootstrap", "$name: #hex|N.NNNrem;", badLine.trim()),
  );

  results.push(scss.includes("$primary:") ? pass("$primary present", "bootstrap") : fail("$primary present", "bootstrap", "present", "missing"));
  // Bug class #4: $secondary present iff seed had a secondary color.
  const hasSecondaryColor = Boolean(seed.secondaryColor);
  const hasSecondaryVar = scss.includes("$secondary:");
  results.push(
    hasSecondaryVar === hasSecondaryColor
      ? pass("$secondary present iff secondaryColor supplied", "bootstrap")
      : fail("$secondary present iff secondaryColor supplied", "bootstrap", String(hasSecondaryColor), String(hasSecondaryVar)),
  );

  for (const name of ["$danger:", "$success:", "$warning:", "$info:"]) {
    results.push(scss.includes(name) ? pass(`${name} present`, "bootstrap") : fail(`${name} present`, "bootstrap", "present", "missing"));
  }

  // Recompute expected radius values independently and string-compare.
  const radiusPath = join(tokensDir, "radius.json");
  if (existsSync(radiusPath)) {
    const { radius } = JSON.parse(readFileSync(radiusPath, "utf-8")) as { radius: Record<string, { $value: string }> };
    const expectations: Array<[string, string]> = [
      ["$border-radius-sm:", pxToRem(radius.sm.$value)],
      ["$border-radius:", pxToRem(radius.md.$value)],
      ["$border-radius-lg:", pxToRem(radius.lg.$value)],
    ];
    for (const [varName, expected] of expectations) {
      const m = scss.match(new RegExp(`\\${varName}\\s*([\\d.]+rem);`));
      const actual = m?.[1];
      results.push(
        actual === expected
          ? pass(`${varName} value matches recomputed pxToRem`, "bootstrap")
          : fail(`${varName} value matches recomputed pxToRem`, "bootstrap", expected, actual ?? "missing"),
      );
    }
  }
  results.push(
    scss.includes("$border-radius-pill: 50rem;")
      ? pass("$border-radius-pill: 50rem; present verbatim", "bootstrap")
      : fail("$border-radius-pill: 50rem; present verbatim", "bootstrap", "present", "missing"),
  );

  return results;
}

// ---------------------------------------------------------------------------
// MD2 / MUI
// ---------------------------------------------------------------------------

export function checkMd2(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const muiDir = join(codeOutDir, "mui");
  const colorsPath = join(muiDir, "colors.ts");
  const palettePath = join(muiDir, "palette.ts");
  const colors = readIfExists(colorsPath);
  const palette = readIfExists(palettePath);

  results.push(colors ? pass("colors.ts exists", "md2") : fail("colors.ts exists", "md2", "file present", "missing"));
  results.push(palette ? pass("palette.ts exists", "md2") : fail("palette.ts exists", "md2", "file present", "missing"));
  if (!colors || !palette) return results;

  // Real typecheck — same invocation validated earlier this session.
  try {
    execFileSync(join(CLI_ROOT, "node_modules", ".bin", "tsc"), ["--noEmit", "--strict", "--target", "es2020", "--module", "esnext", "--typeRoots", "/nonexistent", colorsPath, palettePath], {
      stdio: "pipe",
    });
    results.push(pass("colors.ts + palette.ts typecheck (tsc --strict)", "md2"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push(fail("colors.ts + palette.ts typecheck (tsc --strict)", "md2", "no errors", "tsc reported errors", message.slice(0, 500)));
  }

  const brandMatch = colors.match(/export const brand = \{([\s\S]*?)\} as const;/);
  const keys = brandMatch ? [...brandMatch[1].matchAll(/^\s*(\d+):/gm)].map((m) => m[1]) : [];
  const expectedKeys = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  results.push(
    keys.join(",") === expectedKeys.join(",")
      ? pass("brand ramp has exactly the 10 relabeled 50-900 keys", "md2")
      : fail("brand ramp has exactly the 10 relabeled 50-900 keys", "md2", expectedKeys.join(","), keys.join(",")),
  );

  const hasSecondaryColor = Boolean(seed.secondaryColor);
  const hasSecondaryExport = /export const brandSecondary/.test(colors) && /secondary:\s*\{/.test(palette);
  results.push(
    hasSecondaryExport === hasSecondaryColor
      ? pass("brandSecondary/secondary present iff secondaryColor supplied", "md2")
      : fail("brandSecondary/secondary present iff secondaryColor supplied", "md2", String(hasSecondaryColor), String(hasSecondaryExport)),
  );

  const primitives = readPrimitives(tokensDir);
  const white = primitives.color.primitive.static["100"].$value.toUpperCase();
  const black = primitives.color.primitive.static["200"].$value.toUpperCase();
  const contrastTextValues = [...palette.matchAll(/contrastText:\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
  const badContrast = contrastTextValues.find((v) => v !== white && v !== black);
  results.push(
    contrastTextValues.length > 0 && badContrast === undefined
      ? pass("every contrastText is exactly static.100 or static.200", "md2")
      : badContrast
        ? fail("every contrastText is exactly static.100 or static.200", "md2", `${white} or ${black}`, badContrast)
        : skip("every contrastText is exactly static.100 or static.200", "md2", "no contrastText values found"),
  );

  return results;
}

// ---------------------------------------------------------------------------
// MD3 / Jetpack Compose
// ---------------------------------------------------------------------------

const COLOR_SCHEME_ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "inversePrimary",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "background", "onBackground",
  "surface", "onSurface", "surfaceVariant", "onSurfaceVariant", "surfaceTint",
  "inverseSurface", "inverseOnSurface",
  "error", "onError", "errorContainer", "onErrorContainer",
  "outline", "outlineVariant",
  "scrim",
  "surfaceBright", "surfaceDim",
  "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest", "surfaceContainerLow", "surfaceContainerLowest",
  "primaryFixed", "primaryFixedDim", "onPrimaryFixed", "onPrimaryFixedVariant",
  "secondaryFixed", "secondaryFixedDim", "onSecondaryFixed", "onSecondaryFixedVariant",
  "tertiaryFixed", "tertiaryFixedDim", "onTertiaryFixed", "onTertiaryFixedVariant",
];

function checkColorSchemeBlock(kotlin: string, valName: string, results: CheckResult[]): void {
  const m = kotlin.match(new RegExp(`val ${valName} = ColorScheme\\(([\\s\\S]*?)\\n\\)`));
  if (!m) {
    results.push(fail(`${valName} block present`, "md3", "present", "missing"));
    return;
  }
  results.push(pass(`${valName} block present`, "md3"));
  const body = m[1];
  const colorArgs = [...body.matchAll(/= Color\(0xFF([0-9A-Fa-f]{6})\)/g)];
  results.push(
    colorArgs.length === 48
      ? pass(`${valName} has exactly 48 Color(...) args`, "md3")
      : fail(`${valName} has exactly 48 Color(...) args`, "md3", "48", String(colorArgs.length)),
  );
  const roleNames = [...body.matchAll(/^\s*(\w+) = Color/gm)].map((m2) => m2[1]);
  const missing = COLOR_SCHEME_ROLES.filter((r) => !roleNames.includes(r));
  const dupes = roleNames.filter((r, i) => roleNames.indexOf(r) !== i);
  results.push(
    missing.length === 0 && dupes.length === 0
      ? pass(`${valName} has every ColorScheme role exactly once`, "md3")
      : fail(`${valName} has every ColorScheme role exactly once`, "md3", "all 48 roles, no dupes", `missing=[${missing}] dupes=[${dupes}]`),
  );
  const badHex = colorArgs.find(([, hex]) => hex.length !== 6);
  results.push(badHex === undefined ? pass(`${valName} every hex is valid 6-digit`, "md3") : fail(`${valName} every hex is valid 6-digit`, "md3", "6 hex digits", badHex[0]));
}

export function checkMd3(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];

  // Bug class #5: the material-color-utilities version pin regression.
  try {
    const pkgPath = join(CLI_ROOT, "node_modules", "@material", "material-color-utilities", "package.json");
    if (existsSync(pkgPath)) {
      const { version } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
      results.push(
        version.startsWith("0.3.")
          ? pass("material-color-utilities pinned to 0.3.x", "md3")
          : fail("material-color-utilities pinned to 0.3.x", "md3", "0.3.x", version, "KNOWN REGRESSION RISK: 0.4.0 has a real ESM import bug — see md3.ts header"),
      );
    }
  } catch {
    // non-fatal — the generation attempt below will surface any real problem
  }

  const kotlin = readIfExists(join(codeOutDir, "md3", "Color.kt"));
  if (!kotlin) {
    results.push(fail("Color.kt exists", "md3", "file present", "missing"));
    return results;
  }
  results.push(pass("Color.kt exists", "md3"));

  const pBal = parenBalance(kotlin);
  results.push(pBal === 0 ? pass("Color.kt parens balanced", "md3") : fail("Color.kt parens balanced", "md3", "0", String(pBal)));
  const bBal = braceBalance(kotlin);
  results.push(bBal === 0 ? pass("Color.kt braces balanced", "md3") : fail("Color.kt braces balanced", "md3", "0", String(bBal)));

  checkColorSchemeBlock(kotlin, "LightColorScheme", results);
  checkColorSchemeBlock(kotlin, "DarkColorScheme", results);

  // Bug class #2's central assertion: elevation overlay present iff the
  // shadow preset is dimension-shaped (md3/md2), absent for composite
  // (tailwind/bootstrap) — never approximated.
  const shadowTypes = readShadowTypes(tokensDir);
  const expectOverlay = shadowTypes !== null && Object.values(shadowTypes).every((t) => t === "dimension");
  const hasOverlay = kotlin.includes("object ElevationOverlay");
  results.push(
    hasOverlay === expectOverlay
      ? pass("ElevationOverlay present iff shadow.json is dimension-shaped", "md3")
      : fail("ElevationOverlay present iff shadow.json is dimension-shaped", "md3", String(expectOverlay), String(hasOverlay)),
  );
  if (hasOverlay) {
    const valCount = (kotlin.match(/val (sm|md|lg|xl|xxl) = Color/g) ?? []).length;
    results.push(valCount === 10 ? pass("ElevationOverlay has exactly 10 val lines (5 keys x Light/Dark)", "md3") : fail("ElevationOverlay has exactly 10 val lines (5 keys x Light/Dark)", "md3", "10", String(valCount)));
    results.push(
      !/val 2xl/.test(kotlin) ? pass("no illegal 'val 2xl' identifier (renamed to xxl)", "md3") : fail("no illegal 'val 2xl' identifier (renamed to xxl)", "md3", "xxl", "2xl"),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// SwiftUI
// ---------------------------------------------------------------------------

let swiftcAvailable: boolean | null = null;
function hasSwiftc(): boolean {
  if (swiftcAvailable !== null) return swiftcAvailable;
  try {
    execFileSync("which", ["swiftc"], { stdio: "pipe" });
    swiftcAvailable = true;
  } catch {
    swiftcAvailable = false;
  }
  return swiftcAvailable;
}

export function checkSwiftui(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);
  const swiftPath = join(codeOutDir, "swiftui", "DesignTokens.swift");
  const swift = readIfExists(swiftPath);
  if (!swift) {
    results.push(fail("DesignTokens.swift exists", "swiftui", "file present", "missing"));
    return results;
  }
  results.push(pass("DesignTokens.swift exists", "swiftui"));

  const bBal = braceBalance(swift);
  results.push(bBal === 0 ? pass("DesignTokens.swift braces balanced", "swiftui") : fail("DesignTokens.swift braces balanced", "swiftui", "0", String(bBal)));
  const pBal = parenBalance(swift);
  results.push(pBal === 0 ? pass("DesignTokens.swift parens balanced", "swiftui") : fail("DesignTokens.swift parens balanced", "swiftui", "0", String(pBal)));

  results.push(
    hasLight === swift.includes("enum Light")
      ? pass("Light namespace present iff color.semantic.light.json exists", "swiftui")
      : fail("Light namespace present iff color.semantic.light.json exists", "swiftui", String(hasLight), String(swift.includes("enum Light"))),
  );
  results.push(
    hasDark === swift.includes("enum Dark")
      ? pass("Dark namespace present iff color.semantic.dark.json exists", "swiftui")
      : fail("Dark namespace present iff color.semantic.dark.json exists", "swiftui", String(hasDark), String(swift.includes("enum Dark"))),
  );

  const hasSecondaryColor = Boolean(seed.secondaryColor);
  const hasActionSecondary = /actionSecondary\w* = Color/.test(swift);
  results.push(
    hasActionSecondary === hasSecondaryColor
      ? pass("actionSecondary* present iff secondaryColor supplied", "swiftui")
      : fail("actionSecondary* present iff secondaryColor supplied", "swiftui", String(hasSecondaryColor), String(hasActionSecondary)),
  );

  const floats = [...swift.matchAll(/(?:red|green|blue|opacity):\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  const outOfRange = floats.find((f) => !Number.isFinite(f) || f < 0 || f > 1);
  results.push(
    floats.length > 0 && outOfRange === undefined
      ? pass("every color component is finite and in [0,1]", "swiftui")
      : outOfRange !== undefined
        ? fail("every color component is finite and in [0,1]", "swiftui", "[0,1]", String(outOfRange))
        : skip("every color component is finite and in [0,1]", "swiftui", "no color components found"),
  );

  if (hasSwiftc()) {
    try {
      const sdk = execFileSync("xcrun", ["--show-sdk-path"], { encoding: "utf-8" }).trim();
      execFileSync("swiftc", ["-typecheck", "-sdk", sdk, swiftPath], { stdio: "pipe" });
      results.push(pass("DesignTokens.swift typechecks (swiftc -typecheck)", "swiftui"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push(fail("DesignTokens.swift typechecks (swiftc -typecheck)", "swiftui", "no errors", "swiftc reported errors", message.slice(0, 500)));
    }
  } else {
    results.push(skip("DesignTokens.swift typechecks (swiftc -typecheck)", "swiftui", "swiftc not found on PATH"));
  }

  return results;
}

// ---------------------------------------------------------------------------
// shadcn/ui (Layer 2, slice 1 — see generate/shadcn.ts)
// ---------------------------------------------------------------------------

// Var names hardcoded here rather than imported from shadcn.ts — same
// discipline as checkBootstrap/checkMd2 above, so a check verifies the
// generator's actual output against the documented contract, not against
// its own source agreeing with itself.
const SHADCN_CORE_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--muted",
  "--muted-foreground",
];

const SHADCN_STATUS_EXTRA_VARS = ["--success", "--success-foreground", "--warning", "--warning-foreground", "--info", "--info-foreground", "--promo", "--promo-foreground"];

// theme.css holds both blocks in one file (unlike the base CSS platform's
// separate light.css/dark.css), so extractCssProps needs each block
// isolated first — otherwise a shared var name in both blocks would
// collapse to whichever match comes last.
function splitRootAndDark(css: string): { root: string; dark: string | null } {
  const darkIdx = css.indexOf(".dark {");
  if (darkIdx === -1) return { root: css, dark: null };
  return { root: css.slice(0, darkIdx), dark: css.slice(darkIdx) };
}

export function checkShadcn(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);
  const cssPath = join(codeOutDir, "shadcn", "theme.css");
  const css = readIfExists(cssPath);
  if (!css) {
    results.push(fail("shadcn/theme.css exists", "shadcn", "file present", "missing"));
    return results;
  }
  results.push(pass("shadcn/theme.css exists", "shadcn"));

  const bBal = braceBalance(css);
  results.push(bBal === 0 ? pass("theme.css braces balanced", "shadcn") : fail("theme.css braces balanced", "shadcn", "0", String(bBal)));

  const hasDarkBlock = css.includes(".dark {");
  results.push(
    hasDarkBlock === hasDark
      ? pass(".dark block present iff color.semantic.dark.json exists", "shadcn")
      : fail(".dark block present iff color.semantic.dark.json exists", "shadcn", String(hasDark), String(hasDarkBlock)),
  );

  const { root, dark } = splitRootAndDark(css);
  const rootProps = extractCssProps(root);
  const darkProps = dark ? extractCssProps(dark) : null;

  results.push(
    rootProps.has("radius")
      ? pass("--radius present in :root", "shadcn")
      : fail("--radius present in :root", "shadcn", "present", "missing"),
  );

  // :root only carries color values when a light mode exists (see
  // generate/shadcn.ts's file header) — a dark-only project's :root
  // intentionally has just --radius.
  const colorBlocks: Array<{ label: string; props: Map<string, string> | null }> = [];
  if (hasLight) colorBlocks.push({ label: ":root", props: rootProps });
  if (hasDark) colorBlocks.push({ label: ".dark", props: darkProps });

  for (const { label, props } of colorBlocks) {
    for (const name of SHADCN_CORE_VARS) {
      const key = name.slice(2);
      results.push(
        props?.has(key)
          ? pass(`${name} present in ${label}`, "shadcn")
          : fail(`${name} present in ${label}`, "shadcn", "present", "missing"),
      );
    }
    for (const name of SHADCN_STATUS_EXTRA_VARS) {
      const key = name.slice(2);
      results.push(
        props?.has(key)
          ? pass(`${name} present in ${label}`, "shadcn")
          : fail(`${name} present in ${label}`, "shadcn", "present", "missing"),
      );
    }
  }

  // Bug class #4 (same as checkBootstrap): --secondary/--secondary-foreground
  // present iff the seed supplied a secondary brand color.
  const hasSecondaryColor = Boolean(seed.secondaryColor);
  for (const { label, props } of colorBlocks) {
    const hasSecondaryVar = props?.has("secondary") ?? false;
    results.push(
      hasSecondaryVar === hasSecondaryColor
        ? pass(`--secondary present in ${label} iff secondaryColor supplied`, "shadcn")
        : fail(`--secondary present in ${label} iff secondaryColor supplied`, "shadcn", String(hasSecondaryColor), String(hasSecondaryVar)),
    );
  }

  // Same light/dark-divergence guard as checkCss — catches a resolution/
  // merge bug where dark silently inherited light's value.
  if (hasLight && hasDark && rootProps.has("background") && darkProps?.has("background")) {
    results.push(
      rootProps.get("background") !== darkProps.get("background")
        ? pass("light/dark --background values differ", "shadcn")
        : fail("light/dark --background values differ", "shadcn", "different values", `both = ${rootProps.get("background")}`, "possible light/dark resolution bug"),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// React Native Reusables (RNR) (Layer 2, slice 2 — see generate/rnr.ts)
// ---------------------------------------------------------------------------

// Same list as shadcn's, minus --destructive-foreground — RNR's own real
// file has no foreground pair for destructive (see generate/rnr.ts header).
const RNR_CORE_VARS = ["--background", "--foreground", "--card", "--card-foreground", "--popover", "--popover-foreground", "--primary", "--primary-foreground", "--accent", "--accent-foreground", "--destructive", "--border", "--input", "--ring", "--muted", "--muted-foreground"];

// A raw "H S% L%" triplet, no hsl() wrapper — e.g. "0 0% 100%" or
// "220 70% 50.5%". Anchored so a stray hex/oklch value would fail to match.
const HSL_TRIPLET = /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/;

function splitRootAndDarkRnr(css: string): { root: string; dark: string | null } {
  const darkIdx = css.indexOf(".dark:root {");
  if (darkIdx === -1) return { root: css, dark: null };
  return { root: css.slice(0, darkIdx), dark: css.slice(darkIdx) };
}

export function checkRnr(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);

  const cssPath = join(codeOutDir, "rnr", "global.css");
  const css = readIfExists(cssPath);
  if (!css) {
    results.push(fail("rnr/global.css exists", "rnr", "file present", "missing"));
    return results;
  }
  results.push(pass("rnr/global.css exists", "rnr"));

  const bBal = braceBalance(css);
  results.push(bBal === 0 ? pass("global.css braces balanced", "rnr") : fail("global.css braces balanced", "rnr", "0", String(bBal)));

  const hasDarkBlock = css.includes(".dark:root {");
  results.push(
    hasDarkBlock === hasDark
      ? pass(".dark:root block present iff color.semantic.dark.json exists", "rnr")
      : fail(".dark:root block present iff color.semantic.dark.json exists", "rnr", String(hasDark), String(hasDarkBlock)),
  );

  const { root, dark } = splitRootAndDarkRnr(css);
  const rootProps = extractCssProps(root);
  const darkProps = dark ? extractCssProps(dark) : null;

  results.push(rootProps.has("radius") ? pass("--radius present in :root", "rnr") : fail("--radius present in :root", "rnr", "present", "missing"));

  const colorBlocks: Array<{ label: string; props: Map<string, string> | null }> = [];
  if (hasLight) colorBlocks.push({ label: ":root", props: rootProps });
  if (hasDark) colorBlocks.push({ label: ".dark:root", props: darkProps });

  for (const { label, props } of colorBlocks) {
    for (const name of RNR_CORE_VARS) {
      const key = name.slice(2);
      results.push(props?.has(key) ? pass(`${name} present in ${label}`, "rnr") : fail(`${name} present in ${label}`, "rnr", "present", "missing"));
    }
    // Every present color value must be a raw HSL triplet, not hex/oklch —
    // this is the actual bug class this generator exists to avoid (see
    // generate/rnr.ts's file header on why hex breaks NativeWind's hsl()
    // wrapper).
    const nonTriplet = [...(props?.entries() ?? [])].filter(([k]) => k !== "radius").find(([, v]) => !HSL_TRIPLET.test(v));
    results.push(
      nonTriplet === undefined
        ? pass(`every color value in ${label} is a raw HSL triplet`, "rnr")
        : fail(`every color value in ${label} is a raw HSL triplet`, "rnr", "H S% L%", `--${nonTriplet[0]}: ${nonTriplet[1]}`),
    );
  }

  const hasSecondaryColor = Boolean(seed.secondaryColor);
  for (const { label, props } of colorBlocks) {
    const hasSecondaryVar = props?.has("secondary") ?? false;
    results.push(
      hasSecondaryVar === hasSecondaryColor
        ? pass(`--secondary present in ${label} iff secondaryColor supplied`, "rnr")
        : fail(`--secondary present in ${label} iff secondaryColor supplied`, "rnr", String(hasSecondaryColor), String(hasSecondaryVar)),
    );
  }

  if (hasLight && hasDark && rootProps.has("background") && darkProps?.has("background")) {
    results.push(
      rootProps.get("background") !== darkProps.get("background")
        ? pass("light/dark --background values differ", "rnr")
        : fail("light/dark --background values differ", "rnr", "different values", `both = ${rootProps.get("background")}`, "possible light/dark resolution bug"),
    );
  }

  const tsPath = join(codeOutDir, "rnr", "constants.ts");
  const ts = readIfExists(tsPath);
  if (!ts) {
    results.push(fail("rnr/constants.ts exists", "rnr", "file present", "missing"));
    return results;
  }
  results.push(pass("rnr/constants.ts exists", "rnr"));

  const NAV_KEYS = ["primary", "background", "card", "text", "border", "notification"];
  for (const mode of ["light", "dark"] as const) {
    const expected = mode === "light" ? hasLight : hasDark;
    const blockMatch = ts.match(new RegExp(`${mode}: \\{([^}]*)\\}`));
    const present = Boolean(blockMatch);
    results.push(
      present === expected
        ? pass(`NAV_THEME.${mode} present iff color.semantic.${mode}.json exists`, "rnr")
        : fail(`NAV_THEME.${mode} present iff color.semantic.${mode}.json exists`, "rnr", String(expected), String(present)),
    );
    if (blockMatch) {
      const missingKey = NAV_KEYS.find((k) => !blockMatch[1].includes(`${k}:`));
      results.push(
        missingKey === undefined
          ? pass(`NAV_THEME.${mode} has all 6 React Navigation Theme.colors keys`, "rnr")
          : fail(`NAV_THEME.${mode} has all 6 React Navigation Theme.colors keys`, "rnr", NAV_KEYS.join(","), `missing ${missingKey}`),
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// React Native Paper (Layer 2, slice 2 — see generate/rn-paper.ts)
// ---------------------------------------------------------------------------

// Paper's real MD3Theme.colors subset (hardcoded here, not imported from
// rn-paper.ts — same discipline as every other checker in this file).
const PAPER_CORE_ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "error", "onError", "errorContainer", "onErrorContainer",
  "background", "onBackground",
  "surface", "onSurface", "surfaceVariant", "onSurfaceVariant",
  "outline", "outlineVariant",
  "inverseSurface", "inverseOnSurface", "inversePrimary",
  "scrim",
];
const PAPER_EXTRA_KEYS = ["shadow", "surfaceDisabled", "onSurfaceDisabled", "backdrop", "elevation"];
const PAPER_ELEVATION_LEVELS = ["level0", "level1", "level2", "level3", "level4", "level5"];

export function checkRnPaper(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);

  const tsPath = join(codeOutDir, "rn-paper", "theme.ts");
  const ts = readIfExists(tsPath);
  if (!ts) {
    results.push(fail("rn-paper/theme.ts exists", "rn-paper", "file present", "missing"));
    return results;
  }
  results.push(pass("rn-paper/theme.ts exists", "rn-paper"));

  const bBal = braceBalance(ts);
  results.push(bBal === 0 ? pass("theme.ts braces balanced", "rn-paper") : fail("theme.ts braces balanced", "rn-paper", "0", String(bBal)));

  for (const [themeName, expected] of [["LightTheme", hasLight], ["DarkTheme", hasDark]] as const) {
    const present = ts.includes(`export const ${themeName} =`);
    results.push(
      present === expected
        ? pass(`${themeName} present iff its color.semantic.<mode>.json exists`, "rn-paper")
        : fail(`${themeName} present iff its color.semantic.<mode>.json exists`, "rn-paper", String(expected), String(present)),
    );
  }

  // Check each present theme block contains every expected key — extract
  // the block from `export const <Name> = {` to the next `export const` or
  // end of file (simple, no nested-brace parsing needed at this depth).
  for (const [themeName, expected] of [["LightTheme", hasLight], ["DarkTheme", hasDark]] as const) {
    if (!expected) continue;
    const start = ts.indexOf(`export const ${themeName} =`);
    const nextExport = ts.indexOf("export const", start + 1);
    const block = nextExport === -1 ? ts.slice(start) : ts.slice(start, nextExport);

    const missingRole = PAPER_CORE_ROLES.find((r) => !block.includes(`${r}: '#`));
    results.push(
      missingRole === undefined
        ? pass(`${themeName} has every Paper MD3Theme.colors core role`, "rn-paper")
        : fail(`${themeName} has every Paper MD3Theme.colors core role`, "rn-paper", "present", `missing ${missingRole}`),
    );

    const missingExtra = PAPER_EXTRA_KEYS.find((k) => !block.includes(`${k}:`));
    results.push(
      missingExtra === undefined
        ? pass(`${themeName} has shadow/surfaceDisabled/onSurfaceDisabled/backdrop/elevation`, "rn-paper")
        : fail(`${themeName} has shadow/surfaceDisabled/onSurfaceDisabled/backdrop/elevation`, "rn-paper", "present", `missing ${missingExtra}`),
    );

    const missingLevel = PAPER_ELEVATION_LEVELS.find((l) => !block.includes(`${l}:`));
    results.push(
      missingLevel === undefined
        ? pass(`${themeName}.elevation has all 6 levels`, "rn-paper")
        : fail(`${themeName}.elevation has all 6 levels`, "rn-paper", "present", `missing ${missingLevel}`),
    );

    results.push(
      block.includes("shadow: '#000000'")
        ? pass(`${themeName}.shadow is fixed pure black`, "rn-paper")
        : fail(`${themeName}.shadow is fixed pure black`, "rn-paper", "#000000", "different value"),
    );
  }

  // Same light/dark-divergence guard as every other checker here. Anchored
  // to `export const <Name>Theme =`, not a bare "LightTheme"/"DarkTheme"
  // substring match — both also appear inside the file's own import line
  // (`MD3LightTheme as DefaultLightTheme, MD3DarkTheme as ...`), which sits
  // BEFORE both export blocks. An unanchored match against "DarkTheme"
  // would start searching from that import line and pick up LightTheme's
  // own background value first — caught by actually running this checker
  // against the QA matrix and seeing every both-modes case "fail" despite
  // the real generated file visibly having two different values.
  if (hasLight && hasDark) {
    const lightBg = ts.match(/export const LightTheme[\s\S]*?\bbackground: '(#[0-9A-Fa-f]{6})'/)?.[1];
    const darkBg = ts.match(/export const DarkTheme[\s\S]*?\bbackground: '(#[0-9A-Fa-f]{6})'/)?.[1];
    results.push(
      lightBg !== undefined && darkBg !== undefined && lightBg !== darkBg
        ? pass("light/dark background values differ", "rn-paper")
        : fail("light/dark background values differ", "rn-paper", "different values", `light=${lightBg}, dark=${darkBg}`, "possible HCT scheme computation bug"),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Vuetify (Layer 2, slice 2 — see generate/vuetify.ts)
// ---------------------------------------------------------------------------

const VUETIFY_STATUS_NAMES = ["error", "success", "warning", "info"];

export function checkVuetify(tokensDir: string, codeOutDir: string, seed: SeedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const { hasLight, hasDark } = modeExpectations(seed);

  const tsPath = join(codeOutDir, "vuetify", "theme.ts");
  const ts = readIfExists(tsPath);
  if (!ts) {
    results.push(fail("vuetify/theme.ts exists", "vuetify", "file present", "missing"));
    return results;
  }
  results.push(pass("vuetify/theme.ts exists", "vuetify"));

  const bBal = braceBalance(ts);
  results.push(bBal === 0 ? pass("theme.ts braces balanced", "vuetify") : fail("theme.ts braces balanced", "vuetify", "0", String(bBal)));

  for (const [themeName, expected] of [["lightTheme", hasLight], ["darkTheme", hasDark]] as const) {
    const present = ts.includes(`export const ${themeName} =`);
    results.push(
      present === expected
        ? pass(`${themeName} present iff its color.semantic.<mode>.json exists`, "vuetify")
        : fail(`${themeName} present iff its color.semantic.<mode>.json exists`, "vuetify", String(expected), String(present)),
    );
  }

  results.push(
    !ts.includes("export const lightTheme =") || ts.includes("dark: false,")
      ? pass("lightTheme has dark: false", "vuetify")
      : fail("lightTheme has dark: false", "vuetify", "dark: false", "missing/wrong"),
  );
  results.push(
    !ts.includes("export const darkTheme =") || ts.includes("dark: true,")
      ? pass("darkTheme has dark: true", "vuetify")
      : fail("darkTheme has dark: true", "vuetify", "dark: true", "missing/wrong"),
  );

  for (const [themeName, expected] of [["lightTheme", hasLight], ["darkTheme", hasDark]] as const) {
    if (!expected) continue;
    const start = ts.indexOf(`export const ${themeName} =`);
    const nextExport = ts.indexOf("export const", start + 1);
    const block = nextExport === -1 ? ts.slice(start) : ts.slice(start, nextExport);

    results.push(block.includes("primary:") ? pass(`${themeName} has primary`, "vuetify") : fail(`${themeName} has primary`, "vuetify", "present", "missing"));
    results.push(block.includes("background:") ? pass(`${themeName} has background`, "vuetify") : fail(`${themeName} has background`, "vuetify", "present", "missing"));
    results.push(block.includes("surface:") ? pass(`${themeName} has surface`, "vuetify") : fail(`${themeName} has surface`, "vuetify", "present", "missing"));

    const missingStatus = VUETIFY_STATUS_NAMES.find((s) => !block.includes(`${s}:`));
    results.push(
      missingStatus === undefined
        ? pass(`${themeName} has error/success/warning/info`, "vuetify")
        : fail(`${themeName} has error/success/warning/info`, "vuetify", "present", `missing ${missingStatus}`),
    );

    const hasSecondaryColor = Boolean(seed.secondaryColor);
    const hasSecondaryVar = block.includes("secondary:");
    results.push(
      hasSecondaryVar === hasSecondaryColor
        ? pass(`${themeName} has secondary iff secondaryColor supplied`, "vuetify")
        : fail(`${themeName} has secondary iff secondaryColor supplied`, "vuetify", String(hasSecondaryColor), String(hasSecondaryVar)),
    );
  }

  // Same light/dark-divergence guard as every other checker here — anchored
  // to `export const <name>Theme =`, same lesson learned from checkRnPaper.
  if (hasLight && hasDark) {
    const lightBg = ts.match(/export const lightTheme[\s\S]*?\bbackground: '(#[0-9A-Fa-f]{6})'/)?.[1];
    const darkBg = ts.match(/export const darkTheme[\s\S]*?\bbackground: '(#[0-9A-Fa-f]{6})'/)?.[1];
    results.push(
      lightBg !== undefined && darkBg !== undefined && lightBg !== darkBg
        ? pass("light/dark background values differ", "vuetify")
        : fail("light/dark background values differ", "vuetify", "different values", `light=${lightBg}, dark=${darkBg}`, "possible resolution bug"),
    );
  }

  return results;
}
