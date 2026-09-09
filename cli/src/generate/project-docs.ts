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
}

function buildAgentsMd({ hasTailwind, isReactNative }: AgentRulesOptions): string {
  const rules: string[] = [
    "Never blindly re-run a vendored component's install/add command once it's been customized. There's no merge logic — it silently overwrites. Mark customized files clearly.",
  ];

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
