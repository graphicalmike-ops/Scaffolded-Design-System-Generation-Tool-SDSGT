import { ArrowRightIcon, BedDoubleIcon, CheckIcon, LayersIcon, PlaneIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { faqs, tiers, venue } from "./data";
import { Container, Section, SectionHead } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";

const tipIcon = {
  plane: <PlaneIcon className="size-5" aria-hidden="true" />,
  bed: <BedDoubleIcon className="size-5" aria-hidden="true" />,
  layers: <LayersIcon className="size-5" aria-hidden="true" />,
} as const;

// Venue: a dark illustration panel with a white info card, then three travel tips.
export function Venue() {
  return (
    <Section id="venue">
      <Container>
        <Reveal>
          <SectionHead eyebrow="Venue & travel" title="Meet us at 2,640 metres" intro={venue.intro} />
        </Reveal>
        <Reveal>
          <div className="relative overflow-hidden rounded-xl bg-foreground text-background">
            <svg viewBox="0 0 960 360" className="block h-72 w-full md:h-96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M0 230 C120 160 220 220 340 190 C470 155 560 215 690 180 C800 150 880 190 960 170 L960 360 L0 360 Z" className="fill-background/10" />
              <path d="M0 290 C160 240 300 300 460 262 C620 225 760 290 960 240 L960 360 L0 360 Z" className="fill-background/20" />
              {/* cable cars on a line */}
              <path d="M40 90 L920 40" strokeWidth="2" className="stroke-background/40" fill="none" />
              <g transform="translate(300 0)">
                <rect x="190" y="72" width="44" height="30" rx="8" className="fill-primary" />
                <rect x="198" y="80" width="12" height="12" rx="3" className="fill-background" />
                <rect x="214" y="80" width="12" height="12" rx="3" className="fill-background" />
              </g>
              <g transform="translate(180 0)">
                <rect x="560" y="52" width="44" height="30" rx="8" className="fill-accent" />
                <rect x="568" y="60" width="12" height="12" rx="3" className="fill-background" />
                <rect x="584" y="60" width="12" height="12" rx="3" className="fill-background" />
              </g>
              {/* the mill */}
              <path d="M640 260 L640 190 L700 170 L760 190 L760 260 Z" className="fill-primary/70" />
              <rect x="780" y="210" width="60" height="50" className="fill-background/30" />
            </svg>
            <Card className="m-4 gap-4 bg-card shadow-xl md:absolute md:bottom-6 md:left-6 md:m-0 md:w-96">
              <CardHeader>
                <CardTitle className={cn(type.h4, "text-foreground")}>{venue.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  {venue.facts.map((f) => (
                    <div key={f.label} className="flex flex-col">
                      <dt className={cn(type.captionStrong, "text-muted-foreground")}>{f.label}</dt>
                      <dd className={cn(type.body, "text-foreground")}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
              <CardFooter className="border-t-0 bg-transparent pt-0">
                <Button nativeButton={false} render={<a href="#contact" />} variant="outline" className="group/btn h-11 rounded-full px-6 text-base">
                  Plan your trip
                  <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Reveal>
        <Reveal className="mt-6 grid gap-4 md:grid-cols-3 md:gap-6">
          {venue.tips.map((t) => (
            <Card key={t.title} className="gap-3">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">{tipIcon[t.icon]}</div>
                <CardTitle className={cn(type.h4, "text-foreground")}>{t.title}</CardTitle>
                <CardDescription className={cn(type.body, "text-pretty text-muted-foreground")}>{t.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Reveal>
      </Container>
    </Section>
  );
}

// Tickets: three cards. Only the featured one gets the brand-filled action (one primary action per view).
export function Tickets() {
  return (
    <Section id="tickets" className="border-y bg-card">
      <Container>
        <Reveal>
          <SectionHead title="Choose your pass" intro="Every pass includes the expo floor, lunch and all the coffee you can handle. Prices in US dollars, taxes included." />
        </Reveal>
        <Reveal className="grid items-stretch gap-4 md:grid-cols-3 md:gap-6">
          {tiers.map((t) => (
            <Card key={t.id} className={cn("gap-6 bg-background", t.featured && "ring-2 ring-primary")}>
              <CardHeader>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge variant={t.featured ? "default" : "outline"}>{t.badge}</Badge>
                  {t.featured ? <Badge variant="default">Most popular</Badge> : null}
                </div>
                <CardTitle className={cn(type.h4, "text-foreground")}>{t.name}</CardTitle>
                <CardDescription className={cn(type.body, "text-muted-foreground")}>{t.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <p className="flex items-baseline gap-2 text-foreground">
                  <span className={type.bodySmStrong}>USD</span>
                  <span className={type.stat}>{t.price}</span>
                </p>
                {t.note ? <p className={cn(type.bodySm, "text-muted-foreground")}>{t.note}</p> : null}
                <ul className="flex flex-col gap-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
                      <span className={cn(type.body, "text-foreground")}>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="border-t-0 bg-transparent pt-0">
                <Button
                  nativeButton={false}
                  render={<a href="#contact" />}
                  variant={t.featured ? "default" : "outline"}
                  className="group/btn h-11 w-full rounded-full px-6 text-base"
                >
                  {t.cta}
                  <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </Reveal>
        <Reveal>
          <p className={cn(type.body, "mt-8 text-center text-muted-foreground")}>Student and nonprofit passes are available. See the questions below.</p>
        </Reveal>
      </Container>
    </Section>
  );
}

// FAQ: an accordion; each question is a full-width button with a chevron.
export function Faq() {
  return (
    <Section id="faq">
      <Container>
        <Reveal>
          <SectionHead title="Questions, answered" />
        </Reveal>
        <Reveal>
          <Card className="mx-auto max-w-3xl gap-0 py-2">
            <Accordion className="px-4 md:px-6">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`faq-${i}`}>
                  <AccordionTrigger className={cn(type.bodyLgStrong, "items-center py-5 text-foreground")}>{f.q}</AccordionTrigger>
                  <AccordionContent className={cn(type.body, "text-muted-foreground")}>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </Reveal>
      </Container>
    </Section>
  );
}
