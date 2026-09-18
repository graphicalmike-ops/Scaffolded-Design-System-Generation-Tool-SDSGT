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
// design.md's own content contract is explicitly undecided and deferred
// (contracts-and-seeds.md: "flagged, deferred — not required for the
// pipeline to work"). Written here anyway, as a real placeholder file
// pointing at what does exist, so AGENTS.md's pointer to it isn't a dead
// link — not an attempt to prematurely design its final shape.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerateResult } from "./index.ts";

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

// contracts-and-seeds.md, "design.md (flagged, deferred)": the doc's
// existence and purpose are settled, its concrete contract isn't. Kept
// deliberately minimal rather than guessing at a shape.
export const DESIGN_MD_PLACEHOLDER = `# design.md

This project's own design-system usage guide — which semantic tokens
exist, which component variants survived pruning, how the roundness/
spacing/type-scale presets resolved for this project — isn't built yet.
Its content contract is still undecided (see \`pipeline-plan.md\`,
"design.md").

In the meantime:
- Token-usage rules for writing code against this project's tokens: see
  \`AGENTS.md\`.
- Universal accessibility/UX rules: see \`foundations-rules.md\`.
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

function buildAgentsMd({ hasTailwind, isReactNative, hasShadcn, hasRnr, hasRnPaper, hasVuetify, hasUnboundTailwindSpacing }: AgentRulesOptions): string {
  const rules: string[] = [
    "Never blindly re-run a vendored component's install/add command once it's been customized. There's no merge logic — it silently overwrites. Mark customized files clearly.",
  ];

  if (hasShadcn) {
    rules.push(
      "shadcn/ui's own CSS variable names (`--primary`, `--card`, etc.) are aliased to this project's semantic tokens in `shadcn/theme.css`. Edit the semantic tokens and re-run `generate`, don't hand-edit `theme.css`'s values directly. *(This project targets shadcn/ui.)*",
      "Never blindly re-run `shadcn add <component>` on a component that's already been customized — same reasoning as the general vendored-component rule above, called out explicitly since shadcn is this project's component library. If this project was scaffolded with real components vendored, check `sdsgt-vendored-components.json` at the project root first: it lists each vendored file's original content hash. A hash that still matches means the file is untouched and safe to re-vendor; a hash that no longer matches means it's been customized — leave it alone and tell the user, don't silently overwrite it. *(This project targets shadcn/ui.)*",
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

  if (isReactNative && hasTailwind) {
    rules.push(
      "NativeWind's `inlineRem` must be set to 16, not its default of 14. *(This project targets React Native + Tailwind/NativeWind.)*",
    );
  }
  if (hasTailwind) {
    rules.push(
      "`tailwind-merge` doesn't reliably override classes across differently-shaped Tailwind groups (e.g. `px-4` vs. `pl-5`) — component variants need to account for this rather than assuming overrides always \"just work.\" *(This project targets Tailwind.)*",
    );
  }
  if (hasUnboundTailwindSpacing) {
    rules.push(
      "This project's spacing-rhythm preset is not a constant-multiplier scale, so Tailwind v4's own `--spacing` base variable can't fully represent it — only this project's explicitly-named `--spacing-N` keys (see `tailwind/theme.css`) bind correctly. Any spacing utility outside that exact set — every fractional class (`px-2.5`, `gap-1.5`, ...) and any integer key `spacing.json` doesn't list — silently falls back to Tailwind's own raw default (4px per step), not this project's chosen rhythm. This shows up in real, unmodified vendored shadcn/ui (or shadcn-vue) component source, which uses exactly these classes. Prefer this project's own named spacing tokens over a bare fractional utility class where precision matters. *(This project targets Tailwind, with a non-linear spacing preset.)*",
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
- This project's actual tokens, resolved presets, and components (how to
  use *this* project's design system specifically): see \`design.md\`.

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

export function writeProjectDocs(outDir: string, options: AgentRulesOptions): GenerateResult {
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "foundations-rules.md"), FOUNDATIONS_RULES_MD, "utf-8");
  writeFileSync(join(outDir, "AGENTS.md"), buildAgentsMd(options), "utf-8");
  writeFileSync(join(outDir, "design.md"), DESIGN_MD_PLACEHOLDER, "utf-8");

  return { filesWritten: ["foundations-rules.md", "AGENTS.md", "design.md"] };
}
