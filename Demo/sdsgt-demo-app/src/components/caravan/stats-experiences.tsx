import { FlaskConicalIcon, LayoutGridIcon, MusicIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { experiences, stats } from "./data";
import { Container, Section, SectionHead } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";

// Stats band: four big numbers with short labels, separated by thin dashed dividers.
export function Stats() {
  return (
    <section aria-labelledby="stats-title" className="border-y bg-card py-16 md:py-24">
      <Container>
        <Reveal>
          <h2 id="stats-title" className={cn(type.h2, "mx-auto mb-10 max-w-3xl text-center text-balance text-foreground md:mb-14")}>
            Big enough to matter, small enough to meet
          </h2>
          <dl className="grid grid-cols-2 gap-y-8 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className={cn("flex flex-col gap-2 border-dashed border-border px-4 md:px-8", i % 2 === 1 ? "border-l" : "max-lg:border-l-0", "lg:border-l", i === 0 && "lg:border-l-0")}>
                <dd className={cn(type.stat, "text-foreground")}>{s.value}</dd>
                <dt className={cn(type.body, "text-pretty text-muted-foreground")}>{s.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}

const icons = {
  flask: <FlaskConicalIcon className="size-5" aria-hidden="true" />,
  grid: <LayoutGridIcon className="size-5" aria-hidden="true" />,
  music: <MusicIcon className="size-5" aria-hidden="true" />,
} as const;

// "More than talks": three cards, each with a branded illustration panel on top.
export function Experiences() {
  const art = [
    "bg-primary text-primary-foreground",
    "bg-foreground text-background",
    "bg-accent text-accent-foreground",
  ];
  return (
    <Section id="experiences">
      <Container>
        <Reveal>
          <SectionHead title="More than talks" intro="Get hands-on, see what other teams actually shipped, and meet the people behind it." />
        </Reveal>
        <Reveal className="grid gap-4 md:grid-cols-3 md:gap-6">
          {experiences.map((e, i) => (
            <Card key={e.title} className="gap-0 pt-0">
              <div className={cn("relative flex h-40 items-end overflow-hidden p-4 md:h-48", art[i])} aria-hidden="true">
                <svg viewBox="0 0 200 100" className="absolute inset-0 size-full opacity-25" preserveAspectRatio="xMidYMid slice">
                  <circle cx="30" cy="80" r="46" className="fill-current" />
                  <circle cx="150" cy="20" r="62" fill="none" strokeWidth="2" className="stroke-current" />
                  <circle cx="170" cy="86" r="26" className="fill-current opacity-60" />
                </svg>
                <span className="relative flex size-10 items-center justify-center rounded-full bg-card text-foreground shadow-md">{icons[e.icon]}</span>
              </div>
              <CardHeader className="pt-(--card-spacing)">
                <CardTitle className={cn(type.h4, "text-foreground")}>{e.title}</CardTitle>
                <CardDescription className={cn(type.body, "text-pretty text-muted-foreground")}>{e.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Reveal>
      </Container>
    </Section>
  );
}
