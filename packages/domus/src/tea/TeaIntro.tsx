import { useEffect, useRef, useState } from "react";

import { useValue } from "@kitsune/common-web/src/react";
import { mountStage } from "@kitsune/vn";

import { Button } from "@/components/ui/button";

import { type AkiSceneApp } from "../aki/aki-app";
import { applyActorState, getIntro } from "./tea-intro";

const HINT_MS = 1800; // how long the "nothing asked yet" nudge lingers
const TEXT_CPS = 45; // typewriter reveal — chatty-Aki pace (the script slows key beats itself)

// The intro overlay inside the scene window: the VN dialogue box while Aki explains (click to
// advance, DOM stage in dialogue-only mode — same hybrid as the game's VnDialogue), then the
// practice round's Refill/Clear calls. Renders nothing once the intro is done.
export const TeaIntro = ({ app }: { app: AkiSceneApp }) => {
  const intro = getIntro(app);
  const phase = useValue(intro.phase);
  const stageRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<string | null>(null);

  // The dialogue box, mounted while the script is talking.
  useEffect(() => {
    if (phase !== "dialogue" || !stageRef.current) return;
    const handle = mountStage(intro.engine, stageRef.current, {
      sprites: false,
      textSpeed: TEXT_CPS,
      // The rig binding: reveal-bound mouth (starts with the typewriter, stops when the sentence
      // settles — or instantly on unmount) + script-authored moods onto her face.
      onActorChange: (e) => {
        if (e.who !== "Aki") return;
        app.state.talking.set(e.talking);
        applyActorState(app.state, e.state); // mood → face, pose → rig
      },
    });
    return () => handle.unmount();
  }, [phase, intro]);

  const call = (intent: "refill" | "clear") => {
    if (intro.respond(intent) === "early") {
      setHint("Nothing's been asked yet — watch her signs…");
      setTimeout(() => setHint(null), HINT_MS);
    }
  };

  if (phase === "dialogue") return <div ref={stageRef} className="absolute inset-0 z-20" />;

  if (phase === "demo")
    return (
      <div className="absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-1.5">
        {hint && (
          <span className="bg-background/80 text-muted-foreground rounded-md px-2 py-0.5 text-xs backdrop-blur">
            {hint}
          </span>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => call("refill")}>
            ☕ Refill
          </Button>
          <Button size="sm" variant="secondary" onClick={() => call("clear")}>
            🟫 Clear the setting
          </Button>
        </div>
      </div>
    );

  return null;
};
