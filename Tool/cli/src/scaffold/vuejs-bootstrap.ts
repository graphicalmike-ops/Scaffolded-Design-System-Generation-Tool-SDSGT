// Layer 3 — Vue.js scaffold, Bootstrap (bootstrap-vue-next) path. See
// scaffold/vuejs.ts for the Tailwind path and scaffold/vuejs-vuetify.ts for
// the Vuetify path — this is closer to the former than the latter in one
// specific way (same base CLI, create-vue — bootstrap-vue-next has no
// scaffolding CLI of its own, confirmed by checking its own npm/GitHub
// source, so there's nothing else to drive) but a genuinely separate design
// language from Tailwind, same "not a variant" treatment vuejs-vuetify.ts
// already uses for its own split from vuejs.ts.
//
// Real ground truth verified 2026-09-14 (npm registry + Bootstrap's own
// docs, not assumed from training data):
// - bootstrap-vue-next (current npm latest, 1.1.0) has no scaffolding CLI —
//   installing means `npm i bootstrap bootstrap-vue-next`, registering
//   `app.use(createBootstrap())` in main.ts, and importing its own separate
//   precompiled CSS (`bootstrap-vue-next/dist/bootstrap-vue-next.css`).
// - Its real npm `dependencies` (reka-ui, @vueuse/core, @floating-ui/vue,
//   @floating-ui/core) install automatically — no Popper.js needed at all,
//   since bootstrap-vue-next reimplements Bootstrap's interactive JS in Vue
//   rather than depending on Bootstrap's own JS bundle.
// - Its own docs explicitly say Bootstrap Sass variable customization isn't
//   done through this library — point at Bootstrap's own "Lean Sass
//   Imports" pattern instead (getbootstrap.com/docs/5.3/getting-started/
//   vite/): a devDependency on `sass`, plus a stylesheet that imports the
//   custom variables BEFORE `@import "bootstrap/scss/bootstrap"`. This
//   pipeline's own `generate --bootstrap` already writes exactly that
//   variables partial (`bootstrap/_variables.scss`) — this scaffold just
//   has to wire it in, not invent a new generator.
// - Fonts don't need Sass recompilation at all: Bootstrap 5.3's compiled CSS
//   exposes `--bs-font-sans-serif`/`--bs-body-font-family` as real runtime
//   CSS custom properties on `:root` (confirmed against Bootstrap's own
//   CSS-variables docs) — overriding them in a later plain CSS rule changes
//   the rendered font with no Sass involved, same "plain CSS custom
//   properties, no build-time preprocessing" posture every other font
//   override in this pipeline already uses (see vuejs-vuetify.ts's own
//   --v-font-body/--v-font-heading treatment). Headings get a direct
//   `h1..h6` rule instead, since Bootstrap only emits a
//   `--bs-headings-font-family` custom property when `$headings-font-family`
//   is explicitly set in Sass (it's `null`/unset by default) — a direct
//   selector override needs no such precondition.
//
// Same real, current oxlint/eslint-plugin-oxlint peer-range drift documented
// in vuejs.ts's own file header applies here too (same create-vue template,
// same devDependency) — same .npmrc fix, not re-derived independently.
//
// Icons: `bootstrap-icons` (the official Bootstrap team package, current npm
// latest 1.13.1, confirmed zero runtime `dependencies`) closes the
// "icons as assets" gap this path shipped without — see
// docs/layer2-layer3-plan.md's own tracking. Deliberately NOT
// `bootstrap-icons-vue` (a third-party, non-Bootstrap-team wrapper exposing
// one Vue component per icon) — `bootstrap-icons` itself is just a CSS/font
// file (`font/bootstrap-icons.css`, confirmed via its real package.json
// `"style"` field), used via plain `bi bi-*` classes the same way every
// Bootstrap consumer already does, no extra abstraction needed.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { copyAgentDocs, parseFontFamiliesFromPlainCss, buildFontFaces, readThemeManifest, writeThemeManifest, guardedWriteFile } from "../shared/scaffold-common.ts";

