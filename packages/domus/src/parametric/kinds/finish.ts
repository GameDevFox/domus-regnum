import { WALL_STYLE_OPTIONS } from "../../blocks/properties";
import { Finish, NodeKind } from "../types";
import { DEFAULT_WALL_THICKNESS } from "./constants";

// A wall FINISH constant — thickness + texture offset + style as one node, for fan-out: wire its
// `out` into the `finish` input of several walls/doors/windows and ONE value drives the whole
// house's wall look (the non-circular fix for "the door's pattern should match the wall" — bind
// the same finish into the walls AND its openings). Mirrors the `value`/`text`/`measure`
// constants. A wall kind's bound `finish` supersedes its individual thickness/texOffset/style.
export const finishKind: NodeKind = {
  inputs: {
    thickness: { type: "number", default: DEFAULT_WALL_THICKNESS, inline: true },
    texOffset: { type: "number", default: 0, inline: true },
    style: { type: "string", default: "wallpaper", inline: true, options: WALL_STYLE_OPTIONS },
  },
  outputs: { out: { type: "finish" } },
  build: (scope, { thickness, texOffset, style }) => ({
    out: scope.computed<Finish>((use) => ({
      thickness: use(thickness) as number,
      texOffset: use(texOffset) as number,
      style: use(style) as string,
    })),
  }),
};

// The effective wall finish for a kind: the bound `finish` bundle wins; otherwise the kind's own
// thickness/texOffset/style knobs. Returns the params-blob shape consumers stamp (`wallStyle`).
export const effectiveFinish = (
  finish: Finish | null,
  thickness: number,
  texOffset: number,
  style: string,
): { thickness: number; texOffset: number; wallStyle: string } =>
  finish
    ? { thickness: finish.thickness, texOffset: finish.texOffset, wallStyle: finish.style }
    : { thickness, texOffset, wallStyle: style };
