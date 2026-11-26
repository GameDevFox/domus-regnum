// The Y-rotation that aims a factory's local +X axis from world point A toward world point B.
// Points are world meters (x = world X, z = world Z on the floor); the −Δz matches Three.js's
// right-handed yaw. The ONE source for the segment kinds' orientation (wall/railing/door/window),
// which all build their geometry along local +X and rotate it onto the A→B run.
export const aimRotY = (ax: number, az: number, bx: number, bz: number): number =>
  Math.atan2(-(bz - az), bx - ax);
