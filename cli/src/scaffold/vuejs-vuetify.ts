// Layer 3 — Vue.js scaffold, Vuetify (Material Design) path. See
// scaffold/vuejs.ts for the Tailwind path — this is a genuinely separate
// pipeline, not a variant of it: different official CLI (create-vuetify,
// not create-vue), different design language (Material Design via Vuetify's
// own component styling, not Tailwind utility classes), different theme
// source (generate --vuetify's theme.ts, colors only — no Tailwind theme
// involved at all). See docs/layer2-layer3-plan.md, Subject 3, for why both
// paths were built together in the same session rather than one deferred.
//
// Real ground truth verified 2026-09-14, not assumed from training data:
// `create-vuetify --platform vue --css none --features eslint
// --packageManager npm --install --typescript --dir <dir>` runs with zero
// prompts (closed stdin) and, unlike create-vue, DOES auto-install its own
// dependencies (its own --install flag). `--css none` is deliberate — this
// pipeline's Vuetify integration has always been colors-only (see
// generate/vuetify.ts's own "decided scope" comment), so no utility CSS
// framework belongs in this path at all, consistent with the Pattern A
// SETUP.md snippet already shipped for adding Vuetify to an EXISTING
// project (never mentions Tailwind either).
//
// Fonts: Vuetify's own real installed SCSS source (packages/vuetify/src/
// styles/settings/_variables.scss) defines $body-font-family as
// `var(--v-font-body, 'Roboto', sans-serif)` and $heading-font-family
// similarly via --v-font-heading — confirmed by reading the actual
// installed package, not the (JS-rendered, unfetchable) docs site. That
// means this pipeline never needs to touch Sass at all: setting those two
// CSS custom properties in a plain stylesheet is enough, same "plain CSS
// custom properties, no build-time preprocessing" posture every other
// generator in this pipeline already uses. create-vuetify's own default
// wires a DIFFERENT font mechanism entirely — the `unplugin-fonts` Vite
// plugin fetching Roboto from a local @fontsource package (not a network
// CDN, but still a font this project doesn't want) — removed here in favor
// of this pipeline's own already-fetched real font files, same reasoning
// as nextjs.ts's own avoidance of next/font/google.
//
// Icons: @mdi/font (Material Design Icons) comes vendored automatically by
// create-vuetify's own default preset — confirmed via a real run's
// package.json. Resolves the "icons as assets" open question for Vuetify
// (pipeline-plan.md, "Deferred") the same way lucide-react was resolved for
// free by shadcn's own -d preset — no action needed from this pipeline.
//
// create-vuetify also writes its own generic AGENTS.md/README.md (no flag
// found to suppress this, unlike create-next-app's --no-agents-md) — both
// get overwritten with SDSGT's own versions after the fact, same net effect
// as suppressing them, just one step later.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { copyAgentDocs, parseFontFamiliesFromPlainCss, buildFontFaces } from "../shared/scaffold-common.ts";

// Reads a single `--<name>: <N>px;` custom property out of the base
// plain-CSS platform's own css/tokens.css — same reasoning as
// scaffold/nextjs-mui.ts's own readCssVarPx. Real gap fix, 2026-09-15: this
// pipeline's own corner-roundness preset never reached Vuetify's real
// components before this, only color did.
function readCssVarPx(tokensCss: string, name: string): number {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([\\d.]+)px;`));
  if (!match) throw new Error(`No --${name} custom property found in css/tokens.css — was it written by this pipeline's \`generate\`?`);
  return parseFloat(match[1]);
}