export interface ScaffoldVuejsBootstrapOptions {
  codeDir: string; // output of `generate --bootstrap --framework vuejs`
  outDir: string; // where a new project gets created (update: false/omitted)
  // or an already-scaffolded one gets refreshed (update: true)
  fontsDir?: string; // same convention/files as promote's --fonts-dir
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

// Locked, non-interactive flag set — identical to vuejs.ts's own
// CREATE_VUE_ARGS (verified there 2026-09-14; same CLI, same behavior,
// nothing Bootstrap-specific about create-vue's own flags).
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

// Same real gotcha as vuejs.ts's own runCreateVue — create-vue treats its
// directory argument as a candidate package name, not just a path, and
// silently drops into an interactive prompt for an absolute path even with
// stdin closed. Same fix: run from outDir's own parent, pass just the
// basename.
function runCreateVue(outDir: string): void {
  run("npx", ["--yes", "create-vue@latest", basename(outDir), ...CREATE_VUE_ARGS], dirname(outDir), "create-vue");
}

function writeNpmrc(outDir: string): void {
  writeFileSync(join(outDir, ".npmrc"), "legacy-peer-deps=true\n", "utf-8");
}

// Bootstrap's own Sass (`_functions.scss`) still uses legacy color functions
// (`green()`/`blue()`/`red()`) and the old `if($cond, $true, $false)` syntax
// that Dart Sass's modern color module/conditional syntax have deprecated —
// confirmed by actually building: 300+ real deprecation warnings, not a
// false positive, coming from bootstrap's own source, not this pipeline's
// generated _variables.scss. The color-function set is Bootstrap's own
// documented fix (getbootstrap.com/docs/5.3/getting-started/vite/);
// `if-function` isn't in that doc's list yet but is the same class of
// "bootstrap's own legacy syntax, not ours to fix" issue, confirmed the same
// way — real build output, not assumed.
function writeViteConfig(outDir: string): void {
  const content = [
    "import { fileURLToPath, URL } from 'node:url'",
    "",
    "import { defineConfig } from 'vite'",
    "import vue from '@vitejs/plugin-vue'",
    "import vueDevTools from 'vite-plugin-vue-devtools'",
    "",
    "// https://vite.dev/config/",
    "export default defineConfig({",
    "  plugins: [",
    "    vue(),",
    "    vueDevTools(),",
    "  ],",
    "  resolve: {",
    "    alias: {",
    "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
    "    },",
    "  },",
    "  css: {",
    "    preprocessorOptions: {",
    "      scss: {",
    "        // Bootstrap's own Sass still uses legacy color functions and",
    "        // if() syntax Dart Sass has deprecated — see",
    "        // getbootstrap.com/docs/5.3/getting-started/vite/.",
    "        silenceDeprecations: ['import', 'mixed-decls', 'color-functions', 'global-builtin', 'if-function'],",
    "      },",
    "    },",
    "  },",
    "})",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "vite.config.ts"), content, "utf-8");
}

// create-vue does not auto-install (see vuejs.ts's own file header) — this
// is also where Bootstrap's own real dependencies get added, since there's
// no built-in --bootstrap flag the way create-next-app has --tailwind.
function installDeps(outDir: string): void {
  run("npm", ["install", "bootstrap", "bootstrap-vue-next", "bootstrap-icons", "--save"], outDir, "npm install bootstrap bootstrap-vue-next bootstrap-icons");
  run("npm", ["install", "sass", "--save-dev"], outDir, "npm install sass");
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

function rewriteAppVue(outDir: string): void {
  const content = [
    "<script setup lang=\"ts\">",
    "import { RouterLink, RouterView } from 'vue-router'",
    "</script>",
    "",
    "<template>",
    '  <nav class="d-flex gap-4 p-4 small">',
    '    <RouterLink to="/">Home</RouterLink>',
    '    <RouterLink to="/about">About</RouterLink>',
    "  </nav>",
    "  <RouterView />",
    "</template>",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "App.vue"), content, "utf-8");
}

