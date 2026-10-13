import * as React from "react";
import { cn } from "@/lib/utils";
import { type } from "./type";

// Page container: grid margins use the generated spacing tokens (16px compact, 24px medium and up),
// and the content never grows past the generated 2xl breakpoint.
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-screen-2xl px-4 md:px-6", className)} {...props} />;
}

// Every section uses the same vertical rhythm: the largest spacing steps, smaller on mobile.
export function Section({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("scroll-mt-24 py-16 md:py-24", className)} {...props} />;
}

// Section opener recipe from design.md: a centered heading, a short centered intro, then the content.
export function SectionHead({
  title,
  intro,
  eyebrow,
  align = "center",
  className,
}: {
  title: string;
  intro?: string;
  eyebrow?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-10 flex max-w-3xl flex-col gap-3 md:mb-12",
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow ? <p className={cn(type.bodySmStrong, "text-muted-foreground")}>{eyebrow}</p> : null}
      <h2 className={cn(type.h2, "text-balance text-foreground")}>{title}</h2>
      {intro ? <p className={cn(type.bodyLg, "text-pretty text-muted-foreground")}>{intro}</p> : null}
    </div>
  );
}