// create-vuetify's own default template already writes this file (a
// commented-out `@use 'vuetify/settings' with (...)` example) and already
// wires `vite-plugin-vuetify`'s own `styles.configFile` option at it (see
// writeViteConfig, below) — confirmed live: vite-plugin-vuetify transforms
// the plain `import 'vuetify/styles'` already in the generated plugin file
// to route through this Sass settings file automatically, no separate
// import change needed. `$border-radius-root` is Vuetify's own real base
// Sass variable (confirmed against its own real `$rounded` scale:
// `sm: root/2, null: root, lg: root*2, xl: root*6`) — every one of
// Vuetify's own `rounded-*` utility classes and every component's own
// default radius derives from this single value. Bound to `radius.md`
// (the same token this pipeline's Bootstrap generator already treats as
// the "base" radius, not `lg`) — verified with a real build: the compiled
// CSS's own `.v-btn` rule showed the exact real pixel value, not an
// approximation.
function writeSettingsScss(outDir: string, borderRadius: number): void {
  const content = ["@forward 'vuetify/settings' with (", `  $border-radius-root: ${borderRadius}px`, ");", ""].join("\n");
  writeFileSync(join(outDir, "src", "styles", "settings.scss"), content, "utf-8");
}

export interface ScaffoldVuejsVuetifyOptions {
  codeDir: string; // output of `generate --vuetify --framework vuejs`
  outDir: string; // where the new project gets created — must not already exist
  fontsDir?: string; // same convention/files as promote's --fonts-dir
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
}

function run(cmd: string, args: string[], cwd: string, label: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Real, verified 2026-09-14 flakiness: create-vuetify downloads its own
// template from GitHub at scaffold time (gh:vuetifyjs/cli/templates/vue/
// base#v1.2.1, via its own giget-based downloader) rather than shipping the
// template inside its npm package — confirmed by hitting real, repeated 504
// Gateway Time-outs from that specific download step, even though a plain
// curl HEAD against the same codeload.github.com tarball URL succeeded
// immediately every single time, including moments after a giget failure.
// That rules out a real GitHub outage — most likely giget's own repeated
// GET requests (this exact tarball, hit many times back-to-back while
// verifying this) are tripping some rate-limit or timeout curl's cheap HEAD
// never approaches. Confirmed a failed attempt leaves nothing behind at
// outDir, so a bare retry is safe with no cleanup needed first — backoff is
// increasing (not fixed) since a fixed short delay measurably wasn't enough
// on its own during real testing.
const CREATE_VUETIFY_MAX_ATTEMPTS = 4;
const CREATE_VUETIFY_RETRY_DELAYS_MS = [3000, 8000, 15000];

// Real, verified 2026-09-14 gotcha, same class as create-vue's own (see
// scaffold/vuejs.ts): passing outDir's full absolute path as --dir did NOT
// error and did NOT create the project there either — it silently created
// the project under the CALLING PROCESS's own cwd instead, named after
// outDir's last path segment (confirmed by finding a real, unwanted project
// directory sitting inside this repo's own cli/ folder after a real run).
// Fixed the same way: run from outDir's own parent directory and pass just
// its bare basename.
function runCreateVuetify(outDir: string, projectName: string): void {
  const args = [
    "--yes",
    "create-vuetify@latest",
    "--name", projectName,
    "--platform", "vue",
    "--css", "none",
    "--features", "eslint",
    "--packageManager", "npm",
    "--install",
    "--typescript",
    "--dir", basename(outDir),
  ];

  for (let attempt = 1; attempt <= CREATE_VUETIFY_MAX_ATTEMPTS; attempt += 1) {
    try {
      run("npx", args, dirname(outDir), "create-vuetify");
      return;
    } catch (err) {
      if (attempt === CREATE_VUETIFY_MAX_ATTEMPTS) throw err;
      const delay = CREATE_VUETIFY_RETRY_DELAYS_MS[attempt - 1] ?? CREATE_VUETIFY_RETRY_DELAYS_MS.at(-1)!;
      console.error(`create-vuetify attempt ${attempt} failed (likely a transient template-download hiccup) — retrying in ${delay}ms...`);
      sleepSync(delay);
    }
  }
}

// Full rewrite of a small, known, deterministic file (same precedent as
// nextjs.ts's rewriteLayoutTsx) — branched on hasLight/hasDark exactly like
// the already-shipped Pattern A SETUP.md snippet in generate/vuetify.ts, so
// both Vuetify integration paths (this real scaffold, and the "add to an
// existing project" instructions) behave identically, not two competing
// conventions for the same generator output.
function writeVuetifyPlugin(outDir: string, hasLight: boolean, hasDark: boolean): void {
  const importNames = [hasLight ? "lightTheme" : null, hasDark ? "darkTheme" : null].filter((n): n is string => n !== null).join(", ");
  const themeEntries: string[] = [];
  if (hasLight) themeEntries.push("    light: lightTheme,");
  if (hasDark) themeEntries.push("    dark: darkTheme,");
  const defaultTheme = hasLight ? "light" : "dark";

  const content = [
    "/**",
    " * plugins/vuetify.ts — theme wired in by SDSGT. Re-run `generate` then",
    " * `scaffold` to update; don't hand-edit theme.ts directly, since the next",
    " * scaffold run overwrites it.",
    " */",
    "import { createVuetify } from 'vuetify'",
    "import '@mdi/font/css/materialdesignicons.css'",
    "import 'vuetify/styles'",
    "",
    `import { ${importNames} } from './theme'`,
    "",
    "export default createVuetify({",
    "  theme: {",
    `    defaultTheme: '${defaultTheme}',`,
    "    themes: {",
    ...themeEntries,
    "    },",
    "  },",
    "})",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "plugins", "vuetify.ts"), content, "utf-8");
}

