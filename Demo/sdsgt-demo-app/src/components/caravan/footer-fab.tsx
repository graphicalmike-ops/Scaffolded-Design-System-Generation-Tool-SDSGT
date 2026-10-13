import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { footerColumns } from "./data";
import { Container } from "./layout";
import { Logo } from "./site-header";
import { type } from "./type";

// Footer: the inverse surface with light text; five link columns and a legal row.
export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1.2fr_2fr] lg:gap-16">
        <div className="flex flex-col items-start gap-5">
          <Logo className="text-background focus-visible:outline-background" />
          <p className={cn(type.bodyLg, "max-w-sm text-pretty text-background/80")}>
            A travelling conference for the people who design, plan and build digital products.
          </p>
          <Button
            nativeButton={false}
            render={<a href="#contact" />}
            variant="outline"
            className="h-11 rounded-full border-background bg-transparent px-6 text-base text-background hover:bg-background hover:text-foreground"
          >
            Ask the crew
          </Button>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className={cn(type.captionStrong, "mb-4 tracking-wide text-background")}>{col.title}</h3>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#top" className={cn(type.bodySm, "rounded-sm text-background/80 underline-offset-4 hover:text-background hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background")}>
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <div className="border-t border-background/20">
        <Container className="flex flex-col gap-4 py-6">
          <p className={cn(type.bodySm, "text-background/80")}>
            © 2026 AI Caravan. We collect only what you type into our forms and never sell it. Session recordings are shared with pass holders only.
          </p>
          <p className={cn(type.caption, "text-background/80")}>
            Mock-up: AI Caravan 2026 is a fictional event made to test a design system. Every speaker, company, venue, date and price here is invented.
          </p>
        </Container>
      </div>
    </footer>
  );
}

// Floating action button: one round brand-colored button, fixed bottom-right (design.md, section 6).
export function FloatingButton() {
  return (
    <Button
      nativeButton={false}
      render={<a href="#contact" aria-label="Ask the crew" />}
      size="icon-lg"
      className="fixed right-4 bottom-4 z-30 size-14 rounded-full shadow-xl md:right-6 md:bottom-6 md:size-16 [&_svg:not([class*='size-'])]:size-6"
    >
      <SparklesIcon />
    </Button>
  );
}
