import {
  Camera,
  CanvasTexture,
  OrthographicCamera,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector4,
  WebGLRenderer,
} from "three";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

// Blender-style orientation gizmo for the editor's TOP-right corner. We reuse three's ViewHelper for
// its labelled axis balls but render it ourselves (its built-in render() is bottom-right only), with
// our own ortho camera. Labels map to our world convention: +X = east, +Y = up, +Z = south.
//
// Self-contained so the editor doesn't carry the ViewHelper plumbing: the caller sets
// `renderer.autoClear = false`, draws its scene, then calls `draw(renderer)` to overlay the gizmo.
// Browser-only (builds canvas textures) — same as the block materials.
export type ViewGizmo = {
  helper: ViewHelper;
  draw: (renderer: WebGLRenderer) => void;
};

const DIM = 116; // gizmo viewport size in px
// Shift the gizmo left of the canvas's top-right icon toggles (Nav/Gizmo) so they don't overlap.
// Tuned so the gap between the gizmo's visible balls and the buttons matches the buttons' inset from
// the frame edge (Tailwind `*-3` = 12px). In CSS px; converted to drawing-buffer px at draw time.
const RIGHT_MARGIN = 34;

// A flat colored ball sprite, replacing ViewHelper's baked-black negative-axis balls so each matches
// its axis color (X red / Y green / Z blue), line-less and label-less.
const axisBall = (style: string): SpriteMaterial => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(32, 32, 14, 0, 2 * Math.PI);
  ctx.fillStyle = style;
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new SpriteMaterial({ map: texture, toneMapped: false });
};

const NEG_COLORS: Record<string, string> = {
  negX: "#ff4466",
  negY: "#88ff44",
  negZ: "#4488ff",
};

export const createViewGizmo = (camera: Camera, domElement: HTMLElement): ViewGizmo => {
  const helper = new ViewHelper(camera, domElement);
  helper.setLabels("X", "Y", "Z");
  helper.traverse((obj) => {
    const style = NEG_COLORS[obj.userData.type as string];
    if (style) (obj as Sprite).material = axisBall(style);
  });

  const gizmoCamera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
  gizmoCamera.position.set(0, 0, 2);
  const savedViewport = new Vector4();
  const bufferSize = new Vector2();

  // Overlay the gizmo near the top-right corner, shifted left of the icon toggles. Assumes the caller
  // has already cleared + drawn the main scene with renderer.autoClear = false (so this only clears
  // depth, not color).
  const draw = (renderer: WebGLRenderer): void => {
    helper.quaternion.copy(camera.quaternion).invert();
    helper.updateMatrixWorld();
    renderer.clearDepth();
    renderer.getDrawingBufferSize(bufferSize);
    renderer.getViewport(savedViewport);
    // CSS px → drawing-buffer px so the offset is consistent across pixel ratios.
    const scale = bufferSize.x / (domElement.clientWidth || bufferSize.x);
    const marginX = RIGHT_MARGIN * scale;
    renderer.setViewport(bufferSize.x - DIM - marginX, bufferSize.y - DIM, DIM, DIM);
    renderer.render(helper, gizmoCamera);
    renderer.setViewport(savedViewport.x, savedViewport.y, savedViewport.z, savedViewport.w);
  };

  return { helper, draw };
};