// Replaces create-vuetify's own default (the unplugin-fonts Fonts() plugin
// fetching Roboto from @fontsource) — see file header for why.
function writeViteConfig(outDir: string): void {
  const content = [
    "import { fileURLToPath, URL } from 'node:url'",
    "import Vue from '@vitejs/plugin-vue'",
    "import { defineConfig } from 'vite'",
    "import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'",
    "",
    "// https://vitejs.dev/config/",
    "export default defineConfig({",
    "  plugins: [",
    "    Vue({",
    "      template: { transformAssetUrls },",
    "    }),",
    "    Vuetify({",
    "      autoImport: true,",
    "      styles: {",
    "        configFile: 'src/styles/settings.scss',",
    "      },",
    "    }),",
    "  ],",
    "  define: { 'process.env': {} },",
    "  resolve: {",
    "    alias: {",
    "      '@': fileURLToPath(new URL('src', import.meta.url)),",
    "    },",
    "    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],",
    "  },",
    "  server: {",
    "    port: 3000,",
    "  },",
    "})",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "vite.config.mts"), content, "utf-8");
}

function writeMainTs(outDir: string): void {
  const content = [
    "/**",
    " * main.ts",
    " *",
    " * Bootstraps Vuetify and other plugins then mounts the App",
    " */",
    "",
    "// Composables",
    "import { createApp } from 'vue'",
    "",
    "// Plugins",
    "import { registerPlugins } from '@/plugins'",
    "",
    "// Components",
    "import App from './App.vue'",
    "",
    "// Design tokens (fonts) — see styles/theme.css",
    "import './styles/theme.css'",
    "",
    "const app = createApp(App)",
    "",
    "registerPlugins(app)",
    "",
    "app.mount('#app')",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "main.ts"), content, "utf-8");
}

// Vuetify's own SCSS already reads --v-font-body/--v-font-heading with a
// Roboto fallback (see file header) — setting them here is enough, no Sass
// override needed.
function writeThemeCss(outDir: string, families: { primary: string; secondary?: string }, fontFaceCss: string): void {
  const parts = [fontFaceCss, [":root {", `  --v-font-body: ${families.secondary ?? families.primary}, sans-serif;`, `  --v-font-heading: ${families.primary}, sans-serif;`, "}"].join("\n")].filter(
    Boolean,
  );
  writeFileSync(join(outDir, "src", "styles", "theme.css"), `${parts.join("\n\n")}\n`, "utf-8");
}

