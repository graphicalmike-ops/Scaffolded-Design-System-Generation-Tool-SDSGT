"use client";

import * as React from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { nav } from "./data";
import { type } from "./type";

export function Logo({ className }: { className?: string }) {
  return (
    <a href="#top" className={cn("inline-flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}>
      {/* A route of three dots ending in a brand-colored stop. */}
      <svg viewBox="0 0 40 16" className="h-4 w-10" aria-hidden="true">
        <circle cx="4" cy="8" r="3" className="fill-current opacity-30" />
        <circle cx="16" cy="8" r="3" className="fill-current opacity-60" />
        <circle cx="30" cy="8" r="5" className="fill-primary" />
      </svg>
      <span className={cn(type.h4, "tracking-tight")}>AI Caravan</span>
    </a>
  );
}

// Sticky header: slides away on scroll-down, returns (with a shadow) on scroll-up.
export function SiteHeader() {
  const [hidden, setHidden] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const lastY = React.useRef(0);

  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y > lastY.current && y > 160) setHidden(true);
      else if (y < lastY.current) setHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 text-foreground backdrop-blur transition-transform duration-300 motion-reduce:transition-none",
        hidden && "-translate-y-full",
        scrolled && "shadow-md",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between gap-6 px-4 md:h-20 md:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                type.bodyStrong,
                "relative rounded-sm py-2 text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100 focus-visible:after:scale-x-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:after:transition-none",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button nativeButton={false} render={<a href="#tickets" />} className="h-10 rounded-full px-5 text-base">
            Get Tickets
          </Button>
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon" className="rounded-full lg:hidden" aria-label="Open menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="p-6">
              <SheetTitle className={cn(type.h4, "mb-2")}>Menu</SheetTitle>
              <nav aria-label="Mobile" className="flex flex-col">
                {nav.map((item) => (
                  <SheetClose key={item.href} render={<a href={item.href} />} className={cn(type.bodyLgStrong, "border-b py-4 text-foreground focus-visible:outline-2 focus-visible:outline-ring")}>
                    {item.label}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
