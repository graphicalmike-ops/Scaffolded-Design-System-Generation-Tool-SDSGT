import { ArrowRightIcon, CheckIcon, CodeXmlIcon, CompassIcon, PaletteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { tracks, type TrackId } from "./data";
import { Container, Section, SectionHead } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";

const trackIcon: Record<TrackId, React.ReactNode> = {
  design: <PaletteIcon className="size-5" aria-hidden="true" />,
  management: <CompassIcon className="size-5" aria-hidden="true" />,
  development: <CodeXmlIcon className="size-5" aria-hidden="true" />,
};

// Three tracks: a row of three cards, then tabs that open each track's detail.
export function Tracks() {
  return (
    <Section id="tracks">
      <Container>
        <Reveal>
          <SectionHead
            title="Three tracks, one product team"
            intro="Pick a lane or roam freely. Every pass opens all three tracks, so designers, product managers and engineers learn side by side."
          />
        </Reveal>

        <Reveal className="grid gap-4 md:grid-cols-3 md:gap-6">
          {tracks.map((t) => (
            <Card key={t.id} className="gap-4">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">{trackIcon[t.id]}</div>
                <CardTitle className={cn(type.h4, "text-foreground")}>{t.label}</CardTitle>
                <CardDescription className={cn(type.body, "text-muted-foreground")}>{t.summary}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Reveal>

        <Reveal className="mt-10 md:mt-14">
          <Tabs defaultValue="design" className="gap-6">
            <TabsList className="mx-auto w-full max-w-2xl flex-wrap rounded-full p-1 group-data-horizontal/tabs:h-auto">
              {tracks.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="h-10 rounded-full px-4 text-sm md:text-base">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tracks.map((t) => (
              <TabsContent key={t.id} value={t.id}>
                <Card className="mx-auto max-w-5xl p-0 md:p-2">
                  <div className="grid gap-8 p-6 md:grid-cols-2 md:gap-12 md:p-8">
                    <div className="flex flex-col items-start gap-4">
                      <p className={cn(type.bodySmStrong, "text-muted-foreground")}>
                        {t.number} · {t.label}
                      </p>
                      <h3 className={cn(type.h3, "text-balance text-foreground")}>{t.title}</h3>
                      <p className={cn(type.bodyLg, "text-pretty text-muted-foreground")}>{t.body}</p>
                      <Button nativeButton={false} render={<a href="#agenda" />} variant="outline" className="group/btn mt-2 h-11 rounded-full px-6 text-base">
                        Explore track
                        <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
                      </Button>
                    </div>
                    <CardContent className="flex flex-col justify-center gap-4 p-0">
                      <ul className="flex flex-col gap-4">
                        {t.points.map((p) => (
                          <li key={p} className="flex items-start gap-3">
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <CheckIcon className="size-4" aria-hidden="true" />
                            </span>
                            <span className={cn(type.bodyLg, "text-foreground")}>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </div>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </Container>
    </Section>
  );
}
