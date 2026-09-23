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
//   radius, not `lg`, for consistency).
// - **Button padding wired 2026-09-16** — the gap flagged above, closed.
//   Verified against the real npm-published @mui/material@9.4.0 tarball's
//   own compiled `Button.js`: the root style's own literal default is
//   `padding: '6px 16px'` (vertical/horizontal), applied to every variant
//   (`contained`/`outlined`/`text` each have their own further override —
//   see below) — not derived from `theme.spacing` at all, confirmed by
//   reading the real source, not assumed. Bound via a real
//   `components.MuiButton.styleOverrides.root` addition to the nearest
//   real spacing tokens (6px/16px targets, same "nearest real value, never
//   fabricated" discipline as `generate/bootstrap.ts`'s own
//   `nearestSpacingPx`). **Disclosed limit, not silently smoothed over**:
//   MUI's real `outlined` (5px 15px) and `text` (6px 8px) variants, plus
//   every `size="small"`/`size="large"` variant×size combination, each
//   carry their OWN separate literal padding in MUI's real source (see
//   `Button.js`) that this single `styleOverrides.root` override does not
//   reach — MUI's own `overridesResolver` applies `styles.root` first and
//   the more specific `styles[variant]`/`styles[size...]` entries second,
//   but ONLY when a project's theme actually defines a *matching* override
//   for that variant/size too — this generator doesn't, so medium/
//   contained gets the real, correct token-bound padding, while every
//   other variant/size still falls back to MUI's own hardcoded literal.
//   Confirmed live, not just reasoned about: a real `next build` + a real
//   Chrome computed-style check on the rendered default Button showed
//   `4px`/`16px` (this pipeline's own nearest tokens), not MUI's own
//   `6px`/`16px` literal. A real, narrower fix than Bootstrap's own (which
//   only has one padding pair to override in the first place).
// - **Typography SIZE scale wired 2026-09-16** — closes the last disclosed
//   MUI gap (font *family* was always bound; pixel sizes weren't). Verified
//   against the real npm-published @mui/material@9.4.0 tarball's own
//   compiled `createTypography.js`: real default px sizes are h1=96, h2=60,
//   h3=48, h4=34, h5=24, h6=20, subtitle1/body1=16, subtitle2/body2/
//   button=14, caption/overline=12. Each bound to the NEAREST real
//   type-scale `fontSize` primitive (same discipline as button padding,
//   above) — not an exact match for most variants, since this pipeline's
//   own type-scale is a curated 8-value set, not MUI's own 13-variant
//   scale. A real, disclosed consequence: h1 and h3 have no nearby token of
//   their own (this pipeline's largest role, `display`, tops out well
//   below both) and both resolve to that same `display` value — an honest
//   nearest-match outcome, not a bug.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { copyAgentDocs, parseFontFamiliesFromPlainCss, buildFontFaces, readCssScale, nearestScalePx, readThemeManifest, writeThemeManifest, guardedWriteFile, hashFile } from "../shared/scaffold-common.ts";

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
// Real MUI default px sizes per variant — see this file's own header for
// the source (createTypography.js). `subtitle1`/`subtitle2` share body1/
// body2's real default exactly, so they're not listed twice below.
const MUI_VARIANT_DEFAULT_PX: Record<string, number> = {
  h1: 96,
  h2: 60,
  h3: 48,
  h4: 34,
  h5: 24,
  h6: 20,
  subtitle1: 16,
  body1: 16,
  subtitle2: 14,
  body2: 14,
  button: 14,
  caption: 12,
  overline: 12,
};