// Deliberately light-touch, same restraint as every other scaffold's own
// minimal proof-of-tokens page — but uses a real <v-btn color="primary">,
// not just raw CSS, since the point here is proving the theme actually
// wired into Vuetify's OWN component system, not just that a CSS variable
// exists.
function rewriteAppVue(outDir: string, projectName: string): void {
  const content = [
    "<template>",
    "  <v-app>",
    "    <v-main>",
    '      <v-container class="d-flex flex-column align-center justify-center text-center" style="min-height: 100vh;">',
    '        <h1 class="text-h3 font-weight-bold mb-4">Your design system is ready</h1>',
    '        <p class="mb-6" style="max-width: 32rem;">',
    `          This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "          and fonts are already wired in. Open <code>src/App.vue</code> to start",
    "          building.",
    "        </p>",
    '        <v-btn color="primary">Primary button</v-btn>',
    "      </v-container>",
    "    </v-main>",
    "  </v-app>",
    "</template>",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "src", "App.vue"), content, "utf-8");
}

const BOILERPLATE_PATHS = [
  ["src", "components", "HelloWorld.vue"],
  ["src", "components", "README.md"],
  ["src", "plugins", "README.md"],
  ["src", "styles", "README.md"],
];

function removeBoilerplate(outDir: string): void {
  for (const parts of BOILERPLATE_PATHS) {
    const p = join(outDir, ...parts);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function writeReadme(outDir: string, projectName: string): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — a Vue.js + Vuetify (Material Design) project with your",
    "design system's colors and fonts already wired in.",
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
    "- `src/plugins/theme.ts` — your generated Vuetify theme (light/dark color",
    "  definitions). Re-run SDSGT's `generate` step to update these; don't",
    "  hand-edit them directly, since the next scaffold run overwrites them.",
    "- `src/plugins/vuetify.ts` — wires `theme.ts` into Vuetify's own",
    "  `createVuetify()` setup.",
    "- `src/styles/theme.css` — your real brand fonts, plus the",
    "  `--v-font-body`/`--v-font-heading` custom properties Vuetify's own SCSS",
    "  reads for typography.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldVuejsVuetify(opts: ScaffoldVuejsVuetifyOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir } = opts;

  const vuetifyThemeTsPath = join(codeDir, "vuetify", "theme.ts");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(vuetifyThemeTsPath)) {
    throw new Error(`No Vuetify theme found in ${codeDir} — run \`generate --vuetify --framework vuejs\` first.`);
  }
  if (!existsSync(tokensCssPath)) {
    throw new Error(`No ${tokensCssPath} found — was ${codeDir} really written by this pipeline's \`generate\`? Font family names come from there.`);
  }
  if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-vuetify can create it fresh.`);
  }

  const themeTsContent = readFileSync(vuetifyThemeTsPath, "utf-8");
  const hasLight = /export const lightTheme/.test(themeTsContent);
  const hasDark = /export const darkTheme/.test(themeTsContent);

  const projectName = basename(outDir);
  const filesWritten: string[] = [];

  runCreateVuetify(outDir, projectName);

  removeBoilerplate(outDir);

  writeViteConfig(outDir);
  filesWritten.push("vite.config.mts");

  copyFileSync(vuetifyThemeTsPath, join(outDir, "src", "plugins", "theme.ts"));
  filesWritten.push("src/plugins/theme.ts");
  writeVuetifyPlugin(outDir, hasLight, hasDark);
  filesWritten.push("src/plugins/vuetify.ts");

  const tokensCss = readFileSync(tokensCssPath, "utf-8");
  const families = parseFontFamiliesFromPlainCss(tokensCss);
  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);
  writeThemeCss(outDir, families, fontFaceCss);
  filesWritten.push("src/styles/theme.css");
  writeMainTs(outDir);
  filesWritten.push("src/main.ts");

  writeSettingsScss(outDir, readCssVarPx(tokensCss, "radius-md"));
  filesWritten.push("src/styles/settings.scss");

  rewriteAppVue(outDir, projectName);
  filesWritten.push("src/App.vue");

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  writeReadme(outDir, projectName);
  filesWritten.push("README.md");

  return { filesWritten, projectDir: outDir };
}
