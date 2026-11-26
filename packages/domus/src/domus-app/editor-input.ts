import { HandlerTree } from "@kitsune/common";
import { Key } from "@kitsune/common-web";
import { STOREY_RISE } from "../blocks/dims";

// The Builder's editor-owned KEY bindings, as EventRouter handler-tree fragments (see
// docs/event-router.md at the repo root). level-editor.ts assembles each layer from these plus
// its pointer fragments — one assembly point per layer, since layer() replaces wholesale.
// Layer stack, bottom → top:
//
//   "editor"                  — always-on defaults while the Builder tab is mounted
//   "editor-ui"               — React-coupled bindings (palette toggle; use-editor-shortcuts.ts)
//   "region:draw"             — floor-region painting (mirrors the regionMode toggle)
//   "tool:move" / "tool:scale" — entered while a Move/Scale tool is armed (level-editor mirrors
//                                rectMode into the stack), so X/Y become the Blender axis
//                                constraint and shadow the editor bindings below
//
// The DOM adapter (attachDomInput) is attached by the Builder view on mount, so none of these
// fire on the Game/Debug tabs. Handlers receive the DOM KeyboardEvent; ids are physical key
// codes (`KeyboardEvent.code` via the `Key` constants), so bindings are layout-independent.

// The slice of the editor app the bindings call into (structural, to avoid a circular import
// with level-editor.ts).
export type EditorInputApi = {
  undo: () => void;
  redo: () => void;
  nudgeBuildHeight: (delta: number) => void;
  startRectMode: (mode: "move" | "scale", immediate?: boolean) => void;
  rotate: () => void;
  removeSelected: () => void;
  toggleRectAxis: (axis: "x" | "z") => void;
  clearPart: () => void;
  eyedrop: () => void;
  focusSelection: () => void;
  activePart: { peek: () => unknown };
};

// Ctrl/Cmd chords belong to the browser (and the undo binding) — plain-key bindings decline
// them, passing the event through unhandled.
const noMods = (fn: (e: KeyboardEvent) => unknown) => (e: KeyboardEvent) =>
  e.ctrlKey || e.metaKey ? false : fn(e);

// Inside the node-graph canvas X/Delete belong to react-flow (delete the selected edge/node) —
// the binding stands down and the DOM event reaches react-flow's own listeners untouched.
const inNodeCanvas = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement | null)?.closest?.('[data-testid="node-canvas"]');

// Build-plane nudge steps (m). Keep in sync with BuildHeightControl's HEIGHT_NUDGE.
const BASE_STEP = 0.5;
const FINE_STEP = 0.1;

export const editorKeys = (app: EditorInputApi): HandlerTree => {
  // Blender-style: delete the grabbed item.
  const remove = noMods((e: KeyboardEvent) => {
    if (inNodeCanvas(e)) return false;
    e.preventDefault();
    app.removeSelected();
  });

  // Multi-level build plane: plain = ½ m snap, Shift = storey jump (STOREY_RISE), Alt = 0.1 m fine.
  // e2e asserts the resulting "Height:" texts — values are load-bearing.
  // preventDefault so the page doesn't scroll.
  const buildStep = (e: KeyboardEvent) => (e.shiftKey ? STOREY_RISE : e.altKey ? FINE_STEP : BASE_STEP);
  const nudge = (sign: number) =>
    noMods((e: KeyboardEvent) => {
      e.preventDefault();
      app.nudgeBuildHeight(sign * buildStep(e));
    });

  return {
    key: {
      // Ctrl/Cmd+Z undo (+Shift redo) — the one chord binding; plain Z passes through.
      [Key.Z]: {
        down: (e: KeyboardEvent) => {
          if (!(e.ctrlKey || e.metaKey)) return false;
          e.preventDefault();
          if (e.shiftKey) app.redo();
          else app.undo();
        },
      },
      [Key.PageUp]: { down: nudge(1) },
      [Key.PageDown]: { down: nudge(-1) },
      // Blender G/S: the gesture starts IMMEDIATELY (the primitive follows the cursor, click
      // confirms). Toggles; no-op unless a primitive is selected.
      [Key.G]: { down: noMods(() => app.startRectMode("move", true)) },
      [Key.S]: { down: noMods(() => app.startRectMode("scale", true)) },
      // Rotate the grabbed instance, or cycle the place facing (walls/doors) when none grabbed.
      [Key.R]: { down: noMods(() => app.rotate()) },
      // Idle X deletes, like Delete/Backspace. (The tool layers shadow this with the axis
      // constraint while Move/Scale is armed.)
      [Key.X]: { down: remove },
      [Key.Delete]: { down: remove },
      [Key.Backspace]: { down: remove },
      // Factorio-style: hold something ⇒ clear it; hold nothing ⇒ eyedrop the block under cursor.
      [Key.Q]: {
        down: noMods(() => {
          if (app.activePart.peek()) app.clearPart();
          else app.eyedrop();
        }),
      },
      // Blender convention: frame the camera on the selection (or the hovered cell).
      [Key.Period]: { down: noMods(() => app.focusSelection()) },
      // Esc: clear what's held / cancel-or-exit the active tool (clearPart routes internally).
      [Key.Escape]: { down: noMods(() => app.clearPart()) },
    },
  };
};

// Mid-tool the X/Z keys are the axis constraint (X key → world X, Z key → world Z), matching the
// world-space coordinate model. `noMods` lets Ctrl+Z (undo) fall through to the editor layer below;
// everything else unbound here (G/S/R/Q/Esc/…) falls through too.
export const toolKeys = (app: EditorInputApi): HandlerTree => ({
  key: {
    [Key.X]: { down: noMods(() => app.toggleRectAxis("x")) },
    [Key.Z]: { down: noMods(() => app.toggleRectAxis("z")) },
  },
});
