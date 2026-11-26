import { Frame, NodeKind, Point } from "../types";

// A hand-placed oriented point — the smallest possible Frame producer (slice 1 of
// docs/design/14-component-outputs.md): the author drops it anywhere and wires anything
// frame-typed to it. A PRIMITIVE like rect/point — the Move tool drags it, the outliner roots
// it — plus a `yaw` (degrees, counterclockwise from +X/east, matching the factories' rotY
// convention) editable inline on the canvas node.
export const anchorKind: NodeKind = {
  inputs: {
    // `position` is a Point in Three.js world space (doc v4): x = world X, y = world Y (height),
    // z = world Z (floor depth). Edits as three inline fields or a wired point.
    position: { type: "point", default: { x: 0, y: 0, z: 0 }, inline: true },
    yaw: { type: "number", default: 0, inline: true },
  },
  outputs: { out: { type: "frame" } },
  build: (scope, { position, yaw }) => ({
    out: scope.computed<Frame>((use) => {
      const p = (use(position) as Point | null) ?? { x: 0, y: 0, z: 0 };
      const rad = ((use(yaw) as number) * Math.PI) / 180;
      return {
        pos: [p.x, p.y, p.z],
        // rotY rotates local +X to (cos, 0, −sin) — the same convention wall runs aim by.
        facing: [Math.cos(rad), 0, -Math.sin(rad)],
        key: "anchor",
      };
    }),
  }),
};
