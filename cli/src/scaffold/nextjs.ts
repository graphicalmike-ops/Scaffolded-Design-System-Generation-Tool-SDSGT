// Layer 3 — Next.js scaffold (see pipeline-plan.md, "Who this is for, and
// the bar for 'done'" + docs/layer2-layer3-plan.md, Subject 3). Drives the
// official create-next-app CLI non-interactively — verified 2026-09-12: a
// full explicit flag set plus --yes runs with zero prompts, even with
// stdin closed — then layers this pipeline's already-generated Tailwind
// theme on top. Never a hand-maintained copy of Next's own boilerplate,
// per the "generator drives the official scaffolding CLI" architecture
// decision (pipeline-plan.md, "Tool architecture").
//
// Fonts deliberately do NOT use next/font/google. That API requires a
// static import matching Google's own current export identifier for the
// family (spaces -> underscores), which risks drifting from whatever
// string the user actually typed during seed input (Google has renamed
// families before — "Source Sans Pro" is now "Source Sans 3" upstream).
// This reuses the same already-fetched .woff2 files promote's own
// --fonts-dir already consumes (see shared/font-slug.ts) and writes a
// plain hand-authored @font-face block using the EXACT literal family
// name already baked into every semantic typography token in theme.css —
// no identifier-guessing, no new fetch mechanism, no new risk.
//
// Scope: Next.js + Tailwind only. Bootstrap/MUI Next.js targets aren't
// supported here yet — only the Tailwind theme this pipeline already knows
// how to merge into create-next-app's own Tailwind v4 output.
//
// Pattern B (real shadcn/ui vendoring) built 2026-09-12 — see
// docs/layer2-layer3-plan.md, Subject 2. Real ground truth verified against
// shadcn CLI v4.21.0 (current, not the 4.13.1 recorded 2026-09-10 — worth
// re-checking again by whoever reads this next): `shadcn init -d -y` runs
// with zero prompts (confirmed, stdin closed) but — unlike this pipeline's
// own generators — has no flag to suppress its own default theme
// generation; it always writes a real, structurally-necessary globals.css
// (imports, dark-mode custom-variant, the generic `@theme inline` mapping
// real vendored components' Tailwind utility classes depend on, e.g.
// `bg-primary`) with its own default OKLCH color values, and vendors one
// Button component by default. The safe merge, confirmed by inspecting the
// real output rather than assumed: APPEND this pipeline's own
// `shadcn/theme.css` (already-built, generate --shadcn) to the END of
// shadcn's generated globals.css, not replace/parse it. `:root`/`.dark`
// selector rules can appear anywhere in a stylesheet — CSS's own cascade
// means a later declaration of the same custom property wins — so this
// never needs to touch shadcn's own generated structure at all, and stays
// correct even if that structure shifts in a future shadcn version.
// `--font-sans`/`--font-heading` do NOT get the same append-and-let-the-
// cascade-win treatment as colors — a real, confirmed-live bug found
// 2026-09-17 (see docs/layer2-layer3-plan.md's dated entry) while checking
// whether the sibling shadcn-vue bug (Vue.js path) also applied here. It
// does, but via a DIFFERENT mechanism: unlike shadcn-vue, shadcn/ui's own
// `@theme inline` block here declares `--font-sans: var(--font-sans);` — a
// genuine runtime custom-property lookup, not a baked literal (Tailwind
// preserves the `var()` indirection when the source value is itself a
// `var()` reference) — so a later plain `:root` declaration SHOULD win by
// ordinary cascade rules. It doesn't, because `shadcn init` also rewrites
// `layout.tsx`, re-adding a `next/font/google` Geist import this pipeline
// deliberately strips (see above) — Geist's own generated CSS module sets
// `--font-sans` on `<html>` itself, at equal specificity to this pipeline's
// `:root` rule, and wins in practice. Fixed two ways, not one: (1)
// `rewriteLayoutTsx` gets called AGAIN after `shadcn init`, so the
// reintroduced Geist import never survives into the final project; (2)
// `patchFontFamilyVars` (shared/scaffold-common.ts, same helper
// vuejs.ts's own patchShadcnDefaultFontVars pattern inspired) directly
// overwrites shadcn's own declared `--font-sans`/`--font-heading` theme
// values in place — removing the `var()` indirection those utilities read
// entirely, so no runtime custom property could ever re-win even if some
// future shadcn version reintroduces a similar mechanism. Also worth
// knowing: shadcn's own template maps `--font-heading: var(--font-sans);`
// — an ALIAS of the body font, not an independent role — so before this
// fix, `--font-heading` was never actually separable from `--font-sans` at
// all, regardless of the cascade question.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

