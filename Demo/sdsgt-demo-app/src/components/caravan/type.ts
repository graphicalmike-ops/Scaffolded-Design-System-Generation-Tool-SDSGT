// Semantic type styles from the generated design system (see design.md, section 1).
// Each value is one of the generated `--typography-semantic-*` tokens, applied as a
// CSS `font` shorthand (weight, size/line-height, family). Never set sizes by hand.
// Class names are written out in full so Tailwind can find them.
export const type = {
  display: "[font:var(--typography-semantic-heading-lg-bold)] md:[font:var(--typography-semantic-display-bold)]",
  h2: "[font:var(--typography-semantic-heading-md-semibold)] md:[font:var(--typography-semantic-heading-lg-semibold)]",
  h3: "[font:var(--typography-semantic-heading-sm-semibold)] md:[font:var(--typography-semantic-heading-md-semibold)]",
  h4: "[font:var(--typography-semantic-heading-sm-semibold)]",
  stat: "[font:var(--typography-semantic-heading-lg-bold)] md:[font:var(--typography-semantic-display-bold)]",
  bodyLg: "[font:var(--typography-semantic-body-lg-regular)]",
  bodyLgStrong: "[font:var(--typography-semantic-body-lg-semibold)]",
  body: "[font:var(--typography-semantic-body-regular)]",
  bodyStrong: "[font:var(--typography-semantic-body-semibold)]",
  bodySm: "[font:var(--typography-semantic-body-sm-regular)]",
  bodySmStrong: "[font:var(--typography-semantic-body-sm-semibold)]",
  caption: "[font:var(--typography-semantic-caption-regular)]",
  captionStrong: "[font:var(--typography-semantic-caption-semibold)]",
} as const;
