// Gate OrbitControls wheel-zoom behind the Shift key. When `enableZoom` is false the controls'
// wheel handler bails *before* preventDefault (orbit-controls.js:1168), so an unmodified scroll
// over the canvas scrolls the PAGE as normal; holding Shift re-enables zoom. Returns a cleanup
// that removes the key listeners.
export const shiftToZoom = (controls: { enableZoom: boolean }): (() => void) => {
  controls.enableZoom = false;

  const sync = (e: KeyboardEvent) => {
    controls.enableZoom = e.shiftKey;
  };
  const clear = () => {
    controls.enableZoom = false; // avoid Shift getting "stuck" if the window loses focus
  };

  window.addEventListener("keydown", sync);
  window.addEventListener("keyup", sync);
  window.addEventListener("blur", clear);

  return () => {
    window.removeEventListener("keydown", sync);
    window.removeEventListener("keyup", sync);
    window.removeEventListener("blur", clear);
  };
};
