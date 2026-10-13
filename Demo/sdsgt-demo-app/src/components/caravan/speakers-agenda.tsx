import { ArrowRightIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { agenda, speakers, testimonial, trackLabel } from "./data";
import { Container, Section, SectionHead } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";

// Speakers: a 3-up grid of cards. Portraits are placeholders (initials), never photos.
export function Speakers() {
  return (
    <Section id="speakers" className="bg-card border-y">
      <Container>
        <Reveal>
          <SectionHead
            title="Learn from people who ship"
            intro="Practitioners, not pundits. Every speaker has put an AI feature in front of real customers in the last twelve months."
          />
        </Reveal>
        <Reveal className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {speakers.map((s) => (
            <Card key={s.name} className="gap-5 bg-background">
              <CardHeader className="flex flex-row items-center gap-4">
                <div
                  className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground"
                  aria-hidden="true"
                >
                  <span className="absolute -right-3 -bottom-3 size-8 rounded-full bg-primary" />
                  <span className={cn(type.h4, "relative")}>{s.initials}</span>
                </div>
                <div className="min-w-0">
                  <Badge variant="secondary" className="mb-2">
                    {trackLabel[s.track]}
                  </Badge>
                  <h3 className={cn(type.h4, "text-foreground")}>{s.name}</h3>
                  <p className={cn(type.bodySm, "text-muted-foreground")}>{s.role}</p>
                </div>
              </CardHeader>
              <CardContent className="border-t pt-4">
                <p className={cn(type.bodyStrong, "text-pretty text-foreground")}>{s.talk}</p>
                <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>{s.slot}</p>
              </CardContent>
            </Card>
          ))}
        </Reveal>
        <Reveal className="mt-10 flex justify-center">
          <Button nativeButton={false} render={<a href="#agenda" />} variant="outline" className="group/btn h-11 rounded-full px-6 text-base">
            See full agenda
            <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
          </Button>
        </Reveal>
      </Container>
    </Section>
  );
}

// Agenda: three day tabs, each a list of sessions (time, format and track tags, title, people, room).
export function Agenda() {
  return (
    <Section id="agenda">
      <Container>
        <Reveal>
          <SectionHead
            title="Three days, one route"
            intro="Talks run in Spanish or English with live interpretation. All times are Bogotá time (UTC−5)."
          />
        </Reveal>
        <Reveal>
          <Tabs defaultValue="day1" className="mx-auto max-w-5xl gap-6">
            <TabsList className="mx-auto w-full max-w-xl rounded-full p-1 group-data-horizontal/tabs:h-auto">
              {agenda.map((d) => (
                <TabsTrigger key={d.id} value={d.id} className="h-12 flex-col gap-0 rounded-full px-3">
                  <span className={type.bodySmStrong}>{d.label}</span>
                  <span className={cn(type.caption, "font-normal")}>{d.date}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {agenda.map((d) => (
              <TabsContent key={d.id} value={d.id}>
                <Card className="gap-0 py-0">
                  <ol>
                    {d.sessions.map((s) => (
                      <li key={`${d.id}-${s.time}-${s.title}`} className="grid gap-2 border-b px-4 py-5 last:border-b-0 md:grid-cols-[6rem_1fr_9rem] md:gap-6 md:px-6">
                        <time className={cn(type.bodyStrong, "text-foreground")}>{s.time}</time>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={s.format === "Keynote" ? "default" : "outline"}>{s.format}</Badge>
                            <Badge variant="secondary">{trackLabel[s.track]}</Badge>
                          </div>
                          <h3 className={cn(type.bodyLgStrong, "text-balance text-foreground")}>{s.title}</h3>
                          <p className={cn(type.bodySm, "text-muted-foreground")}>{s.who}</p>
                        </div>
                        <p className={cn(type.bodySm, "flex items-start gap-1.5 text-muted-foreground md:justify-end")}>
                          <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          {s.room}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </Container>
    </Section>
  );
}

// Testimonial: a large quote on a plain surface, with the person's name and role below.
export function Testimonial() {
  return (
    <section aria-label="Testimonial" className="border-y bg-card py-16 md:py-24">
      <Container>
        <Reveal className="mx-auto flex max-w-4xl flex-col items-start gap-6">
          <p className={cn(type.bodySmStrong, "text-muted-foreground")}>{testimonial.eyebrow}</p>
          <blockquote className={cn(type.h3, "text-balance text-foreground")}>“{testimonial.quote}”</blockquote>
          <div className="flex items-center gap-3">
            <div className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground" aria-hidden="true">
              <span className={type.bodyStrong}>{testimonial.initials}</span>
            </div>
            <div>
              <p className={cn(type.bodyStrong, "text-foreground")}>{testimonial.name}</p>
              <p className={cn(type.bodySm, "text-muted-foreground")}>{testimonial.role}</p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
