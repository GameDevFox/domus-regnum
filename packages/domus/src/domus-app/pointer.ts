// Coarse-pointer (touch) detection. A phone/tablet reports `(pointer: coarse)`; a mouse/trackpad
// reports `(pointer: fine)`. Used to switch domus onto its touch control scheme (reticle + on-screen
// action bar) instead of the desktop hover + right-drag model.
export const isCoarsePointer = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
