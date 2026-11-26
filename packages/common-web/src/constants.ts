import { Vector3 } from "three";

export const VECTOR3_ZERO = new Vector3(0, 0, 0);
export const VECTOR3_HALF = new Vector3(0.5, 0.5, 0.5);
export const VECTOR3_ONE = new Vector3(1, 1, 1);

export const VECTOR3_LEFT = new Vector3(-1, 0, 0);
export const VECTOR3_RIGHT = new Vector3(1, 0, 0);
export const VECTOR3_UP = new Vector3(0, 1, 0);
export const VECTOR3_DOWN = new Vector3(0, -1, 0);
export const VECTOR3_FORWARDS = new Vector3(0, 0, -1);
export const VECTOR3_BACKWARDS = new Vector3(0, 0, 1);

export const VECTOR3_X = VECTOR3_RIGHT;
export const VECTOR3_Y = VECTOR3_UP;
export const VECTOR3_Z = VECTOR3_BACKWARDS;
