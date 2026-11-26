import {
  BoxSelect,
  Expand,
  Compass,
  MoveHorizontal,
  Plane,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  Box,
  Check,
  ListTree,
  MousePointer2,
  Magnet,
  Move,
  PanelLeft,
  Pipette,
  Play,
  Redo2,
  RotateCw,
  Save,
  Trash,
  Undo2,
  Upload,
  Waypoints,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ThreeView, useApp, useValue } from "@kitsune/common-web/src/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";

import { saveCurrentLevel } from "../blocks/current-level";
import { deserializeLevel } from "../blocks/edit";
import { deleteSavedRoom, listSavedRooms, roomSlug, saveRoom } from "../blocks/saved-rooms";
import { domusAppP } from "../domus-app";
import {
  EditorApp,
  editorApp,
  editorComponentDoc,
  editorCottageDoc,
  editorCottageLevel,
  editorEmptyLevel,
  editorManorDoc,
  editorSampleDoc,
  editorSampleLevel,
} from "../domus-app/level-editor";
import { deserializeDoc, serializeDoc } from "../parametric/edit";
import { defaultKinds, PRIMITIVE_KINDS } from "../parametric/kinds";
import { isBinding } from "../parametric/types";

import { BlockInspector } from "./BlockInspector";
import { OVERLAY_ICON_BTN } from "./chrome";
import { NodesPanel } from "./NodesPanel";
import { OutlinerPanel } from "./OutlinerPanel";
import { BuildHeightControl } from "./BuildHeightControl";
import { CanvasLoader } from "./CanvasLoader";
import { CameraControlsLegend, ControlsCard, KbdCombo } from "./controls-card";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useIsTouch } from "./use-is-touch";
import { useTogglePanel } from "./use-toggle-panel";

// The level-editor tab: a 3D editor over a reactive parametric DOC (hand-placed blocks live in its
// manual node; parametric nodes generate the rest — see the Nodes panel). Pick a palette block to
// stamp copies, or click an existing item to grab/move it; orbit to look around. The Files modal
// saves/loads named rooms (the parametric DOC); legacy flat-level files still import.

// Parse either format, discriminating on SHAPE: a parametric doc (has a `nodes` array) or a flat
// Level (has `placements` instead). Uses the load* path so the loaded room resets the dirty baseline.
const SAVED_FLASH_MS = 1600; // how long the "Saved ✓" state shows before reverting

// Timestamp for export filenames: YYYY-MM-DD_HH-MM[-SS].
const fileStamp = ({ seconds = false } = {}) => {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
  return seconds ? `${base}-${p(d.getSeconds())}` : base;
};

const loadAny = (app: EditorApp, raw: string) => {
  const parsed = JSON.parse(raw) as { nodes?: unknown };
  if (Array.isArray(parsed?.nodes)) app.loadDoc(deserializeDoc(raw));
  else app.loadLevel(deserializeLevel(raw));
};

// The built-in sample levels, listed read-only in the Files modal's room list. Parametric samples set
// the doc as-is — the builders return it already organized (positions baked into each node's `ui`,
// sub-graphs included), so loading never re-runs layout; the hand-placed ones set a flat level (one
// manual node — nothing to lay out). Add new samples here.
const SAMPLES: { label: string; load: (app: EditorApp) => void }[] = [
  { label: "Graph Manor", load: (app) => app.loadDoc(editorManorDoc()) },
  { label: "Graph Cottage", load: (app) => app.loadDoc(editorCottageDoc()) },
  { label: "Graph Room", load: (app) => app.loadDoc(editorSampleDoc()) },
  { label: "Component Demo", load: (app) => app.loadDoc(editorComponentDoc()) },
  { label: "Manor", load: (app) => app.loadLevel(editorSampleLevel()) },
  { label: "Cottage", load: (app) => app.loadLevel(editorCottageLevel()) },
];

