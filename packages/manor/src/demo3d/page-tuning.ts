// The numbers the 3D game's page is laid out and moved by: how the camera opens and turns, how fast
// the view slides and closes in, and how the picture makes room for the panel. Kept apart from
// main.ts, which wires the page together.

export const FIELD_OF_VIEW = 30;
// Opens on one of the four diagonal views the Turn buttons step between.
export const START = { azimuth: Math.PI / 4, polar: 0.9, distance: 30 };
/** Where the camera looks: the middle of the house. */
export const CENTRE = { x: 9.5, z: 6 };
/** How far above a storey's floor the camera aims. */
export const EYE_LIFT = 1.0;
export const SIM_STEP = 1 / 60;
/** No more than this many steps a frame, so a tab left in the background does not lurch on return. */
export const MAX_STEPS = 12;
/** A turn starts fast and settles: this share of what is left each second, and never slower than the floor. */
export const TURN_EASE = 7;
export const SLOWEST_TURN = 0.6;
/** Radians: nearer the goal than this, a turn is finished. */
export const TURN_DONE = 0.0005;
export const FOLLOW_EASE = 4;
/** Hours of the day with the lamps out, and with them lit. */
export const NOON = 12;
export const MIDNIGHT = 0;
/** How near the camera comes to someone it is following, in metres; and how quickly it gets there, per second. */
export const FOLLOW_DISTANCE = 12;
export const ZOOM_EASE = 3.5;
/** Metres: nearer the wanted distance than this, a zoom is finished. */
export const ZOOM_DONE = 0.02;
/** Metres per second the view slides when moved with the keys. */
export const PAN_SPEED = 9;
/** How fast a controller's right stick, leant right over, turns and tilts the view: radians a second. */
export const STICK_TURN_SPEED = 1.8;
/** How fast a controller's stick, leant right over, slides the map: pixels a second. */
export const STICK_MAP_SPEED = 600;
/** The actions a controller's buttons are bound to, by the names they have in the page's list of what can be done (main.ts, `BINDINGS`): the keys are bound to the same. */
export const ACTION = { turnAnticlockwise: "turn-anticlockwise", turnClockwise: "turn-clockwise", floorUp: "floor-up", floorDown: "floor-down", focusPrevious: "focus-previous", focusNext: "focus-next" } as const;
export const PAN_KEYS = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"];
export const WIDE_SCREEN = 900;
/** Half the panel's width, in pixels: open, and folded away. */
export const PANEL_SHIFT = 184;
export const FOLDED_SHIFT = 36;
