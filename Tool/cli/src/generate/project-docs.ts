// Writes the three agent-facing docs a generated project gets, alongside its
// code tokens — see pipeline-plan.md, "Agent rule files" and "design.md — a
// second doc, separate from foundations-rules.md, and it IS generated," plus
// contracts-and-seeds.md, "foundations-rules.md content" and "AGENTS.md
// template content."
//
// AGENTS.md is the canonical file (read natively by Codex); CLAUDE.md and
// .cursor/rules would be thin mirrors of it, per "Agent rule files" — not
// built yet, not scoped here.
//
// foundations-rules.md is universal and static: same content on every run,
// regardless of seed or which platform flags were passed. AGENTS.md is
// mostly static too, except for two always/never rules that only apply to
// specific targets (see AgentRulesOptions below) — Generate can't infer
// those from the token spec the way it infers "which platform flag was
// passed," so the caller states them explicitly, same reasoning as
// --tailwind/--bootstrap/etc. being opt-in rather than auto-detected.
//
// design.md is built by generate/design-md/ (contract: contracts-and-seeds.md,
// "design.md (contract decided — not built)"). Its designer-owned blocks are
// carried over from the existing file on every run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerateResult } from "./index.ts";
import { buildDesignMd, readDesignerBlocks, type DesignMdOptions } from "./design-md/index.ts";

export const FOUNDATIONS_RULES_MD = `# foundations-rules.md

Universal accessibility/UX rules for this project's UI. Same content on
every SDSGT-generated project — not specific to this project's tokens or
components (see \`design.md\` for that). Token-usage discipline (how to
write code against this project's token spec) lives in \`AGENTS.md\`
instead — a different audience.

## Contrast

WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text (≥24px, or
≥18.66px bold) and UI components.

## Touch targets

- iOS (HIG): 44×44pt minimum.
- Android (Material): 48×48dp minimum.
- Web (WCAG 2.2 SC 2.5.8, AA): 24×24 CSS px minimum.

Native targets follow their own platform's (larger) minimum; web targets
follow WCAG's floor.

## Focus visibility

Every interactive element needs a visible focus indicator (WCAG 2.4.7, AA).
That indicator itself needs ≥3:1 contrast against adjacent colors (WCAG
1.4.11 Non-text Contrast, AA).

## Reduced motion

Respect \`prefers-reduced-motion\` on web, and the OS-level Reduce Motion
setting on iOS/Android.

## Use of color

WCAG 1.4.1 (Level A): color can't be the only signal for meaning, action,
or state — pair it with an icon, text, or shape. Directly relevant to this
project's 5-role status system (\`status.error/success/warning/info/promo\`).

## Required interactive states

Every interactive component needs: default, hover, focus, active/pressed,
disabled — plus loading/selected/error where relevant to that component.

## Accessibility checks are advisory, not a gate

Anything Promote checks (contrast, or any future check on colors or other
properties) gets *flagged* — in the console, in \`report.html\`, and here —
never blocked. A failing check doesn't stop token generation and doesn't
get silently auto-corrected; it's surfaced so a human or agent can decide
whether and how to address it.
`;

