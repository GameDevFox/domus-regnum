import { WebGLRenderer } from "three";
import { XRButton } from "three/examples/jsm/webxr/XRButton";

const alpha = true;

export interface RendererOptions {
  // Enable WebXR + the enter-VR button. Off for headless test harnesses that
  // drive the scene without a real XR session. Defaults on (unchanged behaviour).
  enableXR?: boolean,
};

export const Renderer = ({ enableXR = true }: RendererOptions = {}) => {
  const renderer = new WebGLRenderer({
    alpha,
    antialias: true,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.xr.enabled = enableXR;

  return renderer;
};

export const installRenderer = ({ enableXR = true }: RendererOptions = {}) => {
  const renderer = Renderer({ enableXR });

  const div = document.getElementById("webgl");
  if(div === null)
    throw new Error("Couldn't find `div` with \"webgl\" id");
  div.appendChild(renderer.domElement);

  if(enableXR) {
    const xrButton = XRButton.createButton(
      renderer,
      // { requiredFeatures: ["hand-tracking"] },
    );
    document.body.appendChild(xrButton);
  }

  return renderer;
};
