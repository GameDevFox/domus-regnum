import { NodeKind } from "../types";

// A string constant — the `value` node's text sibling: one inline-editable string in, that
// string out. Lets one value drive several string inputs at once (e.g. a wall finish across a
// whole house, or a block id shared by spawners); consumers with `options` still validate what
// they receive at their own end (an unknown finish falls back to the default).
export const textKind: NodeKind = {
  inputs: {
    value: { type: "string", default: "", inline: true },
  },
  outputs: { out: { type: "string" } },
  build: (scope, { value }) => ({
    out: scope.computed<string>((use) => use(value) as string),
  }),
};
