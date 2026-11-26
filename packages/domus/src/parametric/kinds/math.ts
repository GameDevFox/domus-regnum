import { NodeKind } from "../types";

// Arithmetic on two numbers — Blender's Math node. Pick an operation, wire or type `a`/`b`, get a
// number out. The general primitive for DERIVING values: a room split's complement (`1 − scale` via
// subtract; `−offset` via subtract), a percentage (`depth × fraction` via multiply), etc. Subtract is
// its own op (not add-with-negatives) because you can't negate a WIRED operand with add alone.
const MATH_OPS = [
  { value: "add", label: "Add" },
  { value: "subtract", label: "Subtract" },
  { value: "multiply", label: "Multiply" },
  { value: "divide", label: "Divide" },
];

export const mathKind: NodeKind = {
  inputs: {
    op: { type: "string", default: "add", inline: true, label: "op", options: MATH_OPS },
    a: { type: "number", default: 0, inline: true },
    b: { type: "number", default: 0, inline: true },
  },
  outputs: { out: { type: "number" } },
  build: (scope, { op, a, b }) => ({
    out: scope.computed<number>((use) => {
      const x = Number(use(a) ?? 0);
      const y = Number(use(b) ?? 0);
      switch (use(op) as string) {
        case "subtract":
          return x - y;
        case "multiply":
          return x * y;
        case "divide":
          return y === 0 ? 0 : x / y; // guard ÷0 → 0 (keeps the graph finite)
        default:
          return x + y; // "add"
      }
    }),
  }),
};
