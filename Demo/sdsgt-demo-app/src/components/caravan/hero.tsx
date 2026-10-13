import { ArrowRightIcon, CalendarIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";
import { cn } from "@/lib/utils";

// Hero: centered display headline, a short intro and one primary action (design.md, section 6).
export function Hero() {
  return (
    <section id="top" className="scroll-mt-24 pt-12 pb-8 md:pt-20 md:pb-12">
      <Container>
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <p className={cn(type.bodySmStrong, "inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground")}>
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-4" aria-hidden="true" />
              17–19 November 2026
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon className="size-4" aria-hidden="true" />
              Bogotá, Colombia
            </span>
          </p>
          <h1 className={cn(type.display, "text-balance text-foreground")}>The Road to <span className="whitespace-nowrap">AI-Native</span> Products</h1>
          <p className={cn(type.bodyLg, "max-w-2xl text-pretty text-muted-foreground")}>
            Three days in Bogotá with 64 designers, product managers and engineers who are already changing how digital products get designed, planned and built with AI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button nativeButton={false} render={<a href="#tickets" />} className="group/btn h-11 rounded-full px-6 text-base">
              Get Tickets
              <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
            </Button>
            <Button nativeButton={false} render={<a href="#agenda" />} variant="outline" className="h-11 rounded-full px-6 text-base">
              See agenda
            </Button>
          </div>
        </Reveal>

        <Reveal className="relative mx-auto mt-12 max-w-5xl md:mt-16">
          <HeroArt />
          <Card size="sm" className="absolute top-4 left-4 hidden w-60 gap-1 shadow-lg sm:flex md:top-8 md:left-8">
            <div className="px-(--card-spacing)">
              <p className={cn(type.captionStrong, "flex items-center gap-1.5 text-foreground")}>
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                Live on Sala Cóndor
              </p>
              <p className={cn(type.bodySmStrong, "mt-1 text-foreground")}>Designing for agents, not just users</p>
              <p className={cn(type.caption, "mt-1 text-muted-foreground")}>Valentina Ríos Ocampo · Day 1, 10:30</p>
            </div>
          </Card>
          <Card size="sm" className="absolute right-4 bottom-4 hidden w-56 gap-1 shadow-lg sm:flex md:right-8 md:bottom-8">
            <div className="px-(--card-spacing)">
              <p className={cn(type.captionStrong, "text-muted-foreground")}>Next stop</p>
              <p className={cn(type.bodySmStrong, "mt-1 text-foreground")}>Medellín 2025 → Bogotá 2026</p>
            </div>
          </Card>
        </Reveal>
      </Container>
    </section>
  );
}

// Original illustration: three capsules travelling a road toward an arch. Colors come only from semantic tokens.
function HeroArt() {
  return (
    <div className="overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
      <svg viewBox="0 0 960 420" role="img" aria-label="Illustration: three red and black capsules travelling a winding road toward a large arch" className="block h-auto w-full">
        <defs>
          <linearGradient id="caravan-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="[stop-color:var(--card)]" />
            <stop offset="1" className="[stop-color:var(--muted)]" />
          </linearGradient>
        </defs>
        <rect width="960" height="420" fill="url(#caravan-sky)" />
        {/* distant hills */}
        <path d="M0 270 C140 200 260 260 380 230 C500 200 600 250 720 215 C820 190 900 230 960 215 L960 420 L0 420 Z" className="fill-foreground/10" />
        <path d="M0 310 C160 260 300 320 460 285 C620 250 760 310 960 265 L960 420 L0 420 Z" className="fill-foreground/15" />
        {/* the arch */}
        <path d="M640 330 L640 150 C640 80 800 80 800 150 L800 330 L760 330 L760 155 C760 125 680 125 680 155 L680 330 Z" className="fill-primary" />
        {/* the road */}
        <path d="M-20 400 C220 330 340 380 520 345 C640 322 700 332 720 332 L740 332 C760 332 830 340 980 330 L980 430 L-20 430 Z" className="fill-foreground" />
        <path d="M0 395 C230 332 340 372 520 340 C650 318 700 326 720 326" fill="none" strokeWidth="3" strokeDasharray="16 14" strokeLinecap="round" className="stroke-card" />
        {/* capsules */}
        <g>
          <rect x="120" y="318" width="120" height="52" rx="26" className="fill-primary" />
          <circle cx="160" cy="344" r="9" className="fill-card" />
          <circle cx="200" cy="344" r="9" className="fill-card" />
        </g>
        <g>
          <rect x="290" y="306" width="120" height="52" rx="26" className="fill-accent" />
          <circle cx="330" cy="332" r="9" className="fill-card" />
          <circle cx="370" cy="332" r="9" className="fill-card" />
        </g>
        <g>
          <rect x="460" y="298" width="120" height="52" rx="26" className="fill-card" />
          <circle cx="500" cy="324" r="9" className="fill-foreground" />
          <circle cx="540" cy="324" r="9" className="fill-foreground" />
        </g>
        {/* stars of the route */}
        <circle cx="120" cy="90" r="5" className="fill-primary/40" />
        <circle cx="330" cy="60" r="4" className="fill-foreground/30" />
        <circle cx="520" cy="110" r="6" className="fill-primary/30" />
        <circle cx="880" cy="70" r="4" className="fill-foreground/30" />
      </svg>
    </div>
  );
}
