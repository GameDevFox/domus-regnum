import { NodeKind } from "../types";

// The socket types an interface input/output can declare (doc 18). UI-facing options for the `type`
// dropdown; the editor reads the chosen value to render the real socket on the component instance.
export const SOCKET_OPTIONS = [
  { value: "rect", label: "rect" },
  { value: "point", label: "point" },
  { value: "number", label: "number" },
  { value: "string", label: "string" },
  { value: "boolean", label: "boolean" },
  { value: "measure", label: "measure" },
  { value: "finish", label: "finish" },
  { value: "opening", label: "opening" },
  { value: "frame", label: "frame" },
  { value: "frames", label: "frames" },
  { value: "placements", label: "placements" },
  { value: "json", label: "json" },
];

// Interface SOURCE — only meaningful INSIDE a component definition (docs/design/18). Declares one
// named, typed input of the component: inside the sub-graph its `out` is whatever the INSTANCE
// supplies for `name` (the evaluator SEEDS it — see buildComponent), falling back to `default` when
// the definition is evaluated standalone. `name`/`type` are literal config the evaluator/editor read
// to synthesize the component's input socket; the declared `out` type is a permissive placeholder
// (the real socket type comes from the `type` prop).
export const inputKind: NodeKind = {
  inputs: {
    name: { type: "string", default: "in", inline: true },
    type: { type: "string", default: "rect", inline: true, label: "Type", options: SOCKET_OPTIONS },
    default: { type: "json", default: null, inline: true },
  },
  outputs: { out: { type: "json" } },
  build: (_scope, { default: defV }) => ({ out: defV }),
};
