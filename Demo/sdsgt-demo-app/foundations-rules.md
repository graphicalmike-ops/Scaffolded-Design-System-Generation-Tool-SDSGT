# foundations-rules.md

Universal accessibility/UX rules for this project's UI. Same content on
every SDSGT-generated project — not specific to this project's tokens or
components (see `design.md` for that). Token-usage discipline (how to
write code against this project's token spec) lives in `AGENTS.md`
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

Respect `prefers-reduced-motion` on web, and the OS-level Reduce Motion
setting on iOS/Android.

## Use of color

WCAG 1.4.1 (Level A): color can't be the only signal for meaning, action,
or state — pair it with an icon, text, or shape. Directly relevant to this
project's 5-role status system (`status.error/success/warning/info/promo`).

## Required interactive states

Every interactive component needs: default, hover, focus, active/pressed,
disabled — plus loading/selected/error where relevant to that component.

## Accessibility checks are advisory, not a gate

Anything Promote checks (contrast, or any future check on colors or other
properties) gets *flagged* — in the console, in `report.html`, and here —
never blocked. A failing check doesn't stop token generation and doesn't
get silently auto-corrected; it's surfaced so a human or agent can decide
whether and how to address it.
