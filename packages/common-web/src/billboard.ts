import { Euler, Object3D, Quaternion, Vector3 } from "three";

// Make `object` a CYLINDRICAL (yaw-only) billboard: each frame it rotates about its local Y to face
// the active camera in the XZ plane, staying perfectly UPRIGHT — it never pitches, the way a fully
// camera-facing THREE.Sprite tilts back / foreshortens under a high or angled camera. Pass any
// renderable Object3D (a Mesh/Sprite); the per-frame hook rides `onBeforeRender`, so the active
// camera arrives with no plumbing.
//
// NESTING-AWARE: it subtracts the parent's world yaw, so a billboard nested under a ROTATED group
// (e.g. a wall-facing model's flame) faces the camera in WORLD space, not its parent's local frame.
// Flat at the top level (no rotated parent) this reduces to a plain yaw. Only `rotation.y` is
// touched, so any authored x/z tilt on the object is preserved.
export const yawBillboard = <T extends Object3D>(object: T): T => {
  const worldPos = new Vector3();
  const parentQuat = new Quaternion();
  const parentEuler = new Euler(0, 0, 0, "YXZ");
  object.onBeforeRender = (_renderer, _scene, camera) => {
    object.getWorldPosition(worldPos);
    const worldYaw = Math.atan2(camera.position.x - worldPos.x, camera.position.z - worldPos.z);
    if (object.parent) {
      object.parent.getWorldQuaternion(parentQuat);
      parentEuler.setFromQuaternion(parentQuat, "YXZ"); // Y first → the parent's world yaw
      object.rotation.y = worldYaw - parentEuler.y;
    } else {
      object.rotation.y = worldYaw;
    }
  };
  return object;
};
