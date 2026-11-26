import { Box3, Group, Object3D, PointLight, Vector3, WebGLRenderer } from "three";

import { yawBillboard } from "@kitsune/common-web";

import { color, lazyModel, num } from "../block-materials";
import { BlockParams } from "../types";

// GLB-backed block kinds — geometry authored in Blender, loaded lazily (see `lazyModel`). Unlike the
// procedural kinds these can't build synchronously; the factory returns an (initially empty) group
// and populates it once the model arrives, so a level mounts immediately and fills in on load.

const getCandlestick = lazyModel("/models/candlestick.glb");

// Flame meshes are authored in the GLB named `Flame.*` (e.g. Flame.Left/Center/Right) — the `on`
// toggle shows/hides them and they yaw-billboard to face the camera (flat planes). Exported so the
// Game Demo's decorative candlesticks (domus-app/scene.ts) match the same naming + billboard.
export const isFlame = (o: Object3D): boolean => o.name.toLowerCase().startsWith("flame");

// Candle flicker mirroring the Game Demo's loop (domus-app/animate.ts): frame-based, a 3%/frame
// chance to start a ≤30-frame dip, intensity easing between (base − 1.5) and base. Driven off a
// model mesh's onBeforeRender so it needs no per-frame plumbing — and a frame guard (the renderer's
// frame counter) so the extra shadow-map pass doesn't double-tick it.
const attachFlicker = (ticker: Object3D, light: PointLight, base: number) => {
  const maxDuration = 30;
  const intensityFactor = 1.5;
  let flicker = 0;
  let lastFrame = -1;
  ticker.onBeforeRender = (renderer: WebGLRenderer) => {
    const frame = renderer.info.render.frame;
    if (frame === lastFrame) return; // already ticked this frame (e.g. the shadow pass)
    lastFrame = frame;
    if (flicker === 0) {
      light.intensity = base;
      if (Math.random() > 0.97) flicker = Math.random() * maxDuration;
    } else {
      light.intensity = ((maxDuration - flicker) / maxDuration) * intensityFactor + (base - intensityFactor);
      flicker = Math.max(flicker - 1, 0);
    }
  };
};

// A wall candelabra (the Game Demo's candlestick.glb). Mounted by a POINT on the wall line + a
// `height` (see the parametric `candelabra` kind), so the model is prepped to make both work:
//   • DEPTH — its back plate is shifted to local z=0, so a point ON the wall line sits the model
//     flush against it (the raw model's back is at z≈−0.11 — it'd half-embed otherwise).
//   • HEIGHT — its bounding box is x/y-CENTERED on the origin, so the placement's y positions the
//     model's center: y=0 centers it on the vertical origin, the kind's default lifts it to the
//     lower-sconce height. (The raw model's origin sits up at the candle cups, not its middle.)
// A warm, FLICKERING point light sits at the candle cups (toggle with `on`/the kind's checkbox).
export const Candelabra = (_scope: unknown, params: BlockParams) => {
  const on = params.on !== false; // default lit
  const lightColor = color(params, "color", 0xffb060); // warm candle flame
  const base = num(params, "intensity", 8);
  const distance = num(params, "distance", 4);
  const group = new Group();

  getCandlestick((model) => {
    const box = new Box3().setFromObject(model);
    const center = box.getCenter(new Vector3());
    const offset = new Group();
    offset.position.set(-center.x, -center.y, -box.min.z); // x/y center on origin; back plate → z=0

    const flames: Object3D[] = [];
    let ticker: Object3D | null = null; // a SOLID mesh to drive the flicker (not a flame, whose
    model.traverse((o) => {                                          // onBeforeRender we own below)
      if (!(o as { isMesh?: boolean }).isMesh) return;
      if (isFlame(o)) {
        flames.push(o);
        o.castShadow = false; // a flame casting a shadow looks wrong
      } else {
        o.castShadow = true;
        ticker ??= o;
      }
    });
    offset.add(model);
    group.add(offset);

    // `on` is the LIT state: show + yaw-billboard the flame planes (face the camera horizontally) and
    // add the warm flickering light. Off hides the flame geometry AND the light entirely.
    flames.forEach((f) => {
      f.visible = on;
      if (on) yawBillboard(f);
    });

    if (on) {
      const light = new PointLight(lightColor, base, distance, 1.6);
      // At the candle cups: top of the model, at the cups' depth (raw model z≈0 → local −box.min.z).
      light.position.set(-center.x, box.max.y - center.y - 0.05, -box.min.z);
      group.add(light);
      if (ticker) attachFlicker(ticker, light, base);
    }
  });
  return { mesh: group };
};
