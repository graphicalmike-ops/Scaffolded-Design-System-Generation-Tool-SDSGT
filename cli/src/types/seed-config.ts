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

export interface SeedConfig {
  scaffoldMode: ScaffoldMode;
  targetFramework: TargetFramework;
  targetDesignLanguage: DesignLanguage;
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
