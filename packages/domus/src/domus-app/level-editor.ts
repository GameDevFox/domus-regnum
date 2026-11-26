import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

import { EventRouter, r90 } from "@kitsune/common";
import { FlyControls, Key, mountKeyPan, pointerNdc, pointerToPlaneY } from "@kitsune/common-web";
import type { ThreeApp } from "@kitsune/common-web/src/react";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { defaultBlocks } from "../blocks/block-kinds";
import { textureEpoch } from "../blocks/block-materials";
import { disposeDeep } from "../blocks/dispose";
import {
  movePlacement,
  placeBlock,
  placeRegion,
  regionRect,
  removePlacement,
  rotatePlacement,
  setPlacementElevation,
  setPlacementParam,
} from "../blocks/edit";
import { Cell, cellCenter, Dir, rotateDir } from "../blocks/grid";
import { History } from "../blocks/history";
import { LoadSession, runInitialLoad } from "./load-session";
import { infiniteGrid } from "../three-canvas/infinite-grid";
import { mountLevel } from "../blocks/level";
import { cottageLevel, manorLevel } from "../blocks/sample-level";
import { applyTransform, resolveTransform } from "../blocks/transform";
import { BlockParams, isGridPlacement, Level, Placement } from "../blocks/types";
import { applyViewCull } from "../blocks/view-cull";

import { OrbitControls } from "../domus/orbit-controls";

import { deriveLevel } from "../parametric/derive-level";
import { levelToDoc, MANUAL_NODE_ID, serializeDoc, setPointAxis, setProp } from "../parametric/edit";
import { pointAxis, primCoord, setPrimCoord } from "../parametric/prim-coords";
import { evaluateDoc } from "../parametric/evaluate";
import { dependencyPrimitives, nodeFocusCenter } from "../parametric/node-focus";
import { defaultKinds, PRIMITIVE_KINDS } from "../parametric/kinds";
import { DocNode, isBinding, ParametricDoc } from "../parametric/types";

import { editorKeys, toolKeys } from "./editor-input";
import { manualLens } from "./editor/manual-lens";
import { mountSelectionHighlight } from "./editor/selection-highlight";
import { editorManorDoc } from "./sample-docs"; // the default doc (also re-exported below)
import { exportGlb } from "./editor/export-model";
import { mountFrameGizmos } from "./editor/frame-gizmos";
import { mountNavOverlay } from "./editor/nav-overlay";
import { isSelectable, placementFor, spanFor } from "./editor/placement-model";
import { isCoarsePointer } from "./pointer";
import { shiftToZoom } from "./shift-to-zoom";
import { createViewGizmo } from "./view-gizmo";

// The level-editor Three app: a top-down(ish) view of an editable `Value<Level>` with a grid and a
// click-to-place / click-to-grab interaction. Edits go through the pure ops in blocks/edit.ts and
// push onto an undo stack. The level is rendered reactively via mountLevel, so every edit live-
// updates the scene. React drives the palette / save-load around it.
//
// There is no explicit place/select "mode": the single `activePart` value IS the mode. Holding a
// palette block ⇒ clicks stamp copies (place); holding a grabbed instance ⇒ it follows the cursor
// until you click to drop; holding nothing (null) ⇒ clicks grab the item under the cursor (select).

// What the cursor is currently "holding": a palette block to stamp, or an existing placement that's
// been grabbed (locked to the cursor). null ⇒ idle/select. This one value drives place-vs-select.
// `index` is an index into the MANUAL placements list (the doc's hand-placed node) — generated
// blocks are read-only and can't be grabbed.
export type ActivePart =
  | { source: "palette"; block: string } // a palette block id, ready to stamp copies
  | { source: "instance"; index: number }; // a manual placement, grabbed and locked to the cursor

export type EditorApp = ThreeApp & {
  events: EventRouter; // the Builder's input router — layers defined in editor-input.ts
  doc: Value<ParametricDoc>; // the SOURCE OF TRUTH — parametric nodes + the manual placements node
  level: Value<Level>; // DERIVED from the doc (read-only); what the scene/nav/"play" consume
  manual: Value<Placement[]>; // the manual node's list — selection/grab indices point into THIS
  setDoc: (doc: ParametricDoc) => void; // replace the doc + push history (node panel, doc load)
  // Room load (replace + reset the dirty baseline) vs save/dirty plumbing — see `isDirty`.
  loadDoc: (doc: ParametricDoc) => void;
  loadLevel: (level: Level) => void;
  markClean: () => void; // reset the dirty baseline to the current doc (call after a save)
  isDirty: () => boolean; // current doc (positions included) differs from last load/save
  // Edit-in-place (docs/design/18): the graph canvas/inspector read `viewDoc` (the active graph —
  // the doc, or an open definition's sub-graph) and write via `setViewDoc`. `editPath` is the open
  // definition's name (null = top level); enter/exit descend into / out of it.
  viewDoc: Value<ParametricDoc>;
  setViewDoc: (doc: ParametricDoc) => void;
  editPath: Value<string | null>;
  enterComponent: (name: string) => void;
  exitComponent: () => void;
  selectedNode: Value<string | null>; // parametric node selected (canvas click or viewport pick)
  rectMode: Value<"move" | "scale" | null>; // active tool on the selected primitive
  rectAxis: Value<"x" | "z" | null>; // Blender X/Y axis constraint on the active tool
  rectDragging: Value<boolean>; // a gesture is in flight — overlays go click-through
  // The buttons arm a press-drag-release tool; G/S pass immediate=true for the live Blender
  // gesture (rect follows the cursor at once, click confirms). Both toggle off on re-invoke
  // (same flavor); selecting a primitive auto-arms Move.
  startRectMode: (mode: "move" | "scale", immediate?: boolean) => void;
  toggleRectAxis: (axis: "x" | "z") => void; // X / Y keys while a tool is active
  texMode: Value<boolean>; // texture-offset drag tool armed (wall/walls nodes, literal texOffset)
  texSensitivity: Value<number>; // meters of pattern per pixel of drag — wheel-tuned while armed
  snapEnabled: Value<boolean>; // magnet: Move/Scale snap to 0.5 m (Shift during a drag inverts)
  startTexMode: () => void; // toggle the texture tool (disarms Move/Scale)
  exportModel: (filename: string) => Promise<void>; // download the room as a .glb
  focusPoint: (target: Vector3) => void; // recenter the orbit (outliner double-click)
  tile: number; // the editor grid's cell size (fixed at construction)
  activeFacing: Value<Dir>; // edge for walls/doorways, facing for props (cycled with R)
  activePart: Value<ActivePart | null>; // the held part — null ⇒ select/idle, non-null ⇒ placing
  selected: Value<number | null>; // MANUAL index the inspector edits (set on grab, kept on drop)
  setSelectedParam: (key: string, value: string | number | boolean | undefined) => void; // edit a prop
  previewCull: Value<boolean>; // preview camera-side wall culling while orbiting the editor
  cameraFly: Value<boolean>; // fly camera (orbit is the default) — editing input masked while on
  regionMode: Value<boolean>; // draw-a-floor-region mode: LEFT-drag paints one merged region
  hovered: Value<Cell | null>; // cell under the cursor (for a readout)
  showNav: Value<boolean>; // overlay the derived walkable navmesh
  navWarning: Value<string | null>; // non-null when the overlay finds a disconnected floor
  showGizmo: Value<boolean>; // orientation gizmo in the top-right corner
  buildHeight: Value<number>; // world Y of the build plane (multi-level); placed grid blocks take it
  nudgeBuildHeight: (delta: number) => void; // raise/lower the build plane (snapped to 0.05 m)
  canUndo: Value<boolean>;
  canRedo: Value<boolean>;
  setLevel: (level: Level) => void; // replace + push history (used by load/clear)
  undo: () => void;
  redo: () => void;
  holdBlock: (block: string) => void; // pick a palette block to place (clears any grab first)
  clearPart: () => void; // Q/Esc: drop the held block / cancel & restore a grabbed instance
  rotate: () => void; // R: rotate the grabbed instance, or cycle the place facing (walls/doors)
  removeSelected: () => void; // X: delete the grabbed instance
  eyedrop: () => void; // Q (when idle): pick the block under the cursor into the held part
  actAtReticle: () => void; // touch: the contextual place/grab/drop action at the centre reticle
  focusSelection: () => void; // move the camera focus to the selection (or hovered cell)
  loading: Value<LoadSession | null>; // initial-load session for the editor canvas
  palette: string[];
};