import {
  hashFile,
  collectFilesRecursive,
  copyAgentDocs,
  parseFontFamiliesFromTailwindCss,
  buildFontFaces,
  patchFontFamilyVars,
  readThemeManifest,
  writeThemeManifest,
  guardedWriteFile,
  guardedBlockReplace,
  SDSGT_BLOCK_START,
  SDSGT_BLOCK_END,
} from "../shared/scaffold-common.ts";
import { buildFigmaComponentsPushPlan } from "./figma-components-plan.ts";

export interface ScaffoldNextjsOptions {
  codeDir: string; // output of `generate --tailwind [--shadcn] --framework nextjs`
  outDir: string; // where a new project gets created (update: false/omitted)
  // or an already-scaffolded one gets refreshed (update: true) — see
  // cli.ts's `scaffold --update`.
  fontsDir?: string; // same convention/files as promote's --fonts-dir
  componentLibrary?: "shadcn"; // only "shadcn" is built so far
  update?: boolean; // refresh an EXISTING project's theme files in place
  // instead of scaffolding a new one — see docs/layer2-layer3-plan.md's
  // 2026-09-17 entry. Skips create-next-app/shadcn init/add and every
  // boilerplate page rewrite; only re-runs the token-derived file writes,
  // each guarded against hand-edited customization (see guardedWriteFile).
  force?: boolean; // overwrite a hand-edited theme file anyway, instead of
  // warning and leaving it alone. Only meaningful with update: true.
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
  warnings: string[]; // customization-guard warnings from `update` runs —
  // empty on a fresh (non-update) scaffold, since there's nothing yet to
  // guard against.
}

// Locked, non-interactive flag set — verified 2026-09-12 against a real run
// (closed stdin, zero prompts, clean exit). --no-agents-md suppresses
// Next's own generic AGENTS.md/CLAUDE.md so only SDSGT's own
// design-system-aware version ends up in the project (see copyAgentDocs).
const CREATE_NEXT_APP_ARGS = [
  "--yes",
  "--ts",
  "--tailwind",
  "--eslint",
  "--app",
  "--src-dir",
  "--import-alias", "@/*",
  "--use-npm",
  "--no-agents-md",
];

