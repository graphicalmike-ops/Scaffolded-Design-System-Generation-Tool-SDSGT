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
