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