function runCreateNextApp(outDir: string): void {
  const result = spawnSync("npx", ["--yes", "create-next-app@latest", outDir, ...CREATE_NEXT_APP_ARGS], { stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run create-next-app: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`create-next-app exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

// -d applies shadcn's own "use defaults, no prompts" preset (confirmed
// 2026-09-12: --template=next --preset=base-nova); -y additionally skips
// the confirmation prompt. Together, confirmed to run with zero prompts
// even with stdin closed. No flag exists to suppress its default theme
// generation — see the file header for why that's fine (append, don't
// suppress).
function runShadcnInit(projectDir: string): void {
  const result = spawnSync("npx", ["--yes", "shadcn@latest", "init", "-d", "-y"], { cwd: projectDir, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run shadcn init: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`shadcn init exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

// --all vendors the entire current registry (70+ components, confirmed
// 2026-09-12) — decided over a curated subset so the user never has to
// come back and run `shadcn add <name>` by hand for something this
// pipeline could have already vendored (pipeline-plan.md, "Who this is
// for, and the bar for 'done'").
function runShadcnAddAll(projectDir: string): void {
  const result = spawnSync("npx", ["--yes", "shadcn@latest", "add", "--all", "-y"], { cwd: projectDir, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run shadcn add: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`shadcn add --all exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

// Merges this pipeline's own shadcn theme (real brand colors, already
// mapped onto shadcn's own CSS variable names by generate --shadcn) plus a
// font override, into whatever shadcn's own `init` already wrote. The
// COLOR values are safe by construction — see the file header's
// cascade-order reasoning, still correct for them. The `fontOverride` block
// below is NOT what actually makes fonts render correctly (a real,
// confirmed-live bug found 2026-09-17 — see the file header and
// docs/layer2-layer3-plan.md's dated entry): `patchFontFamilyVars`, called
// from scaffoldNextjs below, does the real work by patching shadcn's own
// declared `--font-sans`/`--font-heading` values in place. This block's own
// declaration is kept anyway (harmless, and correct again if shadcn's
// template ever stops using `@theme inline`/`var()` indirection for fonts),
// same "keep the redundant-but-harmless declaration" call vuejs.ts's own
// buildShadcnMainCssBlock already made for the identical situation.
// Idempotent since 2026-09-17 (a real bug before then — see
// docs/layer2-layer3-plan.md's dated entry): `replaceOrAppendSdsgtBlock`
// finds the block by its start/end markers and REPLACES it in place on a
// second or Nth run (e.g. `scaffold --update`), rather than appending a
// duplicate copy after it forever.
function buildShadcnThemeBlock(shadcnThemeCss: string, families: { primary: string; secondary?: string }): string {
  const fontOverride = [
    ":root {",
    `  --font-sans: ${families.secondary ?? families.primary}, sans-serif;`,
    `  --font-heading: ${families.primary}, sans-serif;`,
    "}",
  ].join("\n");

  return [
    `${SDSGT_BLOCK_START} real brand colors + fonts, merged in after`,
    "   shadcn's own defaults above so they win the CSS cascade without",
    "   needing to touch shadcn's own generated structure. Run `scaffold",
    "   --update` (same flags, --out pointing at this project) after",
    "   editing tokens to refresh this block — don't hand-edit the values",
    "   directly, since an update will warn instead of silently overwriting",
    "   a hand-edited block. --- */",
    "",
    shadcnThemeCss.trim(),
    "",
    fontOverride,
    "",
    SDSGT_BLOCK_END,
  ].join("\n");
}

// The customization guard (docs/layer2-layer3-plan.md, Subject 2, "the
// ACIM lesson" — never blindly re-run a vendored component's install
// command once it's been customized). Records each vendored file's
// original content hash so a future run — or an AI agent, per the
// AGENTS.md rule this pairs with, see generate/project-docs.ts — can tell
// an untouched file (safe to re-vendor) from a customized one (leave it
// alone) without guessing. Written once, at vendor time; nothing in this
// pipeline reads it back yet — that's the not-yet-built re-vendor step.
function buildVendoredManifest(outDir: string): string {
  const uiDir = join(outDir, "src", "components", "ui");
  const utilsPath = join(outDir, "src", "lib", "utils.ts");
  const entries: Record<string, { path: string; hash: string }> = {};

  for (const file of collectFilesRecursive(uiDir)) {
    const name = basename(file, extname(file));
    entries[name] = { path: relative(outDir, file), hash: hashFile(file) };
  }
  if (existsSync(utilsPath)) {
    entries.utils = { path: relative(outDir, utilsPath), hash: hashFile(utilsPath) };
  }

  return `${JSON.stringify({ shadcn: entries }, null, 2)}\n`;
}

function buildGlobalsCss(opts: { hasDark: boolean; fontFaceCss: string }): string {
  const imports = ['@import "tailwindcss";', '@import "./theme.css";', '@import "./theme-light.css";'];
  if (opts.hasDark) imports.push('@import "./theme-dark.css";');

  const parts = [
    [
      "/* Design tokens generated by SDSGT — do not hand-edit; run `scaffold",
      "   --update` (same flags, --out pointing at this project) after editing",
      "   tokens to refresh this file instead. */",
    ].join("\n"),
    imports.join("\n"),
  ];
  if (opts.fontFaceCss) parts.push(opts.fontFaceCss);
  parts.push(
    [
      "body {",
      "  background: var(--color-semantic-background-primary);",
      "  color: var(--color-semantic-text-primary);",
      "  font-family: var(--typography-primitive-fontFamily-secondary, var(--typography-primitive-fontFamily-primary));",
      "}",
    ].join("\n"),
  );

  return `${parts.join("\n\n")}\n`;
}

// Strips Next's own default Geist font wiring — this project's fonts are
// loaded via the hand-authored @font-face block in globals.css instead
// (see buildFontFaces above), not next/font.
function rewriteLayoutTsx(appDir: string, projectName: string): void {
  const content = [
    'import type { Metadata } from "next";',
    'import "./globals.css";',
    "",
    "export const metadata: Metadata = {",
    `  title: "${projectName}",`,
    '  description: "Built with SDSGT — design system already wired in.",',
    "};",
    "",
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    "  return (",
    '    <html lang="en" className="h-full antialiased">',
    '      <body className="min-h-full flex flex-col">{children}</body>',
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "layout.tsx"), content, "utf-8");
}

// Deliberately light-touch — not a full component showcase (that's what
// the <platform>-design-system-demo.html generate already writes is for).
// Just enough real markup, using the tokens now wired into body's own
// cascade, to prove on first load that this isn't Next's generic starter.
function writePageTsx(appDir: string, projectName: string): void {
  const content = [
    "export default function Home() {",
    "  return (",
    '    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">',
    '      <h1 className="text-4xl font-bold">Your design system is ready</h1>',
    '      <p className="max-w-md">',
    `        This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "        and fonts are already wired in. Open <code>src/app/page.tsx</code> to",
    "        start building.",
    "      </p>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "page.tsx"), content, "utf-8");
}

function writeReadme(outDir: string, projectName: string, hasShadcn: boolean): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — a Next.js project with your design system's colors,",
    "fonts, and spacing already wired in.",
    "",
    "## Run it",
    "",
    "```",
    "npm run dev",
    "```",
    "",
    "Then open http://localhost:3000 in your browser.",
    "",
    "## What's in here",
    "",
    "- `src/app/theme.css`, `theme-light.css`, `theme-dark.css` — your generated",
    "  design tokens as Tailwind CSS variables. After editing tokens, run",
    "  `generate` then `scaffold --update` (same flags, --out pointing back at",
    "  this project) to refresh these in place; don't hand-edit them directly —",
    "  an update run warns instead of silently overwriting a hand-edited file.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to this",
    "  project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    ...(hasShadcn
      ? [
          "- `src/components/ui/` — every shadcn/ui component, already vendored and",
          "  already styled with your brand colors (see `src/app/globals.css`).",
          "- `sdsgt-vendored-components.json` — a hash of each vendored component's",
          "  original content. If you customize a component, don't blindly re-run",
          "  `shadcn add` on it later — check this file first (an AI agent reading",
          "  `AGENTS.md` already knows to).",
        ]
      : []),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldNextjs(opts: ScaffoldNextjsOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir, componentLibrary, update = false, force = false } = opts;

  const themeCssPath = join(codeDir, "tailwind", "theme.css");
  const themeLightPath = join(codeDir, "tailwind", "theme-light.css");
  const themeDarkPath = join(codeDir, "tailwind", "theme-dark.css");
  if (!existsSync(themeCssPath) || !existsSync(themeLightPath)) {
    throw new Error(
      `No Tailwind theme found in ${codeDir} — run \`generate --tailwind --framework nextjs\` first. ` +
        "This scaffold step only supports Tailwind-themed Next.js projects today (Bootstrap/MUI Next.js scaffolding isn't built yet).",
    );
  }
  const shadcnThemeCssPath = join(codeDir, "shadcn", "theme.css");
  if (componentLibrary === "shadcn" && !existsSync(shadcnThemeCssPath)) {
    throw new Error(
      `--shadcn was requested but no shadcn theme found in ${codeDir} — run \`generate --tailwind --shadcn --framework nextjs\` first (both flags together).`,
    );
  }
  if (update) {
    if (!existsSync(outDir)) {
      throw new Error(`--update was passed but ${outDir} doesn't exist — nothing to update. Run \`scaffold\` without --update first to create it.`);
    }
  } else if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-next-app can create it fresh. Pass --update to refresh an existing project instead.`);
  }

  const projectName = basename(outDir);
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const manifest = readThemeManifest(outDir);
  const nextManifest: Record<string, string> = { ...manifest };

  function guarded(relPath: string, content: string | Buffer, label?: string): void {
    const result = guardedWriteFile(outDir, relPath, content, manifest, { force });
    nextManifest[relPath] = result.hash;
    if (result.written) {
      filesWritten.push(label ?? relPath);
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  if (!update) {
    runCreateNextApp(outDir);
  }

  const appDir = join(outDir, "src", "app");

  guarded(join("src", "app", "theme.css"), readFileSync(themeCssPath));
  guarded(join("src", "app", "theme-light.css"), readFileSync(themeLightPath));
  const hasDark = existsSync(themeDarkPath);
  if (hasDark) {
    guarded(join("src", "app", "theme-dark.css"), readFileSync(themeDarkPath));
  }

  const families = parseFontFamiliesFromTailwindCss(readFileSync(themeCssPath, "utf-8"));
  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);

  if (!update) {
    rewriteLayoutTsx(appDir, projectName);
    filesWritten.push("src/app/layout.tsx");

    writePageTsx(appDir, projectName);
    filesWritten.push("src/app/page.tsx");
  }

  if (componentLibrary === "shadcn") {
    if (!update) {
      runShadcnInit(outDir);
      runShadcnAddAll(outDir);

      // shadcn init rewrites layout.tsx too, re-adding a next/font/google
      // Geist import + variable class the rewriteLayoutTsx call above just
      // stripped — confirmed live 2026-09-17 (see file header) that this is
      // the actual reason the old font override never rendered: Geist's own
      // generated CSS sets `--font-sans` on <html> at runtime, outranking
      // this pipeline's plain `:root` override in practice. Re-stripping it
      // now, after shadcn's own init has actually run, is what makes that
      // reintroduced import not survive into the final project.
      rewriteLayoutTsx(appDir, projectName);

      // shadcn init/add already wrote their own globals.css and components —
      // append our real values on top rather than rewriting from scratch,
      // per the file header's cascade-order reasoning (still correct for
      // colors; see patchFontFamilyVars below for fonts specifically).
      const globalsCss = readFileSync(join(appDir, "globals.css"), "utf-8");
      const globalsWithFonts = fontFaceCss ? `${globalsCss.trimEnd()}\n\n${fontFaceCss}\n` : globalsCss;
      writeFileSync(join(appDir, "globals.css"), globalsWithFonts, "utf-8");

      const manifestJson = buildVendoredManifest(outDir);
      writeFileSync(join(outDir, "sdsgt-vendored-components.json"), manifestJson, "utf-8");
      filesWritten.push("sdsgt-vendored-components.json");

      // Written unconditionally once real components are vendored — same
      // "harmless if unused" treatment as figma-push-plan.json (promote/
      // figma-plan.ts): the actual Figma push only happens if figmaManaged
      // is true and a live connection exists, but computing the plan costs
      // nothing either way. See scaffold/figma-components-plan.ts. Not
      // recomputed on `update` — the vendored component set itself isn't
      // touched by this pathway, so the existing plan is still accurate.
      const componentsPlan = buildFigmaComponentsPushPlan(codeDir, join(outDir, "src", "components", "ui"));
      writeFileSync(join(outDir, "figma-components-push-plan.json"), `${JSON.stringify(componentsPlan, null, 2)}\n`, "utf-8");
      filesWritten.push("figma-components-push-plan.json");
    }

    // The real font fix — see the file header for why the fontOverride
    // block above doesn't actually change what renders. Patches shadcn's
    // own declared --font-sans/--font-heading values (inside its own
    // `@theme inline` block) IN PLACE, rather than relying on a separate
    // later declaration to win the cascade. Deliberately unconditional
    // (runs on every scaffold AND every `--update`, not gated like the
    // shadcn-init-only block above) since a changed font on `--update`
    // needs this reapplied too, same as vuejs.ts's own equivalent fix.
    // Naturally idempotent — see patchFontFamilyVars's own comment.
    const globalsPath = join(appDir, "globals.css");
    writeFileSync(globalsPath, patchFontFamilyVars(readFileSync(globalsPath, "utf-8"), families), "utf-8");

    // Guarded so a hand-edited override block isn't silently clobbered on
    // `update` — the block itself (not shadcn's own untouched defaults
    // around it) is what this pipeline owns and re-derives from tokens.
    // One precisely-disclosed interaction, not a bug (same as vuejs.ts's
    // own equivalent note): the direct patch above is unconditional, while
    // this block stays guarded — if it's hand-edited and gets skipped on an
    // `--update` that also changes fonts, the compiled --font-sans/
    // --font-heading values still move to the NEW font (patched above)
    // while the real brand colors stay OLD until the warning below is
    // resolved (--force or a hand-merge).
    const blockKey = join("src", "app", "globals.css#sdsgt-block");
    const block = buildShadcnThemeBlock(readFileSync(shadcnThemeCssPath, "utf-8"), families);
    const blockResult = guardedBlockReplace(readFileSync(globalsPath, "utf-8"), block, manifest[blockKey], { force });
    nextManifest[blockKey] = blockResult.hash;
    if (blockResult.written) {
      writeFileSync(globalsPath, blockResult.content, "utf-8");
      filesWritten.push("src/app/globals.css (SDSGT overrides block)");
    } else if (blockResult.warning) {
      warnings.push(`src/app/globals.css: ${blockResult.warning}`);
    }
  } else {
    guarded(join("src", "app", "globals.css"), buildGlobalsCss({ hasDark, fontFaceCss }));
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName, componentLibrary === "shadcn");
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
