"use client";

import * as React from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Container } from "./layout";
import { partners } from "./data";
import { type } from "./type";
import { cn } from "@/lib/utils";

// Auto-scrolling partner names with a pause control; stops entirely under reduced motion (see caravan.css).
export function Partners() {
  const [paused, setPaused] = React.useState(false);

  return (
    <section aria-label="Partners" className="border-y bg-card py-8">
      <Container className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className={cn(type.bodySmStrong, "text-muted-foreground")}>Backed by teams shipping AI every day</p>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? "Resume partner scroll" : "Pause partner scroll"}
            className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hidden"
          >
            {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
          </button>
        </div>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="caravan-marquee-track" data-paused={paused}>
            {[...partners, ...partners].map((name, i) => (
              <li
                key={`${name}-${i}`}
                aria-hidden={i >= partners.length ? true : undefined}
                className={cn(type.bodyLgStrong, "px-6 whitespace-nowrap text-muted-foreground md:px-10")}
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
