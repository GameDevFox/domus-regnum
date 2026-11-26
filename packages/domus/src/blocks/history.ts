import { Value } from "@kitsune/common-web/src/value";

// A generic undo/redo history over an immutable value. Every editing op produces a NEW value (see
// blocks/edit.ts), so history is just three things: the current `value` Value, an undo stack, and a
// redo stack. Pure bookkeeping — no Three, no DOM — so it's trivially unit-tested and reusable by
// anything that edits an immutable document (the level editor today; prefab/material editors later).
//
//   commit(next) — make `next` current, pushing the old value for undo, clearing the redo branch.
//   undo()/redo() — step along the timeline.
//   (A history-less "replace" swap doesn't exist here — silent resets just `value.set(...)` directly.)
export type History<T> = {
  value: Value<T>;
  canUndo: Value<boolean>;
  canRedo: Value<boolean>;
  commit: (next: T) => void;
  // Record that `value` moved from `prev` to its CURRENT value as a single undoable step. For
  // interactions that drive `value.set(...)` live (e.g. dragging an item around) and want the whole
  // gesture to undo in one go: snapshot before, edit live, then commitLive(snapshot) on release.
  commitLive: (prev: T) => void;
  undo: () => void;
  redo: () => void;
};

export const History = <T,>(initial: T): History<T> => {
  const value = Value<T>(initial);
  const undoStack: T[] = [];
  const redoStack: T[] = [];
  const canUndo = Value(false);
  const canRedo = Value(false);

  const sync = () => {
    canUndo.set(undoStack.length > 0);
    canRedo.set(redoStack.length > 0);
  };

  const commit = (next: T) => {
    undoStack.push(value.peek());
    redoStack.length = 0;
    value.set(next);
    sync();
  };

  const commitLive = (prev: T) => {
    undoStack.push(prev);
    redoStack.length = 0;
    sync(); // value is already current (set live during the gesture)
  };

  const undo = () => {
    const prev = undoStack.pop();
    if (prev === undefined) return;
    redoStack.push(value.peek());
    value.set(prev);
    sync();
  };

  const redo = () => {
    const next = redoStack.pop();
    if (next === undefined) return;
    undoStack.push(value.peek());
    value.set(next);
    sync();
  };

  return { value, canUndo, canRedo, commit, commitLive, undo, redo };
};