// (Block-category rules — EDGE/FREE blocks, span, selectability, and `placementFor` — live in
// editor/placement-model.ts so they can be unit-tested without a Three context.)

// The world is unbounded (the infinite shader grid + free placement anywhere); this cap is
// numeric sanity only — a near-grazing ray can hit the build plane kilometers out, where a
// misclick would strand a block nobody can find and float precision starts to wobble.
const MAX_PICK_CELLS = 2000; // 1 km at tile 0.5

const emptyLevel = (): Level => ({ name: "Untitled", tile: 0.5, placements: [] });

export const editorApp = (): EditorApp => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 520;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x12161d, 1);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x404050, 1.1));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const dir = new DirectionalLight(0xfff0dd, 1.2);
  dir.position.set(6, 14, 8);
  scene.add(dir);

  const camera = new PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000);

  // Blender-style orientation gizmo, drawn in the top-right corner (see view-gizmo.ts). We clear
  // manually (autoClear off) so the gizmo can overlay the main view after the scene is drawn.
  renderer.autoClear = false;
  const gizmo = createViewGizmo(camera, renderer.domElement);
  const showGizmo = Value(true);
  // Preview the game's camera-side wall culling while orbiting the editor. ON by default for a
  // cleaner view; near walls you'd look through hide as you orbit — toggle it OFF (the eye button)
  // to select a wall that's currently culled.
  const previewCull = Value(true);
  // Region draw mode: while on, a LEFT-drag paints one merged floor region over the dragged rectangle
  // (live preview below). Off ⇒ normal place/select editing.
  const regionMode = Value(false);
  // The magnet: Move/Scale drags snap to the 0.5 m base increment while on (the default); holding
  // Shift during a drag temporarily inverts it (smooth with the magnet on, snapped with it off).
  const snapEnabled = Value(true);
  // Fly camera mode (orbit is the default): free flight on FlyControls — click the canvas for
  // pointer-lock mouse look, WASD flies, R/F up/down, Shift boosts. Mirrors into the "view:fly"
  // router layer, which masks ALL editing input while flying (see the layer below).
  const cameraFly = Value(false);

  // The Builder's input router: DOM events route through a layer stack — editor defaults at the
  // bottom, tool layers shadowing them while armed. Bindings live in editor-input.ts; the React
  // view attaches the DOM adapter on tab mount (use-editor-shortcuts.ts), scoping input to the tab.
  const events = EventRouter();

  const render = () => {
    // Re-evaluate camera-side visibility before drawing (levelGroup exists by the time render runs).
    applyViewCull(camera, levelGroup, previewCull.peek());
    renderer.clear();
    renderer.render(scene, camera);
    if (showGizmo.peek()) gizmo.draw(renderer);
  };

  const controls = new OrbitControls(camera);
  controls.enableDamping = false;
  // Blender-style camera: RIGHT-drag orbits, Ctrl/Cmd+RIGHT-drag pans the focus point (OrbitControls'
  // built-in modifier swap; Shift is dropped — Firefox forces its context menu on Shift+RightClick).
  // MIDDLE is disabled (middle-drag triggers the browser's autoscroll on Firefox/Linux); zoom is
  // Shift+Scroll. LEFT is free for placing/selecting. (Controls suppress the context menu.)
  controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
  controls.connect(renderer.domElement);
  shiftToZoom(controls);
  controls.addEventListener("change", render);

  // --- editable document + history --------------------------------------------------------------
  // The editor's source of truth is the PARAMETRIC DOC (docs/design/13-parametric-builder.md):
  // hand-placed blocks live in its manual `placements` node, parametric nodes generate the rest,
  // and the visible Level is DERIVED (evaluateDoc + deriveLevel). Undo/redo is History over docs.
  // The Graph Manor (the parametric flagship) is the default; the loader dropdown swaps samples.
  const history = History<ParametricDoc>(editorManorDoc()); // already organized (baked positions)
  const doc = history.value;
  const { canUndo, canRedo, commit, commitLive } = history;

  // Unsaved-changes tracking: `savedDoc` is the serialized doc as last LOADED or SAVED. `isDirty`
  // compares the live doc against it (node positions included, since they're part of the doc), and
  // loads/saves reset the baseline via `markClean`. Edits flow through setDoc/commit, which leave the
  // baseline alone — so editing reads as dirty until the next save. Serialized only on demand (load
  // triggers, save, beforeunload), never per-edit.
  const savedDoc = Value(serializeDoc(doc.peek()));
  const markClean = () => savedDoc.set(serializeDoc(doc.peek()));
  const isDirty = () => serializeDoc(doc.peek()) !== savedDoc.peek();

  const scope = Scope();
  // Arrow keys glide the view across the grid (WASD is reserved: S/G drive the rect modal).
  // The helper runs its own RAF only while held, so the render-on-demand editor stays idle.
  // Stands down while flying — FlyControls reads the arrows for pitch/yaw.
  mountKeyPan(scope, controls, camera, {
    keys: { forward: ["arrowup"], back: ["arrowdown"], left: ["arrowleft"], right: ["arrowright"] },
    enabled: () => !cameraFly.peek(),
  });
  const evaluated = evaluateDoc(scope, doc);
  const level = deriveLevel(scope, doc, evaluated); // read-only — all edits go through the doc

  // --- edit-in-place (docs/design/18, Phase 3) ------------------------------------------------
  // `editPath` is the component definition NAME open in the graph canvas (null = top level). The
  // canvas/inspector read `viewDoc` — the active graph presented AS a ParametricDoc, so they need no
  // changes — and write through `setViewDoc`. The 3D scene always derives from the FULL `doc`, so
  // every instance updates live while you edit a definition's internals.
  const editPath = Value<string | null>(null);
  const viewDoc = scope.computed((use): ParametricDoc => {
    const d = use(doc);
    const name = use(editPath);
    const def = name ? d.components?.find((c) => c.name === name) : undefined;
    return def ? { ...d, nodes: def.nodes } : d; // swap in the sub-graph; keep name/tile/components
  });
  // If the open definition disappears (e.g. undo past its creation), pop back to the top level.
  scope.effect((use) => {
    const name = use(editPath);
    const d = use(doc);
    if (name && !d.components?.some((c) => c.name === name)) editPath.set(null);
  });

  // --- the manual-node lens (editor/manual-lens.ts) --------------------------------------------
  // Hand tools operate on a plain Level that is a LENS over the doc's manual node — read it out,
  // apply a pure blocks/edit op, write it back. (manualListOf/withManual are internal to the lens.)
  const { manualLevel, setManual, commitManual, manualV, manualIndexOf } = manualLens(
    doc,
    commit,
    scope,
  );

  // --- primitive manipulation (Move/Scale tools) -----------------------------------------------
  // Select a PRIMITIVE — rect or point — by clicking its generated geometry in the viewport, its
  // node on the canvas, or its outliner row. Selecting auto-arms the Move tool. Entry styles
  // share one gesture engine:
  //   • The BUTTONS (and auto-arm) give a drag tool: press LEFT anywhere on the canvas to
  //     anchor, drag to apply, release to lock in (ONE undo step; bare clicks don't record).
  //     The tool stays armed for more drags, and the canvas does NO picking while it's active —
  //     a cluttered scene can't steal the selection mid-drag. The button (or Esc when idle)
  //     exits back to selection; change targets via Esc-then-click, the outliner, or the canvas.
  //   • G / S start the gesture IMMEDIATELY (Blender-style): the primitive follows the cursor
  //     with no button held, LEFT click confirms and exits, Esc cancels.
  // X / Y mid-tool toggle the Blender axis constraint (doc x ↔ world X, doc y ↔ world Z).
  // Scale needs a size, so it's rects only. The cursor raycasts onto the primitive's elevation
  // plane and cells snap to integers.
  const selectedNode = Value<string | null>(null);
  const rectMode = Value<"move" | "scale" | null>(null);
  // Blender-style axis constraint: lock the active gesture to one floor axis — world X or world Z
  // (doc coords are world space now). Toggled by the X/Y keys while a tool is active (the Y key
  // locks the Z axis — the depth axis on the floor plane); cleared on tool entry/exit.
  const rectAxis = Value<"x" | "z" | null>(null);
  // True while a gesture is IN FLIGHT (button drag, or the live G/S gesture) — the view mutes
  // every overlay panel then, so nothing creates pointer dead zones while the cursor roams.
  const rectDragging = Value(false);
  let rectImmediate = false; // keyboard entry — the gesture is live without a held button
  let rectSnapshot: ParametricDoc | null = null; // doc at GESTURE start — non-null = in flight
  let rectStartHit: Vector3 | null = null; // where on the plane the gesture anchored
  let rectDirty = false; // did this gesture actually change anything? (skip no-op undo steps)
  let rect0 = { x: 0, y: 0, z: 0, w: 1, d: 1 }; // world: x/z floor, y height, w/d extents

  const nodeById = (id: string | null): DocNode | null =>
    (id && doc.peek().nodes.find((n) => n.id === id)) || null;

  // The Move tool works on any PRIMITIVE (rect, point); Scale needs a size, so rects only.
  const selectedPrimitive = (): DocNode | null => {
    const node = nodeById(selectedNode.peek());
    return node && PRIMITIVE_KINDS.has(node.kind) ? node : null;
  };

  // The primitive feeding a node: the node itself if it IS one, else its first primitive-bound
  // input — how clicking a generated wall/floor selects the rect (or point) that drives it. A
  // two-point `wall` resolves to point `a` (props order), so click-then-G moves that end.
  // DERIVED chains fall through to their root primitive: a wall on rectPoints selects the RECT
  // (Move then carries the whole assembly — the points are computed, not grabbable).
  const sourcePrimitiveOf = (node: DocNode): string | null => {
    if (PRIMITIVE_KINDS.has(node.kind)) return node.id;
    for (const v of Object.values(node.props)) {
      const bound = isBinding(v) ? nodeById(v.bind) : null;
      if (bound && PRIMITIVE_KINDS.has(bound.kind)) return bound.id;
    }
    return dependencyPrimitives(doc.peek(), node)[0]?.id ?? null;
  };

  const captureRect0 = (node: DocNode) => ({
    x: primCoord(node, "x", 0), // world X (rect/anchor: position.x; point: x)
    y: primCoord(node, "y", 0), // world Y (height)
    z: primCoord(node, "z", 0), // world Z (floor depth)
    w: pointAxis(node, "size", "x", 0.5), // extent along world X (rect size.x = width)
    d: pointAxis(node, "size", "z", 0.5), // extent along world Z (rect size.z = depth)
  });

  const startRectMode = (mode: "move" | "scale", immediate = false) => {
    // Re-invoking the SAME mode in the SAME flavor toggles off (button unclick, G after G).
    // Same mode in the OTHER flavor switches — e.g. G while the button-armed move tool is on
    // (incl. auto-arm on select) starts the live Blender gesture instead of exiting.
    if (rectMode.peek() === mode && rectImmediate === immediate) {
      exitRectMode();
      return;
    }
    const node = selectedPrimitive();
    if (!node) return;
    if (mode === "scale" && node.kind !== "rect") return; // points have no size to scale
    cancelGrab();
    activePart.set(null);
    // Same-mode FLAVOR switches (armed ↔ immediate) don't change the layer stack, so the tool
    // layer's _exit can't see them — abandon the in-flight gesture explicitly. Cross-mode
    // switches are also covered by _exit when rectMode.set() replaces the layer below.
    cancelRectDrag();
    rectAxis.set(null);
    rectImmediate = immediate;
    texMode.set(false); // tools are mutually exclusive (texMode declared below; runs post-init)
    rectMode.set(mode);
    if (immediate) {
      // Keyboard entry (Blender G/S): the gesture goes live NOW — anchored at the cursor if
      // it's over the canvas, else at the first pointer move. LEFT click confirms.
      rect0 = captureRect0(node);
      rectSnapshot = doc.peek();
      rectDragging.set(true);
      rectStartHit = lastPointer
        ? pointerToPlaneY(
            lastPointer.x,
            lastPointer.y,
            renderer.domElement,
            camera,
            rect0.y,
          )
        : null;
    }
  };

  // LEFT press while armed (button entry): anchor the gesture where the press hits the
  // primitive's elevation plane. Deliberately NO picking here — while a tool is active the
  // whole canvas is a drag surface, so a cluttered scene can't steal the selection mid-drag.
  // Change selection via Esc-then-click, the outliner, or the node canvas.
  // rect0 is captured per-drag so consecutive drags compose.
  const beginRectDrag = (clientX: number, clientY: number) => {
    const node = selectedPrimitive();
    if (!rectMode.peek() || !node) return;
    rect0 = captureRect0(node);
    const hit = pointerToPlaneY(clientX, clientY, renderer.domElement, camera, rect0.y);
    if (!hit) return;
    rectSnapshot = doc.peek();
    rectStartHit = hit;
    rectDragging.set(true);
  };

  // Drags work in raw world meters. With the magnet on (default) values snap to the 0.5 m base
  // increment — the game's grid unit — and holding SHIFT during the drag temporarily inverts
  // the magnet (smooth while it's on, snapped while it's off). Smooth values commit at mm
  // precision so float noise never lands in the doc.
  const SNAP = 0.5;
  const mm = (v: number) => Math.round(v * 1000) / 1000;
  const updateRectDrag = (clientX: number, clientY: number, invertSnap = false) => {
    const mode = rectMode.peek();
    const id = selectedNode.peek();
    if (!mode || !rectSnapshot || !id) return;
    const kind = nodeById(id)?.kind ?? "rect"; // position coords nest for rect/anchor, not point
    const hit = pointerToPlaneY(clientX, clientY, renderer.domElement, camera, rect0.y);
    if (!hit) return;
    if (!rectStartHit) {
      rectStartHit = hit; // immediate entry with the cursor off-canvas: first move anchors
      return;
    }
    const snapping = snapEnabled.peek() !== invertSnap;
    const quant = (v: number) => (snapping ? Math.round(v / SNAP) * SNAP : mm(v));
    const axis = rectAxis.peek(); // lock to one floor axis: "x" = world X, "z" = world Z
    let next = rectSnapshot;
    if (mode === "move") {
      // Snap the DELTA, not the position — the primitive keeps its own alignment relative to
      // where the gesture started (a quarter-offset rect stays quarter-offset).
      const dx = axis === "z" ? 0 : quant(hit.x - rectStartHit.x);
      const dz = axis === "x" ? 0 : quant(hit.z - rectStartHit.z);
      rectDirty = dx !== 0 || dz !== 0;
      next = setPrimCoord(setPrimCoord(next, id, kind, "x", mm(rect0.x + dx)), id, kind, "z", mm(rect0.z + dz));
    } else {
      // Scale about the center (Blender S): the cursor's distance to the center, relative to
      // where the gesture started, is the scale factor. Axis-constrained scale (S then X/Y)
      // measures along that axis only and resizes only that dimension. Sizes quantize per the
      // magnet and x/z re-derive from the FIXED center, so it stays centered.
      const cx = rect0.x + rect0.w / 2; // corner-anchored meters: center is corner + size/2
      const cz = rect0.z + rect0.d / 2;
      const dist = (px: number, pz: number) =>
        axis === "x"
          ? Math.abs(px - cx)
          : axis === "z"
            ? Math.abs(pz - cz)
            : Math.hypot(px - cx, pz - cz);
      const d0 = dist(rectStartHit.x, rectStartHit.z);
      const d1 = dist(hit.x, hit.z);
      const f = d0 > 1e-6 ? d1 / d0 : 1;
      const w = axis === "z" ? rect0.w : Math.max(SNAP, quant(rect0.w * f));
      const d = axis === "x" ? rect0.d : Math.max(SNAP, quant(rect0.d * f));
      rectDirty = w !== rect0.w || d !== rect0.d;
      next = setPointAxis(next, id, "size", "x", w);
      next = setPointAxis(next, id, "size", "z", d);
      next = setPrimCoord(next, id, kind, "x", mm(cx - w / 2));
      next = setPrimCoord(next, id, kind, "z", mm(cz - d / 2));
    }
    doc.set(next); // live preview, no history — the confirm records ONE step
  };

  // Release (armed flow) / click (immediate flow) = the gesture locks in as ONE undo step —
  // unless nothing actually changed (a bare click), which restores silently so the undo stack
  // doesn't collect no-ops.
  const endRectDrag = () => {
    if (!rectSnapshot) return;
    if (rectDirty) commitLive(rectSnapshot);
    else doc.set(rectSnapshot);
    rectSnapshot = null;
    rectStartHit = null;
    rectDirty = false;
    rectDragging.set(false);
  };

  const cancelRectDrag = () => {
    if (rectSnapshot) doc.set(rectSnapshot); // restore the rect to where the gesture started
    rectSnapshot = null;
    rectStartHit = null;
    rectDirty = false;
    rectDragging.set(false);
  };

  // Exiting the tool = flipping the mode off. The actual cleanup (cancel the in-flight gesture,
  // drop the axis constraint) lives in the tool layer's _exit — the rectMode mirror exits the
  // layer, so EVERY exit path (Esc, deselect, confirm, mode switch) funnels through it.
  const exitRectMode = () => {
    rectMode.set(null);
  };

  // --- texture-offset drag tool -----------------------------------------------------------------
  // Armed via the Texture button when the selected node's kind has a LITERAL texOffset input
  // (wall / walls; a bound input belongs to its source node). Press-drag-release like Move/Scale:
  // horizontal pixels slide the pattern (live preview, ONE undo step on release), and the wheel
  // tunes the sensitivity while armed. Same doc-snapshot discipline as the rect gestures.
  const texMode = Value(false);
  const texSensitivity = Value(0.005); // meters of pattern per pixel of drag
  let texSnapshot: ParametricDoc | null = null;
  let tex0 = 0; // texOffset where the drag anchored
  let texStartX: number | null = null;
  let texDirty = false;

  const texEligible = (): boolean => {
    const id = selectedNode.peek();
    const node = id ? doc.peek().nodes.find((n) => n.id === id) : undefined;
    if (!node || !defaultKinds[node.kind]?.inputs.texOffset) return false;
    const prop = node.props.texOffset;
    return prop === undefined || !isBinding(prop);
  };

  const beginTexDrag = (clientX: number) => {
    const id = selectedNode.peek();
    if (!texMode.peek() || !id || !texEligible()) return;
    const node = doc.peek().nodes.find((n) => n.id === id);
    tex0 = typeof node?.props.texOffset === "number" ? node.props.texOffset : 0;
    texSnapshot = doc.peek();
    texStartX = clientX;
    texDirty = false;
    rectDragging.set(true); // overlays go click-through — the whole canvas is the drag surface
  };

  const updateTexDrag = (clientX: number) => {
    const id = selectedNode.peek();
    if (!texSnapshot || texStartX == null || !id) return;
    // NEGATED delta: a larger offset advances the sampling window, which slides the VISIBLE
    // pattern backward — so the pattern follows the cursor on the canonical faces (the ones
    // facing the default camera). Opposite-facing walls mirror; one scalar can't serve both.
    const v = Math.round((tex0 - (clientX - texStartX) * texSensitivity.peek()) * 100) / 100;
    texDirty = texDirty || v !== tex0;
    doc.set(setProp(texSnapshot, id, "texOffset", v)); // live preview, no history
  };

  const endTexDrag = () => {
    if (!texSnapshot) return;
    if (texDirty)
      commitLive(texSnapshot); // the whole drag = one undo step
    else doc.set(texSnapshot); // bare click: restore silently, no history no-op
    texSnapshot = null;
    texStartX = null;
    texDirty = false;
    rectDragging.set(false);
  };

  const cancelTexDrag = () => {
    if (texSnapshot) doc.set(texSnapshot);
    texSnapshot = null;
    texStartX = null;
    texDirty = false;
    rectDragging.set(false);
  };

  // Wheel tunes sensitivity while armed (scroll up = coarser, down = finer). Plain wheel is
  // free here — editor zoom is Shift+Scroll — so swallow it instead of scrolling the page.
  const onTexWheel = (e: WheelEvent) => {
    if (e.shiftKey) return; // Shift+Scroll stays camera zoom
    e.preventDefault();
    const f = Math.pow(1.25, -Math.sign(e.deltaY));
    texSensitivity.update((s) => Math.min(0.05, Math.max(0.0005, s * f)));
  };

  const startTexMode = () => {
    if (texMode.peek()) {
      texMode.set(false);
      return;
    }
    rectMode.set(null); // tools are mutually exclusive
    texMode.set(true);
  };

  // X/Y while a tool is active: toggle the axis constraint and re-apply the in-flight gesture
  // immediately (so the rect snaps onto the axis without waiting for the next pointer move).
  const toggleRectAxis = (axis: "x" | "z") => {
    if (!rectMode.peek()) return;
    rectAxis.update((a) => (a === axis ? null : axis));
    if (rectSnapshot && lastPointer) updateRectDrag(lastPointer.x, lastPointer.y);
  };

  // Selecting a primitive (rect, point) auto-arms the Move tool — the next press-drag moves it,
  // no button hunt. Deselecting (or selecting a non-primitive) puts the tool away. Explicit
  // Scale stays put when the selection changes between primitives.
  scope.effect((use) => {
    use(selectedNode);
    const prim = selectedPrimitive();
    if (prim) {
      const mode = rectMode.peek();
      if (!mode || (mode === "scale" && prim.kind !== "rect")) {
        // Arm Move — also when hopping from a rect in Scale onto a point (points can't scale).
        rectImmediate = false;
        rectAxis.set(null);
        rectMode.set("move");
      }
    } else if (rectMode.peek()) {
      exitRectMode();
    }
  });

  // Cursor hint while a tool is armed — the whole canvas is the drag surface.
  scope.effect((use) => {
    const m = use(rectMode);
    renderer.domElement.style.cursor = m === "move" ? "move" : m === "scale" ? "nwse-resize" : "";
  });

  // Mirror the tool mode into the input router's layer stack: while a tool is armed its layer
  // shadows the editor base bindings (X = axis constraint instead of delete; see editor-input.ts).
  scope.effect((use) => {
    const mode = use(rectMode);
    const current = events.active().find((n) => n.startsWith("tool:"));
    if (mode) events.replace("tool:", `tool:${mode}`);
    else if (current) events.exit(current);
  });

  // The held part (see ActivePart). When it's an `instance`, that's a "grab": the item is locked to
  // the cursor and `grabSnapshot` holds the level from before the grab (for a one-step commit on drop
  // / restore on cancel). Indices reference positions in `placements`, so replacing the whole level
  // or stepping history clears the grab.
  const activePart = Value<ActivePart | null>(null);
  // The MANUAL placement index the property inspector edits. Set when an item is grabbed and KEPT
  // after it's dropped (so you can tweak its properties while it sits idle); cleared when the
  // selection could go stale (history nav, doc swap, delete, or holding a palette brush to stamp).
  const selected = Value<number | null>(null);
  let grabSnapshot: ParametricDoc | null = null;
  // Convenience reads of the held part's variant.
  const heldInstance = (): number | null => {
    const p = activePart.peek();
    return p?.source === "instance" ? p.index : null;
  };
  const heldBlock = (): string | null => {
    const p = activePart.peek();
    return p?.source === "palette" ? p.block : null;
  };

  // Esc: drop the grabbed item back at its original position + orientation, discarding the move.
  const cancelGrab = () => {
    if (grabSnapshot == null) return;
    doc.set(grabSnapshot);
    grabSnapshot = null;
    activePart.set(null);
    selected.set(null);
  };

  const setDoc = (next: ParametricDoc) => {
    cancelGrab();
    activePart.set(null);
    selected.set(null);
    editPath.set(null); // a fresh doc (sample/load) always opens at the top level
    commit(next);
  };
  // Write an edit from the graph canvas back to the ACTIVE graph: the doc itself at the top level,
  // or the open definition's sub-graph when editing in place (one undo step either way).
  const setViewDoc = (next: ParametricDoc) => {
    const name = editPath.peek();
    if (!name) return setDoc(next);
    const d = doc.peek();
    // next.nodes is the open definition's edited sub-graph; next.components carries any NEW nested
    // definitions (grouping inside a definition), so write through the latter and patch this def.
    commit({
      ...d,
      components: (next.components ?? d.components ?? []).map((c) =>
        c.name === name ? { ...c, nodes: next.nodes } : c,
      ),
    });
  };
  // Descend into / out of a definition's sub-graph (double-click an instance / the breadcrumb).
  // Clear the selection + disarm viewport tools so stale ids never leak across graphs.
  const enterComponent = (name: string) => {
    if (!doc.peek().components?.some((c) => c.name === name)) return;
    rectMode.set(null);
    texMode.set(false);
    selectedNode.set(null);
    editPath.set(name);
  };
  const exitComponent = () => {
    selectedNode.set(null);
    editPath.set(null);
  };
  // Legacy entry: a flat Level (samples, old saves) migrates into a doc with one manual node.
  const setLevel = (next: Level) => setDoc(levelToDoc(next));
  // Loading a room (sample / saved / import / New) replaces the doc AND resets the dirty baseline, so
  // the freshly-loaded room reads as clean. (Plain setDoc/setLevel stay the edit path — dirtyable.)
  const loadDoc = (next: ParametricDoc) => {
    setDoc(next);
    markClean();
  };
  const loadLevel = (next: Level) => loadDoc(levelToDoc(next));
  const undo = () => {
    cancelGrab();
    activePart.set(null);
    selected.set(null);
    history.undo();
  };
  const redo = () => {
    cancelGrab();
    activePart.set(null);
    selected.set(null);
    history.redo();
  };

  // Edit one property of the selected placement. Mid-grab it folds into the grab's single undo step
  // (live set, like movePlacement); idle it's a discrete commit. Index is stable (replace-in-place).
  const setSelectedParam = (key: string, value: string | number | boolean | undefined) => {
    const i = selected.peek();
    if (i == null) return;
    const next = setPlacementParam(manualLevel(), i, key, value);
    if (grabSnapshot == null) commitManual(next);
    else setManual(next);
  };

  // --- scene content --------------------------------------------------------------------------
  const levelGroup = new Group();
  scene.add(levelGroup);
  mountLevel(scope, levelGroup, level);

  // Editing tools: an infinite shader grid, an invisible ground plane for picking, and a hover
  // highlight. The grid fades with camera distance and placement is unbounded (pickCell caps
  // only at MAX_PICK_CELLS for numeric sanity) — the world has no edges.
  const tile = level.peek().tile;
  const grid = infiniteGrid({ tile });
  grid.position.y = 0.001;
  scene.add(grid);

  // Tool state.
  const palette = Object.keys(defaultBlocks);
  const activeFacing = Value<Dir>("N");
  const hovered = Value<Cell | null>(null);
  const showNav = Value(false);
  const navWarning = Value<string | null>(null); // set when the nav overlay finds a split floor
  // Multi-level: the world Y of the plane we're placing on. Raise/lower it to build upper floors;
  // placed grid blocks take this elevation. Snapped to 0.05 m to avoid float drift.
  const buildHeight = Value(0);
  const nudgeBuildHeight = (delta: number) =>
    buildHeight.set(Math.round((buildHeight.peek() + delta) * 20) / 20);

  // --- ghost cursor ---------------------------------------------------------------------------
  // In place mode the cursor IS the block: a translucent copy of the active block, built from the
  // same registry + transform as a real placement and repositioned on hover, so you see exactly
  // what (and how oriented) you're about to drop. Materials are cloned + dimmed so we never mutate
  // the shared block materials. Rebuilt only when the block kind changes; re-posed every hover.
  const ghostGroup = new Group();
  scene.add(ghostGroup);
  let ghostScope = Scope();
  scope.add(() => ghostScope.cleanup());

  const makeGhostly = (root: Object3D): void => {
    const dim = (mat: Material): Material => {
      const c = mat.clone();
      c.transparent = true;
      c.opacity = 0.45;
      c.depthWrite = false;
      return c;
    };
    root.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m) return;
      (o as Mesh).material = Array.isArray(m) ? m.map(dim) : dim(m);
    });
  };

  // The placement the held block would create at a cell — shared with applyAt via placementFor. Only
  // called while a palette block is held, so `heldBlock()` is non-null here.
  const cursorPlacement = (cell: Cell): Placement =>
    placementFor(heldBlock() ?? "floor", cell, activeFacing.peek(), buildHeight.peek(), tile);

  const buildGhost = (): void => {
    ghostScope.cleanup();
    disposeDeep(ghostGroup);
    ghostGroup.clear();
    ghostScope = Scope();
    const block = heldBlock();
    if (!block) return; // nothing held (or a grabbed instance) ⇒ no ghost
    const factory = defaultBlocks[block];
    if (!factory) return;
    const params: BlockParams = { tile, span: spanFor(block) };
    const built = factory(ghostScope, params);
    makeGhostly(built.mesh);
    ghostGroup.add(built.mesh);
  };

  // Selected-rect highlight: a translucent quad over the rect's footprint, so "selected" is
  // visible in the viewport (not just on the node canvas). Tracks live edits during Move/Scale.
  const rectHi = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  rectHi.rotation.x = -r90;
  rectHi.visible = false;
  scene.add(rectHi);
  scope.add(() => disposeDeep(rectHi));
  scope.effect((use) => {
    use(doc);
    use(selectedNode);
    const node = selectedPrimitive();
    if (!node) {
      rectHi.visible = false;
      render();
      return;
    }
    // Primitive props are world METERS in world space (doc v4): a rect's x/z is its NW corner on
    // the floor, so the quad centers at corner + size/2 and scales to the size directly. A
    // point/anchor has no size — highlight one tile centered ON the point.
    const [x, z] = [primCoord(node, "x", 0), primCoord(node, "z", 0)];
    const isRect = node.kind === "rect";
    const w = isRect ? pointAxis(node, "size", "x", 0.5) : tile;
    const d = isRect ? pointAxis(node, "size", "z", 0.5) : tile;
    rectHi.position.set(
      isRect ? x + w / 2 : x,
      primCoord(node, "y", 0) + 0.025,
      isRect ? z + d / 2 : z,
    );
    rectHi.scale.set(w, d, 1);
    rectHi.visible = true;
    render();
  });

  // Navmesh overlay (editor/nav-overlay.ts): a reactive wireframe of the walkable graph that updates
  // live as you place walls / punch doorways, and sets navWarning when the floor splits into regions.
  mountNavOverlay({ scope, scene, level, showNav, navWarning, render });
  // Frame gizmos: while the selected node outputs frames (anchor, future wall slots), draw a
  // dot + facing tick per frame (docs/design/14-component-outputs.md slice 1).
  mountFrameGizmos(scope, scene, doc, evaluated, selectedNode, render);

  // Re-render when the gizmo or the cull preview is toggled.
  scope.effect((use) => {
    use(showGizmo);
    use(previewCull);
    render();
  });

  // Block textures (wallpaper/floor) load async; the editor renders on-demand, so without this a
  // wall placed before its image decoded would stay black until the next hover/orbit. Repaint when
  // a texture finishes loading. (`textureEpoch` only changes in a browser, never under node tests.)
  scope.effect((use) => {
    use(textureEpoch);
    render();
  });

  // Selection outline tracks the selected placement (set on grab, kept after drop) — editor module.
  mountSelectionHighlight(scope, scene, { selected, manualV, tile, render });

  // --- pointer picking ------------------------------------------------------------------------
  // Viewport→world mapping lives in @kitsune/common-web (pointerNdc / pointerToPlaneY): the
  // cursor is raycast onto the build plane, so picking tracks the camera at any angle/distance.
  const raycaster = new Raycaster();
  let hoverCell: Cell | null = null;
  let lastPointer: { x: number; y: number } | null = null; // last cursor pos, for the keyboard eyedropper

  const pickCell = (clientX: number, clientY: number): Cell | null => {
    const hit = pointerToPlaneY(clientX, clientY, renderer.domElement, camera, buildHeight.peek());
    if (!hit) return null;
    const t = tile; // the editor grid is fixed at construction tile (levels here are tile=1)
    const c = Math.round(hit.x / t);
    const r = Math.round(hit.z / t);
    if (Math.abs(c) > MAX_PICK_CELLS || Math.abs(r) > MAX_PICK_CELLS) return null;
    return [c, r];
  };

  // Raycast the actual rendered meshes (hitbox), returning the DERIVED placement under the cursor.
  // mountLevel tags each block's root with its placement, so we climb to that root and look it up.
  // With `grabbable`, skips floors/structural edges (isSelectable) AND generated blocks (read-only
  // parametric output — only manual placements can be grabbed; see manualIndexOf).
  const pickAt = (
    clientX: number,
    clientY: number,
    opts: { grabbable?: boolean } = {},
  ): Placement | null => {
    raycaster.setFromCamera(pointerNdc(clientX, clientY, renderer.domElement), camera);
    for (const hit of raycaster.intersectObjects(levelGroup.children, true)) {
      // Climb to the block's root, tracking visibility on the way: Three's Raycaster does NOT
      // skip invisible objects, so without this a camera-side-culled wall (root.visible=false,
      // see blocks/view-cull.ts) would still swallow clicks meant for what's behind it.
      let o: Object3D | null = hit.object;
      let chainVisible = o.visible;
      while (o && o.parent !== levelGroup) {
        o = o.parent;
        if (o) chainVisible &&= o.visible;
      }
      if (!chainVisible) continue; // hidden (culled) — pick through it
      const placement = o?.userData.placement as Placement | undefined;
      if (!placement) continue;
      if (opts.grabbable && (!isSelectable(placement.block) || manualIndexOf(placement) == null))
        continue;
      return placement;
    }
    return null;
  };

  // --- region draw: drag a rectangle → one merged floor region --------------------------------
  const regionPreview = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  regionPreview.rotation.x = -Math.PI / 2; // lie flat on the ground plane
  regionPreview.visible = false;
  scene.add(regionPreview);
  scope.add(() => disposeDeep(regionPreview));
  let regionStart: Cell | null = null; // NW-ish corner where the drag began (null = not drawing)

  // Show + size the translucent preview over the rect from `regionStart` to the cell under (x,y).
  const updateRegionPreview = (x: number, y: number) => {
    const end = pickCell(x, y);
    if (regionStart == null || end == null) {
      regionPreview.visible = false;
      render();
      return;
    }
    const { cell, size } = regionRect(regionStart, end);
    regionPreview.position.set(
      (cell[0] + (size[0] - 1) / 2) * tile,
      buildHeight.peek() + 0.03,
      (cell[1] + (size[1] - 1) / 2) * tile,
    );
    regionPreview.scale.set(size[0] * tile, size[1] * tile, 1);
    regionPreview.visible = true;
    render();
  };
  // Commit the dragged rectangle as one floor region (one undo step), then clear the draw.
  const endRegionDraw = (x: number, y: number) => {
    if (regionStart == null) return;
    const end = pickCell(x, y) ?? regionStart;
    const { cell, size } = regionRect(regionStart, end);
    commitManual(placeRegion(manualLevel(), cell, size));
    regionStart = null;
    regionPreview.visible = false;
    render();
  };

  // Grab: lock the picked item to the cursor (it then follows pointer moves / rotates with R).
  // `index` is a MANUAL-list index (pickAt already filtered to grabbable manual placements).
  const startGrab = (index: number) => {
    grabSnapshot = doc.peek();
    // Pop the build plane to the grabbed item's elevation, so it sits on a matching plane — and then
    // rides that plane if you raise/lower it (relocating the item across floors). Set before the
    // selection so the build-plane effect doesn't move the not-yet-grabbed item.
    const p = manualV.peek()[index];
    buildHeight.set(isGridPlacement(p) ? (p.y ?? 0) : p.pos[1]);
    activePart.set({ source: "instance", index });
    selected.set(index); // surface this placement in the property inspector (kept after it's dropped)
  };
  // Drop: lock it in place, recording the whole grab (move + rotations) as one undo step.
  const dropGrab = () => {
    if (grabSnapshot == null) return;
    commitLive(grabSnapshot);
    grabSnapshot = null;
    activePart.set(null);
  };

  // Pick a palette block to place (Factorio-style brush). Abandons any in-progress grab first
  // (restoring the grabbed item to where it was).
  const holdBlock = (block: string) => {
    cancelGrab();
    selected.set(null); // placing a brush clears the inspector selection
    activePart.set({ source: "palette", block });
  };

  // Q/Esc: clear what's held. A grabbed instance is restored to its original spot (cancel); a palette
  // brush is simply dropped → back to idle/select.
  const clearPart = () => {
    if (rectMode.peek()) {
      // Immediate (G/S) gesture: Esc restores and exits, like Blender. Button-armed: Esc
      // abandons an in-flight drag but keeps the tool armed; Esc again exits to selection.
      if (rectSnapshot && !rectImmediate) cancelRectDrag();
      else exitRectMode();
      return;
    }
    if (heldInstance() != null) cancelGrab();
    else activePart.set(null);
  };

  // Eyedropper — Q when nothing is held: pick the block under the cursor into the held part, ready to
  // stamp copies. Matches its facing/edge so the ghost comes up oriented the same way, and pops the
  // build plane to its elevation. Raycasts at the last cursor position (the key event has no coords).
  const eyedrop = () => {
    if (!lastPointer) return;
    const p = pickAt(lastPointer.x, lastPointer.y); // any block, incl. floor/walls/generated
    if (p == null) return;
    if (isGridPlacement(p)) activeFacing.set(p.edge ?? p.face ?? activeFacing.peek());
    buildHeight.set(isGridPlacement(p) ? (p.y ?? 0) : p.pos[1]); // pop the plane to the picked item
    activePart.set({ source: "palette", block: p.block });
  };

  const updateHighlight = () => {
    // While a palette block is held, the ghost block IS the cursor. Grab/idle show no ghost (the
    // grabbed item itself follows the cursor; idle just raycasts on click).
    const placing = heldBlock() != null;
    ghostGroup.visible = placing && !!hoverCell;
    if (placing && hoverCell) {
      applyTransform(ghostGroup, resolveTransform(cursorPlacement(hoverCell), tile));
    }
    render();
  };

  // Multi-level: when the build plane rises/lowers, move the grid + the pick plane to that Y and
  // re-pose the ghost/highlight (and ground-plane raycasts) so everything sits on the new floor.
  // Tracks the build height the camera focus is currently aligned to, so each change pans the view
  // by exactly the delta (keeping the orbit offset/zoom).
  let cameraPlaneY = 0;
  scope.effect((use) => {
    const h = use(buildHeight);
    grid.position.y = h + 0.001;
    // Pan the camera focus with the plane so the floor you're editing stays framed: shift the orbit
    // target and the camera by the same delta (the view slides vertically — no zoom/orbit change).
    const dy = h - cameraPlaneY;
    if (dy !== 0) {
      controls.target.y += dy;
      camera.position.y += dy;
      controls.update(); // fires "change" → render
      cameraPlaneY = h;
    }
    // A grabbed item rides the build plane: raising/lowering relocates it to that elevation.
    const i = heldInstance();
    if (i != null) setManual(setPlacementElevation(manualLevel(), i, h));
    updateHighlight();
  });

  // Touch (coarse pointer) vs mouse: on touch the editor uses a centre reticle + on-screen buttons
  // instead of hover + clicks (OrbitControls owns the gestures). Detected once at construction.
  const TOUCH = isCoarsePointer();

  // Cursor tracking — pure state mirroring every mode reads (the keyboard eyedropper, gesture
  // anchors, the ghost). A direct listener, not a routed binding: it runs unconditionally,
  // before whatever layer handles the move.
  const trackPointer = (e: PointerEvent) => {
    if (TOUCH) return; // touch is camera-only; the reticle (syncReticle) drives the target instead
    lastPointer = { x: e.clientX, y: e.clientY };
    hoverCell = pickCell(e.clientX, e.clientY);
    hovered.set(hoverCell);
  };

  // Stamp the held palette block at a cell — same placement rule as the ghost (placementFor). No-op
  // unless a palette block is held.
  const applyAt = (cell: Cell) => {
    const block = heldBlock();
    if (!block) return;
    selected.set(null); // stamping may re-slot indices — drop any stale inspector selection
    commitManual(
      placeBlock(
        manualLevel(),
        placementFor(block, cell, activeFacing.peek(), buildHeight.peek(), tile),
      ),
    );
  };

  // The contextual action at a screen point: idle → grab the item there; holding an instance → drop
  // it; holding a palette block → stamp it. Shared by the mouse (onUp) and the touch reticle.
  const actAt = (x: number, y: number) => {
    const part = activePart.peek();
    if (part == null) {
      // Grab takes precedence (hand-placed furniture etc.), exactly as before.
      const grabbable = pickAt(x, y, { grabbable: true });
      const gi = grabbable ? manualIndexOf(grabbable) : null;
      if (gi != null) {
        startGrab(gi);
        return;
      }
      // Otherwise: clicking GENERATED geometry selects the rect that drives it (via the
      // generator's binding) — the entry point to Move/Scale. Empty space clears the selection.
      const any = pickAt(x, y);
      if (!any) {
        selectedNode.set(null);
        return;
      }
      const node = nodeById(any.id?.split("/")[0] ?? null);
      if (node && node.id !== MANUAL_NODE_ID) selectedNode.set(sourcePrimitiveOf(node) ?? node.id);
      return;
    }
    if (part.source === "instance") {
      dropGrab();
      return;
    }
    const cell = pickCell(x, y);
    if (cell) applyAt(cell);
  };

  // The canvas's centre in client coords — the touch reticle's screen point.
  const canvasCenter = (): { x: number; y: number } => {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Mouse pointer behavior lives in the router layers — see the "input routing" section before
  // the return, where each layer is assembled from its key + pointer fragments.

  // Touch: keep the ghost/target on the centre reticle as the camera moves, and (while grabbing) drag
  // the held item along with it. Recomputed on every camera change.
  const syncReticle = () => {
    if (!TOUCH) return;
    const c = canvasCenter();
    lastPointer = c; // so the eyedropper samples the reticle cell
    hoverCell = pickCell(c.x, c.y);
    hovered.set(hoverCell);
    const i = heldInstance();
    if (i != null && hoverCell) setManual(movePlacement(manualLevel(), i, hoverCell));
    updateHighlight();
  };
  // The contextual action at the reticle — the touch action bar's primary button.
  const actAtReticle = () => {
    const c = canvasCenter();
    actAt(c.x, c.y);
  };

  // Cursor tracking is a lifetime canvas listener; the routed pointer BEHAVIOR only flows while
  // the Builder tab is mounted (the React view attaches/detaches the DOM adapter). On touch,
  // OrbitControls owns the pointer and the reticle follows the camera.
  renderer.domElement.addEventListener("pointermove", trackPointer);
  controls.addEventListener("change", syncReticle); // touch only (no-op on mouse)
  scope.add(() => {
    renderer.domElement.removeEventListener("pointermove", trackPointer);
    controls.removeEventListener("change", syncReticle);
    controls.removeEventListener("change", render); // registered at construction, way above
  });

  // Re-render whenever the level changes (mountLevel rebuilds meshes first, then we draw).
  scope.effect((use) => {
    use(level);
    render();
  });
  // Rebuild the ghost when the held part changes (block kind differs, or it becomes a grab/null).
  scope.effect((use) => {
    use(activePart);
    buildGhost();
    updateHighlight();
  });
  // Re-pose the ghost when the place facing changes.
  scope.effect((use) => {
    use(activeFacing);
    updateHighlight();
  });

  // --- camera framing + resize ----------------------------------------------------------------
  const frameCamera = () => {
    const center = new Vector3(0, 0, 0); // levels are centered on the origin
    // Initial framing: the classic starter area (~16 m at tile 0.5) — the world itself is
    // unbounded, this is just a comfortable opening view.
    const dist = 32 * tile * 0.95;
    camera.position.copy(center).add(new Vector3(0, dist, dist * 0.55));
    controls.target.copy(center);
    controls.update();
  };
  frameCamera();

  // --- grab actions (driven by React keyboard shortcuts in the Builder tab) --------------------
  // R: rotate the grabbed instance in place (live — it's still locked to the cursor; folded into the
  // single undo step recorded on drop). With no instance grabbed, cycle the place facing instead
  // (N→E→S→W), which orients walls/doorways and faced props as you stamp them.
  const rotate = () => {
    const i = heldInstance();
    if (i != null) setManual(rotatePlacement(manualLevel(), i));
    else activeFacing.set(rotateDir(activeFacing.peek(), 1));
  };
  // X: delete the grabbed instance (and end the grab), as one undo step from the pre-grab state.
  const removeSelected = () => {
    const i = heldInstance();
    if (i == null || grabSnapshot == null) return;
    setManual(removePlacement(manualLevel(), i));
    commitLive(grabSnapshot);
    grabSnapshot = null;
    activePart.set(null);
    selected.set(null);
  };
  // World point to focus: the grabbed placement if any, else the hovered cell.
  // What "the selection" means for framing, in priority order: a grabbed instance, the kept
  // manual selection (inspector), the selected parametric node (its primitives' midpoint —
  // shared math with the outliner's double-click), and finally the hovered cell. The old
  // version predated the parametric selection model entirely — the "Focus does nothing" bug:
  // clicking the button moved the cursor OFF the canvas, so it framed whatever cell the mouse
  // last left, ignoring what was actually selected.
  const focusTarget = (): Vector3 | null => {
    const i = heldInstance();
    const list = manualV.peek();
    if (i != null && i >= 0 && i < list.length) return resolveTransform(list[i], tile).position;
    const sel = selected.peek();
    if (sel != null && sel >= 0 && sel < list.length)
      return resolveTransform(list[sel], tile).position;
    const nodeId = selectedNode.peek();
    if (nodeId) {
      const c = nodeFocusCenter(doc.peek(), nodeId);
      if (c) return new Vector3(c.x, c.y, c.z);
    }
    return hoverCell ? cellCenter(hoverCell, tile) : null;
  };
  // Recenter the orbit on a world point, keeping the current view offset/zoom.
  const focusPoint = (target: Vector3) => {
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    controls.update(); // fires "change" → render
  };
  // Blender '.' : recenter the orbit on the selection (grabbed item or hovered cell).
  const focusSelection = () => {
    const target = focusTarget();
    if (target) focusPoint(target);
  };

  const resize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    syncReticle(); // touch: the canvas just got laid out — seed the reticle's target cell (no-op on mouse)
    render();
  };
  resize(canvas.width, canvas.height);

  // Initial load: mask the editor canvas until its block textures (wallpaper/wood) are downloaded
  // AND GPU-warmed — this is where the texture pop-in was most visible.
  const loading = Value<LoadSession | null>(null);
  void runInitialLoad(loading, { renderer, scene, camera });

  // Export the mounted level (every generated + hand-placed block, textures included) as .glb.
  const exportModel = (filename: string) => exportGlb(levelGroup, filename);

  // --- input routing ----------------------------------------------------------------------------
  // Each layer = its key fragment (editor-input.ts) + its pointer fragment (here, where the
  // gesture internals live). Mouse editing is LEFT-button only — right/middle drive the camera,
  // and the router simply has no bindings for them. On touch every pointer fragment is omitted:
  // OrbitControls owns the gestures and the reticle + on-screen buttons drive editing instead.
  const inputApi = {
    undo,
    redo,
    nudgeBuildHeight,
    startRectMode,
    rotate,
    removeSelected,
    toggleRectAxis,
    clearPart,
    eyedrop,
    focusSelection,
    activePart,
  };

  // A small drag isn't a click — the press records where it landed, the release acts on it.
  let downAt: { x: number; y: number } | null = null;

  events.layer("editor", {
    ...editorKeys(inputApi),
    ...(TOUCH
      ? {}
      : {
          pointer: {
            move: () => {
              // A grabbed item is locked to the cursor — it follows the hovered cell live (no
              // history until dropped). movePlacement keeps the index stable, so the grab stays
              // valid.
              const i = heldInstance();
              if (i != null && hoverCell) setManual(movePlacement(manualLevel(), i, hoverCell));
              updateHighlight();
            },
            left: {
              down: (e: PointerEvent) => {
                downAt = { x: e.clientX, y: e.clientY };
              },
              up: (e: PointerEvent) => {
                if (!downAt) return;
                const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
                downAt = null;
                if (moved > 4) return; // a drag, not a click
                actAt(e.clientX, e.clientY);
              },
            },
          },
        }),
  });

  // Leaving a tool layer — Esc, deselect, confirm, or a Move↔Scale switch (replace) — is THE
  // gesture cleanup path: any in-flight drag restores to its start and the axis constraint
  // drops. Gesture code only ever flips rectMode; the mirror + this lifecycle do the rest.
  const toolLifecycle = {
    _exit: () => {
      cancelRectDrag();
      rectAxis.set(null);
    },
  };

  // While a tool is armed it owns the pointer: every move feeds the in-flight gesture (a no-op
  // until a press/G/S anchors one), and no picking happens — a cluttered scene can't steal the
  // selection mid-drag.
  const toolPointer = TOUCH
    ? {}
    : {
        pointer: {
          move: (e: PointerEvent) => updateRectDrag(e.clientX, e.clientY, e.shiftKey),
          left: {
            down: (e: PointerEvent) => {
              // Armed (button) flow: the press starts a drag. A live immediate (G/S) gesture
              // ignores the press — its confirming click commits on the UP.
              if (!rectSnapshot) beginRectDrag(e.clientX, e.clientY);
            },
            up: () => {
              endRectDrag(); // release/click locks the gesture in (one undo step)
              if (rectImmediate) rectMode.set(null); // Blender flow: confirm exits to selection
            },
          },
        },
      };
  events.layer("tool:move", { ...toolKeys(inputApi), ...toolLifecycle, ...toolPointer });
  events.layer("tool:scale", { ...toolKeys(inputApi), ...toolLifecycle, ...toolPointer });

  // The texture-offset drag tool (see the gesture fns above): owns the pointer like the rect
  // tools, plus the wheel for sensitivity. Exiting the layer IS the cancel path.
  events.layer("tool:texture", {
    _enter: () => {
      renderer.domElement.style.cursor = "ew-resize";
      renderer.domElement.addEventListener("wheel", onTexWheel, { passive: false });
    },
    _exit: () => {
      cancelTexDrag();
      renderer.domElement.removeEventListener("wheel", onTexWheel);
      renderer.domElement.style.cursor = "";
    },
    key: {
      [Key.Escape]: { down: () => texMode.set(false) },
    },
    ...(TOUCH
      ? {}
      : {
          pointer: {
            move: (e: PointerEvent) => {
              if (texSnapshot) updateTexDrag(e.clientX);
            },
            left: {
              down: (e: PointerEvent) => {
                if (!texSnapshot) beginTexDrag(e.clientX);
              },
              up: () => endTexDrag(),
            },
          },
        }),
  });
  scope.effect((use) => {
    events.toggle("tool:texture", use(texMode));
  });
  // Selection moved off a texture-capable node (or its texOffset got bound) → the tool exits.
  scope.effect((use) => {
    use(selectedNode);
    use(doc);
    if (texMode.peek() && !texEligible()) texMode.set(false);
  });

  events.layer("region:draw", {
    // Entering drops any held brush/grab (the normal ghost hides while drawing); leaving
    // cancels an in-progress draw.
    _enter: () => {
      activePart.set(null);
      render();
    },
    _exit: () => {
      regionStart = null;
      regionPreview.visible = false;
      render();
    },
    ...(TOUCH
      ? {}
      : {
          pointer: {
            move: (e: PointerEvent) => {
              if (regionStart != null) updateRegionPreview(e.clientX, e.clientY); // grow the rectangle
            },
            left: {
              down: (e: PointerEvent) => {
                regionStart = pickCell(e.clientX, e.clientY); // begin a region drag
                updateRegionPreview(e.clientX, e.clientY);
              },
              up: (e: PointerEvent) => endRegionDraw(e.clientX, e.clientY), // commit as a floor region
            },
          },
        }),
  });
  scope.effect((use) => {
    events.toggle("region:draw", use(regionMode));
  });

  // Fly camera: a router layer so entering/exiting IS the mode switch — _enter/_exit own the
  // whole setup/teardown (orbit handoff, FlyControls lifetime, the per-frame RAF this
  // render-on-demand surface otherwise lacks), and the catch-alls mask every editing binding
  // below while the camera is in flight (FlyControls reads keys via its own window listeners).
  // Escape (which also releases the browser's pointer lock) drops back to orbit.
  let fly: ReturnType<typeof FlyControls> | null = null;
  let flyRaf = 0;
  let flyRadius = 10; // orbit radius going in — reused to re-anchor the target coming out
  // The browser reserves Esc to release a pointer lock (the keydown never reaches the page), so
  // losing the lock IS the exit signal: lock gone → back to orbit. (The layer's own Escape
  // binding below covers the never-locked case, e.g. a denied lock request.)
  const onFlyLockChange = () => {
    if (document.pointerLockElement !== renderer.domElement) cameraFly.set(false);
  };
  events.layer("view:fly", {
    _enter: () => {
      flyRadius = controls.target.distanceTo(camera.position);
      controls.enabled = false;
      fly = FlyControls(camera, renderer.domElement, { movementSpeed: 8 });
      // Capture the mouse immediately — entering fly is itself the user gesture (the toggle
      // click reaches here synchronously: Value listeners run inline), so the request is allowed.
      renderer.domElement.requestPointerLock();
      document.addEventListener("pointerlockchange", onFlyLockChange);
      let last = performance.now();
      const step = (t: number) => {
        const dt = Math.min((t - last) / 1000, 0.1);
        last = t;
        fly?.update(dt);
        render();
        flyRaf = requestAnimationFrame(step);
      };
      flyRaf = requestAnimationFrame(step);
    },
    _exit: () => {
      document.removeEventListener("pointerlockchange", onFlyLockChange);
      cancelAnimationFrame(flyRaf);
      fly?.dispose();
      fly = null;
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      // Re-anchor the orbit on whatever we're looking at now: same radius, new view direction —
      // so the first right-drag orbits around the spot ahead instead of the stale target.
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      controls.target.copy(camera.position).addScaledVector(dir, flyRadius);
      controls.enabled = true;
      controls.update(); // fires "change" → render
    },
    key: {
      [Key.Escape]: { down: () => cameraFly.set(false) },
      _any: () => {},
    },
    pointer: { _any: () => {} },
  });
  scope.effect((use) => {
    events.toggle("view:fly", use(cameraFly));
  });

  return {
    renderer,
    events,
    resize,
    exportModel,
    focusPoint,
    tile,
    doc,
    level,
    manual: manualV,
    setDoc,
    viewDoc,
    setViewDoc,
    editPath,
    enterComponent,
    exitComponent,
    selectedNode,
    rectMode,
    rectAxis,
    rectDragging,
    texMode,
    texSensitivity,
    snapEnabled,
    startTexMode,
    startRectMode,
    toggleRectAxis,
    activeFacing,
    activePart,
    selected,
    setSelectedParam,
    previewCull,
    cameraFly,
    regionMode,
    hovered,
    showNav,
    navWarning,
    showGizmo,
    buildHeight,
    nudgeBuildHeight,
    canUndo,
    canRedo,
    setLevel,
    loadDoc,
    loadLevel,
    markClean,
    isDirty,
    undo,
    redo,
    holdBlock,
    clearPart,
    rotate,
    removeSelected,
    eyedrop,
    actAtReticle,
    focusSelection,
    loading,
    palette,
  };
};

// Reset helpers React can use without reaching into internals.
export const editorEmptyLevel = emptyLevel;
export const editorSampleLevel = (): Level => manorLevel;
export const editorCottageLevel = (): Level => cottageLevel;

// The built-in sample DOCS live in their own module (pure data); re-exported here so existing
// importers (LevelEditorView, the eval tests) keep their import path.
export {
  editorSampleDoc,
  editorComponentDoc,
  editorCottageDoc,
  editorManorDoc,
  fixtureManorDoc,
} from "./sample-docs";

