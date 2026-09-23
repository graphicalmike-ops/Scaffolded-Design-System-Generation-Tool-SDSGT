// Layer 3 — Vue.js scaffold, Tailwind path (see pipeline-plan.md, "Who this
// is for, and the bar for 'done'" + docs/layer2-layer3-plan.md, Subject 3).
// Mirrors scaffold/nextjs.ts's shape and reasoning — drives the official
// create-vue CLI non-interactively (verified 2026-09-14: feature flags +
// a directory argument run with zero prompts, even with stdin closed),
// then layers this pipeline's already-generated Tailwind theme on top.
//
// Real difference from Next.js worth knowing up front: create-next-app
// installs its own dependencies automatically; create-vue does NOT (its own
// closing output literally tells you to run `npm install` yourself) — so
// this file has to run that install itself, which is also the one place
// Tailwind's own two packages (tailwindcss, @tailwindcss/vite — there's no
// built-in --tailwind flag here the way create-next-app has one) get added.
//
// A REAL, VERIFIED BUG (2026-09-14) shapes a chunk of this file: create-vue's
// own --eslint template locks a devDependency version of `oxlint` that has
// already drifted ahead of `eslint-plugin-oxlint`'s peer range (oxlint
// releases roughly weekly; eslint-plugin-oxlint's peer pin lags behind) —
// confirmed by actually running `npm install` fresh against real current
// npm registry state and hitting a real ERESOLVE. `legacy-peer-deps=true`
// in a project .npmrc is the standard, documented npm escape hatch for
// exactly this class of upstream peer-range lag — written into the
// generated project itself (not just used transiently for this scaffold
// step) so the user's OWN future `npm install`s keep working too, not just
// this one. Revisit removing it once eslint-plugin-oxlint's peer range
// catches back up.
//
// Fonts deliberately do NOT use any Google Fonts CDN reference, same
// reasoning as nextjs.ts: reuses the same already-fetched .woff2 files
// promote's own --fonts-dir already consumes and writes a plain
// hand-authored @font-face block using the exact literal family name
// already baked into every semantic typography token — no
// identifier-guessing, no new fetch mechanism, no new risk.
//
// Pattern B (shadcn-vue) built alongside the base scaffold, not a later
// slice — see docs/layer2-layer3-plan.md, Subject 2: shadcn-vue reuses
// generate --shadcn's theme.css as-is (identical CSS variable convention to
// shadcn/ui, verified). Two real, verified gaps shadcn/ui's own Next.js
// build never hit: (1) shadcn-vue's own installation checker reads
// baseUrl/paths from the ROOT tsconfig.json, which create-vue's split
// tsconfig template only sets in tsconfig.app.json — fixed by writing the
// alias into tsconfig.json directly, which is also just a correct fix on
// its own merits, not merely a workaround. (2) `add --all` vendors the
// `chart` component's source but never installs its registry-declared
// runtime dependency (@unovis/vue + @unovis/ts) — confirmed by a real
// vue-tsc typecheck failing until these are installed by hand.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import {
  hashFile,
  collectFilesRecursive,
  copyAgentDocs,
  parseFontFamiliesFromTailwindCss,
  buildFontFaces,
  readThemeManifest,
  writeThemeManifest,
  guardedWriteFile,
  guardedBlockReplace,
  SDSGT_BLOCK_START,
  SDSGT_BLOCK_END,
  SDSGT_FONT_BLOCK_START,
  SDSGT_FONT_BLOCK_END,
} from "../shared/scaffold-common.ts";

export interface ScaffoldVuejsOptions {
  codeDir: string; // output of `generate --tailwind [--shadcn] --framework vuejs`
  outDir: string; // where a new project gets created (update: false/omitted)
  // or an already-scaffolded one gets refreshed (update: true)
  fontsDir?: string; // same convention/files as promote's --fonts-dir
  componentLibrary?: "shadcn"; // shadcn-vue — only option built so far for this path
  update?: boolean; // refresh an EXISTING project's theme files in place —
  // see docs/layer2-layer3-plan.md's 2026-09-17 entry / cli.ts's
  // `scaffold --update`.
  force?: boolean; // overwrite a hand-edited theme file anyway
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
  warnings: string[];
}

