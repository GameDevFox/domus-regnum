import { useEffect, useRef } from "react";

// Dismiss a popover when the user clicks/taps outside it (and, opt-in, on Escape). Returns a ref to
// attach to the popover's outer element; listeners are only wired while `enabled`, in the CAPTURE
// phase so the dismiss beats any inner handler that might stopPropagation. `pointerdown` covers mouse
// and touch in one go. The callback is held in a ref so passing an inline `() => setOpen(false)`
// doesn't re-subscribe every render. Consolidates the ColorPicker + node-canvas Organize copies.
export const useClickOutside = <T extends HTMLElement>(
  enabled: boolean,
  onDismiss: () => void,
  { escape = false }: { escape?: boolean } = {},
) => {
  const ref = useRef<T>(null);
  const cb = useRef(onDismiss);
  cb.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cb.current();
    window.addEventListener("pointerdown", onDown, true);
    if (escape) window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      if (escape) window.removeEventListener("keydown", onKey);
    };
  }, [enabled, escape]);

  return ref;
};
