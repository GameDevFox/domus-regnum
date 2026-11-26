import { MOUSE, Vector3 } from "three";

import { r90 } from "@kitsune/common";
import { DirectOrbitControls, FlyControls, frameDelta, mountKeyPan } from "@kitsune/common-web";
import { children } from "@kitsune/common-web/src/registry";
import { Scope } from "@kitsune/common-web/src/scope";

import { watch } from "../common/watch-log";
import { iconsTexture } from "../domus/materials";
import { OrbitControls } from "../domus/orbit-controls";
import { spawnIcons } from "../domus/spawn-icons";

import { DomusApp } from ".";
import { mountMascotWander } from "./mascot-wander";
import { shiftToZoom } from "./shift-to-zoom";

type CompositionDeps = Pick<
  DomusApp,
  | "scene"
  | "camera"
  | "renderer"
  | "sceneObjects"
  | "time"
  | "cameraMode"
  | "cameraZoom"
  | "showItems"
  | "showBlocks"
  | "showConsole"
  | "console2d"
>;

// Controlled-mode auto-orbit: a fixed high pitch, one slow revolution per period.
const AUTO_ORBIT_PITCH_FRAC = 1 / 8; // pitch = r90 · (1 − this) — slightly below straight-down
const ORBIT_HALF_TURN_MS = 5000; // ms per π of theta (10 s per full revolution)

// The zoom slider's range, as orbit radii: slider 0 = ZOOM_FAR, 1 = ZOOM_NEAR.
const ZOOM_FAR = 20;
const ZOOM_NEAR = 7; // closer than this and the camera dips into the room geometry
const zoomRadius = (z: number) => ZOOM_FAR - z * (ZOOM_FAR - ZOOM_NEAR);
// The inverse: an orbit radius back to a slider position (clamped — the controls clamp the
// camera to the same range, so the mapping stays a bijection).
const radiusZoom = (radius: number) =>
  Math.min(1, Math.max(0, (ZOOM_FAR - radius) / (ZOOM_FAR - ZOOM_NEAR)));

