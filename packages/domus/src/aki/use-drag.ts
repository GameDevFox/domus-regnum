import { useRef, useState } from "react";

// Pointer-drag plumbing shared by the Aki views: captures the pointer, tracks the cumulative pixel
// delta from press, and reports a `dragging` flag for the cursor. The caller snapshots whatever it's
// dragging in `onStart` and maps the delta to its own Value in `onDrag`.
export const useDrag = (opts: { onStart?: () => void; onDrag: (dxPx: number, dyPx: number) => void; onEnd?: () => void }) => {
  const start = useRef({ active: false, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { active: true, x: e.clientX, y: e.clientY };
      opts.onStart?.();
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current.active) return;
      opts.onDrag(e.clientX - start.current.x, e.clientY - start.current.y);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current.active) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      start.current.active = false;
      setDragging(false);
      opts.onEnd?.();
    },
  };
  // pointercancel ends the drag the same way as pointerup
  return { dragging, handlers: { ...handlers, onPointerCancel: handlers.onPointerUp } };
};