// Locked, non-interactive flag set — verified 2026-09-14 against a real run
// (closed stdin, zero prompts, clean exit). Deliberately no --pinia/
// --vitest/--cypress/--playwright, same minimal-scope reasoning as
// nextjs.ts's own locked flag set (no testing-framework flags there either).
const CREATE_VUE_ARGS = ["--ts", "--router", "--eslint"];

const BOILERPLATE_PATHS = [
  ["src", "components", "HelloWorld.vue"],
  ["src", "components", "TheWelcome.vue"],
  ["src", "components", "WelcomeItem.vue"],
  ["src", "components", "icons"],
  ["src", "assets", "logo.svg"],
  ["src", "assets", "base.css"],
];

function run(cmd: string, args: string[], cwd: string, label: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

// Real, verified 2026-09-14 gotcha: create-vue's own "run non-interactively"
// detection treats its directory argument as a candidate PACKAGE NAME, not
// just a filesystem path — an absolute path (which every SDSGT --out value
// naturally is) fails that validation and silently drops into its
// interactive prompt flow instead of erroring, even with stdin closed.
// Confirmed by actually hitting this: passing outDir directly produced a
// live "Package name:" prompt and created nothing. Fixed by running from
// outDir's own parent directory and passing just its bare basename — same
// project gets created, just via a path create-vue's own validation accepts.
function runCreateVue(outDir: string): void {
  run("npx", ["--yes", "create-vue@latest", basename(outDir), ...CREATE_VUE_ARGS], dirname(outDir), "create-vue");
}

function writeNpmrc(outDir: string): void {
  writeFileSync(join(outDir, ".npmrc"), "legacy-peer-deps=true\n", "utf-8");
}

// create-vue does not auto-install (unlike create-next-app) — this is also
// where Tailwind's own two packages get added, since create-vue has no
// built-in --tailwind flag the way create-next-app does.
function installBaseAndTailwind(outDir: string): void {
  run("npm", ["install", "tailwindcss", "@tailwindcss/vite", "--save"], outDir, "npm install");
}

function writeTsconfigJson(outDir: string): void {
  const content = `${JSON.stringify(
    {
      files: [],
      references: [{ path: "./tsconfig.node.json" }, { path: "./tsconfig.app.json" }],
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(outDir, "tsconfig.json"), content, "utf-8");
}

function writeViteConfig(outDir: string): void {
  const content = [
    "import { fileURLToPath, URL } from 'node:url'",
    "",
    "import { defineConfig } from 'vite'",
    "import vue from '@vitejs/plugin-vue'",
    "import vueDevTools from 'vite-plugin-vue-devtools'",
    "import tailwindcss from '@tailwindcss/vite'",
    "",
    "export default defineConfig({",
    "  plugins: [",
    "    vue(),",
    "    vueDevTools(),",
    "    tailwindcss(),",
    "  ],",
    "  resolve: {",
    "    alias: {",
    "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
    "    },",
    "  },",
    "})",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "vite.config.ts"), content, "utf-8");
}

function removeBoilerplate(outDir: string): void {
  for (const parts of BOILERPLATE_PATHS) {
    const p = join(outDir, ...parts);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function rewriteIndexHtml(outDir: string, projectName: string): void {
  const path = join(outDir, "index.html");
  const content = readFileSync(path, "utf-8")
    .replace('<html lang="">', '<html lang="en">')
    .replace("<title>Vite App</title>", `<title>${projectName}</title>`);
  writeFileSync(path, content, "utf-8");
}

// Strips the default Vue logo/greeting chrome, keeps real routing working
// (--router is a real feature this scaffold chose to include, not
// boilerplate to discard the way Next's placeholder homepage was).
function rewriteAppVue(outDir: string): void {
  const content = [
    "<script setup lang=\"ts\">",
    "import { RouterLink, RouterView } from 'vue-router'",
    "</script>",
    "",
    "<template>",
    '  <nav class="flex gap-4 p-4 text-sm">',
    '    <RouterLink to="/">Home</RouterLink>',
    '    <RouterLink to="/about">About</RouterLink>',
    "  </nav>",
    "  <RouterView />",
    "</template>",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "App.vue"), content, "utf-8");
}

// Deliberately light-touch — same "just enough real markup to prove this
// isn't the generic starter" restraint as nextjs.ts's writePageTsx.
function rewriteHomeView(outDir: string, projectName: string): void {
  const content = [
    "<template>",
    '  <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">',
    '    <h1 class="text-4xl font-bold">Your design system is ready</h1>',
    '    <p class="max-w-md">',
    `      This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "      and fonts are already wired in. Open <code>src/views/HomeView.vue</code>",
    "      to start building.",
    "    </p>",
    "  </main>",
    "</template>",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "views", "HomeView.vue"), content, "utf-8");
}

