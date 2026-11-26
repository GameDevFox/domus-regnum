import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ThreeView, useApp, useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";

import { type AkiSceneApp, CANVAS_FILL, sceneApp } from "../aki/aki-app";
import { EMOTE_POOL } from "./data";
import { getIntro } from "./tea-intro";
import { TeaIntro } from "./TeaIntro";
import { TeaTitle } from "./TeaTitle";

const randomEmote = () => EMOTE_POOL[Math.floor(Math.random() * EMOTE_POOL.length)];

// Tea-party scene (Tea Time) — the composited scene: a widescreen (golden-ratio) window with the
// Victorian background as a CSS layer and the Aki scene-lib app rendered on a transparent canvas over it,
// so she reads as a guest seated across the table. A loading screen covers the window until Aki's
// textures are in. A button pops a single emote above her head (first step toward the emote system).
//
// (Aki's placement is baked into SCENE_PLACEMENT in aki-app.ts; the drag/scroll authoring aid was removed
// now that it's dialed in — the useDrag hook + placement math stay in place for reuse.)

const BACKGROUND = "/backgrounds/abbey_grounds.jpg";

const SceneWindow = ({ children }: { children: React.ReactNode }) => (
  <div
    className="relative aspect-[1618/1000] w-full overflow-hidden rounded-xl border bg-clip-padding bg-cover bg-center shadow-sm"
    style={{ backgroundImage: `url(${BACKGROUND})` }}
  >
    {children}
  </div>
);

// Loader overlay scoped to the scene window; fully opaque so NOTHING behind it shows (the transparent
// canvas, the emote column, the background image popping in) — then fades out once ready.
const Loading = ({ show }: { show: boolean }) => (
  <div
    aria-hidden={!show}
    className={`bg-background absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[inherit] transition-opacity duration-500 ${show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
  >
    <Loader2 className="text-muted-foreground size-6 animate-spin" />
    <span className="text-muted-foreground text-sm">Setting the table…</span>
  </div>
);

export const TeaDemo = () => {
  const app = useApp(sceneApp);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 pt-2">
      {app ? <Scene app={app} /> : <SceneWindow><Loading show /></SceneWindow>}
    </div>
  );
};

const Scene = ({ app }: { app: AkiSceneApp }) => {
  const akiLoading = useValue(app.state.loading);
  const introPhase = useValue(getIntro(app).phase);
  // Also wait for the background image itself, so it never "pops in" behind/after the loader.
  const [bgReady, setBgReady] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgReady(true);
    img.onerror = () => setBgReady(true); // a missing background must not wedge the loader
    img.src = BACKGROUND;
  }, []);
  const loading = akiLoading || !bgReady;

  return (
    <>
      <SceneWindow>
        <ThreeView app={sceneApp} className={CANVAS_FILL} />
        {/* The start gate: waits under the loader, then holds the scene until the player clicks —
            the click is the audio-unlock gesture and flips `revealed` (slide-in + intro follow). */}
        <TeaTitle app={app} />
        <TeaIntro app={app} />
        <Loading show={loading} />
      </SceneWindow>
      {/* Fire a random emote from the curated pool; a fresh object each click spawns another (they stack).
          Parked while the intro owns the scene — a stray glyph mid-tutorial would muddy the stream. */}
      <Button
        size="sm"
        variant="secondary"
        disabled={loading || introPhase !== "done"}
        onClick={() => app.state.emote.set({ glyph: randomEmote() })}
      >
        🎲 Emote
      </Button>
    </>
  );
};