// Real MUI default action opacities — confirmed against the real
// npm-published @mui/material@9.4.0 tarball's own `styles/createPalette.js`
// (`getLight()`'s own `action` block). Added 2026-09-16 while auditing
// Layer 2 for gaps beyond radius/spacing/typography specifically. MUI also
// has a separate real `dark` set (hoverOpacity 0.08, selectedOpacity 0.16,
// activatedOpacity 0.24 — disabledOpacity/focusOpacity unchanged) — LIGHT's
// set is used here because `generate/md2.ts`'s own `palette.ts` never sets
// `mode` at all (confirmed by reading a real generated file), so MUI's own
// real default (`mode: 'light'`) silently applies regardless of which
// light/dark seed choice was made — a separate, already-disclosed, still
// real MD2 generator limitation (see this file's header), not something
// this fix changes or should try to work around by guessing the "real"
// mode.
const MUI_ACTION_OPACITY_DEFAULTS: Record<string, number> = {
  hoverOpacity: 0.04,
  selectedOpacity: 0.08,
  disabledOpacity: 0.38,
  focusOpacity: 0.12,
  activatedOpacity: 0.12,
};

function buildThemeTs(
  families: { primary: string; secondary?: string },
  borderRadius: number,
  buttonPaddingY: number,
  buttonPaddingX: number,
  fontSizeScale: Record<string, number>,
  opacityScale: Record<string, number>,
): string {
  const unquote = (f: string) => f.replace(/^['"]|['"]$/g, "");
  const bodyFont = `${unquote(families.secondary ?? families.primary)}, sans-serif`;
  const headingFont = `${unquote(families.primary)}, sans-serif`;
  const variantSize = (variant: string) => nearestScalePx(MUI_VARIANT_DEFAULT_PX[variant], fontSizeScale);
  const actionOpacity = (key: string) => nearestScalePx(MUI_ACTION_OPACITY_DEFAULTS[key], opacityScale);

  const content = [
    '"use client";',
    "",
    'import { createTheme } from "@mui/material/styles";',
    "",
    'import { palette } from "./theme-palette";',
    "",
    "const theme = createTheme({",
    "  palette: {",
    "    ...palette,",
    "    // Real MUI light-mode action opacity defaults — see this file's",
    "    // own header (MUI_ACTION_OPACITY_DEFAULTS) for the real source",
    "    // and why light's set specifically.",
    "    action: {",
    `      hoverOpacity: ${actionOpacity("hoverOpacity")},`,
    `      selectedOpacity: ${actionOpacity("selectedOpacity")},`,
    `      disabledOpacity: ${actionOpacity("disabledOpacity")},`,
    `      focusOpacity: ${actionOpacity("focusOpacity")},`,
    `      activatedOpacity: ${actionOpacity("activatedOpacity")},`,
    "    },",
    "  },",
    "  // Real radius.md token (matches this pipeline's own Bootstrap base-",
    "  // radius mapping) — MUI's own components (Button, Card, Paper, ...)",
    "  // all read this one value directly, no per-component override needed.",
    `  shape: { borderRadius: ${borderRadius} },`,
    "  components: {",
    "    MuiButton: {",
    "      styleOverrides: {",
    "        // Real MUI default (medium/contained) is a literal '6px 16px',",
    "        // not derived from theme.spacing — see this file's own header.",
    "        // Bound to the nearest real spacing tokens instead. Only",
    "        // reaches the medium/contained case; every other variant/size",
    "        // keeps MUI's own literal padding (see file header).",
    "        root: {",
    `          paddingTop: "${buttonPaddingY}px",`,
    `          paddingBottom: "${buttonPaddingY}px",`,
    `          paddingLeft: "${buttonPaddingX}px",`,
    `          paddingRight: "${buttonPaddingX}px",`,
    "        },",
    "      },",
    "    },",
    "  },",
    "  typography: {",
    `    fontFamily: ${JSON.stringify(bodyFont)},`,
    // fontSize below is bound to the nearest real type-scale token for
    // every variant — see this file's own header (MUI_VARIANT_DEFAULT_PX).
    `    h1: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h1")}px" },`,
    `    h2: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h2")}px" },`,
    `    h3: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h3")}px" },`,
    `    h4: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h4")}px" },`,
    `    h5: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h5")}px" },`,
    `    h6: { fontFamily: ${JSON.stringify(headingFont)}, fontSize: "${variantSize("h6")}px" },`,
    `    subtitle1: { fontSize: "${variantSize("subtitle1")}px" },`,
    `    subtitle2: { fontSize: "${variantSize("subtitle2")}px" },`,
    `    body1: { fontSize: "${variantSize("body1")}px" },`,
    `    body2: { fontSize: "${variantSize("body2")}px" },`,
    `    button: { fontSize: "${variantSize("button")}px" },`,
    `    caption: { fontSize: "${variantSize("caption")}px" },`,
    `    overline: { fontSize: "${variantSize("overline")}px" },`,
    "  },",
    "});",
    "",
    "export default theme;",
    "",
  ].join("\n");
  return content;
}

// Font FILES only — MUI/CssBaseline reads fontFamily from the theme object
// itself (see file header), no plain-CSS custom-property override needed
// the way the Tailwind/Bootstrap paths each need one.
function buildFontFacesCss(fontFaceCss: string): string {
  return [
    "/* Design tokens generated by SDSGT — do not hand-edit; run `scaffold",
    "   --update` (same flags, --out pointing at this project) after editing",
    "   tokens to refresh this file instead. */",
    "",
    fontFaceCss,
    "",
  ].join("\n");
}

// Fixed 2026-09-17 (see docs/layer2-layer3-plan.md's dated follow-up
// entry) — the real gap: a project ORIGINALLY scaffolded with no
// --fonts-dir has a layout.tsx with no `./fonts.css` import (see
// rewriteLayoutTsx's own `hasFonts` branch below); if a LATER `--update`
// run is the first to pass --fonts-dir, fonts.css gets (re)written but
// nothing wires it in, since `update` deliberately never rewrites
// layout.tsx wholesale (it's boilerplate, out of this pathway's normal
// scope — a user may have built real UI in it since). Rather than leave
// this as a printed warning forever, insert just the one missing import
// line, hash-guarded via `guardedWriteFile` exactly like every other
// theme file this pathway touches, so a hand-edited layout.tsx is detected
// and left alone (warned, not silently changed) instead of assumed safe.
//
// Deliberately conservative about WHERE to insert: finds the last
// `import ...;` statement in the top-of-file import block (skipping over
// this pipeline's own template's mid-block blank line — see
// rewriteLayoutTsx) and inserts right after it, rather than trying to
// match the exact template shape — a side-effect import is valid wherever
// another import statement already is, so this also works on a lightly
// hand-edited layout.tsx that still starts with real import statements.
function injectFontsCssImport(layoutContent: string): string {
  const lines = layoutContent.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (/^import\s.*;\s*$/.test(line)) {
      lastImportIdx = i;
      continue;
    }
    break; // left the top-of-file import block
  }
  if (lastImportIdx === -1) {
    // No recognizable import statement at all — prepend rather than
    // silently do nothing.
    return `import "./fonts.css";\n${layoutContent}`;
  }
  const next = [...lines];
  next.splice(lastImportIdx + 1, 0, 'import "./fonts.css";');
  return next.join("\n");
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
    "  dark/contrastText per color). After editing tokens, run `generate`",
    "  then `scaffold --update` (same flags, --out pointing back at this",
    "  project) to refresh this in place; don't hand-edit it directly — an",
    "  update run warns instead of silently overwriting a hand-edited file.",
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
  const { codeDir, outDir, fontsDir, update = false, force = false } = opts;

  const paletteTsPath = join(codeDir, "mui", "palette.ts");
  const tokensCssPath = join(codeDir, "css", "tokens.css");
  if (!existsSync(paletteTsPath)) {
    throw new Error(`No MUI palette found in ${codeDir} — run \`generate --md2 --framework nextjs\` first.`);
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
    installDeps(outDir);
  }

  const appDir = join(outDir, "src", "app");

  if (!update) {
    // create-next-app's own default (plain, non-Tailwind since
    // --no-tailwind was passed) globals.css is unused here — MUI's
    // CssBaseline is this project's reset, not a hand-written stylesheet.
    const defaultGlobalsCss = join(appDir, "globals.css");
    if (existsSync(defaultGlobalsCss)) rmSync(defaultGlobalsCss);
  }

  guarded(join("src", "app", "theme-palette.ts"), readFileSync(paletteTsPath));

  const tokensCss = readFileSync(tokensCssPath, "utf-8");
  const families = parseFontFamiliesFromPlainCss(tokensCss);
  const borderRadius = readCssVarPx(tokensCss, "radius-md");
  const spacingScale = readCssScale(tokensCss, "spacing");
  // Real MUI medium/contained defaults — see buildThemeTs's own comment.
  const buttonPaddingY = nearestScalePx(6, spacingScale);
  const buttonPaddingX = nearestScalePx(16, spacingScale);
  const fontSizeScale = readCssScale(tokensCss, "typography-primitive-font-size");
  const opacityScale = readCssScale(tokensCss, "opacity", "");
  guarded(join("src", "app", "theme.ts"), buildThemeTs(families, borderRadius, buttonPaddingY, buttonPaddingX, fontSizeScale, opacityScale));

  const { css: fontFaceCss, filesWritten: fontFiles } = buildFontFaces(families, fontsDir, join(outDir, "public", "fonts"));
  filesWritten.push(...fontFiles);
  const hasFonts = fontFaceCss.length > 0;
  if (hasFonts) {
    guarded(join("src", "app", "fonts.css"), buildFontFacesCss(fontFaceCss));
    // Fixed 2026-09-17 (see docs/layer2-layer3-plan.md's dated follow-up
    // entry and injectFontsCssImport's own comment above) — this used to
    // only print a warning telling the user to add the import by hand.
    // Now: if this project's ORIGINAL scaffold ran without --fonts-dir (no
    // fonts.css, layout.tsx has no import for it) and this update run is
    // the first to pass --fonts-dir, the missing `./fonts.css` import gets
    // added automatically, hash-guarded against layout.tsx being
    // hand-edited since this pipeline last wrote it (see the `layoutRelPath`
    // baseline recorded below, at fresh-scaffold time). A fresh (non-update)
    // scaffold never hits this branch at all, since it always rewrites
    // layout.tsx itself with the correct import already in place.
    if (update) {
      const layoutRelPath = join("src", "app", "layout.tsx");
      const layoutPath = join(appDir, "layout.tsx");
      const layoutContent = existsSync(layoutPath) ? readFileSync(layoutPath, "utf-8") : "";
      if (layoutContent && !layoutContent.includes("./fonts.css")) {
        const injected = injectFontsCssImport(layoutContent);
        const result = guardedWriteFile(outDir, layoutRelPath, injected, manifest, { force });
        nextManifest[layoutRelPath] = result.hash;
        if (result.written) {
          filesWritten.push("src/app/layout.tsx (added fonts.css import)");
        } else if (result.warning) {
          warnings.push(
            "src/app/fonts.css was (re)written, but src/app/layout.tsx doesn't import it yet and appears hand-edited since SDSGT last wrote it — not modified automatically. Add `import \"./fonts.css\";` yourself, or re-run with --force to have SDSGT add it for you.",
          );
        }
      }
    }
  }

  if (!update) {
    rewriteLayoutTsx(appDir, projectName, hasFonts);
    filesWritten.push("src/app/layout.tsx");
    // Baseline hash for layout.tsx — not otherwise guarded/regenerated by
    // `update` (it's boilerplate a user may build real UI into), but a
    // later `update` run may need to inject a single missing import line
    // into it (see the hasFonts branch above) and must be able to tell
    // "still exactly what SDSGT wrote" from "hand-edited since" first.
    nextManifest[join("src", "app", "layout.tsx")] = hashFile(join(appDir, "layout.tsx"));

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
