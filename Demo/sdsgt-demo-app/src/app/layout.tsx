import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Caravan 2026 · Bogotá",
  description: "Mock-up event page for AI Caravan 2026, built from an SDSGT-generated design system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
