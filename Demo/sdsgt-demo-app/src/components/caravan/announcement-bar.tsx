"use client";

import * as React from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { announcements } from "./data";
import { type } from "./type";

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-full text-primary-foreground transition-colors hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION).matches;
}

// Rotating announcements on the brand color. Auto-rotating content must have a pause control,
// and starts paused when the visitor prefers reduced motion (design.md, section 6).
export function AnnouncementBar() {
  const [index, setIndex] = React.useState(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const reducedMotion = React.useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const paused = userPaused || reducedMotion;
  const count = announcements.length;

  React.useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => window.clearInterval(id);
  }, [paused, count]);

  const item = announcements[index];

  return (
    <div className="bg-primary text-primary-foreground" role="region" aria-label="Announcements">
      <div className="mx-auto flex min-h-12 w-full max-w-screen-2xl items-center gap-2 px-4 md:px-6">
        <button type="button" className={iconButton} aria-label="Previous announcement" onClick={() => setIndex((i) => (i - 1 + count) % count)}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <p className={cn(type.bodySmStrong, "flex-1 text-center text-pretty")} aria-live={paused ? "polite" : "off"}>
          {item.text}{" "}
          <a href={item.href} className="group/link inline-flex items-center gap-1 underline underline-offset-4 hover:no-underline">
            {item.cta}
            <ArrowRightIcon className="size-4 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none" />
          </a>
        </p>
        <button type="button" className={iconButton} aria-label="Next announcement" onClick={() => setIndex((i) => (i + 1) % count)}>
          <ChevronRightIcon className="size-4" />
        </button>
        <button type="button" className={iconButton} aria-label={paused ? "Resume rotating announcements" : "Pause rotating announcements"} aria-pressed={paused} onClick={() => setUserPaused((p) => !p)}>
          {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </button>
      </div>
    </div>
  );
}
