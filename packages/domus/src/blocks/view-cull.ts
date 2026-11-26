import { Camera, Object3D } from "three";

import { Placement } from "./types";
import { CULL_H, CULL_V, VIEW_SIDE, ViewSide } from "./properties";

// Camera-side culling for edge blocks. A wall/doorway/window can be flagged (via its `viewSide`
// param) to render only from one side of its plane, so the near side of a house hides and you can
// look through it. Unlike backface culling this hides the WHOLE block (caps, top, bottom), because
// we toggle the block's root Object3D `.visible`, not a material's `side`.
//
// A block faces its local +Z (walls are authored long along X, thin along Z, then rotated by the
// interpreter). The world normal is the +Z column of its world matrix; the side the camera is on is
// the sign of (camera - block) · normal, taken in the XZ plane (height is irrelevant to "which side").

type XZ = { x: number; z: number };

// The pure, testable core: should a block with this `viewSide` render, given its world normal and
// position and the camera position (all XZ)? `both` / anything unset always renders. `front` shows on
// the +normal side (dot >= 0, so a camera exactly on the plane counts as front); `back` on the other.
export const visibleFromSide = (
  viewSide: string | undefined,
  normal: XZ,
  blockPos: XZ,
  camPos: XZ,
): boolean => {
  if (viewSide !== "front" && viewSide !== "back") return true;
  const dot = (camPos.x - blockPos.x) * normal.x + (camPos.z - blockPos.z) * normal.z;
  return (viewSide as ViewSide) === "front" ? dot >= 0 : dot < 0;
};

// A corner post sits at the junction of a horizontal wall (world normal +Z) and a vertical wall
// (world normal +X), carrying each wall's `viewSide` as `cullH` / `cullV`. The post lies ON both wall
// planes, so we reuse `visibleFromSide` with the corner's own position. It hides only when the camera
// is on the hidden side of BOTH walls — the diagonal quadrant where both already vanished, which is
// exactly when the lone post would stick up like a pillar. If either wall isn't a culling wall (its
// cull is unset), the corner always shows, so it still caps a wall that's still standing.
export const cornerVisible = (
  cullH: string | undefined,
  cullV: string | undefined,
  pos: XZ,
  camPos: XZ,
): boolean =>
  visibleFromSide(cullH, { x: 0, z: 1 }, pos, camPos) ||
  visibleFromSide(cullV, { x: 1, z: 0 }, pos, camPos);

// Walk a mounted level group's children and set each block's visibility from its `viewSide` flag (or,
// for corner posts, the two-wall `cullH`/`cullV` test) and the camera. `enabled = false` (the editor's
// preview toggle off) forces everything visible — so the editor never hides a block you're trying to
// select. Cheap enough to call every frame: the block transforms are static, so the only per-frame
// work is the dot test.
export const applyViewCull = (camera: Camera, root: Object3D, enabled = true): void => {
  for (const child of root.children) {
    const placement = child.userData.placement as Placement | undefined;

    if (placement?.block === "corner") {
      const cullH = placement.params?.[CULL_H] as string | undefined;
      const cullV = placement.params?.[CULL_V] as string | undefined;
      if (!enabled || cullH === undefined || cullV === undefined) {
        child.visible = true;
        continue;
      }
      child.updateWorldMatrix(true, false);
      const e = child.matrixWorld.elements;
      const pos = { x: e[12], z: e[14] };
      child.visible = cornerVisible(cullH, cullV, pos, camera.position);
      continue;
    }

    const viewSide = placement?.params?.[VIEW_SIDE];
    if (!enabled || (viewSide !== "front" && viewSide !== "back")) {
      child.visible = true;
      continue;
    }
    child.updateWorldMatrix(true, false);
    const e = child.matrixWorld.elements;
    const normal = { x: e[8], z: e[10] }; // local +Z basis, in world space
    const blockPos = { x: e[12], z: e[14] }; // world translation
    child.visible = visibleFromSide(viewSide, normal, blockPos, camera.position);
  }
};