const LevelEditorView = ({ app, roomId }: { app: EditorApp; roomId?: string }) => {
  const navigate = useNavigate();
  const hovered = useValue(app.hovered);
  const level = useValue(app.level);
  const manual = useValue(app.manual); // grab/selection indices point into the manual list
  const showNav = useValue(app.showNav);
  const navWarning = useValue(app.navWarning);
  const showGizmo = useValue(app.showGizmo);
  const previewCull = useValue(app.previewCull);
  const cameraFly = useValue(app.cameraFly);
  const regionMode = useValue(app.regionMode);
  const buildHeight = useValue(app.buildHeight);
  const doc = useValue(app.doc);
  const selectedNodeId = useValue(app.selectedNode);
  const rectMode = useValue(app.rectMode);
  const rectAxis = useValue(app.rectAxis);
  // The Move tool applies to any selected PRIMITIVE (rect, point); Scale needs a size → rects.
  const selectedDocNode = doc.nodes.find((n) => n.id === selectedNodeId);
  const selectedKind = selectedDocNode?.kind ?? null;
  const primSelected = selectedKind !== null && PRIMITIVE_KINDS.has(selectedKind);
  const rectSelected = selectedKind === "rect";
  // The Texture drag tool applies when the selected node's kind has a LITERAL texOffset input
  // (wall/walls) — a bound one belongs to its source node.
  const texMode = useValue(app.texMode);
  const snapEnabled = useValue(app.snapEnabled);
  const texSensitivity = useValue(app.texSensitivity);
  const texProp = selectedDocNode?.props.texOffset;
  const texCapable =
    selectedKind !== null &&
    !!defaultKinds[selectedKind]?.inputs.texOffset &&
    (texProp === undefined || !isBinding(texProp));
  const canUndo = useValue(app.canUndo);
  const canRedo = useValue(app.canRedo);
  // The single "held part" drives everything: a palette block to stamp, a grabbed instance, or null
  // (idle/select). `placing` = something is held.
  const activePart = useValue(app.activePart);
  const heldBlock = activePart?.source === "palette" ? activePart.block : null;
  const heldInstance = activePart?.source === "instance" ? activePart.index : null;
  const placing = activePart != null;
  // On touch we swap to the reticle + on-screen action bar scheme (no hover / right-drag).
  const isTouch = useIsTouch();
  const fileRef = useRef<HTMLInputElement>(null);
  // The block palette is a left-edge overlay on the canvas, collapsed by default and toggled with E.
  const palette = useTogglePanel();
  // The Files modal: open state, the user's saved rooms (refreshed when it opens), and the
  // "save current as" name field.
  const files = useTogglePanel();
  const [savedRooms, setSavedRooms] = useState(listSavedRooms);
  const [saveName, setSaveName] = useState("");
  // Brief "Saved ✓" confirmation on the Save button after a successful save (reverts after ~1.6s).
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []); // clear the pending revert on unmount
  // The outliner (Blender-style hierarchy) docks to the canvas's upper right, closed by default.
  const outliner = useTogglePanel();

  // Send the authored level to the live game (the sims read it reactively), turn on the room +
  // Tidy House so it comes alive immediately, and switch to the Game tab.
  const playInGame = () => {
    saveCurrentLevel(app.level.peek());
    void domusAppP.then((a) => {
      a.data.showBlocks.set(true);
      a.data.runHaul.set(true); // default Play to the trash-haul sim
    });
    navigate("/");
  };

  // Unsaved-changes guard: true to proceed (clean, or the user confirmed discarding). Used before
  // any room swap (New / sample / saved room / URL change). Node positions count as changes.
  const confirmDiscard = () =>
    !app.isDirty() || window.confirm("Discard unsaved changes to the current room?");

  // Native "Leave site?" prompt on close/reload while there are unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!app.isDirty()) return;
      e.preventDefault();
      e.returnValue = ""; // Chrome shows its generic prompt only when returnValue is set
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [app]);

  // Builder keyboard shortcuts (see use-editor-shortcuts.ts) — scoped to this tab.
  useEditorShortcuts(app, palette.set);

  // /build/:roomId — load the room named by the URL (a built-in sample or a user save, matched by
  // slug) when navigated to. Skips if that room is already showing, so loading via the modal (which
  // also pushes the slug to the URL) doesn't reload. Reacts to the URL only, not name-field edits.
  useEffect(() => {
    if (!roomId || roomSlug(saveName) === roomId) return;
    // A URL-driven swap (deep link, back/forward, manual edit) discards the current room — guard it,
    // and on cancel snap the URL back to the room still showing so URL and state stay in sync.
    if (!confirmDiscard()) {
      navigate(saveName ? `/build/${roomSlug(saveName)}` : "/build", { replace: true });
      return;
    }
    const sample = SAMPLES.find((s) => roomSlug(s.label) === roomId);
    if (sample) {
      sample.load(app);
      setSaveName(sample.label);
      return;
    }
    const saved = listSavedRooms().find((r) => roomSlug(r.name) === roomId);
    if (saved) {
      loadAny(app, saved.doc);
      setSaveName(saved.name);
    }
    // Depends on roomId only — intentionally URL-driven, must not re-run when the name field is edited.
  }, [roomId]);

  const exportJson = () => {
    const blob = new Blob([serializeDoc(app.doc.peek())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domus-room-${fileStamp({ seconds: true })}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // Export the assembled room as a 3D model (.glb) — geometry, materials, embedded textures.
  const exportModel = () => {
    void app.exportModel(`domus-room-${fileStamp()}.glb`).catch((err) => {
      console.error("Failed to export model:", err);
    });
  };

  // While a gesture is IN FLIGHT (button drag, or the live G/S gesture) the WHOLE canvas is the
  // drag surface — every overlay panel goes click-through (and dims as the cue) so nothing
  // creates dead zones while the cursor roams. Armed-but-idle keeps overlays interactive (the
  // outliner is how you hop selection, since the viewport doesn't pick while a tool is on).
  // Only the Move/Scale cluster itself always stays interactive (it's the tool's own exit).
  const rectDragging = useValue(app.rectDragging);
  const overlayMuted = rectDragging ? "pointer-events-none opacity-50" : "";

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadAny(app, String(reader.result));
      } catch (err) {
        console.error("Failed to import level:", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative w-full">
        <ThreeView app={editorApp} className="path-debug-canvas" />
        <CanvasLoader loading={app.loading} />
        {/* Block palette: pinned to the canvas's top-left. A tap target (for mobile, where E isn't
            available) toggles the vertical block list that drops down beneath it. */}
        <div
          className={`absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col gap-2 transition-opacity ${overlayMuted}`}
        >
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="secondary"
              className="size-8 shrink-0 border shadow-[var(--shadow-soft)]"
              onClick={palette.toggle}
              title="Toggle block palette (E)"
              aria-label="Toggle block palette"
            >
              <PanelLeft />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-8 shrink-0 border shadow-[var(--shadow-soft)]"
              onClick={() => {
                setSavedRooms(listSavedRooms());
                files.show();
              }}
              title="Files — save / load / samples"
              aria-label="Files"
            >
              <FolderOpen />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-8 shrink-0 border shadow-[var(--shadow-soft)]"
              onClick={playInGame}
              title="Play in game"
              aria-label="Play in game"
            >
              <Play />
            </Button>
          </div>
          {palette.open && (
            <div className="bg-background/80 flex min-h-0 flex-col gap-1 overflow-y-auto rounded-md p-1.5 shadow-md backdrop-blur">
              {app.palette.map((id) => (
                <button
                  key={id}
                  className={`rounded px-2.5 py-1 text-left text-sm capitalize transition-colors ${id === heldBlock ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                  onClick={() => app.holdBlock(id)}
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Armed drag tools for the selected rect: Move (G) / Scale (S) toggle on, then press-
            drag-release anywhere on the canvas applies the gesture (release commits one undo
            step). Click the button again (or Esc) to return to selection. Top-center so they
            read as acting on the selection. */}
        {(primSelected || texCapable) && (
          <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
            {primSelected && (
              <Button
                size="sm"
                variant={rectMode === "move" ? "default" : "secondary"}
                className="border shadow-[var(--shadow-soft)]"
                onClick={() => app.startRectMode("move")}
                title="Move the selected primitive (G) — drag on the canvas, release to commit; click again to exit"
              >
                <Move className="mr-1 size-4" /> Move
              </Button>
            )}
            {rectSelected && (
              <Button
                size="sm"
                variant={rectMode === "scale" ? "default" : "secondary"}
                className="border shadow-[var(--shadow-soft)]"
                onClick={() => app.startRectMode("scale")}
                title="Scale the selected rect about its center (S) — drag on the canvas, release to commit; click again to exit"
              >
                <Expand className="mr-1 size-4" /> Scale
              </Button>
            )}
            {texCapable && (
              <Button
                size="sm"
                variant={texMode ? "default" : "secondary"}
                className="border shadow-[var(--shadow-soft)]"
                onClick={() => app.startTexMode()}
                title="Slide the wall pattern: drag horizontally on the canvas (release commits one undo step); scroll to adjust sensitivity; Esc or click again to exit"
                aria-label="Texture offset tool"
              >
                <MoveHorizontal className="mr-1 size-4" /> Texture
              </Button>
            )}
            {texMode && (
              // Drag sensitivity readout — tuned with the wheel while the tool is armed.
              <span className="bg-background/85 text-muted-foreground rounded-md border px-2 py-1 text-xs shadow-[var(--shadow-soft)]">
                {(texSensitivity * 1000).toFixed(1)} mm/px
              </span>
            )}
            {primSelected && (
              <Button
                size="icon"
                variant={snapEnabled ? "default" : "secondary"}
                className={OVERLAY_ICON_BTN}
                onClick={() => app.snapEnabled.update((v) => !v)}
                title="Snap Move/Scale to 0.5 m (hold Shift during a drag to temporarily invert)"
                aria-label="Toggle snapping"
              >
                <Magnet />
              </Button>
            )}
            {rectMode && rectAxis && (
              // Blender X/Y axis constraint readout (toggled with the X / Y keys mid-tool).
              <span className="bg-background/85 text-muted-foreground rounded-md border px-2 py-1 text-xs shadow-[var(--shadow-soft)]">
                along {rectAxis.toUpperCase()}
              </span>
            )}
          </div>
        )}
        {/* Outliner: Blender-style hierarchy of the scene, docked upper-right beside the toggle
            column. The full-height wrapper is click-through (only the panel itself takes the
            pointer) so the empty space under a short outliner never blocks the canvas. */}
        {outliner.open && (
          <div className="pointer-events-none absolute top-3 right-13 bottom-3 z-10">
            <div
              className={`h-full transition-opacity ${rectDragging ? "opacity-50" : "pointer-events-auto"}`}
            >
              <OutlinerPanel app={app} />
            </div>
          </div>
        )}
        {/* Canvas overlay toggles (top-right, icon-only — like the other tabs). The 3D orientation
            gizmo is rendered shifted left of these so they don't overlap. */}
        <div
          className={`absolute top-3 right-3 z-10 flex flex-col gap-2 transition-opacity ${overlayMuted}`}
        >
          <Button
            size="icon"
            variant={outliner.open ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={outliner.toggle}
            title="Toggle the outliner (scene hierarchy)"
            aria-label="Toggle outliner"
          >
            <ListTree />
          </Button>
          <Button
            size="icon"
            variant={showGizmo ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={() => app.showGizmo.update((v) => !v)}
            title="Toggle the orientation gizmo"
            aria-label="Toggle orientation gizmo"
          >
            <Compass />
          </Button>
          <Button
            size="icon"
            variant={cameraFly ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={() => app.cameraFly.update((v) => !v)}
            title="Fly camera: captures the mouse to look, WASD flies, R/F up/down, Shift boosts; Esc returns to orbit. Editing pauses while flying."
            aria-label="Toggle fly camera"
          >
            <Plane />
          </Button>
          <Button
            size="icon"
            variant={showNav ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={() => app.showNav.update((v) => !v)}
            title="Toggle the walkable navmesh overlay"
            aria-label="Toggle navmesh overlay"
          >
            <Waypoints />
          </Button>
          <Button
            size="icon"
            variant={previewCull ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={() => app.previewCull.update((v) => !v)}
            title="Preview camera-side wall culling (hide walls you'd look through)"
            aria-label="Preview camera-side wall culling"
          >
            {previewCull ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            size="icon"
            variant={regionMode ? "default" : "secondary"}
            className={OVERLAY_ICON_BTN}
            onClick={() => app.regionMode.update((v) => !v)}
            title="Region mode: drag to paint one merged floor region"
            aria-label="Toggle region draw mode"
          >
            <BoxSelect />
          </Button>
        </div>
        {/* Touch (mobile) control scheme: a centre reticle is the cursor (the ghost/target follows it
            as you move the camera), and a bottom action bar acts at it. Hidden on mouse/desktop. */}
        {isTouch && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="grid size-7 place-items-center rounded-full border-2 border-amber-400/80">
              <div className="size-1.5 rounded-full bg-amber-400" />
            </div>
          </div>
        )}
        {isTouch && (
          <div className="bg-background/85 absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full p-1.5 shadow-md backdrop-blur">
            <Button size="sm" className="shrink-0 px-4" onClick={app.actAtReticle}>
              {heldInstance != null ? "Drop" : heldBlock != null ? "Place" : "Grab"}
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0"
              onClick={app.eyedrop}
              title="Eyedrop the block under the reticle"
              aria-label="Eyedrop"
            >
              <Pipette />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0"
              disabled={!placing}
              onClick={app.rotate}
              title="Rotate"
              aria-label="Rotate"
            >
              <RotateCw />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0"
              disabled={heldInstance == null}
              onClick={app.removeSelected}
              title="Delete"
              aria-label="Delete"
            >
              <Trash />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0"
              disabled={!placing}
              onClick={app.clearPart}
              title="Deselect"
              aria-label="Deselect"
            >
              <MousePointer2 />
            </Button>
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <span className="tabular-nums">
          {hovered ? `Cell ${hovered[0]}, ${hovered[1]}` : "Hover the grid…"} ·{" "}
          {level.placements.length} blocks
          {heldInstance != null
            ? ` · grabbing ${manual[heldInstance]?.block ?? "?"} — click to drop, Esc to cancel`
            : heldBlock != null
              ? ` · placing ${heldBlock} — click to stamp, Esc to clear`
              : " · click an item to grab it"}
        </span>
        <div className="flex items-center gap-3">
          {showNav && navWarning && (
            <span
              className="text-amber-500"
              title="Furniture or walls have stranded part of the floor"
            >
              ⚠ {navWarning}
            </span>
          )}
          <span
            className="tabular-nums opacity-70"
            title="Build-plane elevation ( PgUp / PgDn to change )"
          >
            Height: {buildHeight.toFixed(2)} m
          </span>
          <span className="capitalize opacity-70">Mode: {placing ? "place" : "select"}</span>
        </div>
      </div>

      {/* Tool actions (the block palette is the left-edge overlay on the canvas, toggled with E) */}
      <Card className="w-full py-3">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Held-part actions (the palette overlay on the canvas is how you pick a block to place) */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={!placing}
                onClick={app.rotate}
                title="Rotate the grabbed item, or cycle wall/door facing (R)"
              >
                <RotateCw className="mr-1 size-4" /> Rotate
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={heldInstance == null}
                onClick={app.removeSelected}
                title="Delete the grabbed item (X)"
              >
                <Trash className="mr-1 size-4" /> Delete
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={app.focusSelection}
                title="Frame the camera on the selection (.)"
              >
                <Crosshair className="mr-1 size-4" /> Focus
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!placing}
                onClick={app.clearPart}
                title="Clear the held block / cancel the grab (Esc)"
              >
                <MousePointer2 className="mr-1 size-4" /> Deselect
              </Button>
            </div>

            {/* Undo / redo */}
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled={!canUndo} onClick={app.undo}>
                <Undo2 className="mr-1 size-4" /> Undo
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRedo} onClick={app.redo}>
                <Redo2 className="mr-1 size-4" /> Redo
              </Button>
            </div>

            {/* Build-plane height (multi-level) — see BuildHeightControl.tsx; pushed to the right */}
            <div className="ml-auto">
              <BuildHeightControl app={app} />
            </div>
          </div>

          {/* Type-specific properties for the selected block (renders only when one is selected) */}
          <BlockInspector app={app} />

          {/* The Files dialog (controlled) + hidden import input — opened from the Files / Play icon
              buttons in the canvas's top-left overlay. The wrapper is display:none so it stays OUT of
              the card's flex flow (the dialog portals to the body; the input is clicked from code). */}
          <div className="hidden">
            <Dialog
              open={files.open}
              onOpenChange={(o) => {
                files.set(o);
                if (o) setSavedRooms(listSavedRooms());
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Files</DialogTitle>
                  <DialogDescription>
                    Save and load this room, import / export files, or start from a sample.
                  </DialogDescription>
                </DialogHeader>

                {/* Rooms — built-in samples (read-only) + the user's own saves. Click a row to load
                    it; "Save current as" stores the current room under a new, editable name. */}
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-muted-foreground text-xs font-medium uppercase">
                    Rooms <span className="normal-case">(loading replaces the current room)</span>
                  </h3>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-fit"
                    onClick={() => {
                      if (!confirmDiscard()) return;
                      app.loadLevel(editorEmptyLevel());
                      setSaveName(""); // a fresh, unnamed room
                      navigate("/build");
                      files.close();
                    }}
                  >
                    <FilePlus className="mr-1 size-4" /> New
                  </Button>
                  <ul className="divide-border max-h-56 divide-y overflow-y-auto rounded-md border">
                    {SAMPLES.map((s) => (
                      <li key={s.label} className="flex items-center gap-1 pr-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="grow justify-start font-normal"
                          onClick={() => {
                            if (!confirmDiscard()) return;
                            s.load(app);
                            setSaveName(s.label); // seed the name field so Save makes a named copy
                            navigate(`/build/${roomSlug(s.label)}`);
                            files.close();
                          }}
                        >
                          {s.label}
                        </Button>
                        <span className="text-muted-foreground text-xs">built-in</span>
                      </li>
                    ))}
                    {savedRooms.map((r) => (
                      <li key={r.name} className="flex items-center gap-1 pr-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="grow justify-start font-normal"
                          onClick={() => {
                            if (!confirmDiscard()) return;
                            loadAny(app, r.doc);
                            setSaveName(r.name); // Save re-saves (updates) this room by default
                            navigate(`/build/${roomSlug(r.name)}`);
                            files.close();
                          }}
                        >
                          {r.name}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Delete ${r.name}`}
                          onClick={() => {
                            deleteSavedRoom(r.name);
                            setSavedRooms(listSavedRooms());
                          }}
                        >
                          <Trash className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = saveName.trim();
                      if (!name) return;
                      saveRoom(name, serializeDoc(app.doc.peek()));
                      app.markClean(); // the saved doc is now the clean baseline
                      setSavedRooms(listSavedRooms());
                      setSaveName(name); // keep it as the current room's name
                      navigate(`/build/${roomSlug(name)}`);
                      // Flash "Saved ✓" on the button, then revert.
                      setJustSaved(true);
                      clearTimeout(savedTimer.current);
                      savedTimer.current = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
                    }}
                  >
                    <Input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Save current room as…"
                      aria-label="Save current room as"
                      className="h-8"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={!saveName.trim()}
                      className={`transition-colors ${justSaved ? "bg-green-600 text-white hover:bg-green-600" : ""}`}
                    >
                      {justSaved ? (
                        <>
                          <Check className="mr-1 size-4" /> Saved
                        </>
                      ) : (
                        <>
                          <Save className="mr-1 size-4" /> Save
                        </>
                      )}
                    </Button>
                  </form>
                </section>

                <section className="flex flex-col gap-1.5">
                  <h3 className="text-muted-foreground text-xs font-medium uppercase">Files</h3>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" onClick={exportJson}>
                      <Download className="mr-1 size-4" /> Export JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="mr-1 size-4" /> Import JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={exportModel}
                      title="Export the room as a 3D model (.glb — opens in Blender etc.)"
                    >
                      <Box className="mr-1 size-4" /> Export Model
                    </Button>
                  </div>
                </section>
              </DialogContent>
            </Dialog>

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              aria-label="Import level file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  importJson(f);
                  files.close();
                }
                e.target.value = "";
              }}
            />
          </div>

          {/* Parametric nodes: the graph canvas + per-node inspector */}
          <Separator />
          <NodesPanel app={app} />
        </CardContent>
      </Card>

      <ControlsCard>
        <CameraControlsLegend />
        <li className="flex items-center gap-2.5">
          <Kbd>Click</Kbd> Grab / place item
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>E</Kbd> Toggle block palette
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>Q</Kbd> Eyedrop item under the cursor / Clear what you're holding
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>R</Kbd> Rotate
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>X</Kbd> Delete
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>Esc</Kbd> Clear held block / Cancel grab
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>PgUp</Kbd> / <Kbd>PgDn</Kbd> Raise / Lower build plane
          (<Kbd>Shift</Kbd>{" "} storey, <Kbd>Alt</Kbd> fine)
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>Home</Kbd> Fits entire graph (Graph Editor)
        </li>
        <li className="flex items-center gap-2.5">
          <Kbd>.</Kbd> Fit selection (Graph Editor)
        </li>
        <li className="flex items-center gap-2.5">
          <KbdCombo keys={["Ctrl", "Z"]} /> Undo
        </li>
        <li className="flex items-center gap-2.5">
          <KbdCombo keys={["Shift", "Ctrl", "Z"]} /> Redo
        </li>
      </ControlsCard >
    </div >
  );
};

export const LevelEditorPanel = ({ roomId }: { roomId?: string }) => {
  const app = useApp(editorApp);
  // Reserve the canvas height while the app constructs (first open only — remounts are cache-seeded)
  // so the page below doesn't jump.
  if (!app)
    return (
      <div className="path-debug-canvas text-muted-foreground flex items-center justify-center text-sm">
        loading editor…
      </div>
    );
  return <LevelEditorView app={app} roomId={roomId} />;
};