// The reactive scene composition. Replaces the old `ThreeComponents` manager: each toggleable
// piece is now a `when` keyed off a Value<boolean>, so flipping the Value mounts/unmounts it
// (cleanup runs on unmount). Per-frame work is a `scope.effect` reading `time` — set once per
// frame in `buildAnimate` — so the effect re-runs every frame while its branch is mounted.
export const buildComposition = ({
  scene,
  camera,
  renderer,
  sceneObjects,
  time,
  cameraMode,
  cameraZoom,
  showItems,
  showBlocks,
  showConsole,
  console2d,
}: CompositionDeps): Scope => {
  const scope = Scope();

  // The in-world console2 debug overlay: hidden by default, toggled by the backtick key (see
  // GameControls). A persistent effect (not inside a camera `when`) so visibility tracks the Value
  // regardless of camera mode.
  scope.effect((use) => {
    console2d.mesh.visible = use(showConsole);
  });

  // The mascot's random walks on the floor graph (see mascot-wander.ts). Its live position is a
  // Value, so the camera-follow below depends on it EXPLICITLY — no reliance on what order the
  // frame loop happens to run things in.
  const mascotPosition = mountMascotWander(scope, time, sceneObjects.mascot);

  children(scope, scene, (kids) => {
    const { when, match } = kids;

    // The camera tri-state: exactly one branch mounted per mode (match tears the old one
    // down on switch — no per-mode boolean computeds needed).
    match(cameraMode, {
      // Camera "Controlled": auto-orbit that tracks the mascot.
      controlled: ({ scope }) => {
      const controls = DirectOrbitControls(camera, new Vector3(0, 0.5, -1));
      // Guards the orbit readout to once per FRAME: this effect ALSO depends on mascotPosition (for
      // target.y), which the wander updates mid-frame — so a moving mascot fires the effect twice per
      // frame. The camera should re-run (target follows the mascot); the log should not double.
      let loggedT = -1;
      scope.effect((use) => {
        const t = use(time);

        controls.phi = r90 * (1 - AUTO_ORBIT_PITCH_FRAC);
        controls.radius = zoomRadius(use(cameraZoom)); // the left-edge slider

        controls.target.y = use(mascotPosition).y;
        // controls.target.copy(use(mascotPosition));

        controls.theta = (t / ORBIT_HALF_TURN_MS) * Math.PI;

        controls.update();

        // Live camera-orbit readout to console2 (radius = zoom, phi = pitch, theta = yaw). Lost in
        // the OldBuilder→Builder migration (4e78142), restored here. Press ` to show/hide console2.
        if (t === loggedT) return;
        loggedT = t;
        const { radius, phi, theta } = controls;
        watch.log("Orbit:", { radius, phi, theta });
      });
      },

      // Camera "Click & Drag": user-driven orbit. Disconnects on unmount.
      manual: ({ scope }) => {
      const controls = new OrbitControls(camera);
      controls.target = new Vector3(0, 2, -1);
      controls.enableDamping = true;
      // Blender-style, matching the Builder: RIGHT-drag orbits, Ctrl/Cmd+RIGHT pans; zoom is Shift+
      // Scroll (MIDDLE disabled — middle-drag triggers the browser's autoscroll on Firefox/Linux).
      controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
      // Keep manual zoom inside the slider's range (also keeps the camera out of the room
      // geometry) — this is what makes slider ↔ radius a clean bijection.
      controls.minDistance = ZOOM_NEAR;
      controls.maxDistance = ZOOM_FAR;
      controls.connect(renderer.domElement);
      scope.add(() => controls.disconnect());
      scope.add(shiftToZoom(controls)); // Shift+Scroll zooms; plain scroll scrolls the page
      mountKeyPan(scope, controls, camera); // WASD/arrows glide the focus across the floor
      scope.effect((use) => {
        use(time);
        controls.update();
      });

      // Two-way binding with the left-edge zoom slider. CAMERA → SLIDER: every controls change
      // (Shift+Scroll, pinch, damping inertia) re-derives the slider position from the orbit
      // radius — orbit/pan keep the radius, so those sets dedupe away. Synced once at mount, so
      // entering free mode keeps your framing and the slider adopts it. SLIDER → CAMERA: a zoom
      // change dollies along the current view direction. The echo is broken by the radius check:
      // a camera-driven slider sync maps back to exactly the radius the camera already has.
      const syncSlider = () => {
        cameraZoom.set(radiusZoom(camera.position.distanceTo(controls.target)));
      };
      syncSlider();
      controls.addEventListener("change", syncSlider);
      scope.add(() => controls.removeEventListener("change", syncSlider));

      scope.effect((use) => {
        const z = use(cameraZoom);
        const dir = camera.position.clone().sub(controls.target);
        if (dir.lengthSq() < 1e-6) return;
        const radius = zoomRadius(z);
        if (Math.abs(dir.length() - radius) < 1e-4) return; // echo of a camera-driven sync
        dir.setLength(radius);
        camera.position.copy(controls.target).add(dir);
        controls.update();
      });
      },

      // Camera "Fly": free flight on the modified three.js FlyControls (common-web). Click the
      // canvas to grab the pointer (mouse look), WASD flies along the view, R/F go straight
      // up/down, Shift holds a 4× boost. Takes over from the camera's CURRENT orientation (the
      // controls initialize theta/phi from it) and leaves the pointer lock behind on exit.
      fly: ({ scope }) => {
        const controls = FlyControls(camera, renderer.domElement, { movementSpeed: 8 });
        scope.add(() => {
          controls.dispose();
          if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        });
        const delta = frameDelta(scope, time, { maxStep: 0.1 });
        scope.effect((use) => controls.update(use(delta)));
      },
    });

    // Item icons: only in the default demo scene, so mounted when shown AND the Builder Room is
    // hidden. The toggle's value is preserved while the room is up — this just suppresses the icons.
    const itemsVisible = kids.scope.computed((use) => use(showItems) && !use(showBlocks));
    when(itemsVisible, ({ scope }) => {
      const icons = spawnIcons(iconsTexture);
      icons.forEach((icon) => scene.add(icon));
      scope.add(() => icons.forEach((icon) => scene.remove(icon)));
    });
  });

  // Right-clicking (desktop) or touching (mobile) the canvas drops into manual ("Click & Drag") camera
  // mode. In Controlled mode the OrbitControls branch above isn't mounted, so the drag would do nothing
  // — setting `cameraMode` mounts + connects OrbitControls synchronously (Value listeners run inline),
  // and we re-dispatch the pointerdown so the SAME drag the user already started begins orbiting (touch:
  // one finger orbits, two fingers pinch-zoom + pan). Fly mode owns its own pointer (lock-to-look), so
  // this only fires from Controlled. `contextmenu` is suppressed so the browser menu never pops
  // mid-drag (OrbitControls also suppresses it once connected).
  const el = renderer.domElement;
  const onContextMenu = (e: Event) => e.preventDefault();
  const onPointerDown = (e: PointerEvent) => {
    const isTouch = e.pointerType === "touch";
    // Right-click on desktop, or any touch on mobile (no right button there), while in Controlled mode.
    if ((e.button !== 2 && !isTouch) || cameraMode.peek() !== "controlled") return;
    cameraMode.set("manual"); // synchronously mounts + connects the OrbitControls branch
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: e.pointerId,
        pointerType: e.pointerType || "mouse",
        isPrimary: true,
        button: e.button,
        buttons: e.buttons,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  el.addEventListener("contextmenu", onContextMenu);
  el.addEventListener("pointerdown", onPointerDown);
  scope.add(() => {
    el.removeEventListener("contextmenu", onContextMenu);
    el.removeEventListener("pointerdown", onPointerDown);
  });

  return scope;
};
