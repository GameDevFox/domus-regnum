import { NodeKind } from "../types";

// A numeric constant (Blender's Value node): one inline-editable number in, that number out.
// Exists so one number can drive several inputs at once (e.g. a shared wall thickness) and so
// numbers have a visible, wireable home on the canvas instead of living only in inspectors.
export const valueKind: NodeKind = {
  inputs: {
    value: { type: "number", default: 1, inline: true },
  },
  outputs: { out: { type: "number" } },
  build: (scope, { value }) => ({
    out: scope.computed<number>((use) => use(value) as number),
  }),
};
