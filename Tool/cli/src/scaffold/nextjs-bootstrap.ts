// Layer 3 — Next.js scaffold, Bootstrap (React-Bootstrap) path. See
// scaffold/nextjs.ts for the Tailwind/shadcn path and
// scaffold/vuejs-bootstrap.ts for the Vue.js equivalent of this file — same
// "genuinely separate design language, not a variant" treatment, same base
// CLI (`create-next-app`) driven with a different flag set instead of a
// dedicated one, since React-Bootstrap has no scaffolding CLI of its own.
//
// Real ground truth verified (npm registry + Next.js's own current docs +
// react-bootstrap's own real dependency graph, not assumed from training
// data):
// - **create-next-app now defaults `--tailwind` to on** (current Next.js CLI
//   docs, "Initialize with Tailwind CSS config (default)") — the existing
//   Tailwind scaffold (nextjs.ts) passes it explicitly anyway, but this path
//   needs the real negation flag, `--no-tailwind` (confirmed current
//   convention: "`--no-*` — Negate default options. E.g. `--no-ts`").
// - **react-bootstrap's own real npm `dependencies`** pull in
//   `@restart/ui`, which itself lists `@popperjs/core` as a real
//   `dependency` (not a peer) — confirmed by reading both packages' actual
//   published `package.json`. No separate Popper install needed, despite
//   older tutorials suggesting otherwise (real current dependency graph
//   settles it either way).
// - **react-bootstrap ships no `"use client"` directive in its own build**
//   (confirmed: open upstream issue, react-bootstrap/react-bootstrap#6792,
//   asking for exactly this, unresolved) — unlike some modern React
//   libraries that bundle the directive for RSC compatibility. Any file
//   that renders a real react-bootstrap component needs its own `"use
//   client"` at the top; this scaffold's own proof-of-tokens page does.
// - **Same Sass wiring as the Vue.js Bootstrap path** — react-bootstrap's
//   own docs say the same thing bootstrap-vue-next's do: Bootstrap Sass
//   variable customization isn't done through the component library, use
//   Bootstrap's own "Lean Sass Imports" pattern instead. This pipeline's
//   `generate --bootstrap` already writes the variables partial that needs
//   (`bootstrap/_variables.scss`) — reused as-is, no new generator work.
// - **Next.js's own `sassOptions.quietDeps`** (confirmed passthrough to the
//   real `sass`/`sass-embedded` compiler options — Next's own docs say
//   `sassOptions` isn't typed beyond `implementation` because unknown keys
//   pass straight through, and this pipeline confirmed it by actually
//   building) silences Bootstrap's own legacy-Sass deprecation-warning noise
//   (same real 300+-warning finding as the Vue.js path) — real Turbopack
//   build output confirmed it suppresses every one of them. Two warnings
//   survived that pass, though: this file's own `@import` statements (a
//   real, separate, current Dart Sass deprecation about the `@import`
//   at-rule itself, reported at the call site in globals.scss, not inside
//   a dependency — `quietDeps` correctly leaves call-site warnings alone).
//   Bootstrap's own docs still recommend `@import` for this exact pattern
//   (not the newer `@use`/`with` syntax, which needs the override variables
//   passed explicitly rather than just defined before an `@import`), so
//   this silences that one deprecation ID too (`silenceDeprecations:
//   ["import"]`) rather than migrating syntax ahead of Bootstrap's own docs.
// - **Icons**: `bootstrap-icons` (the official Bootstrap team package,
//   confirmed zero runtime dependencies) installs the same way it does for
//   the Vue.js path — see vuejs-bootstrap.ts's own file header for why not
//   a third-party per-icon wrapper.
//
// Same "reuses generate --bootstrap's own partial, no new generator work"
// posture as vuejs-bootstrap.ts throughout.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { copyAgentDocs, parseFontFamiliesFromPlainCss, buildFontFaces, readThemeManifest, writeThemeManifest, guardedWriteFile } from "../shared/scaffold-common.ts";

