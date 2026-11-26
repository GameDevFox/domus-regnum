import { Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from "three";

import { r90 } from "@kitsune/common";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { disposeDeep } from "../../blocks/dispose";
import { resolveTransform } from "../../blocks/transform";
import { Placement } from "../../blocks/types";

// The grabbed-selection outline: an amber cell quad under the currently-selected manual placement
// (set on grab, kept after drop). A reactive overlay like editor/nav-overlay.ts — driven by the
// `selected` index + the manual list, repositioned via resolveTransform (which handles edge blocks,
// whose anchor cell is offset from the wall).
export const mountSelectionHighlight = (
  scope: Scope,
  scene: Scene,
  deps: {
    selected: Value<number | null>;
    manualV: Value<Placement[]>;
    tile: number;
    render: () => void;
  },
): void => {
  const { selected, manualV, tile, render } = deps;
  const hi = new Mesh(
    new PlaneGeometry(tile * 0.98, tile * 0.98),
    new MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  hi.rotation.x = -r90;
  hi.position.y = 0.02;
  hi.visible = false;
  scene.add(hi);
  scope.add(() => {
    scene.remove(hi);
    disposeDeep(hi);
  });

  scope.effect((use) => {
    const i = use(selected);
    const list = use(manualV);
    if (i == null || i < 0 || i >= list.length) {
      hi.visible = false;
    } else {
      const pos = resolveTransform(list[i], tile).position;
      hi.position.set(pos.x, pos.y + 0.02, pos.z);
      hi.visible = true;
    }
    render();
  });
};
