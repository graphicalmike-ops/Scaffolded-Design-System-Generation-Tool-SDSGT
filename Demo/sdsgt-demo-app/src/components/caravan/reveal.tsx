"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Fades content up as it scrolls into view. Without JavaScript or with reduced motion, it just shows.
export function Reveal({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-visible={visible} className={cn("caravan-reveal", className)} {...props}>
      {children}
    </div>
  );
}
