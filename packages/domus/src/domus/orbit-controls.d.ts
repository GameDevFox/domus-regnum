// Types for our orbit-controls.js fork. Its public API is IDENTICAL to upstream three r179
// OrbitControls (the fork only removes `event.shiftKey` from two pan-modifier checks and adds
// an unused rotate(x, y) helper — see the header in orbit-controls.js), so upstream's
// declarations describe it exactly.
export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
