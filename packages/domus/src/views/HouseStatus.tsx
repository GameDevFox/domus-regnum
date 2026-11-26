import { useValue } from "@kitsune/common-web/src/react";

import { DomusSceneApp } from "../domus-app/three-app";

// A house-status panel overlaid in the frame while the Tidy House sim runs: a cleanliness meter
// (green→amber→red as the house falls behind) plus a live servant roster (name + what each is
// doing). Both read reactive Values the sim publishes; the roster only re-renders when a servant's
// activity/task changes, not every frame.
const ACTIVITY_LABEL: Record<string, string> = {
  idle: "idle",
  walking: "walking",
  working: "sweeping",
};
const ACTIVITY_DOT: Record<string, string> = {
  idle: "#9aa3b0",
  walking: "#5ec8ff",
  working: "#3ddc84",
};

// Cleanliness meter bands (percent) + their colors (green matches the "working" dot).
const CLEAN_GOOD_PCT = 66;
const CLEAN_WARN_PCT = 33;
const METER_COLORS = { good: "#3ddc84", warn: "#ffd166", bad: "#ff6e6e" };

export const HouseStatus = ({ app }: { app: DomusSceneApp }) => {
  const running = useValue(app.state.runTidy);
  const clean = useValue(app.state.cleanliness);
  const staff = useValue(app.state.staff);
  if (!running) return null;

  const pct = Math.round(clean * 100);
  const color = pct > CLEAN_GOOD_PCT ? METER_COLORS.good : pct > CLEAN_WARN_PCT ? METER_COLORS.warn : METER_COLORS.bad;
  return (
    <div className="bg-card/80 absolute top-3 left-3 z-10 w-44 rounded-md border p-2.5 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">House cleanliness</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {staff.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5 text-xs">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: ACTIVITY_DOT[s.activity] }}
              />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground ml-auto">
                {ACTIVITY_LABEL[s.activity] ?? s.activity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