export interface AgentRulesOptions {
  // Whether --tailwind was passed to this generate run. Gates the
  // tailwind-merge always/never rule, per contracts-and-seeds.md: "Tailwind-
  // targeted projects only: shadcn/ui, shadcn-vue, RNR."
  hasTailwind: boolean;
  // Whether --framework react-native was passed. Gates the NativeWind rule
  // together with hasTailwind above — NativeWind specifically means
  // React Native + Tailwind (RNR), not React Native on its own (e.g. RN
  // Paper/MD2 has no NativeWind involved at all).
  isReactNative: boolean;
  // Whether --shadcn was passed. Gates the two shadcn-specific always/never
  // rules below — see generate/shadcn.ts and contracts-and-seeds.md,
  // "shadcn/ui theming."
  hasShadcn: boolean;
  // Whether --rnr was passed. Gates the RNR-specific always/never rules —
  // see generate/rnr.ts and contracts-and-seeds.md, "React Native
  // Reusables (RNR) theming."
  hasRnr: boolean;
  // Whether --rn-paper was passed. Gates the RN Paper-specific always/never
  // rule — see generate/rn-paper.ts and contracts-and-seeds.md, "React
  // Native Paper theming."
  hasRnPaper: boolean;
  // Whether --vuetify was passed. Gates the Vuetify-specific always/never
  // rule — see generate/vuetify.ts and contracts-and-seeds.md, "Vuetify
  // theming."
  hasVuetify: boolean;
  // True only when --tailwind ran AND its resolved spacing preset turned
  // out non-linear (see generate/tailwind.ts's computeLinearSpacingConstant
  // — currently just the "bootstrap" spacing rhythm: 0/4/8/16/24/48px isn't
  // a constant-per-step scale). Gates the disclosure that fractional/
  // unlisted spacing utilities in real vendored shadcn/ui or shadcn-vue
  // component source (px-2.5, gap-1.5, any un-named integer key) fall back
  // to Tailwind's own raw 4px default instead of this project's chosen
  // rhythm — a structural limit of Tailwind v4's single-multiplier
  // architecture, not an unfinished fix. Linear presets don't need this
  // rule: they get a real `--spacing` base-variable binding instead (see
  // tailwind.ts), so there's nothing left to disclose.
  hasUnboundTailwindSpacing: boolean;
}

