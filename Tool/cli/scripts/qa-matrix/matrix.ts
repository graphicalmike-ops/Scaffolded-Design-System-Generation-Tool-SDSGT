// The QA matrix's seed cases — 30 total, deliberately bounded (see
// /Users/migjulio/.claude/plans/now-build-a-test-distributed-taco.md for the
// full reasoning). No fs/child_process orchestration here beyond reading the
// two static example seed files verbatim for the baseline group — --list/
// --dry-run stay side-effect-free (no generate/promote runs happen from
// importing this file).
//
// Groups:
// - core (16): targetDesignLanguage x lightDarkMode x secondary-present x
//   neutralColorStyle, pairwise-covered via a 4x4 grid rather than the full
//   4x3x2x2=48 factorial — every row/column spans all 3 lightDarkMode
//   values, covering all 6 factor-pairs in 16 cases.
// - achromatic (4): #808080 (zero saturation) on primary/secondary/both —
//   regression coverage for the hue formula bug already fixed once in
//   src/color/hsl.ts, now also exercised through md3.ts's own HCT math.
// - mismatch (6): presets mixed against targetDesignLanguage. Originally
//   built around shadowPreset's two token shapes (composite vs. bare
//   elevation dp); since the MD3/MD2 shadow presets were removed
//   (2026-10-21) every shadow is composite, and these cases now cover
//   cross-language mixes of the remaining presets.
// - baseline (2): the real files in examples/, read verbatim.
// - boundary (2): pure black/white primary — a lightness-extreme case
//   distinct from the achromatic (zero-saturation) bug class.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { SeedConfig, DesignLanguage } from "../../src/types/seed-config.ts";
import type { QaCase } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

function loadExampleSeed(filename: string): SeedConfig {
  return JSON.parse(readFileSync(join(CLI_ROOT, "examples", filename), "utf-8")) as SeedConfig;
}

// Defaults every preset to match targetDesignLanguage (the "matched" case) —
// override individual preset fields explicitly to build a mismatch.
function seed(
  lang: DesignLanguage,
  fields: Partial<SeedConfig> & Pick<SeedConfig, "primaryColor" | "neutralColorStyle" | "lightDarkMode">,
): SeedConfig {
  return {
    scaffoldMode: "files-only",
    targetFramework: "nextjs",
    targetDesignLanguage: lang,
    figmaManaged: false,
    primaryFont: "Inter",
    typeScalePreset: lang,
    spacingPreset: lang,
    radiusPreset: lang,
    opacityPreset: lang === "bootstrap" ? "bootstrap" : "tailwind",
    // MD3/MD2 shadow presets were removed 2026-10-21 — Material languages
    // get the Tailwind shadow preset, same as the setup form suggests.
    shadowPreset: lang === "bootstrap" ? "bootstrap" : "tailwind",
    ...fields,
  };
}

