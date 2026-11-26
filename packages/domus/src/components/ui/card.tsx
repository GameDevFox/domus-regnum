import * as React from "react";

import { cn } from "@/lib/utils";

const Card = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card"
    className={cn(
      // --shadow-soft is tuned for dark mode: a soft, deeper cast that registers on the warm bg
      // (the default shadow-sm is black-on-dark and effectively invisible).
      "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-[var(--shadow-soft)]",
      className,
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="card-header" className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />
);

const CardTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />
);

const CardDescription = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);

const CardContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="card-content" className={cn("px-6", className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