function buildAgentsMd({ framework, hasTailwind, isReactNative, hasShadcn, hasRnr, hasRnPaper, hasVuetify, hasMd2, hasMd3, hasUnboundTailwindSpacing }: DesignMdOptions): string {
  const rules: string[] = [
    "Never blindly re-run a vendored component's install/add command once it's been customized. There's no merge logic — it silently overwrites. Mark customized files clearly.",
  ];

  if (hasShadcn) {
    rules.push(
      "shadcn/ui's own CSS variable names (`--primary`, `--card`, etc.) are aliased to this project's semantic tokens in `shadcn/theme.css`. Edit the semantic tokens and re-run `generate`, don't hand-edit `theme.css`'s values directly. *(This project targets shadcn/ui.)*",
      "Never blindly re-run `shadcn add <component>` on a component that's already been customized — same reasoning as the general vendored-component rule above, called out explicitly since shadcn is this project's component library. If this project was scaffolded with real components vendored, check `sdsgt-vendored-components.json` at the project root first: it lists each vendored file's original content hash. A hash that still matches means the file is untouched and safe to re-vendor; a hash that no longer matches means it's been customized — leave it alone and tell the user, don't silently overwrite it. *(This project targets shadcn/ui.)*",
    );
  }

  // Figma <-> code naming (Batch 16 of figma-component-variations-plan.md). The components pushed to Figma carry the
  // real shadcn/ui variations as Figma properties, so an agent reading a Figma component set needs the translation
  // rule. Only for shadcn projects (the pushed component library); harmless if the project has no Figma file.
  if (hasShadcn) {
    rules.push(
      "Figma names map to code props by lowercasing, when this project's shadcn/ui components were pushed to Figma. A Figma component's properties are the real code variations: `Variant=Outline, Size=Icon-sm` means `variant=\"outline\" size=\"icon-sm\"`, and `Orientation=Vertical` means `orientation=\"vertical\"` (Separator, Field, Attachment). Four properties are NOT plain props: (1) `State` (Hover, Focus, Pressed) is styling the browser applies, not a prop you set; `Disabled` is the `disabled` prop (or `aria-disabled`/`data-disabled` where the component uses it) and `Invalid` is `aria-invalid` (`data-invalid` on Field). (2) For Tabs, `Style=Line` is the `variant=\"line\"` prop on `TabsList`, and `Variant=Active/Inactive` is which tab is selected, not a prop. (3) For Checkbox, RadioGroup and Switch, `Variant=Checked/Unchecked` is the control's checked state, not a `variant` prop. (4) For Bubble, `Clickable=Clickable` means the bubble content is rendered as a `<button>` or `<a>` (via `render`), which is what turns on its hover and focus looks. Also: a few Figma sizes are visually snapped to the nearest design token (for example Button `Sm` and `Icon-sm` draw at 24px although the code classes say 28px), and some states are drawn as an approximation. Trust the code's own classes for exact values, and do not measure the Figma file to decide a size or color. *(This project targets shadcn/ui.)*",
    );
  }

  if (hasRnr) {
    rules.push(
      "RNR's CSS variables (`--primary`, `--card`, etc., in `rnr/global.css`) and `rnr/constants.ts`'s `NAV_THEME` must stay in sync — they're generated from the same tokens, but are two separate files. Edit the semantic tokens and re-run `generate`, don't hand-edit either file directly. *(This project targets React Native Reusables.)*",
      "Never blindly re-run RNR's own component-add command on a component that's already been customized — same reasoning as the general vendored-component rule above. *(This project targets React Native Reusables.)*",
      "This project's `tailwind.config.js` extends `theme.spacing` with this project's own real spacing tokens (bound 2026-09-16), but only for the keys your chosen spacing preset actually defines. For the `tailwind`/`md3`/`md2` spacing presets this is a correct no-op (those presets are numerically identical to Tailwind v3's own default scale already); for the `bootstrap` preset it's a real, meaningful binding for keys 0-5 (e.g. `px-3`, `px-4`), but keys beyond 5 (and any fractional class like `px-2.5`) still fall back to Tailwind's own stock default, since `spacing.bootstrap.json` itself only ever defines 6 steps. Don't assume every spacing class here reflects this project's tokens — verify against `spacing.json`'s own key range before trusting one outside it. `tailwind.config.js` ALSO extends `theme.fontSize` with this project's own real type-scale tokens (bound 2026-09-16) for all 13 of Tailwind's real named keys (`xs` through `9xl`) — a complete fix, unlike spacing, since Tailwind's fontSize scale has no keys beyond these 13 to fall through to. Each key binds to the nearest real type-scale token for THAT key's own real default size, so a curated 8-value type-scale mapped onto 13 keys means some of the larger keys (`4xl`+) may share the same nearest value — an honest nearest-match outcome, not a bug; verify against `typography.primitive.json` if a specific class's exact size matters. *(This project targets React Native Reusables.)*",
    );
  }

  if (hasRnPaper) {
    rules.push(
      "React Native Paper's `theme.ts` (`rn-paper/theme.ts`) is generated from this project's tokens via the same real HCT color computation as `--md3`, and also binds every real MD3 typescale role's `fontSize` (`displayLarge` through `bodySmall`) to the nearest real type-scale token. Edit the semantic/brand tokens and re-run `generate`, don't hand-edit `theme.ts`'s values directly. *(This project targets React Native Paper.)*",
      "Import `Button`, `Card`, `Chip`, `TextInput`, `Snackbar`, `Menu`, `ToggleButton`, `DrawerItem`, `FAB`, `Searchbar`, and `Dialog` from `./components/`, NOT directly from `react-native-paper` — Paper's own `roundness` theme value only guarantees `Button`'s corners match this project's real radius token; each of the other ten uses a different internal multiplier and would render a mismatched radius if imported straight from the library. `Button` itself needs wrapping for a different reason: its real internal padding (`marginVertical`/`marginHorizontal` on its label — Paper has no literal `padding` property here) was never bound to this project's spacing tokens at all. `./components/*.tsx` are thin wrappers that fix this using each real component's own per-instance override prop (`style`, `contentStyle` for Menu, `outlineStyle` for outlined TextInput, `labelStyle` for Button) — everything else about them (props, compound sub-components like `Card.Content`/`Menu.Item`/`Dialog.Actions`/`ToggleButton.Group`/`FAB.Group`) works identically to the real Paper component. `Button`, `FAB`, and `Searchbar` only apply their fix to their real default mode/size (`Button` any mode except `\"text\"`, `FAB` `size=\"medium\"`, `Searchbar` `mode=\"bar\"`) — other modes/sizes render via Paper's own unmodified defaults. This covers every real Paper component whose own source references `roundness` at all (confirmed exhaustively). SegmentedButtons and Tooltip use `roundness` but have no real override path in their own source — don't try to fix their radius. Every other Paper component (Avatar, Badge, IconButton, and more) either has no radius concept at all or uses a deliberately fixed circular shape (`size / 2`) independent of any roundness preset — that's correct Material Design behavior, not something to change. *(This project targets React Native Paper.)*",
    );
  }

  if (hasVuetify) {
    rules.push(
      "Vuetify's `theme.ts` (`vuetify/theme.ts`) supplies only the base colors (primary/secondary/background/surface/error/info/success/warning) — Vuetify's own runtime derives on-*/lighten/darken variants from these. Edit the semantic/brand tokens and re-run `generate`, don't hand-edit `theme.ts` or fight Vuetify's derived variants directly. *(This project targets Vuetify.)*",
    );
  }

  // RNR is NativeWind (Tailwind v3) even though React Native projects never
  // get --tailwind (its v4 output doesn't fit NativeWind) — so --rnr counts
  // as Tailwind for these two rules. Gap found and fixed 2026-10-21.
  const usesTailwindClasses = hasTailwind || hasRnr;
  if (isReactNative && usesTailwindClasses) {
    rules.push(
      "NativeWind's `inlineRem` must be set to 16, not its default of 14. *(This project targets React Native + Tailwind/NativeWind.)*",
    );
  }
  if (usesTailwindClasses) {
    rules.push(
      "`tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups (e.g. `px-4` vs. `pl-5`) — component variants need to account for this rather than assuming overrides always \"just work.\" *(This project targets Tailwind.)*",
    );
  }
  if (hasUnboundTailwindSpacing) {
    rules.push(
      "This project's spacing-rhythm preset is not a constant-multiplier scale, so Tailwind v4's own `--spacing` base variable can't fully represent it — only this project's explicitly-named `--spacing-N` keys (see `tailwind/theme.css`) bind correctly. Any spacing utility outside that exact set — every fractional class (`px-2.5`, `gap-1.5`, ...) and any integer key `spacing.json` doesn't list — silently falls back to Tailwind's own raw default (4px per step), not this project's chosen rhythm. This shows up in real, unmodified vendored shadcn/ui (or shadcn-vue) component source, which uses exactly these classes. Prefer this project's own named spacing tokens over a bare fractional utility class where precision matters. *(This project targets Tailwind, with a non-linear spacing preset.)*",
    );
  }

  // Known-limit disclosures added 2026-10-21 (design.md section 7 points to
  // these by topic). Facts verified against contracts-and-seeds.md, "Shadow"
  // and "Fixed defaults", and scaffold/react-native.ts's font scope cut.
  if (isReactNative) {
    rules.push(
      "Custom fonts aren't loaded in this project. React Native needs `.ttf`/`.otf` font files loaded through `expo-font`'s `useFonts()`, and SDSGT only fetches web font files (`.woff2`), so text renders in the platform's default font. Sizes, weights and line heights still come from the type tokens, and the font family names in the tokens are correct. To use the real fonts, add `.ttf`/`.otf` files and load them with `expo-font` (see Expo's fonts guide): with static fonts each weight is a separate file, declared with its own weight and style — or use one variable font file, whose weights work on iOS and Android 10+ only. Don't swap in a different font to work around this. *(This project targets React Native.)*",
    );
  }
  if (hasRnr) {
    rules.push(
      "Use `shadows.ts` for shadows, not Tailwind `shadow-*` classes. `shadows.ts` holds this project's shadow tokens as React Native `boxShadow` styles (apply with `style={shadows.md}`, combinable with other styles); they render every layer on iOS and on Android 9+ (Android 8 and older show no shadow). Tailwind `shadow-*` classes don't render this project's shadows on device: they use Tailwind's own default values, and NativeWind's converter (`react-native-css-interop`) drops any multi-layer shadow and keeps only the color of a single-layer one (using its spread as the blur — no offset, no opacity), so they look weak or invisible. RNR's own installed components still use `shadow-*` classes internally — don't edit them to swap in `shadows.ts` without asking the designer. *(This project targets React Native Reusables.)*",
    );
  }
  const isMui = hasMd2 && framework === "nextjs";
  if (isMui || hasVuetify) {
    const lib = isMui ? "MUI's `theme.shadows`" : "Vuetify's elevation system";
    const scale = isMui ? "25 levels" : "a two-layer Material depth model";
    rules.push(
      `This project's shadow tokens (\`shadow.json\`, 5 named tiers) are not connected to ${lib}. It uses a different kind of scale — a numbered depth model (${scale}) where each component picks its own level for structural reasons — so there's no fair one-to-one mapping, and none was invented. Use the library's own \`elevation\` prop on its components; use the \`shadow.*\` tokens only for custom elements outside the library. *(This project targets ${isMui ? "MUI" : "Vuetify"}.)*`,
    );
  }
  if (hasMd2 || hasMd3 || hasVuetify || hasRnPaper) {
    rules.push(
      "The grid tiers (`grid.json`) follow Material Design 3's columns, margins and gutters, but switch at this project's breakpoint tokens rather than Material's own window sizes: `compact` below `breakpoint.md`, `medium` from `breakpoint.md` up to `breakpoint.lg`, `expanded` from `breakpoint.lg` up (current widths in `design.md`, section 4). Material's native thresholds are 600dp and 840dp — use the breakpoint tokens, not Material's numbers. *(This project targets a Material Design library.)*",
    );
  }

  rules.push(
    "Never re-run the token generator expecting it to \"update\" the project. Regenerating is a deliberate, destructive reset — it replaces manual edits made since the last run. To fix or adjust something, edit the specific token; don't regenerate.",
    "A token is only ever edited in one place at a time. If a value already exists as a token, change the token — don't hardcode a local override in a component to work around it.",
    "Don't cross-wire another design language's conventions into this project (e.g. hand-rolling Tailwind-style shade computation into a Bootstrap-targeted project, or approximating MD3's tonal palette with a plain color ramp). Trust the tokens already generated for this project's actual chosen stack — if something seems missing, flag it as a gap rather than importing a different system's approach.",
  );

  const rulesList = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `# AGENTS.md

Read this file before writing any UI code in this project. It's the
canonical agent-rules file — read natively by Codex; other tools' rule
files (\`CLAUDE.md\`, \`.cursor/rules\`) are meant to mirror it, not restate it.

- Accessibility/UX rules (how the UI should behave): see
  \`foundations-rules.md\`.
- This project's actual tokens, scales, and components (how to use
  *this* project's design system specifically): see \`design.md\`.

## Core rule

Use semantic tokens, not primitives, for color and typography. Every other
token group — spacing, radius, opacity, border-width, shadow, breakpoints,
grid — is flat by design, so referencing it directly is expected, not a
violation. No hardcoded hex/px where a token already covers the value. If
no semantic token fits, add one — don't fall back to a primitive or a
magic number to route around the gap.

## Always / never

${rulesList}
`;
}

export function writeProjectDocs(outDir: string, tokensDir: string, options: DesignMdOptions): GenerateResult & { warnings: string[] } {
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "foundations-rules.md"), FOUNDATIONS_RULES_MD, "utf-8");
  writeFileSync(join(outDir, "AGENTS.md"), buildAgentsMd(options), "utf-8");
  const filesWritten = ["foundations-rules.md", "AGENTS.md"];
  const warnings: string[] = [];

  // Keep any designer-owned blocks already in this folder's design.md;
  // leave the file alone if its markers are broken (nothing gets lost).
  const designPath = join(outDir, "design.md");
  const { blocks, problem } = readDesignerBlocks(existsSync(designPath) ? readFileSync(designPath, "utf-8") : null);
  if (problem) {
    warnings.push(problem);
  } else {
    writeFileSync(designPath, buildDesignMd(tokensDir, outDir, options, blocks), "utf-8");
    filesWritten.push("design.md");
  }

  return { filesWritten, warnings };
}