function core(): QaCase[] {
  return [
    { id: "CORE-A1", group: "core", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "light", primaryColor: "#2563EB", secondaryColor: "#F97316", neutralColorStyle: "brand-tinted", primaryFont: "Inter", secondaryFont: "Source Sans Pro" }) },
    { id: "CORE-A2", group: "core", seed: seed("tailwind", { targetFramework: "vuejs", lightDarkMode: "dark", primaryColor: "#10B981", secondaryColor: "#EC4899", neutralColorStyle: "pure-gray", primaryFont: "Inter", secondaryFont: "Poppins" }) },
    { id: "CORE-A3", group: "core", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#6366F1", neutralColorStyle: "brand-tinted", primaryFont: "Roboto" }) },
    { id: "CORE-A4", group: "core", seed: seed("tailwind", { targetFramework: "vuejs", lightDarkMode: "light", primaryColor: "#EF4444", neutralColorStyle: "pure-gray", primaryFont: "Nunito" }) },

    { id: "CORE-B1", group: "core", seed: seed("bootstrap", { targetFramework: "nextjs", lightDarkMode: "dark", primaryColor: "#0D6EFD", secondaryColor: "#6F42C1", neutralColorStyle: "brand-tinted", primaryFont: "Source Sans Pro", secondaryFont: "Inter" }) },
    { id: "CORE-B2", group: "core", seed: seed("bootstrap", { targetFramework: "vuejs", lightDarkMode: "both", primaryColor: "#198754", secondaryColor: "#FD7E14", neutralColorStyle: "pure-gray", primaryFont: "Roboto", secondaryFont: "Montserrat" }) },
    { id: "CORE-B3", group: "core", seed: seed("bootstrap", { targetFramework: "nextjs", lightDarkMode: "light", primaryColor: "#DC3545", neutralColorStyle: "brand-tinted", primaryFont: "Nunito" }) },
    { id: "CORE-B4", group: "core", seed: seed("bootstrap", { targetFramework: "vuejs", lightDarkMode: "dark", primaryColor: "#20C997", neutralColorStyle: "pure-gray", primaryFont: "Inter" }) },

    { id: "CORE-C1", group: "core", seed: seed("md3", { targetFramework: "kotlin", lightDarkMode: "both", primaryColor: "#8B5CF6", secondaryColor: "#F59E0B", neutralColorStyle: "brand-tinted", primaryFont: "Roboto", secondaryFont: "Noto Sans" }) },
    { id: "CORE-C2", group: "core", seed: seed("md3", { targetFramework: "swiftui", lightDarkMode: "light", primaryColor: "#06B6D4", secondaryColor: "#F43F5E", neutralColorStyle: "pure-gray", primaryFont: "Roboto", secondaryFont: "Inter" }) },
    { id: "CORE-C3", group: "core", seed: seed("md3", { targetFramework: "kotlin", lightDarkMode: "dark", primaryColor: "#7C3AED", neutralColorStyle: "brand-tinted", primaryFont: "Roboto" }) },
    { id: "CORE-C4", group: "core", seed: seed("md3", { targetFramework: "swiftui", lightDarkMode: "both", primaryColor: "#14B8A6", neutralColorStyle: "pure-gray", primaryFont: "Roboto" }) },

    { id: "CORE-D1", group: "core", seed: seed("md2", { targetFramework: "nextjs", lightDarkMode: "light", primaryColor: "#3F51B5", secondaryColor: "#FF4081", neutralColorStyle: "brand-tinted", primaryFont: "Roboto", secondaryFont: "Inter" }) },
    { id: "CORE-D2", group: "core", seed: seed("md2", { targetFramework: "vuejs", lightDarkMode: "dark", primaryColor: "#009688", secondaryColor: "#FFC107", neutralColorStyle: "pure-gray", primaryFont: "Roboto", secondaryFont: "Nunito" }) },
    { id: "CORE-D3", group: "core", seed: seed("md2", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#9C27B0", neutralColorStyle: "brand-tinted", primaryFont: "Roboto" }) },
    { id: "CORE-D4", group: "core", seed: seed("md2", { targetFramework: "vuejs", lightDarkMode: "dark", primaryColor: "#F44336", neutralColorStyle: "pure-gray", primaryFont: "Roboto" }) },
  ];
}

function achromatic(): QaCase[] {
  return [
    { id: "ACH-1", group: "achromatic", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#808080", neutralColorStyle: "brand-tinted" }) },
    { id: "ACH-2", group: "achromatic", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#808080", neutralColorStyle: "pure-gray" }) },
    { id: "ACH-3", group: "achromatic", seed: seed("md3", { targetFramework: "swiftui", lightDarkMode: "both", primaryColor: "#2563EB", secondaryColor: "#808080", neutralColorStyle: "brand-tinted" }) },
    { id: "ACH-4", group: "achromatic", seed: seed("md3", { targetFramework: "swiftui", lightDarkMode: "both", primaryColor: "#808080", secondaryColor: "#808080", neutralColorStyle: "pure-gray" }) },
  ];
}

function mismatch(): QaCase[] {
  return [
    // Tailwind project with Bootstrap shadows.
    { id: "MIS-1", group: "mismatch", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#2563EB", secondaryColor: "#F97316", neutralColorStyle: "brand-tinted", shadowPreset: "bootstrap" }) },
    // MD3 project with Tailwind shadows (the setup form's suggestion).
    { id: "MIS-2", group: "mismatch", seed: seed("md3", { targetFramework: "swiftui", lightDarkMode: "both", primaryColor: "#8B5CF6", secondaryColor: "#F59E0B", neutralColorStyle: "pure-gray", shadowPreset: "tailwind" }) },
    // Bootstrap project with Tailwind shadows.
    { id: "MIS-3", group: "mismatch", seed: seed("bootstrap", { targetFramework: "vuejs", lightDarkMode: "light", primaryColor: "#0D6EFD", neutralColorStyle: "brand-tinted", shadowPreset: "tailwind" }) },
    // MD2 project with Bootstrap shadows.
    { id: "MIS-4", group: "mismatch", seed: seed("md2", { targetFramework: "nextjs", lightDarkMode: "dark", primaryColor: "#9C27B0", secondaryColor: "#FFC107", neutralColorStyle: "pure-gray", shadowPreset: "bootstrap" }) },
    // Everything mismatched, Bootstrap shadows.
    { id: "MIS-5", group: "mismatch", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#EF4444", secondaryColor: "#10B981", neutralColorStyle: "brand-tinted", typeScalePreset: "md3", spacingPreset: "bootstrap", radiusPreset: "md2", shadowPreset: "bootstrap", opacityPreset: "bootstrap" }) },
    // Everything mismatched, Tailwind shadows (opposite direction).
    { id: "MIS-6", group: "mismatch", seed: seed("md2", { targetFramework: "vuejs", lightDarkMode: "both", primaryColor: "#14B8A6", secondaryColor: "#F43F5E", neutralColorStyle: "pure-gray", typeScalePreset: "bootstrap", spacingPreset: "md3", radiusPreset: "tailwind", shadowPreset: "tailwind", opacityPreset: "tailwind" }) },
  ];
}

function baseline(): QaCase[] {
  return [
    { id: "BASE-1", group: "baseline", seed: loadExampleSeed("sample-seed-config.json") },
    { id: "BASE-2", group: "baseline", seed: loadExampleSeed("sample-seed-config-minimal.json") },
  ];
}

function boundary(): QaCase[] {
  return [
    { id: "BND-1", group: "boundary", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#000000", neutralColorStyle: "brand-tinted" }) },
    { id: "BND-2", group: "boundary", seed: seed("tailwind", { targetFramework: "nextjs", lightDarkMode: "both", primaryColor: "#FFFFFF", neutralColorStyle: "pure-gray" }) },
  ];
}

// The 30 seed-based cases, in a fixed order — case IDs are stable strings,
// but --batch slices this array's order, so the order itself must stay
// fixed across runs for batch resumption to be reliable.
export function getSeedCases(): QaCase[] {
  return [...core(), ...achromatic(), ...mismatch(), ...baseline(), ...boundary()];
}
