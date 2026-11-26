import { NodeKind } from "../types";

import { SOCKET_OPTIONS } from "./input";

// Interface SINK — only meaningful INSIDE a component definition (docs/design/18). Declares one
// named, typed output: whatever is wired into `in` becomes the instance's output named `name`
// (buildComponent reads each output node's `value`). `name`/`type` are literal config read to
// synthesize the component's output socket.
export const outputKind: NodeKind = {
  inputs: {
    name: { type: "string", default: "out", inline: true },
    type: {
      type: "string",
      default: "placements",
      inline: true,
      label: "Type",
      options: SOCKET_OPTIONS,
    },
    in: { type: "json", default: null },
  },
  outputs: { value: { type: "json" } },
  build: (_scope, { in: inV }) => ({ value: inV }),
};
