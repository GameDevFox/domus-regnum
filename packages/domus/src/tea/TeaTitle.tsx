import { useEffect, useState } from "react";

import { useValue } from "@kitsune/common-web/src/react";

import { type AkiSceneApp } from "../aki/aki-app";
import { getIntro, preloadStinger } from "./tea-intro";
import { track } from "../analytics";

// The Tea Time title card — the "press start" gate every web game needs (see the intro design
// notes): assets load behind the opaque loader, then the player sits on this card until THEY are
// ready. The click is the user gesture that unlocks audio (the stinger plays inside the handler),
// then the card fades and `revealed` cues Aki's slide-in + the intro dialogue (tea-intro.ts).
//
// Faces: Cinzel for the "Domus Regnum" display line, IM Fell English for the flavor text — both
// loaded from Google Fonts in index.html for now; TODO: bake both into the app (with the emotes).
const TITLE_FONT = '"Cinzel", Georgia, serif';
const FLAVOR_FONT = '"IM Fell English", Georgia, serif';

const FADE_MS = 700; // title fade-out after the click (Aki starts sliding beneath it)

export const TeaTitle = ({ app }: { app: AkiSceneApp }) => {
  const revealed = useValue(app.state.revealed);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  // Warm the stinger while the card (or the loader above it) is on screen — the script's
  // entrance exec plays it from buffer on Start.
  useEffect(() => void preloadStinger(), []);

  // Once dismissed this session (revealed persists on the app singleton), never re-show —
  // including on tab revisits, where we skip straight to gone.
  if (gone || (revealed && !fading)) return null;

  const start = () => {
    if (fading) return;
    track("tea-start"); // funnel: the player engaged the demo (vs. just landing on the Tea tab)
    setFading(true);
    // The whole opening now lives in the VN script: begin() runs the entrance exec synchronously
    // in THIS click (stinger keeps its autoplay unlock, `revealed` cues the slide-in + our fade),
    // then the script's wait holds the first line until she's seated.
    getIntro(app).begin();
    setTimeout(() => setGone(true), FADE_MS);
  };

  return (
    <button
      type="button"
      onClick={start}
      aria-label="Start the Tea Party demo"
      className="absolute inset-0 z-[5] flex w-full cursor-pointer flex-col items-center justify-center gap-3 transition-opacity"
      style={{
        opacity: fading ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        // A candlelit vignette over the garden: readable type, background still breathing through.
        background:
          "radial-gradient(ellipse at 50% 42%, rgb(20 14 8 / 0.55) 0%, rgb(12 8 4 / 0.78) 62%, rgb(8 5 2 / 0.9) 100%)",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <h2
        className="text-5xl font-bold tracking-[0.08em] text-[#e8d9b0] drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
        style={{ fontFamily: TITLE_FONT }}
      >
        Domus Regnum
      </h2>
      <p className="text-xl italic text-[#c9b788]/90" style={{ fontFamily: FLAVOR_FONT }}>
        ~ A Tea Party Demo ~
      </p>
      <p
        className="mt-10 text-base text-[#e8d9b0]/90 [animation:tea-strobe_2.6s_ease-in-out_infinite]"
        style={{ fontFamily: FLAVOR_FONT }}
      >
        Click to Start
      </p>
    </button>
  );
};
