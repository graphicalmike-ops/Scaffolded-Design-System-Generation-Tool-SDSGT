// Layer 3 — Next.js scaffold, MUI (Material Design 2) path. See
// scaffold/nextjs.ts for the Tailwind/shadcn path and
// scaffold/nextjs-bootstrap.ts for the Bootstrap equivalent of this file —
// same "genuinely separate design language" split, same base CLI
// (`create-next-app --no-tailwind`) since MUI has no scaffolding CLI of its
// own either. This closes the very last "not built" line in this pipeline's
// own Layer 3 tracking (docs/layer2-layer3-plan.md) — every framework this
// pipeline supports now has a real scaffold or component-library install for
// every design language it offers.
//
// Real ground truth verified (npm registry + MUI's own current docs, not
// assumed from training data):
// - **MUI 9.4.0 is current npm latest** — matches this pipeline's already-
//   decided "MUI 9.x" version target (pipeline-plan.md, "Generators"),
//   verified fresh rather than assumed still current.
// - **`@emotion/react`/`@emotion/styled` are now OPTIONAL peers of
//   `@mui/material`** (MUI 9 also supports a zero-runtime Pigment CSS
//   alternative) — the classic Emotion-based setup this pipeline uses still
//   needs both installed explicitly, they just don't come in automatically.
// - **`@mui/material-nextjs`'s `AppRouterCacheProvider` has a real,
//   version-specific subpath per Next.js major** (confirmed via its actual
//   published `exports` map: `v13`/`v14`/`v15`/`v16-appRouter`) — this
//   pipeline's `create-next-app@latest` installs Next.js 16.x today, so
//   `@mui/material-nextjs/v16-appRouter` is the correct import, not the
//   `v15-appRouter` path MUI's own docs page still shows as its lead
//   example (their docs hadn't been updated for the new major at the time
//   of writing — checked the package's real exports rather than trusting
//   the doc page's copy-paste example).
// - **The theme file itself needs `"use client"`**, confirmed against MUI's
//   own current Next.js integration guide — not because `createTheme()`
//   needs to run on the client, but because the theme object (which
//   contains functions, e.g. `breakpoints` helpers) has to be created
//   directly inside client-module space rather than passed as a prop
//   crossing the Server-to-Client boundary from `layout.tsx`.
// - **`layout.tsx` itself does NOT need `"use client"`** — unlike
//   react-bootstrap (scaffold/nextjs-bootstrap.ts), MUI's own components
//   (`ThemeProvider`, `CssBaseline`, `Button`, every `@mui/icons-material`
//   icon) already ship a real `"use client"` directive in their own build
//   (confirmed: MUI's own 2023 blog post on this, done specifically for
//   Next.js App Router compatibility) — a genuine difference from
//   react-bootstrap's own still-open gap on this exact point. `page.tsx`
//   rendering a real `<Button>`/icon needs no directive of its own either.
// - **`CssBaseline` applies `background`/`color`/`font-family` from the
//   theme automatically** (MUI's own documented CSS reset behavior) — no
//   hand-written body CSS needed the way the Tailwind/Bootstrap paths each
//   need, since MUI's own component reads `theme.palette.background.default`
//   /`theme.palette.text.primary`/`theme.typography.fontFamily` itself.
// - **`generate --md2`'s own `palette.ts` is mode-agnostic** (verified by
//   reading the real generator source, `generate/md2.ts`) — it reads
//   primitive-level color values directly, not the semantic per-mode files
//   Vuetify's own generator reads, so there's no light/dark branching to
//   wire here the way vuejs-vuetify.ts's own `hasLight`/`hasDark` check
//   needs. One theme, not two — a real, current limit of Layer 2's MD2
//   generator, not something this scaffold works around.
// - **Icons**: `@mui/icons-material` (official MUI package, peer-pinned to
//   the exact same `@mui/material` version) closes the "icons as assets"
//   gap the same way `bootstrap-icons` did for both Bootstrap paths.
// - **`shape.borderRadius` wired 2026-09-15** — a real gap found while
//   building the Figma component push: this pipeline's own corner-
//   roundness preset never reached MUI's real components before this,
//   only color did. `theme.shape.borderRadius` is a real, single pixel-
//   number MUI itself reads directly for virtually every component
//   (Button, Card, Paper, ...) — bound to `radius.md` (the same token
//   this pipeline's own Bootstrap generator already treats as the "base"
//   radius, not `lg`, for consistency). Button's own real *padding* is a
//   separate, still-open gap — MUI doesn't derive it from `theme.spacing`
//   by default, and wiring it needs a real `components.MuiButton.
//   styleOverrides` addition, not yet done; disclosed, not silently
//   assumed fixed alongside radius.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { copyAgentDocs, parseFontFamiliesFromPlainCss, buildFontFaces } from "../shared/scaffold-common.ts";

