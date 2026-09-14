// Mirrors the "Seed inputs" table in contracts-and-seeds.md.
// Only the fields Promote actually needs are required here — fields that only
// matter at Generate time (component library, Figma connection, scaffold
// framework choice) are still captured, since the seed-input step always asks
// for them, but Promote doesn't read them.

export type ScaffoldMode = "scaffold" | "files-only";
export type TargetFramework = "nextjs" | "vuejs" | "react-native" | "kotlin" | "swiftui";
export type DesignLanguage = "tailwind" | "bootstrap" | "md3" | "md2";
export type LightDarkMode = "light" | "dark" | "both";
export type NeutralColorStyle = "brand-tinted" | "pure-gray";
export type OpacityPreset = "tailwind" | "bootstrap";
// One per framework's "Suggestion logic" table in the SDSGT-start skill /
// contracts-and-seeds.md's "Seed inputs" table. "shadcn" also covers
// shadcn-vue and "react-bootstrap" also covers bootstrap-vue-next — both
// pairs reuse the same generator output as-is (verified — contracts-and-
// seeds.md, "shadcn/ui theming"/"React Native Reusables (RNR) theming").
export type ComponentLibrary =
  | "shadcn" // Next.js + Tailwind, or Vue.js + Tailwind (shadcn-vue)
  | "mui" // Next.js + MD3/MD2
  | "react-bootstrap" // Next.js + Bootstrap, or Vue.js + Bootstrap (bootstrap-vue-next)
  | "vuetify" // Vue.js + MD3/MD2
  | "rnr" // React Native + Tailwind
  | "rn-paper" // React Native + MD3/MD2
  | "compose-material3" // Kotlin (only option)
  | "swiftui-native"; // SwiftUI (only option)

export interface SeedConfig {
  scaffoldMode: ScaffoldMode;
  targetFramework: TargetFramework;
  targetDesignLanguage: DesignLanguage;
  // Only present when the framework/design-language combo has a real
  // component-library choice (Bootstrap has none for React Native/Kotlin/
  // iOS — see the SDSGT-start skill's "Suggestion logic"). Drives which
  // extra `generate` flag gets passed alongside the base platform flag:
  // "shadcn"/"rnr"/"rn-paper"/"vuetify" map to --shadcn/--rnr/--rn-paper/
  // --vuetify; every other value already resolves via the base platform
  // flag alone (--md2/--bootstrap/--md3/--swiftui) with no extra flag
  // needed. This is theme-mapping only — no real component source is
  // vendored yet. See docs/layer2-layer3-plan.md, Subject 1 and 2.
  componentLibrary?: ComponentLibrary;
  figmaManaged: boolean;
  // Only present when figmaManaged is true — the Figma file the user wants
  // this project's tokens pushed into. Not read by promote() itself (same
  // treatment as componentLibrary/scaffoldMode); it's what the push
  // procedure (see cli/src/promote/figma-plan.ts and the SDSGT-figma-push
  // skill) uses to identify/verify the target file. See contracts-and-
  // seeds.md, "Figma push."
  figmaFileUrl?: string;
  // Only present when figmaManaged is true — which Figma MCP the user wants
  // the push to go through. Collected for real (a genuine seed choice, not
  // a placeholder), but during the internal-testing phase the push
  // procedure always executes via "southleft" regardless of this value —
  // "official" is a real, confirmed MCP (mcp.figma.com, OAuth-gated) but
  // its post-auth tool surface has never been exercised from this project,
  // so nothing is built against it yet. See contracts-and-seeds.md,
  // "Which Figma MCP."
  figmaMcp?: "official" | "southleft";
  // Only present when figmaManaged is true — which Figma plan the target
  // file's workspace is on. Unlike figmaMcp above, this ACTUALLY drives
  // real behavior: it decides whether the push builds one variable
  // collection with two real modes ("paid") or two separate collections
  // ("free"), since Figma caps a collection at one mode on a free plan
  // with no error raised (docs/figma-mcp-capabilities.md). Only matters
  // when lightDarkMode is "both" — a single-mode project never reaches
  // the multi-mode question at all, so this is a no-op if the user didn't
  // also pick "both" for row 6. See contracts-and-seeds.md, "Figma push."
  figmaPlan?: "free" | "paid";
  lightDarkMode: LightDarkMode;

  primaryColor: string; // #hex
  secondaryColor?: string; // #hex
  neutralColorStyle: NeutralColorStyle;

  primaryFont: string;
  secondaryFont?: string;

  typeScalePreset: DesignLanguage;
  spacingPreset: DesignLanguage;
  radiusPreset: DesignLanguage;
  opacityPreset: OpacityPreset;
  shadowPreset: DesignLanguage;
}
