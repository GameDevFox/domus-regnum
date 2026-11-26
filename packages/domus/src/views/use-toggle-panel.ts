import { useCallback, useState } from "react";

// The open/close boolean every collapsible overlay (palettes, the Files modal, the outliner) was
// re-hand-rolling: `useState(false)` plus a `setOpen((v) => !v)` toggle. Returns the flag alongside
// stable `toggle`/`show`/`close` handlers (and the raw setter for the rare conditional case), so a
// panel is one line: `const palette = useTogglePanel();` → `palette.open`, `palette.toggle`.
export const useTogglePanel = (initial = false) => {
  const [open, setOpen] = useState(initial);
  return {
    open,
    toggle: useCallback(() => setOpen((v) => !v), []),
    show: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
    set: setOpen,
  };
};