// Reads a single `--<name>: <N>px;` custom property out of the base
// plain-CSS platform's own css/tokens.css — same source/reasoning as
// figma-components-plan.ts's own readCssScale, just for one value instead
// of a whole scale. Real gap fix, 2026-09-15 (see file header addendum
// below): MUI's own shape.borderRadius was never wired to this pipeline's
// radius tokens until now — every MUI component read MUI's own hardcoded
// default (4px) regardless of the corner-roundness preset chosen at seed
// input.
function readCssVarPx(tokensCss: string, name: string): number {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([\\d.]+)px;`));
  if (!match) throw new Error(`No --${name} custom property found in css/tokens.css — was it written by this pipeline's \`generate\`?`);
  return parseFloat(match[1]);
}

export interface ScaffoldNextjsMuiOptions {
  codeDir: string; // output of `generate --md2 --framework nextjs`
  outDir: string; // where the new project gets created — must not already exist
  fontsDir?: string; // same convention/files as promote's --fonts-dir
}

export interface ScaffoldResult {
  filesWritten: string[];
  projectDir: string;
}

// Same locked flag set as nextjs-bootstrap.ts — --no-tailwind since MUI is
// also not a Tailwind consumer, everything else identical.
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
// is just the extra MUI-specific install on top. No Sass devDependency here
// — MUI is CSS-in-JS (Emotion), not Sass, unlike either Bootstrap path.
function installDeps(outDir: string): void {
  run(
    "npm",
    ["install", "@mui/material", "@emotion/react", "@emotion/styled", "@mui/material-nextjs", "@emotion/cache", "@mui/icons-material", "--save"],
    outDir,
    "npm install @mui/material @emotion/react @emotion/styled @mui/material-nextjs @emotion/cache @mui/icons-material",
  );
}

