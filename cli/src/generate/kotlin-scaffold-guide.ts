// Kotlin/Jetpack Compose scaffold guide — Layer 3's answer for the one
// framework where Layer 3 genuinely can't be automated, not just "harder."
//
// Verified 2026-09-14, real research before concluding this (same "run the
// actual tool, don't assume from training data" discipline this project has
// used everywhere else): there is no official, non-interactive way to
// scaffold a new Android/Jetpack Compose project.
// - No "android create <template>" CLI exists — the real, current
//   developer.android.com/tools command-line-tools page lists sdkmanager/
//   avdmanager/lint/apkanalyzer/adb/etc., nothing that creates a new app
//   project. (An early web search surfaced a plausible-sounding `android
//   create empty-activity` command; re-checking against the real current
//   tools page showed no such thing exists — that first result was wrong,
//   not this project's own invention, but still wrong, so it never made it
//   into this file's design.)
// - `gradle init --type kotlin-application` is real, but only scaffolds a
//   generic Kotlin JVM console app — no Android manifest, no Compose
//   dependencies, not an Android app at all. Verified via a real local
//   `gradle help --task init` run listing every supported --type value.
// - Android Studio itself has no documented headless/batch project-creation
//   mode — File > New > Project's GUI wizard is the only officially
//   supported path (verified against developer.android.com/studio/
//   command-line, which only documents SDK tools, not the IDE itself).
//
// This is a structurally different situation from every other Layer 3
// target in this pipeline (Next.js, Vue.js, React Native all have a real
// official non-interactive CLI to drive) — not just a harder version of the
// same problem. So instead of a `scaffold --framework kotlin` step that
// drives nothing, this writes a real, filled-in instructions file
// alongside `generate --md3`'s own Color.kt — the same "Pattern A" move
// already used for Vuetify/React Native Paper's SETUP.md (no automatable
// install/vendor path → real instructions with this project's own actual
// generated values, not a generic tutorial), just one level up: whole
// project creation instead of "add a library to an existing project."
//
// Real, current reference points this guide's content is checked against,
// not invented:
// - Compose BOM 2026.08.00 (current, verified via developer.android.com's
//   own BOM-to-library mapping table) maps to material3:material3 1.4.0 —
//   the exact version generate/md3.ts's own Color.kt already targets, a
//   real consistency check, not a coincidence.
// - Android Studio's "Empty Activity" Compose template's own default file
//   layout (app/src/main/java/<package>/ui/theme/{Color,Theme,Type}.kt) and
//   Theme.kt shape, verified against Google's own current Compose theming
//   documentation.
// - This pipeline's own generated `Color.kt` exports fully-built
//   `ColorScheme(...)` instances (all 48 real fields), not the
//   `lightColorScheme(primary = ..., ...)` partial-builder function the
//   default template's own Color.kt/Theme.kt pairing uses — so the wiring
//   code below references `LightColorScheme`/`DarkColorScheme` directly,
//   it does not wrap them in another builder call.
// - Deliberately omits Android 12+'s dynamic (wallpaper-derived) color
//   option the default template's own Theme.kt usually includes — using it
//   would silently replace this project's real generated brand colors with
//   whatever the device's wallpaper happens to produce, the opposite of
//   what every other platform in this pipeline does (SDSGT's own real
//   colors always win, never a platform default).

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerateResult } from "./index.ts";

