import { useEffect, useRef } from "react";

import { mountStage } from "@kitsune/vn";
import { useValue } from "@kitsune/common-web/src/react";

import { DomusSceneApp } from "../domus-app/three-app";

// The VN cutscene's dialogue box + choices, as a DOM overlay over the game frame. The character
// sprites are drawn in the canvas by the Three.js layer (vn-scene.ts); this is the "DOM on top"
// half of the hybrid. We reuse @kitsune/vn's DOM stage in dialogue-only mode (sprites: false) rather
// than reimplementing the textbox in JSX, mounting it into a ref while the cutscene is active.
//
// The overlay fills the frame and captures clicks to advance, so it's modal while up — press V (or
// the Drama button) to dismiss; the scene also ends itself on its last line (see vn-scene.ts).
export const VnDialogue = ({ app }: { app: DomusSceneApp }) => {
  const { vnActive, vnEngine } = app.state;
  const active = useValue(vnActive);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const handle = mountStage(vnEngine, ref.current, { sprites: false });
    return () => handle.unmount();
  }, [active, vnEngine]);

  if (!active) return null;
  return <div ref={ref} className="absolute inset-0 z-20" />;
};
