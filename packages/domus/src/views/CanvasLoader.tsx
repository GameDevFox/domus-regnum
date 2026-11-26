import { useValue } from "@kitsune/common-web/src/react";
import { Value } from "@kitsune/common-web/src/value";

import { LoadSession } from "../domus-app/load-session";

// A loader overlay scoped to ONE canvas (not the whole page), so the surrounding page chrome — the
// header, tabs, concept images, credits — renders and stays readable while only the 3D view masks.
// Driven by a per-app `loading: Value<LoadSession | null>`: the initial load publishes one, and a
// future area transition publishes another, so the same overlay doubles as an in-game loading
// screen. Sits `absolute inset-0` inside the canvas frame (which is `relative` + rounded/overflow).
export const CanvasLoader = ({ loading }: { loading: Value<LoadSession | null> }) => {
  const session = useValue(loading);
  if (!session) return null;
  return <CanvasLoaderOverlay session={session} />;
};

const CanvasLoaderOverlay = ({ session }: { session: LoadSession }) => {
  const phase = useValue(session.phase);
  const progress = useValue(session.progress);
  const label = useValue(session.label);
  const pct = Math.round(progress * 100);
  const ready = phase === "ready";
  return (
    <div
      aria-hidden={ready}
      className={`bg-background absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-[inherit] transition-opacity duration-300 ${
        ready ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="bg-secondary h-1.5 w-48 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* The GPU phase has no byte-progress to show, so it reads "Preparing…" rather than a %. */}
      <p className="text-muted-foreground text-xs">
        {phase === "uploading" ? "Preparing…" : `${label} ${pct}%`}
      </p>
    </div>
  );
};