export interface ScaffoldNextjsBootstrapOptions {
  codeDir: string; // output of `generate --bootstrap --framework nextjs`
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

// Locked, non-interactive flag set — same base as nextjs.ts's own
// CREATE_NEXT_APP_ARGS, but --no-tailwind instead of --tailwind (see file
// header: Tailwind now defaults ON, this path needs the real negation
// flag). Verified 2026-09-14 against a real run, zero prompts, stdin closed.
const CREATE_NEXT_APP_ARGS = [
  "--yes",
  "--ts",
  "--no-tailwind",
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

function run(cmd: string, args: string[], cwd: string, label: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not run ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status ?? "unknown"} — see output above for the real error.`);
  }
}

// create-next-app auto-installs its own base deps (unlike create-vue) — this
// is just the extra Bootstrap-specific install on top.
function installDeps(outDir: string): void {
  run("npm", ["install", "bootstrap", "react-bootstrap", "bootstrap-icons", "--save"], outDir, "npm install bootstrap react-bootstrap bootstrap-icons");
  run("npm", ["install", "sass", "--save-dev"], outDir, "npm install sass");
}

// See file header — quietDeps targets Bootstrap's own legacy Sass
// specifically (a node_modules dependency), the more precise tool here than
// naming individual deprecation IDs.
function writeNextConfig(outDir: string): void {
  const content = [
    "import type { NextConfig } from \"next\";",
    "",
    "const nextConfig: NextConfig = {",
    "  sassOptions: {",
    "    // Bootstrap's own Sass still uses legacy color functions/if()",
    "    // syntax Dart Sass has deprecated — this is dependency noise, not",
    "    // this pipeline's own generated Sass. See file header.",
    "    quietDeps: true,",
    "    // This file's own \"@import\" (Bootstrap's own documented \"Lean Sass",
    "    // Imports\" pattern still uses it, not the newer @use/with syntax)",
    "    // is real, current Dart Sass syntax, just deprecated ahead of a",
    "    // future removal — confirmed by a real build, not assumed.",
    "    silenceDeprecations: [\"import\"],",
    "  },",
    "};",
    "",
    "export default nextConfig;",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "next.config.ts"), content, "utf-8");
}

// Sass entry point — same "Lean Sass Imports" pattern as the Vue.js
// Bootstrap path's main.scss. `@import "./variables"` resolves to
// `_variables.scss` sitting next to it (Sass partial convention). Not
// token-derived itself (just two static import lines), so `scaffold
// --update` doesn't touch it — only `_variables.scss` and `theme.css`
// actually change when tokens change.
function writeGlobalsScss(appDir: string): void {
  const content = ['@import "./variables";', '@import "bootstrap/scss/bootstrap";', ""].join("\n");
  writeFileSync(join(appDir, "globals.scss"), content, "utf-8");
}

// Plain-CSS font override, same runtime-CSS-custom-property treatment as
// vuejs-bootstrap.ts's writeThemeCss — see that file's header for why this
// needs no Sass recompilation.
function buildThemeCss(families: { primary: string; secondary?: string }, fontFaceCss: string): string {
  const bodyFont = families.secondary ?? families.primary;
  const parts = [fontFaceCss, [":root {", `  --bs-font-sans-serif: ${bodyFont}, sans-serif;`, "}", "", `h1, h2, h3, h4, h5, h6 {`, `  font-family: ${families.primary}, sans-serif;`, "}"].join("\n")].filter(
    Boolean,
  );
  return `${parts.join("\n\n")}\n`;
}

// Strips Next's own default Geist font wiring, same reasoning as nextjs.ts's
// own rewriteLayoutTsx — fonts are loaded via the hand-authored @font-face
// block in theme.css instead.
function rewriteLayoutTsx(appDir: string, projectName: string): void {
  const content = [
    'import type { Metadata } from "next";',
    'import "./globals.scss";',
    'import "bootstrap-icons/font/bootstrap-icons.css";',
    'import "./theme.css";',
    "",
    "export const metadata: Metadata = {",
    `  title: "${projectName}",`,
    '  description: "Built with SDSGT — design system already wired in.",',
    "};",
    "",
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    "  return (",
    '    <html lang="en">',
    "      <body>{children}</body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "layout.tsx"), content, "utf-8");
}

// "use client" is required here — react-bootstrap ships no such directive
// in its own build (see file header), so any file rendering its components
// needs one. Uses a real <Button variant="primary"> and a real `bi bi-*`
// icon class, same "prove it's actually wired, not just installed"
// treatment as vuejs-bootstrap.ts's own proof-of-tokens page.
function writePageTsx(appDir: string, projectName: string): void {
  const content = [
    '"use client";',
    "",
    'import Button from "react-bootstrap/Button";',
    "",
    "export default function Home() {",
    "  return (",
    '    <main className="d-flex min-vh-100 flex-column align-items-center justify-content-center gap-4 p-4 text-center">',
    '      <h1 className="display-5 fw-bold">Your design system is ready</h1>',
    '      <p style={{ maxWidth: "32rem" }}>',
    `        This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "        and fonts are already wired in. Open <code>src/app/page.tsx</code> to",
    "        start building.",
    "      </p>",
    '      <Button variant="primary">',
    '        <i className="bi bi-check-circle-fill me-2" />',
    "        Primary button",
    "      </Button>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "page.tsx"), content, "utf-8");
}

function writeReadme(outDir: string, projectName: string): void {
  const content = [
    `# ${projectName}`,
    "",
    "Generated by SDSGT — a Next.js + React-Bootstrap project with your design",
    "system's colors and fonts already wired in.",
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
    "- `src/app/_variables.scss` — your generated Bootstrap Sass variable",
    "  overrides (colors, border-radius). After editing tokens, run `generate`",
    "  then `scaffold --update` (same flags, --out pointing back at this",
    "  project) to refresh these in place; don't hand-edit them directly — an",
    "  update run warns instead of silently overwriting a hand-edited file.",
    "- `src/app/globals.scss` — imports `_variables.scss` before Bootstrap's",
    "  own Sass, so your colors override Bootstrap's defaults.",
    "- `src/app/theme.css` — your real brand fonts, plus the",
    "  `--bs-font-sans-serif` custom property Bootstrap's compiled CSS reads",
    "  for typography.",
    "- `bootstrap-icons` is installed and imported in `layout.tsx` — use any",
    "  icon with a plain class, e.g. `<i className=\"bi bi-heart\" />` (full",
    "  list at icons.getbootstrap.com).",
    "- Any file that renders a `react-bootstrap` component needs its own",
    "  `\"use client\"` directive at the top — react-bootstrap doesn't ship",
    "  one itself (see `src/app/page.tsx` for an example). `AGENTS.md`",
    "  already tells a coding agent this.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldNextjsBootstrap(opts: ScaffoldNextjsBootstrapOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir, update = false, force = false } = opts;

  const variablesScssPath = join(codeDir, "bootstrap", "_variables.scss");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(variablesScssPath)) {
    throw new Error(`No Bootstrap Sass variables found in ${codeDir} — run \`generate --bootstrap --framework nextjs\` first.`);
  }
  if (!existsSync(tokensCssPath)) {
    throw new Error(`No ${tokensCssPath} found — was ${codeDir} really written by this pipeline's \`generate\`? Font family names come from there.`);
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
    writeNextConfig(outDir);
    filesWritten.push("next.config.ts");
    installDeps(outDir);
  }

  const appDir = join(outDir, "src", "app");

  if (!update) {
    // create-next-app's own default (plain, non-Tailwind since
    // --no-tailwind was passed) globals.css is superseded by globals.scss
    // below — remove it rather than leave an unimported, dead file sitting
    // in the project.
    const defaultGlobalsCss = join(appDir, "globals.css");
    if (existsSync(defaultGlobalsCss)) rmSync(defaultGlobalsCss);

    writeGlobalsScss(appDir);
    filesWritten.push("src/app/globals.scss");
  }

  guarded(join("src", "app", "_variables.scss"), readFileSync(variablesScssPath));

  const families = parseFontFamiliesFromPlainCss(readFileSync(tokensCssPath, "utf-8"));
  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);
  guarded(join("src", "app", "theme.css"), buildThemeCss(families, fontFaceCss));

  if (!update) {
    rewriteLayoutTsx(appDir, projectName);
    filesWritten.push("src/app/layout.tsx");

    writePageTsx(appDir, projectName);
    filesWritten.push("src/app/page.tsx");
  }

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  if (!update) {
    writeReadme(outDir, projectName);
    filesWritten.push("README.md");
  }

  writeThemeManifest(outDir, nextManifest);

  return { filesWritten, projectDir: outDir, warnings };
}
