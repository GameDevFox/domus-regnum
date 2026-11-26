import { Box, Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ThreeView, useApp, useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

import { PathDebugApp, pathDebugApp, scenarios } from "../domus-app/path-debug";

import { CanvasLoader } from "./CanvasLoader";
import { OVERLAY_ICON_BTN } from "./chrome";

// The path-debug visualizer: a separate Three.js view of the headless agent sim, with a slider that
// scrubs the recorded (deterministic) timeline. Resolves the app first, then renders the canvas +
// slider (useValue needs a live Value, so the slider lives in a child).
export const PathDebugPanel = ({ scenarioId }: { scenarioId?: string }) => {
  const app = useApp(pathDebugApp);
  // Reserve the canvas height while the app constructs (first open only) so the page below is stable.
  if (!app)
    return (
      <div className="path-debug-canvas text-muted-foreground flex items-center justify-center text-sm">
        loading path debug…
      </div>
    );
  return <PathDebugView app={app} scenarioId={scenarioId} />;
};

const PathDebugView = ({ app, scenarioId }: { app: PathDebugApp; scenarioId?: string }) => {
  const navigate = useNavigate();
  const frame = useValue(app.frame);
  const frameCount = useValue(app.frameCount);
  const perspective = useValue(app.perspective);
  const [playing, setPlaying] = useState(false);

  // The selected scenario is driven by the URL (/path-debug/:id); fall back to the first.
  const index = Math.max(
    0,
    scenarios.findIndex((s) => s.id === scenarioId),
  );
  const scenario = scenarios[index];
  const last = Math.max(0, frameCount - 1); // actual recorded length (haul runs stop when clean)
  const frameDt = scenario.dt;
  const [seed, setSeed] = useState(app.currentSeed);

  const frameInt = Math.round(frame);
  const time = (frame * frameDt).toFixed(1);
  const totalTime = (last * frameDt).toFixed(1);

  // Keep the app's loaded scene in sync with the selected scenario (reverting to its default seed).
  useEffect(() => {
    if (app.currentScenario !== index) {
      setPlaying(false);
      setSeed(scenarios[index].seed);
      app.loadScenario(index); // rebuilds the scene + timeline and resets the playhead to 0
    }
  }, [app, index]);

  const selectScenario = (id: string) => navigate(`/path-debug/${id}`);

  // Re-record the current scenario with the entered seed (only when it actually changed).
  const applySeed = () => {
    if (seed !== app.currentSeed) {
      setPlaying(false);
      app.loadScenario(index, seed);
    }
  };

  const togglePlay = () => {
    if (!playing && app.frame.peek() >= last) app.frame.set(0); // restart if parked at the end
    setPlaying((p) => !p);
  };

  // Real-time playback: each animation frame, advance by (real elapsed seconds / frameDt). Stops
  // at the end. Scrubbing or switching scenarios pauses it.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - prev) / 1000;
      prev = now;
      const next = app.frame.peek() + elapsed / frameDt;
      if (next >= last) {
        app.frame.set(last);
        setPlaying(false);
        return;
      }
      app.frame.set(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, app, last, frameDt]);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full flex-col items-center gap-2 md:grid md:grid-cols-3 md:gap-4">
        <Select value={scenario.id} onValueChange={selectScenario}>
          <SelectTrigger className="w-[230px]">
            {/* Radix's bare Select.Value carries no data-slot, so the trigger's line-clamp never
                applied — render the name in a real truncating span instead (min-w-0 lets a flex
                child shrink; truncate adds the ellipsis). */}
            <span className="min-w-0 truncate">{scenario.name}</span>
          </SelectTrigger>
          <SelectContent>
            {scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center justify-center gap-2">
          <span className="text-muted-foreground text-sm">Seed</span>
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySeed();
            }}
            onBlur={applySeed}
            className="w-[130px]"
            aria-label="Random seed"
          />
        </div>

        <div className="text-muted-foreground flex gap-4 text-sm tabular-nums md:justify-end md:self-end">
          <span>
            Frame {frameInt} / {last}
          </span>
          <span>
            Time {time} / {totalTime}s
          </span>
        </div>
      </div>
      <div className="flex w-full items-center gap-3">
        <Button
          size="icon"
          variant="secondary"
          className="size-8 shrink-0"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Slider
          aria-label="Playback timeline"
          min={0}
          max={last}
          value={[frame]}
          onValueChange={(v) => {
            setPlaying(false);
            app.frame.set(v[0]);
          }}
        />
      </div>
      <div className="relative w-full">
        <ThreeView app={pathDebugApp} className="path-debug-canvas" />
        <CanvasLoader loading={app.loading} />
        <Button
          size="icon"
          variant="secondary"
          className={`absolute top-3 right-3 z-10 ${OVERLAY_ICON_BTN}`}
          onClick={() => app.perspective.update((v) => !v)}
          title={
            perspective
              ? "Perspective — switch to Orthographic"
              : "Orthographic — switch to Perspective"
          }
          aria-label="Toggle camera projection"
        >
          {perspective ? <Box /> : <Square />}
        </Button>
      </div>
    </div>
  );
};