// See file header — "use client" here, not in layout.tsx, per MUI's own
// current Next.js integration guide.
//
// Real bug found and fixed: a multi-word font family's raw token value
// already includes literal quote characters (e.g. `'Source Sans Pro'` —
// confirmed by reading a real generated css/tokens.css), while a
// single-word one (`Inter`) doesn't. Naively wrapping that raw value in
// another hand-written single-quoted TS string literal broke on the
// multi-word case (`''Source Sans Pro', sans-serif'` — invalid syntax,
// caught by a real `next build` failure). Fixed by stripping any
// pre-existing quotes first (same pattern scaffold-common.ts's
// `buildFontFaces` already uses for the identical reason) and using
// `JSON.stringify` to safely produce the TS string literal, rather than
// hand-rolled quoting.
function writeThemeTs(appDir: string, families: { primary: string; secondary?: string }, borderRadius: number): void {
  const unquote = (f: string) => f.replace(/^['"]|['"]$/g, "");
  const bodyFont = `${unquote(families.secondary ?? families.primary)}, sans-serif`;
  const headingFont = `${unquote(families.primary)}, sans-serif`;

  const content = [
    '"use client";',
    "",
    'import { createTheme } from "@mui/material/styles";',
    "",
    'import { palette } from "./theme-palette";',
    "",
    "const theme = createTheme({",
    "  palette,",
    "  // Real radius.md token (matches this pipeline's own Bootstrap base-",
    "  // radius mapping) — MUI's own components (Button, Card, Paper, ...)",
    "  // all read this one value directly, no per-component override needed.",
    `  shape: { borderRadius: ${borderRadius} },`,
    "  typography: {",
    `    fontFamily: ${JSON.stringify(bodyFont)},`,
    `    h1: { fontFamily: ${JSON.stringify(headingFont)} },`,
    `    h2: { fontFamily: ${JSON.stringify(headingFont)} },`,
    `    h3: { fontFamily: ${JSON.stringify(headingFont)} },`,
    `    h4: { fontFamily: ${JSON.stringify(headingFont)} },`,
    `    h5: { fontFamily: ${JSON.stringify(headingFont)} },`,
    `    h6: { fontFamily: ${JSON.stringify(headingFont)} },`,
    "  },",
    "});",
    "",
    "export default theme;",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "theme.ts"), content, "utf-8");
}

// Font FILES only — MUI/CssBaseline reads fontFamily from the theme object
// itself (see file header), no plain-CSS custom-property override needed
// the way the Tailwind/Bootstrap paths each need one.
function writeFontFacesCss(appDir: string, fontFaceCss: string): void {
  const content = [
    "/* Design tokens generated by SDSGT — do not hand-edit; re-run `generate`",
    "   instead, since this whole file gets overwritten by the next scaffold. */",
    "",
    fontFaceCss,
    "",
  ].join("\n");
  writeFileSync(join(appDir, "fonts.css"), content, "utf-8");
}

function rewriteLayoutTsx(appDir: string, projectName: string, hasFonts: boolean): void {
  const content = [
    'import type { Metadata } from "next";',
    'import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";',
    'import { ThemeProvider } from "@mui/material/styles";',
    'import CssBaseline from "@mui/material/CssBaseline";',
    ...(hasFonts ? ['import "./fonts.css";'] : []),
    "",
    'import theme from "./theme";',
    "",
    "export const metadata: Metadata = {",
    `  title: "${projectName}",`,
    '  description: "Built with SDSGT — design system already wired in.",',
    "};",
    "",
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    "  return (",
    '    <html lang="en">',
    "      <body>",
    "        <AppRouterCacheProvider>",
    "          <ThemeProvider theme={theme}>",
    "            <CssBaseline />",
    "            {children}",
    "          </ThemeProvider>",
    "        </AppRouterCacheProvider>",
    "      </body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(appDir, "layout.tsx"), content, "utf-8");
}

// No "use client" needed here — see file header: MUI's own Button/icon
// components already ship the directive in their own build, a real
// difference from react-bootstrap's own still-open gap on this point. Real
// <Button>/<CheckCircleIcon>, not raw markup, same "prove it's actually
// wired" treatment as every other Bootstrap/Vuetify/Paper scaffold.
//
// Real TS finding caught by an actual `next build` typecheck: `fontWeight`
// is NOT a direct `Typography` prop in current MUI 9 typings (it broke
// overload resolution entirely, not just a missing-prop warning) — `sx={{
// fontWeight: 700 }}` is the always-valid styling API instead.
function writePageTsx(appDir: string, projectName: string): void {
  const content = [
    'import Button from "@mui/material/Button";',
    'import Typography from "@mui/material/Typography";',
    'import CheckCircleIcon from "@mui/icons-material/CheckCircle";',
    "",
    "export default function Home() {",
    "  return (",
    "    <main",
    "      style={{",
    "        display: \"flex\",",
    "        minHeight: \"100vh\",",
    "        flexDirection: \"column\",",
    "        alignItems: \"center\",",
    "        justifyContent: \"center\",",
    "        gap: \"1rem\",",
    "        padding: \"2rem\",",
    "        textAlign: \"center\",",
    "      }}",
    "    >",
    '      <Typography variant="h3" sx={{ fontWeight: 700 }}>',
    "        Your design system is ready",
    "      </Typography>",
    '      <Typography style={{ maxWidth: "32rem" }}>',
    `        This project was generated by SDSGT — ${projectName}'s tokens, colors,`,
    "        and fonts are already wired in. Open <code>src/app/page.tsx</code> to",
    "        start building.",
    "      </Typography>",
    '      <Button variant="contained" color="primary" startIcon={<CheckCircleIcon />}>',
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
    "Generated by SDSGT — a Next.js + MUI (Material Design) project with your",
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
    "- `src/app/theme-palette.ts` — your generated MUI palette (main/light/",
    "  dark/contrastText per color). Re-run SDSGT's `generate` step to update",
    "  this; don't hand-edit it directly, since the next scaffold run",
    "  overwrites it.",
    "- `src/app/theme.ts` — wires `theme-palette.ts` into a real",
    "  `createTheme()`, plus your real brand fonts. Needs its own",
    "  `\"use client\"` directive (see the file itself for why).",
    "- `src/app/fonts.css` — your real brand `@font-face` rules. `CssBaseline`",
    "  (in `layout.tsx`) reads `theme.typography.fontFamily` automatically —",
    "  no extra CSS override needed.",
    "- `@mui/icons-material` is installed — import any icon directly, e.g.",
    "  `import CheckCircleIcon from \"@mui/icons-material/CheckCircle\";`.",
    "- MUI's own components (`Button`, `ThemeProvider`, every icon) already",
    "  ship their own `\"use client\"` directive, so most pages using them",
    "  don't need one themselves — `AGENTS.md` already tells a coding agent",
    "  this.",
    "- `AGENTS.md` — rules an AI coding agent should follow when adding UI to",
    "  this project, so it uses your design system correctly.",
    "- `foundations-rules.md` — universal accessibility/UX rules.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), content, "utf-8");
}

export function scaffoldNextjsMui(opts: ScaffoldNextjsMuiOptions): ScaffoldResult {
  const { codeDir, outDir, fontsDir } = opts;

  const paletteTsPath = join(codeDir, "mui", "palette.ts");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(paletteTsPath)) {
    throw new Error(`No MUI palette found in ${codeDir} — run \`generate --md2 --framework nextjs\` first.`);
  }
  if (!existsSync(tokensCssPath)) {
    throw new Error(`No ${tokensCssPath} found — was ${codeDir} really written by this pipeline's \`generate\`? Font family names come from there.`);
  }
  if (existsSync(outDir)) {
    throw new Error(`${outDir} already exists — scaffold needs a path that doesn't exist yet, so create-next-app can create it fresh.`);
  }

  const projectName = basename(outDir);
  const filesWritten: string[] = [];

  runCreateNextApp(outDir);
  installDeps(outDir);

  const appDir = join(outDir, "src", "app");

  // create-next-app's own default (plain, non-Tailwind since --no-tailwind
  // was passed) globals.css is unused here — MUI's CssBaseline is this
  // project's reset, not a hand-written stylesheet.
  const defaultGlobalsCss = join(appDir, "globals.css");
  if (existsSync(defaultGlobalsCss)) rmSync(defaultGlobalsCss);

  writeFileSync(join(appDir, "theme-palette.ts"), readFileSync(paletteTsPath, "utf-8"), "utf-8");
  filesWritten.push("src/app/theme-palette.ts");

  const tokensCss = readFileSync(tokensCssPath, "utf-8");
  const families = parseFontFamiliesFromPlainCss(tokensCss);
  const borderRadius = readCssVarPx(tokensCss, "radius-md");
  writeThemeTs(appDir, families, borderRadius);
  filesWritten.push("src/app/theme.ts");

  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);
  const hasFonts = fontFaceCss.length > 0;
  if (hasFonts) {
    writeFontFacesCss(appDir, fontFaceCss);
    filesWritten.push("src/app/fonts.css");
  }

  rewriteLayoutTsx(appDir, projectName, hasFonts);
  filesWritten.push("src/app/layout.tsx");

  writePageTsx(appDir, projectName);
  filesWritten.push("src/app/page.tsx");

  filesWritten.push(...copyAgentDocs(codeDir, outDir));

  writeReadme(outDir, projectName);
  filesWritten.push("README.md");

  return { filesWritten, projectDir: outDir };
}
