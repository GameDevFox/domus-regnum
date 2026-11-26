import { Camera, Vector3 } from "three";

import { Scope } from "./scope";

// Keyboard panning for orbit-style cameras: held keys glide the orbit TARGET camera-relative,
// dragging the camera along so the framing holds. Two flavors (see panBasis): floor mode slides
// across the ground plane; fly mode follows the full view direction, so pitching down and holding
// forward DESCENDS. Runs its own RAF only while a key is held — render-on-demand views (the
// Builder) repaint exactly as long as needed and go idle again.
//
// Key maps are configurable because tabs differ: the Builder binds G/S to the rect modal, so it
// pans with ARROWS only; the game's free camera takes WASD + arrows.

export type PanControls = { target: Vector3; update: () => void };

export type WasdPanOptions = {
  speed?: number; // world units per second (default 6)
  keys?: { forward: string[]; back: string[]; left: string[]; right: string[] };
  // Fly mode: forward keeps the camera's pitch (look down + W descends, look up + W climbs).
  // Default floor mode flattens forward onto XZ — right for the Builder's grid view, where
  // vertical drift would fight the build plane.
  fly?: boolean;
  // Stand down while false — for views whose camera is temporarily owned by something else
  // (the Builder's fly mode also reads the arrow keys). Checked per keypress AND per frame, so
  // flipping mid-glide stops the glide.
  enabled?: () => boolean;
};

// The camera-relative movement basis. Forward is the view direction — flattened onto the ground
// in floor mode, full 3D in fly mode. Strafe stays horizontal in both (FPS-style), with stable
// fallbacks when the view is straight down and no horizontal heading exists.
export const panBasis = (camera: Camera, fly: boolean): { fwd: Vector3; right: Vector3 } => {
  const fwd = new Vector3();
  camera.getWorldDirection(fwd);
  if (!fly) {
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); // looking straight down: pick a stable forward
  }
  fwd.normalize();

  const right = new Vector3(-fwd.z, 0, fwd.x); // fwd × up, kept horizontal
  if (right.lengthSq() < 1e-6) right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0); // straight down: the camera's own right
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();

  return { fwd, right };
};

const DEFAULT_KEYS = {
  forward: ["w", "arrowup"],
  back: ["s", "arrowdown"],
  left: ["a", "arrowleft"],
  right: ["d", "arrowright"],
};

export const mountKeyPan = (
  scope: Scope,
  controls: PanControls,
  camera: Camera,
  { speed = 6, keys = DEFAULT_KEYS, fly = false, enabled = () => true }: WasdPanOptions = {},
): void => {
  const all = new Set([...keys.forward, ...keys.back, ...keys.left, ...keys.right]);
  const held = new Set<string>();
  let raf: number | null = null;
  let lastT = 0;

  const step = (t: number) => {
    if (!enabled()) {
      held.clear();
      raf = null;
      return;
    }
    const dt = Math.min(Math.max(t - lastT, 0) / 1000, 0.05);
    lastT = t;

    const { fwd, right } = panBasis(camera, fly);

    const move = new Vector3();
    if (keys.forward.some((k) => held.has(k))) move.add(fwd);
    if (keys.back.some((k) => held.has(k))) move.sub(fwd);
    if (keys.right.some((k) => held.has(k))) move.add(right);
    if (keys.left.some((k) => held.has(k))) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      controls.target.add(move);
      camera.position.add(move);
      controls.update();
    }
    raf = held.size > 0 ? requestAnimationFrame(step) : null;
  };

  const isTyping = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  };

  const onDown = (e: KeyboardEvent) => {
    if (!enabled()) return;
    const k = e.key.toLowerCase();
    if (!all.has(k) || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    e.preventDefault(); // arrows would scroll the page
    if (held.size === 0 && raf === null) {
      lastT = performance.now();
      raf = requestAnimationFrame(step);
    }
    held.add(k);
  };
  const onUp = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
  // Defensive: losing window focus mid-hold would otherwise leave keys stuck "down".
  const onBlur = () => held.clear();

  scope.listen(window, "keydown", onDown);
  scope.listen(window, "keyup", onUp);
  scope.listen(window, "blur", onBlur);
  scope.add(() => {
    if (raf !== null) cancelAnimationFrame(raf);
    held.clear();
  });
};
