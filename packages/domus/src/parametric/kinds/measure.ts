import { Measure, NodeKind } from "../types";

// A measure CONSTANT — one {scale, offset} pair as a node, for fan-out: wire its output into
// several measure inputs (e.g. three doors' `size`) and one value drives them all, exactly as
// the `value`/`text` kinds do for numbers and strings. Resolved by the consumer against ITS
// parent length (scale·L + offset — see types.ts `Measure`).
export const measureKind: NodeKind = {
  inputs: {
    scale: { type: "number", default: 0, inline: true },
    offset: { type: "number", default: 0, inline: true },
  },
  outputs: { out: { type: "measure" } },
  build: (scope, { scale, offset }) => ({
    out: scope.computed<Measure>((use) => ({
      scale: use(scale) as number,
      offset: use(offset) as number,
    })),
  }),
};
