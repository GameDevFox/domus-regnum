import { Color, SRGBColorSpace, WebGLRenderer } from "three";

import { DomusApp } from ".";

export const buildRenderer = ({ canvas }: Pick<DomusApp, "canvas">) => {
  const renderer = new WebGLRenderer({
    canvas,

    // alpha: true,
    antialias: true,
    // Keep the last frame readable so right-click "Save image"/"Copy" (and toDataURL screenshots)
    // capture the scene instead of a blank buffer. Minor cost; fine for this app.
    preserveDrawingBuffer: true,
  });

  renderer.autoClear = false;
  renderer.setClearColor(new Color().setHex(0x202020, SRGBColorSpace));
  renderer.setSize(canvas.width, canvas.height);

  return renderer;
};

export const cleanUpRenderer = (renderer: WebGLRenderer) => {
  renderer.setAnimationLoop(() => {});
};

if (import.meta.hot) {
  import.meta.hot.accept();
  window.Kitsune?.updateDep("renderer", buildRenderer);
}
