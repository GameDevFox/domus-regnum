import { Camera, Plane, Raycaster, Vector2, Vector3 } from "three";

// Viewport↔world mapping helpers: turn pointer positions on a canvas into points in the 3D
// scene. The core trick for camera-relative manipulation (drag a thing and have it TRACK the
// cursor at any camera angle/distance) is raycasting the pointer onto the plane the thing
// lives on — the grabbed point stays glued under the cursor by construction.

// Pointer position in normalized device coordinates ([-1,1]², y up) relative to `element`.
export const pointerNdc = (clientX: number, clientY: number, element: HTMLElement): Vector2 => {
  const rect = element.getBoundingClientRect();
  return new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
};

const sharedRaycaster = new Raycaster();
const sharedPlane = new Plane();

// The world point where the pointer's view ray crosses the horizontal plane at height `y` —
// null when the ray misses it (camera looking away from the plane). Fresh Vector3 returned.
export const intersectPlaneAtY = (
  camera: Camera,
  ndc: Vector2,
  y = 0,
  raycaster: Raycaster = sharedRaycaster,
): Vector3 | null => {
  raycaster.setFromCamera(ndc, camera);
  sharedPlane.set(new Vector3(0, 1, 0), -y); // plane: normal·p + constant = 0 ⇒ constant = -y
  const hit = new Vector3();
  return raycaster.ray.intersectPlane(sharedPlane, hit) ? hit : null;
};

// Convenience: pointer event coordinates straight to the plane-at-y world point.
export const pointerToPlaneY = (
  clientX: number,
  clientY: number,
  element: HTMLElement,
  camera: Camera,
  y = 0,
): Vector3 | null => intersectPlaneAtY(camera, pointerNdc(clientX, clientY, element), y);
