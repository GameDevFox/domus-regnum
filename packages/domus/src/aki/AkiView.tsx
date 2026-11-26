import { useRef } from "react";

import { ThreeView, useApp, useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

import { CANVAS_FILL, clampPortraitPan, portraitApp, portraitMetrics, type PortraitState } from "./aki-app";
import { EYES, type EyesName, MOUTHS, type MouthName, POSES, type PoseName } from "./names";
import { useDrag } from "./use-drag";

// Aki demo (/aki) — the character as a scene-lib component driven by Values (see aki-app.ts). This panel
// binds those Values to a control panel + a zoom bar (Value) + click-drag pan; <ThreeView> renders the
// persistent app. Foundation for the tea-party guest.

const label = (s: string) => s.replace(/-/g, " ");

// Mood presets set BOTH eyes and mouth (+ the matching marker); each combo is unique so the active mood
// is inferred from the current eyes/mouth.
const MOODS = [
  { name: "Normal", eyes: "open", mouth: "closed" },
  { name: "Calm", eyes: "closed", mouth: "closed" },
  { name: "Cheerful", eyes: "happy", mouth: "open" },
  { name: "Excited", eyes: "sparkle", mouth: "large-smile" },
  { name: "Embarrassed", eyes: "embarrassed", mouth: "large-smile" },
  { name: "Pout", eyes: "angry", mouth: "pout" },
  { name: "Angry", eyes: "angry", mouth: "angry" },
] as const satisfies readonly { name: string; eyes: EyesName; mouth: MouthName }[];

export const AkiPanel = () => {
  const app = useApp(portraitApp);
  if (!app) return <p className="text-muted-foreground pt-6 text-center text-sm">Loading Aki…</p>;
  return <Portrait state={app.state} />;
};

const Portrait = ({ state }: { state: PortraitState }) => {
  const pose = useValue(state.pose);
  const eyes = useValue(state.eyes);
  const mouth = useValue(state.mouth);
  const glasses = useValue(state.glasses);
  const ears = useValue(state.ears);
  const angryMark = useValue(state.angryMark);
  const drop = useValue(state.drop);
  const blink = useValue(state.blink);
  const talking = useValue(state.talking);
  const zoom = useValue(state.zoom);

  const logFraming = () => {
    const { x, y } = state.pan.peek();
    console.log(`[Aki framing] zoom=${state.zoom.peek().toFixed(3)} pan={x:${x.toFixed(3)}, y:${y.toFixed(3)}}`);
  };

  // ---- click-drag pan (content follows the pointer), clamped to the figure ----
  const startPan = useRef({ x: 0, y: 0 });
  const { dragging, handlers } = useDrag({
    onStart: () => (startPan.current = state.pan.peek()),
    onDrag: (dx, dy) => {
      const w = state.width.peek();
      const h = state.height.peek();
      const { halfH } = portraitMetrics(state.zoom.peek(), w, h);
      const wpp = (2 * halfH) / h;
      state.pan.set(clampPortraitPan({ x: startPan.current.x - dx * wpp, y: startPan.current.y + dy * wpp }, state.zoom.peek(), w, h));
    },
    onEnd: logFraming,
  });

  const setZoom = (z: number) => {
    state.zoom.set(z);
    state.pan.set(clampPortraitPan(state.pan.peek(), z, state.width.peek(), state.height.peek()));
  };

  const activeMood = MOODS.find((m) => m.eyes === eyes && m.mouth === mouth)?.name;
  const pickMood = (m: (typeof MOODS)[number]) => {
    state.eyes.set(m.eyes);
    state.mouth.set(m.mouth);
    state.talking.set(false);
    state.angryMark.set(m.name === "Angry");
    state.drop.set(m.name === "Embarrassed");
  };
  const pickMouth = (n: MouthName) => {
    state.talking.set(false); // a manual mouth cancels talking
    state.mouth.set(n);
  };
  const randomPose = () => state.pose.set(POSES.filter((p) => p !== state.pose.peek())[Math.floor(Math.random() * (POSES.length - 1))]);

  const Row = <N extends string>(title: string, names: readonly N[], current: N, pick: (n: N) => void) => (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</span>
      <div className="flex flex-wrap gap-1">
        {names.map((n) => (
          <Button key={n} size="sm" variant={n === current ? "default" : "secondary"} className="capitalize" onClick={() => pick(n)}>
            {label(n)}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-stretch gap-5 pt-2">
      <div className="flex w-full flex-col gap-6 sm:flex-row">
        {/* Portrait (2/3) — camera zoom bar on the left, click-drag to pan. */}
        <div className="relative min-w-0 sm:basis-2/3">
          <div className="rounded-xl border bg-card/50 p-2 shadow-sm">
            <div
              {...handlers}
              className={`relative aspect-[1000/1618] w-full touch-none overflow-hidden select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              <ThreeView app={portraitApp} className={CANVAS_FILL} />
            </div>
          </div>
          <div className="absolute top-1/2 left-4 z-10 flex h-40 -translate-y-1/2 flex-col items-center gap-1">
            <span className="text-muted-foreground text-[10px] font-medium">1:1</span>
            <Slider
              orientation="vertical"
              value={[Math.round(zoom * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => setZoom(v / 100)}
              onValueCommit={logFraming}
              aria-label="Zoom"
            />
            <span className="text-muted-foreground text-[10px] font-medium">fit</span>
          </div>
        </div>

        {/* Controls (1/3) */}
        <div className="flex min-w-0 flex-col gap-4 sm:basis-1/3">
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant={talking ? "default" : "secondary"} onClick={() => state.talking.update((v) => !v)}>
              {talking ? "◼ Stop" : "▶ Talk"}
            </Button>
            <Button size="sm" variant={blink ? "default" : "secondary"} onClick={() => state.blink.update((v) => !v)}>
              Blink
            </Button>
            <Button size="sm" variant="secondary" onClick={randomPose}>
              Random pose
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Mood</span>
            <div className="flex flex-wrap gap-1">
              {MOODS.map((m) => (
                <Button key={m.name} size="sm" variant={m.name === activeMood ? "default" : "secondary"} onClick={() => pickMood(m)}>
                  {m.name}
                </Button>
              ))}
            </div>
          </div>

          {Row("Pose", POSES, pose, (n: PoseName) => state.pose.set(n))}
          {Row("Eyes", EYES, eyes, (n: EyesName) => state.eyes.set(n))}
          {Row("Mouth", MOUTHS, mouth, pickMouth)}

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Accessories</span>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={glasses ? "default" : "secondary"} onClick={() => state.glasses.update((v) => !v)}>
                Glasses
              </Button>
              <Button size="sm" variant={ears ? "default" : "secondary"} onClick={() => state.ears.update((v) => !v)}>
                Cat ears
              </Button>
              <Button size="sm" variant={angryMark ? "default" : "secondary"} onClick={() => state.angryMark.update((v) => !v)}>
                Anger mark
              </Button>
              <Button size="sm" variant={drop ? "default" : "secondary"} onClick={() => state.drop.update((v) => !v)}>
                Sweat drop
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
