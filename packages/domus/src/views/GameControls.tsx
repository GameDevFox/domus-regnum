import {
  Bot,
  Box,
  Drama,
  Eye,
  EyeOff,
  Hand,
  Home,
  Image as ImageIcon,
  Maximize,
  Minimize,
  Orbit,
  Plane,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Key } from "@kitsune/common-web";
import { useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

import { DomusSceneApp } from "../domus-app/three-app";

import { OVERLAY_ICON_BTN } from "./chrome";

// The Game Demo's sim is a single tri-state, not two independent toggles: at most one runs at a time.
type Sim = "none" | "trash" | "tidy";

// Game controls — icon buttons overlaid in the frame's top-right corner. Each flips a reactive
// Value (camera mode, items, sims) or fullscreen, and its icon reflects the current state. `frameRef`
// is the element we fullscreen (so the overlay stays visible in fullscreen). Keys mirror the buttons.
export const GameControls = ({
  app,
  frameRef,
}: {
  app: DomusSceneApp;
  frameRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const {
    cameraMode,
    cameraZoom,
    showItems,
    showConsole,
    showBlocks,
    runHaul,
    runTidy,
    billboards,
    vnActive,
  } = app.state;
  const camMode = useValue(cameraMode);
  const zoom = useValue(cameraZoom);
  const itemsShown = useValue(showItems);
  const blocksShown = useValue(showBlocks);
  const haulRunning = useValue(runHaul);
  const tidyRunning = useValue(runTidy);
  const useBillboards = useValue(billboards);
  const vnShown = useValue(vnActive);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // The camera button/key cycles the tri-state: Controlled → Click & Drag → Fly → Controlled.
  const cycleCamera = () =>
    cameraMode.update((m) => (m === "controlled" ? "manual" : m === "manual" ? "fly" : "controlled"));
  const toggleItems = () => showItems.update((v) => !v);
  const toggleBillboards = () => billboards.update((v) => !v);
  const toggleVn = () => vnActive.update((v) => !v);
  const simRunning = haulRunning || tidyRunning;

  // The sim runs IN the Builder Room, so its control only appears while the room is shown. It's a
  // tri-state (none / trash-haul / Tidy House), mutually exclusive. `sim` is the rendered state;
  // the mutators read the live Values (peek) so they're correct from the button AND the H/T keys.
  const sim: Sim = tidyRunning ? "tidy" : haulRunning ? "trash" : "none";
  const setSim = (next: Sim) => {
    runHaul.set(next === "trash");
    runTidy.set(next === "tidy");
  };
  const currentSim = (): Sim => (runTidy.peek() ? "tidy" : runHaul.peek() ? "trash" : "none");
  // The tri-state button cycles None → Trash → Tidy → None.
  const cycleSim = () => setSim(sim === "none" ? "trash" : sim === "trash" ? "tidy" : "none");
  // H / T jump straight to a sim (or back to None if it's already running), showing the room if hidden.
  const selectSim = (which: "trash" | "tidy") => {
    const next: Sim = currentSim() === which ? "none" : which;
    if (next !== "none") showBlocks.set(true);
    setSim(next);
  };
  // Hiding the room also stops any running sim — a sim can't run in a hidden room.
  const toggleBlocks = () => {
    const next = !showBlocks.peek();
    showBlocks.set(next);
    if (!next) setSim("none");
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frameRef.current?.requestFullscreen();
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case Key.C:
          cycleCamera();
          break;
        case Key.F:
          // Fly mode owns F (fly straight down — FlyControls binds R/F) — stand down there.
          if (cameraMode.peek() !== "fly") toggleFullscreen();
          break;
        case Key.I:
          if (!showBlocks.peek()) showItems.update((v) => !v); // items toggle only in demo mode
          break;
        case Key.B:
          toggleBlocks();
          break;
        case Key.H:
          selectSim("trash");
          break;
        case Key.T:
          selectSim("tidy");
          break;
        case Key.M:
          if (runHaul.peek() || runTidy.peek()) billboards.update((v) => !v); // only with a sim up
          break;
        case Key.V:
          vnActive.update((v) => !v); // play/dismiss the VN cutscene
          break;
        case Key.Backquote:
          showConsole.update((v) => !v); // show/hide the console2 debug overlay
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cameraMode,
    showItems,
    showConsole,
    showBlocks,
    runHaul,
    runTidy,
    billboards,
    vnActive,
    frameRef,
  ]);

  const iconButton = OVERLAY_ICON_BTN;

  return (
    <>
      {/* Camera zoom: a vertical slider on the frame's left edge. Top = close, bottom = far.
          Drives both ORBIT modes (controlled radius; manual dolly, two-way bound). Fly mode has
          no orbit radius, so the slider hides there — W/S is the zoom. */}
      {camMode !== "fly" && (
        <div className="absolute top-1/2 left-3 z-10 h-36 -translate-y-1/2">
          <Slider
            orientation="vertical"
            value={[Math.round(zoom * 100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => cameraZoom.set(v / 100)}
            aria-label="Camera zoom"
          />
        </div>
      )}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          className={iconButton}
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className={iconButton}
          onClick={cycleCamera}
          title={
            camMode === "controlled"
              ? "Camera: Controlled (C)"
              : camMode === "manual"
                ? "Camera: Click & Drag (C)"
                : "Camera: Fly — click to look, WASD + R/F (C)"
          }
          aria-label="Toggle camera mode"
        >
          {camMode === "controlled" ? <Orbit /> : camMode === "manual" ? <Hand /> : <Plane />}
        </Button>
        <Button
          size="icon"
          variant={blocksShown ? "default" : "secondary"}
          className={iconButton}
          onClick={toggleBlocks}
          title={blocksShown ? "Hide Builder Room (B)" : "Show Builder Room (B)"}
          aria-label="Toggle Builder Room"
        >
          <Home />
        </Button>
        {/* Items live only in the default demo scene, so the toggle is shown only while the Builder
          Room is hidden. We don't reset showItems when the room toggles — just gate the control. */}
        {!blocksShown && (
          <Button
            size="icon"
            variant="secondary"
            className={iconButton}
            onClick={toggleItems}
            title={itemsShown ? "Hide items (I)" : "Show items (I)"}
            aria-label="Toggle items"
          >
            {itemsShown ? <Eye /> : <EyeOff />}
          </Button>
        )}
        {/* Sim control — only while the Builder Room is shown (a sim needs the room). Tri-state cycle:
          off → trash-haul → Tidy House → off. H/T jump straight to one. */}
        {blocksShown && (
          <Button
            size="icon"
            variant={sim === "none" ? "secondary" : "default"}
            className={iconButton}
            onClick={cycleSim}
            title={
              sim === "none"
                ? "Sim: off — tap to run Trash-haul (H / T)"
                : sim === "trash"
                  ? "Sim: Trash-haul — tap for Tidy House"
                  : "Sim: Tidy House — tap to stop"
            }
            aria-label="Cycle simulation (off / trash / tidy)"
          >
            {sim === "trash" ? <Trash2 /> : sim === "tidy" ? <Sparkles /> : <Bot />}
          </Button>
        )}
        {/* Avatar look — only while a sim is running (that's when agents exist). Toggles every agent
          between the 2D maid billboards (default) and the 3D cone+sphere models. */}
        {simRunning && (
          <Button
            size="icon"
            variant="secondary"
            className={iconButton}
            onClick={toggleBillboards}
            title={
              useBillboards
                ? "Maids: 2D billboards — tap for 3D models (M)"
                : "Maids: 3D models — tap for 2D billboards (M)"
            }
            aria-label="Toggle maid 2D / 3D"
          >
            {useBillboards ? <ImageIcon /> : <Box />}
          </Button>
        )}
        <Button
          size="icon"
          variant={vnShown ? "default" : "secondary"}
          className={iconButton}
          onClick={toggleVn}
          title={vnShown ? "End cutscene (V)" : "Play cutscene (V)"}
          aria-label="Toggle VN cutscene"
        >
          <Drama />
        </Button>
      </div>
    </>
  );
};