// Deliberately light-touch, same restraint as every other scaffold's own
// minimal proof-of-tokens page — but uses a real <BButton variant="primary">
// and a real `bi bi-*` icon class, not just raw markup, since the point is
// proving the theme actually wired into bootstrap-vue-next's OWN component
// system and bootstrap-icons' own CSS, not just that Bootstrap's compiled
// CSS exists.
function rewriteHomeView(outDir: string, projectName: string): void {
  const content = [
    "<template>",
    '  <main class="d-flex flex-column align-items-center justify-content-center text-center gap-4 p-4" style="min-height: 100vh;">',
    '    <h1 class="display-5 fw-bold">Your design system is ready</h1>',
    '    <p style="max-width: 32rem;">',
    `      This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "      and fonts are already wired in. Open <code>src/views/HomeView.vue</code>",
    "      to start building.",
    "    </p>",
    '    <BButton variant="primary"><i class="bi bi-check-circle-fill me-2"></i>Primary button</BButton>',
    "  </main>",
    "</template>",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "views", "HomeView.vue"), content, "utf-8");
}

// Sass entry point — imports the generated variables partial BEFORE
// Bootstrap's own Sass, per Bootstrap's own "Lean Sass Imports" pattern
// (see file header). `@import "./variables"` resolves to `_variables.scss`
// sitting next to it (Sass partial convention — no underscore/extension in
// the import path). Not token-derived itself (just two static import
// lines), so `scaffold --update` doesn't touch it — only `_variables.scss`
// and `theme.css` actually change when tokens change.
function writeMainScss(assetsDir: string): void {
  const content = ['@import "./variables";', '@import "bootstrap/scss/bootstrap";', ""].join("\n");
  writeFileSync(join(assetsDir, "main.scss"), content, "utf-8");
}

// Plain-CSS font override, applied after the compiled Bootstrap CSS loads —
// see file header for why this needs no Sass recompilation.
function buildThemeCss(families: { primary: string; secondary?: string }, fontFaceCss: string): string {
  const bodyFont = families.secondary ?? families.primary;
  const parts = [fontFaceCss, [":root {", `  --bs-font-sans-serif: ${bodyFont}, sans-serif;`, "}", "", `h1, h2, h3, h4, h5, h6 {`, `  font-family: ${families.primary}, sans-serif;`, "}"].join("\n")].filter(
    Boolean,
  );
  return `${parts.join("\n\n")}\n`;
}

function writeMainTs(outDir: string): void {
  const content = [
    "import { createApp } from 'vue'",
    "import { createBootstrap } from 'bootstrap-vue-next/plugins/createBootstrap'",
    "",
    "import App from './App.vue'",
    "import router from './router'",
    "",
    "// Compiled Bootstrap CSS (your generated colors/radius already baked in)",
    "import './assets/main.scss'",
    "// bootstrap-vue-next's own component CSS",
    "import 'bootstrap-vue-next/dist/bootstrap-vue-next.css'",
    "// Bootstrap Icons — plain CSS classes, e.g. <i class=\"bi bi-heart\">",
    "import 'bootstrap-icons/font/bootstrap-icons.css'",
    "// Fonts — see styles/theme.css",
    "import './assets/theme.css'",
    "",
    "const app = createApp(App)",
    "",
    "app.use(router)",
    "app.use(createBootstrap())",
    "",
    "app.mount('#app')",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "main.ts"), content, "utf-8");
}

function writeReadme(outDir: string, projectName: string): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — a Vue.js + bootstrap-vue-next (Bootstrap) project",
    "with your design system's colors and fonts already wired in.",
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
    "- `src/assets/_variables.scss` — your generated Bootstrap Sass variable",
    "  overrides (colors, border-radius). After editing tokens, run `generate`",
    "  then `scaffold --update` (same flags, --out pointing back at this",
    "  project) to refresh these in place; don't hand-edit them directly — an",
    "  update run warns instead of silently overwriting a hand-edited file.",
    "- `src/assets/main.scss` — imports `_variables.scss` before Bootstrap's",
    "  own Sass, so your colors override Bootstrap's defaults (Bootstrap's",
    "  own tint-color()/shade-color() derive every tint/shade from there).",
    "- `src/assets/theme.css` — your real brand fonts, plus the",
    "  `--bs-font-sans-serif` custom property Bootstrap's compiled CSS reads",
    "  for typography.",
    "- `bootstrap-icons` is installed and imported in `main.ts` — use any icon",
    "  with a plain class, e.g. `<i class=\"bi bi-heart\"></i>` (full list at",
    "  icons.getbootstrap.com).",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "- `.npmrc` — sets `legacy-peer-deps=true`. Needed because of a real,",
    "  current version drift between create-vue's own `oxlint` and",
    "  `eslint-plugin-oxlint` devDependencies (not something this project",
    "  introduced) — safe to remove once that upstream drift resolves itself.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldVuejsBootstrap(opts: ScaffoldVuejsBootstrapOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir, update = false, force = false } = opts;

  const variablesScssPath = join(codeDir, "bootstrap", "_variables.scss");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(variablesScssPath)) {
    throw new Error(`No Bootstrap Sass variables found in ${codeDir} — run \`generate --bootstrap --framework vuejs\` first.`);
  }
  if (!existsSync(tokensCssPath)) {
    throw new Error(`No ${tokensCssPath} found — was ${codeDir} really written by this pipeline's \`generate\`? Font family names come from there.`);
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
    writeViteConfig(outDir);
    filesWritten.push("vite.config.ts");
    installDeps(outDir);

    removeBoilerplate(outDir);
    rewriteIndexHtml(outDir, projectName);
    filesWritten.push("index.html");
    rewriteAppVue(outDir);
    filesWritten.push("src/App.vue");
    rewriteHomeView(outDir, projectName);
    filesWritten.push("src/views/HomeView.vue");
  }

  const assetsDir = join(outDir, "src", "assets");

  if (!update) {
    writeMainScss(assetsDir);
    filesWritten.push("src/assets/main.scss");
  }

  guarded(join("src", "assets", "_variables.scss"), readFileSync(variablesScssPath));

  const families = parseFontFamiliesFromPlainCss(readFileSync(tokensCssPath, "utf-8"));
  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);
  guarded(join("src", "assets", "theme.css"), buildThemeCss(families, fontFaceCss));

  if (!update) {
    writeMainTs(outDir);
    filesWritten.push("src/main.ts");
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName);
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