function buildMainCss(opts: { hasDark: boolean; fontFaceCss: string }): string {
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

function runShadcnVueInit(projectDir: string): void {
  run("npx", ["--yes", "shadcn-vue@latest", "init", "-d", "-y"], projectDir, "shadcn-vue init");
}

// --all vendors the entire current registry, same "never make the user come
// back for one shadcn add <name> we could've already done" reasoning as
// nextjs.ts's runShadcnAddAll.
function runShadcnVueAddAll(projectDir: string): void {
  run("npx", ["--yes", "shadcn-vue@latest", "add", "--all", "-y"], projectDir, "shadcn-vue add --all");
}

// See file header — the one real gap found in `add --all`'s own output.
function installChartDeps(projectDir: string): void {
  run("npm", ["install", "@unovis/vue", "@unovis/ts"], projectDir, "npm install @unovis/vue @unovis/ts");
}

// Merges this pipeline's own shadcn theme (reused as-is for shadcn-vue,
// identical CSS variable convention) plus a font override, into whatever
// shadcn-vue's own `init` already wrote to src/assets/main.css — same
// cascade-order safety as nextjs.ts's own shadcn block. Idempotent since
// 2026-09-17 (a real bug before then — see docs/layer2-layer3-plan.md's
// dated entry): guardedBlockReplace finds the block by its start/end
// markers and REPLACES it in place on a second or Nth run (e.g. `scaffold
// --update`), rather than appending a duplicate copy after it forever.
// Also strips shadcn-vue's own default Google Fonts CDN @import (Geist)
// first — a real, live network request on every page load that shadcn/ui's
// Next.js flavor never has in the first place (it uses next/font instead),
// so there's no equivalent "harmless if unused" precedent to lean on here;
// this one actually fires a request for a font this project doesn't use.
// Only stripped on a fresh scaffold — on `update` the file no longer has
// this import (already stripped the first time), so the replace is a no-op.
//
// The `fontOverride` block below does NOT actually win the CSS cascade for
// --font-sans/--font-heading, despite the comment that used to claim it did
// — a real, pre-existing bug caught 2026-09-17 while verifying the
// font-face fix above with an actual Playwright computed-style check (not
// just grepping compiled CSS text, which is what let this go unnoticed
// since shadcn-vue's own Vue path was first built 2026-09-14). shadcn-vue's
// own `init -d -y` output declares --font-sans/--font-heading inside an
// `@theme inline { ... }` block; Tailwind v4's `inline` keyword means the
// LITERAL value gets baked directly into every utility class that reads it
// at BUILD time (confirmed against real compiled output:
// `.font-sans{font-family:Geist Variable,sans-serif}` — a literal, not
// `var(--font-sans)`), so a separate, later `--font-sans` declaration
// anywhere else in the file (this `fontOverride` block, appended after,
// same as every other override here) has zero effect on anything using the
// `font-sans`/`font-heading` utilities or shadcn-vue's own `body { @apply
// font-sans; }` base rule — which is exactly what HomeView's rendered text
// relies on, having no font utility class of its own. This affected every
// shadcn-vue scaffold this pipeline has ever produced, fresh or updated,
// not just the update-detection gap this session was asked to close.
// Fixed by `patchShadcnDefaultFontVars` below, which edits shadcn-vue's own
// declared values in place instead of relying on the cascade — kept this
// block's own declaration too (harmless, and correct again if shadcn-vue's
// template ever drops `inline`), not removed.
function buildShadcnMainCssBlock(shadcnThemeCss: string, families: { primary: string; secondary?: string }): string {
  const fontOverride = [
    ":root {",
    `  --font-sans: ${families.secondary ?? families.primary}, sans-serif;`,
    `  --font-heading: ${families.primary}, sans-serif;`,
    "}",
  ].join("\n");

  return [
    `${SDSGT_BLOCK_START} real brand colors + fonts, merged in after`,
    "   shadcn-vue's own defaults above. Run `scaffold --update` (same",
    "   flags, --out pointing at this project) after editing tokens to",
    "   refresh this block — don't hand-edit the values directly, since an",
    "   update will warn instead of silently overwriting a hand-edited",
    "   block. --- */",
    "",
    shadcnThemeCss.trim(),
    "",
    fontOverride,
    "",
    SDSGT_BLOCK_END,
  ].join("\n");
}

function stripDefaultGoogleFontsImport(mainCss: string): string {
  return mainCss.replace(/^@import url\(['"]https:\/\/fonts\.googleapis\.com[^)]*\);\n?/m, "");
}

// The real, load-bearing half of the font fix — see buildShadcnMainCssBlock's
// own comment above for why the separate override block alone doesn't
// actually change what renders. Patches shadcn-vue's own `--font-sans`/
// `--font-heading` declarations IN PLACE (wherever they're declared —
// intentionally not scoped to `@theme inline` specifically, so this keeps
// working even if shadcn-vue's template stops using `inline` later; a
// plain, deterministic value substitution, same "small edit to shadcn's
// own generated boilerplate" precedent stripDefaultGoogleFontsImport above
// already uses in this file, not a new mechanism). No `g` flag deliberately
// — only the FIRST occurrence in the file (shadcn-vue's own declaration,
// which always appears before this pipeline's own override block gets
// appended) is meant to be touched; this pipeline's own block is replaced
// wholesale by guardedBlockReplace regardless, so it's never at risk of a
// double-edit. Naturally idempotent on `--update` (a regex matching by
// property name replaces whatever value is currently there, stale or not),
// so — unlike the @font-face block — no separate start/end markers are
// needed for this one.
function patchShadcnDefaultFontVars(mainCss: string, families: { primary: string; secondary?: string }): string {
  const bodyFont = `${families.secondary ?? families.primary}, sans-serif`;
  const headingFont = `${families.primary}, sans-serif`;
  return mainCss.replace(/--font-sans:\s*[^;]+;/, `--font-sans: ${bodyFont};`).replace(/--font-heading:\s*[^;]+;/, `--font-heading: ${headingFont};`);
}

// The shadcn-vue font-face fix, 2026-09-17 (see docs/layer2-layer3-plan.md's
// dated follow-up entry). Bounded by its OWN SDSGT_FONT_BLOCK_START/END
// markers — a separate pair from the theme-override block above — so a
// changed font choice on `--update` can be found and REPLACED wholesale,
// the same "guarded block replace" mechanism that block already uses, not
// a plain substring check (which could only detect "already present",
// never "present but stale").
function buildShadcnFontFaceBlock(fontFaceCss: string): string {
  return [
    `${SDSGT_FONT_BLOCK_START} real @font-face rules, generated from`,
    "   your brand fonts. Run `scaffold --update` (same flags, --out pointing",
    "   at this project) after changing fonts to refresh this block — don't",
    "   hand-edit it directly, since an update will warn instead of silently",
    "   overwriting a hand-edited block. --- */",
    "",
    fontFaceCss.trim(),
    "",
    SDSGT_FONT_BLOCK_END,
  ].join("\n");
}

// Keyed by path relative to ui/, NOT basename — unlike shadcn/ui's flat
// Next.js output, shadcn-vue nests every component in its own folder
// (accordion/Accordion.vue, accordion/index.ts, combobox/Combobox.vue,
// combobox/index.ts, ...), so keying by basename alone would collide every
// single component's own index.ts under one "index" key. Confirmed by
// inspecting a real `add --all` run's actual directory shape before writing
// this, not assumed to match nextjs.ts's flat-file manifest shape.
function buildVendoredManifest(outDir: string): string {
  const uiDir = join(outDir, "src", "components", "ui");
  const utilsPath = join(outDir, "src", "lib", "utils.ts");
  const entries: Record<string, { path: string; hash: string }> = {};

  for (const file of collectFilesRecursive(uiDir)) {
    const key = relative(uiDir, file);
    entries[key] = { path: relative(outDir, file), hash: hashFile(file) };
  }
  if (existsSync(utilsPath)) {
    entries["utils.ts"] = { path: relative(outDir, utilsPath), hash: hashFile(utilsPath) };
  }

  return `${JSON.stringify({ "shadcn-vue": entries }, null, 2)}\n`;
}

function writeReadme(outDir: string, projectName: string, hasShadcn: boolean): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — a Vue.js project with your design system's colors,",
    "fonts, and spacing already wired in.",
    "",
    "## Run it",
    "",
    "```",
    "npm run dev",
    "```",
    "",
    "Then open http://localhost:5173 in your browser.",
    "",
    "## What's in here",
    "",
    "- `src/assets/main.css` — your generated design tokens as Tailwind CSS",
    "  variables. After editing tokens, run `generate` then `scaffold",
    "  --update` (same flags, --out pointing back at this project) to",
    "  refresh these in place; don't hand-edit them directly — an update run",
    "  warns instead of silently overwriting a hand-edited file.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "- `.npmrc` — sets `legacy-peer-deps=true`. Needed because of a real,",
    "  current version drift between create-vue's own `oxlint` and",
    "  `eslint-plugin-oxlint` devDependencies (not something this project",
    "  introduced) — safe to remove once that upstream drift resolves itself.",
    ...(hasShadcn
      ? [
          "- `src/components/ui/` — every shadcn-vue component, already vendored",
          "  and already styled with your brand colors (see `src/assets/main.css`).",
          "- `sdsgt-vendored-components.json` — a hash of each vendored component's",
          "  original content. If you customize a component, don't blindly re-run",
          "  `shadcn-vue add` on it later — check this file first (an AI agent",
          "  reading `AGENTS.md` already knows to).",
        ]
      : []),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldVuejs(opts: ScaffoldVuejsOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir, componentLibrary, update = false, force = false } = opts;

  const themeCssPath = join(codeDir, "tailwind", "theme.css");
  const themeLightPath = join(codeDir, "tailwind", "theme-light.css");
  const themeDarkPath = join(codeDir, "tailwind", "theme-dark.css");
  if (!existsSync(themeCssPath) || !existsSync(themeLightPath)) {
    throw new Error(
      `No Tailwind theme found in ${codeDir} — run \`generate --tailwind --framework vuejs\` first. ` +
        "This scaffold step only supports Tailwind-themed Vue projects — for Material Design/Vuetify, use scaffold --framework vuejs --vuetify instead.",
    );
  }
  const shadcnThemeCssPath = join(codeDir, "shadcn", "theme.css");
  if (componentLibrary === "shadcn" && !existsSync(shadcnThemeCssPath)) {
    throw new Error(
      `--shadcn was requested but no shadcn theme found in ${codeDir} — run \`generate --tailwind --shadcn --framework vuejs\` first (both flags together).`,
    );
  }
  if (update) {
    if (!existsSync(outDir)) {
      throw new Error(`--update was passed but ${outDir} doesn't exist — nothing to update. Run \`scaffold\` without --update first to create it.`);
    }
  } else if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-vue can create it fresh. Pass --update to refresh an existing project instead.`);
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
    runCreateVue(outDir);
    writeNpmrc(outDir);
    filesWritten.push(".npmrc");
    writeTsconfigJson(outDir);
    filesWritten.push("tsconfig.json");
    writeViteConfig(outDir);
    filesWritten.push("vite.config.ts");
    installBaseAndTailwind(outDir);

    removeBoilerplate(outDir);
    rewriteIndexHtml(outDir, projectName);
    filesWritten.push("index.html");
    rewriteAppVue(outDir);
    filesWritten.push("src/App.vue");
    rewriteHomeView(outDir, projectName);
    filesWritten.push("src/views/HomeView.vue");
  }

  const assetsDir = join(outDir, "src", "assets");
  const families = parseFontFamiliesFromTailwindCss(readFileSync(themeCssPath, "utf-8"));
  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);

  if (componentLibrary === "shadcn") {
    if (!update) {
      // shadcn-vue's own init validates that Tailwind v4 is ALREADY working
      // before it will proceed (confirmed by hitting this for real: it
      // fails with "No Tailwind CSS configuration found" against
      // create-vue's untouched default main.css, even though the Vite
      // plugin + packages are already installed) — unlike the Next.js
      // path, where create-next-app's own --tailwind flag already leaves a
      // working @import "tailwindcss" in globals.css before shadcn's init
      // ever runs. create-vue has no such flag, so this pipeline has to
      // seed the same minimal working state itself first; shadcn-vue's
      // init then rewrites this file with its own richer default on top.
      writeFileSync(join(assetsDir, "main.css"), '@import "tailwindcss";\n', "utf-8");
      runShadcnVueInit(outDir);
      runShadcnVueAddAll(outDir);
      installChartDeps(outDir);

      writeFileSync(join(outDir, "sdsgt-vendored-components.json"), buildVendoredManifest(outDir), "utf-8");
      filesWritten.push("sdsgt-vendored-components.json");
    }

    // Fixed 2026-09-17 (see docs/layer2-layer3-plan.md's dated follow-up
    // entry) — this used to be a plain substring check ("is this exact
    // font-face text already present"), which could add a NEW font's rules
    // on `--update` but could never find and remove a STALE font-face rule
    // left over from a since-changed font choice, since nothing bounded
    // where "this pipeline's font-face block" started or ended. Now uses
    // its own guarded block (SDSGT_FONT_BLOCK_START/END, independent of the
    // theme-override block below) so a changed font is a real block
    // REPLACE, not an append next to old, now-orphaned rules.
    const mainCssPath = join(assetsDir, "main.css");
    let mainCss = patchShadcnDefaultFontVars(stripDefaultGoogleFontsImport(readFileSync(mainCssPath, "utf-8")), families);

    if (fontFaceCss) {
      const fontBlock = buildShadcnFontFaceBlock(fontFaceCss);
      const fontBlockKey = join("src", "assets", "main.css#sdsgt-font-block");
      const fontBlockResult = guardedBlockReplace(mainCss, fontBlock, manifest[fontBlockKey], { force }, { start: SDSGT_FONT_BLOCK_START, end: SDSGT_FONT_BLOCK_END });
      nextManifest[fontBlockKey] = fontBlockResult.hash;
      if (fontBlockResult.written) {
        mainCss = fontBlockResult.content;
        filesWritten.push("src/assets/main.css (SDSGT font-face block)");
      } else if (fontBlockResult.warning) {
        warnings.push(`src/assets/main.css: ${fontBlockResult.warning}`);
      }
    }
    // No `else` branch for a missing fontsDir on `update`: same as before,
    // an update run made without --fonts-dir leaves whatever font-face
    // block (or absence of one) is already on disk untouched, rather than
    // guessing whether its removal was intended.

    const block = buildShadcnMainCssBlock(readFileSync(shadcnThemeCssPath, "utf-8"), families);
    const blockKey = join("src", "assets", "main.css#sdsgt-block");
    const blockResult = guardedBlockReplace(mainCss, block, manifest[blockKey], { force });
    nextManifest[blockKey] = blockResult.hash;
    if (blockResult.written) {
      mainCss = blockResult.content;
      filesWritten.push("src/assets/main.css (SDSGT overrides block)");
    } else if (blockResult.warning) {
      warnings.push(`src/assets/main.css: ${blockResult.warning}`);
    }

    writeFileSync(mainCssPath, mainCss, "utf-8");
  } else {
    guarded(join("src", "assets", "theme.css"), readFileSync(themeCssPath));
    guarded(join("src", "assets", "theme-light.css"), readFileSync(themeLightPath));
    const hasDark = existsSync(themeDarkPath);
    if (hasDark) {
      guarded(join("src", "assets", "theme-dark.css"), readFileSync(themeDarkPath));
    }
    guarded(join("src", "assets", "main.css"), buildMainCss({ hasDark, fontFaceCss }));
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName, componentLibrary === "shadcn");
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
