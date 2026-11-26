// Canonical structural dimensions (world meters). These are CROSS-FILE CONTRACTS: the stair/ramp
// mesh shear, the navmesh elevation painting, and the parametric kinds' defaults must all agree
// bit-identically or agents sink through floors — change deliberately and re-run the nav tests.
export const STOREY_RISE = 3.3; // one storey of climb (stair/ramp default; build-plane Shift jump)
export const WALL_HEIGHT = 3.0;
export const WALL_THICKNESS = 0.2;
