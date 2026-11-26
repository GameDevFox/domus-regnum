import * as React from "react";

import { cn } from "@/lib/utils";

// A keycap — the HTML <kbd> element styled to look like a physical key: a lifted cap with a
// hard bottom "lip" (the dark drop) that reads as the key's height in our cozy dark theme.
const Kbd = ({ className, ...props }: React.ComponentProps<"kbd">) => (
  <kbd
    className={cn(
      "bg-secondary text-secondary-foreground inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 font-mono text-xs font-semibold shadow-[0_2px_0_rgb(0_0_0_/_0.45)] select-none",
      className,
    )}
    {...props}
  />
);

export { Kbd };