function buildGuide(hasElevationOverlay: boolean): string {
  const elevationSection = hasElevationOverlay
    ? [
        "## 5. Optional: elevation overlays",
        "",
        "Your `Color.kt` also includes an `ElevationOverlay` object (`Light`/`Dark`,",
        "each with `sm`/`md`/`lg`/`xl`/`xxl`) — Compose's own real",
        "`surfaceColorAtElevation()` formula, precomputed for your project's actual",
        "shadow token dp values. Compose computes the same thing at runtime from",
        "`MaterialTheme.colorScheme` automatically for built-in elevated surfaces",
        "(`Card`, `Surface(tonalElevation = ...)`, etc.) — you only need",
        "`ElevationOverlay` directly if you're hand-drawing something outside",
        "Compose's own elevation system and need the exact same color it would have",
        "used.",
        "",
      ].join("\n")
    : "";

  return [
    "# Kotlin / Jetpack Compose — manual scaffold guide",
    "",
    "**Why this is a guide, not an automatic step:** every other framework this",
    "tool supports (Next.js, Vue.js, React Native) has a real official",
    "non-interactive CLI this pipeline drives directly — `create-next-app`,",
    "`create-vue`, `create-expo-app`. Android/Jetpack Compose doesn't have one.",
    "Verified before writing this guide, not assumed: there is no `android",
    "create` command (a real current check of Android's own command-line-tools",
    "documentation confirms this), Gradle's own `gradle init` can only",
    "scaffold a generic Kotlin JVM console app (no Android manifest, no",
    "Compose dependencies — not a real Android app), and Android Studio",
    "itself has no documented headless or batch project-creation mode. File >",
    "New > Project's GUI wizard is the only officially supported way to",
    "create a new Android project today. This file exists so that gap",
    "doesn't leave you stuck — every value below is your own real generated",
    "data, not a generic tutorial.",
    "",
    "## 0. Prerequisites",
    "",
    "- [Android Studio](https://developer.android.com/studio) installed.",
    "- No SDK/emulator setup needed just to follow these steps — Android",
    "  Studio's own first-run wizard handles that.",
    "",
    "## 1. Create the project",
    "",
    "Open Android Studio → **File > New > Project** → choose the **Empty",
    "Activity** template (this is the one with Compose already set up — exact",
    "wording may shift slightly between Android Studio versions, look for",
    "\"Empty Activity\" or \"Empty Compose Activity\"). Set your own app name and",
    "package name — you'll need your real package name for step 2. Language:",
    "**Kotlin**. Minimum SDK: whatever your project needs; any current default",
    "works fine with the code below.",
    "",
    "This creates a real project with `Color.kt`/`Theme.kt`/`Type.kt` already",
    "scaffolded under `app/src/main/java/<your.package.name>/ui/theme/` — you're",
    "about to replace/extend two of those three with your own generated design",
    "system.",
    "",
    "## 2. Replace Color.kt with your generated one",
    "",
    "Copy the `Color.kt` generated right next to this file (same `md3/`",
    "folder) over the template's own `app/src/main/java/<your.package.name>/",
    "ui/theme/Color.kt` — then add a package declaration as its first line,",
    "matching wherever you placed it:",
    "",
    "```kotlin",
    "package <your.package.name>.ui.theme",
    "```",
    "",
    "(Your generated file has no package line by itself — this tool doesn't",
    "know your package name in advance, so add this one line yourself before",
    "building.)",
    "",
    "This gives you two real, ready-to-use `ColorScheme` instances —",
    "`LightColorScheme` and `DarkColorScheme` — every field Compose's own",
    "`androidx.compose.material3.ColorScheme` constructor needs, already",
    "filled in from your real brand colors via Google's own Material Color",
    "Utilities (the same HCT tonal-palette math Android's own Material You",
    "system uses).",
    "",
    "## 3. Wire Theme.kt to use them",
    "",
    "Replace the template's own generated `Theme.kt` with this — it's",
    "deliberately simpler than the template's own default, since your",
    "`Color.kt` already exports complete `ColorScheme` objects (the",
    "template's own `Theme.kt` wraps a partial `lightColorScheme(primary =",
    "..., ...)` builder call instead — you don't need that step, your file",
    "already did it, with more fields filled in than the template's own",
    "default does):",
    "",
    "```kotlin",
    "package <your.package.name>.ui.theme",
    "",
    "import androidx.compose.foundation.isSystemInDarkTheme",
    "import androidx.compose.material3.MaterialTheme",
    "import androidx.compose.runtime.Composable",
    "",
    "@Composable",
    "fun AppTheme(",
    "    darkTheme: Boolean = isSystemInDarkTheme(),",
    "    content: @Composable () -> Unit",
    ") {",
    "    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme",
    "",
    "    MaterialTheme(",
    "        colorScheme = colorScheme,",
    "        typography = Typography,",
    "        content = content,",
    "    )",
    "}",
    "```",
    "",
    "**Deliberately no Android 12+ \"dynamic color\" branch** (the template's",
    "own default `Theme.kt` usually offers one, deriving colors from the",
    "device's wallpaper via `dynamicLightColorScheme(context)`/",
    "`dynamicDarkColorScheme(context)`). Using it would silently replace your",
    "real generated brand colors with whatever a given device's wallpaper",
    "produces — the opposite of what this tool is for. If you want dynamic",
    "color as a user-facing *option* later, that's a real product decision to",
    "make deliberately, not something to fall into by leaving template code",
    "in place.",
    "",
    "`Typography` above is the template's own default from `Type.kt` — this",
    "tool doesn't generate Compose typography yet (only the color scheme), so",
    "leave `Type.kt`/`Shape.kt` as the template created them, or customize them",
    "by hand to match your type-scale/radius token choices.",
    "",
    "## 4. Use it",
    "",
    "Wrap your app's root composable (usually in `MainActivity.kt`, inside",
    "`setContent { }`) in `AppTheme { ... }`, the same pattern the template's",
    "own generated `MainActivity.kt` already uses with its own theme name —",
    "just swap the template's theme composable for this one.",
    "",
    elevationSection,
    "## Build it",
    "",
    "Verify Compose BOM 2026.08.00 or newer is set in your module's",
    "`build.gradle.kts`:",
    "",
    "```kotlin",
    'implementation(platform("androidx.compose:compose-bom:2026.08.00"))',
    "```",
    "",
    "(check [the current BOM-to-library mapping](https://developer.android.com/develop/ui/compose/bom/bom-mapping) if it's been a while) —",
    "this is what resolves to `material3:material3` 1.4.0, the exact version",
    "your `Color.kt`'s `ColorScheme` constructor shape was verified against.",
    "Android Studio's own **Run** button builds and installs to a connected",
    "device/emulator. From the command line instead:",
    "",
    "```",
    "./gradlew assembleDebug",
    "```",
    "",
    "## What's in here",
    "",
    "- `Color.kt` — your generated `LightColorScheme`/`DarkColorScheme` (plus",
    "  `ElevationOverlay`, if your project has shadow tokens). Re-run SDSGT's",
    "  `generate` step to update these; don't hand-edit them directly, since",
    "  the next `generate` run overwrites this file — keep your own",
    "  customizations in `Theme.kt` instead, which this tool never touches",
    "  after you've written it once.",
    "",
  ].join("\n");
}

export function generateKotlinScaffoldGuide(outDir: string, colorKtContent: string): GenerateResult {
  const hasElevationOverlay = colorKtContent.includes("object ElevationOverlay");
  const buildPath = join(outDir, "md3");
  writeFileSync(join(buildPath, "SCAFFOLD_GUIDE.md"), buildGuide(hasElevationOverlay), "utf-8");
  return { filesWritten: ["md3/SCAFFOLD_GUIDE.md"] };
}
