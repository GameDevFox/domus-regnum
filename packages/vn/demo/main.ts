// Hybrid demo: proves the render sandwich.
//
//   [3D game scene]  →  [VN sprite pass]  →  [DOM dialogue box]
//   (in the canvas)     (in the canvas)       (DOM over the canvas)
//
// One WebGL canvas renders a live 3D scene (a slowly tumbling shape — stand-in for the game), then
// the VN sprite layer composites over it via clearDepth (same trick domus uses for its 2D overlay).
// The semi-transparent meadow backdrop lets the 3D scene show through. The dialogue box + choices
// are DOM on top, where text and input belong.

import {
  AmbientLight,
  Color,
  DirectionalLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TorusKnotGeometry,
  WebGLRenderer,
} from "three";

import { mountStage } from "../src/dom/stage";
import { mountSprites } from "../src/three/index";
import { collectImages, VNEngine } from "../src/index";

import { resolveImage } from "./assets";
import { demoScript } from "./script";

const canvas = document.getElementById("vn-canvas") as HTMLCanvasElement;
const stageEl = document.getElementById("stage") as HTMLElement;

// ---- the WebGL canvas + a placeholder 3D "game" scene ----
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.autoClear = false; // we clear manually so we can render in passes

const gameScene = new Scene();
gameScene.background = new Color(0x0d1020);
const gameCamera = new PerspectiveCamera(50, 1, 0.1, 100);
gameCamera.position.set(0, 0, 6);

gameScene.add(new AmbientLight(0xffffff, 0.6));
const key = new DirectionalLight(0xfff0d0, 2.2);
key.position.set(3, 4, 5);
gameScene.add(key);

const knot = new Mesh(
  new TorusKnotGeometry(1.1, 0.34, 160, 24),
  new MeshStandardMaterial({ color: 0x6fa8ff, roughness: 0.3, metalness: 0.4, emissive: 0x10204a }),
);
gameScene.add(knot);
const orb = new Mesh(
  new IcosahedronGeometry(0.5, 0),
  new MeshStandardMaterial({ color: 0xffcf6f, roughness: 0.5, emissive: 0x3a2400 }),
);
orb.position.set(2.6, 1.6, -1);
gameScene.add(orb);

// ---- the VN engine + the two render layers ----
const engine = VNEngine(demoScript, { now: () => performance.now() });
const sprites = mountSprites(engine, { resolveImage });
// dialogue + choices only; opt into the typewriter here to demonstrate it (it's off by default).
mountStage(engine, stageEl, { resolveImage, sprites: false, textSpeed: 45 });

const resize = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  gameCamera.aspect = w / h;
  gameCamera.updateProjectionMatrix();
};
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((t) => {
  knot.rotation.x = t * 0.0004;
  knot.rotation.y = t * 0.0006;
  orb.rotation.y = t * 0.001;

  renderer.clear(); // color + depth
  renderer.render(gameScene, gameCamera); // 1. the 3D game
  renderer.clearDepth(); // 2. so the VN layer isn't depth-occluded
  sprites.render(renderer); // 3. the VN sprite pass, composited over the game
  // 4. the DOM dialogue box composites on top via normal DOM stacking
});

// Preload every image the scene references BEFORE starting, so nothing pops in untextured. The
// progress callback is where a real loading bar would hook in.
void sprites
  .preload(collectImages(demoScript), (p) => console.log(`[vn] preloaded ${p.loaded}/${p.total}`))
  .then(() => engine.start("start"));

declare global {
  interface Window {
    vn: {
      advance: () => void;
      choose: (i: number) => void;
      status: () => string;
      snapshot: () => unknown;
    };
  }
}

window.vn = {
  advance: () => engine.advance(),
  choose: (i) => engine.choose(i),
  status: () => engine.status(),
  snapshot: () => engine.snapshot(),
};
