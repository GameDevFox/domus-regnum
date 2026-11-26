import {
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from "three";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { disposeDeep } from "../../blocks/dispose";
import { buildLevelNav } from "../../blocks/level-nav";
import { Level } from "../../blocks/types";

// The editor's reactive navmesh wireframe overlay. Rebuilt whenever the level (or the `showNav`
// toggle) changes, so you watch the walkable graph update live as you place walls and punch doorways.
// Sets `navWarning` when the graph splits into more than one region. Furniture carving is on, so the
// overlay shows the *real* walkable graph (nodes under furniture gone, edges not passing through it).
export const mountNavOverlay = (opts: {
  scope: Scope;
  scene: Scene;
  level: Value<Level>;
  showNav: Value<boolean>;
  navWarning: Value<string | null>;
  render: () => void;
}): void => {
  const { scope, scene, level, showNav, navWarning, render } = opts;

  const navGroup = new Group();
  navGroup.position.y = 0.06;
  scene.add(navGroup);

  scope.effect((use) => {
    const lvl = use(level);
    const on = use(showNav);
    disposeDeep(navGroup);
    navGroup.clear();
    if (on) {
      const nav = buildLevelNav(lvl);
      const edgePoints: Vector3[] = [];
      nav.edges.forEach(([a, b]) => edgePoints.push(nav.nodes[a], nav.nodes[b]));
      navGroup.add(
        new LineSegments(
          new BufferGeometry().setFromPoints(edgePoints),
          new LineBasicMaterial({ color: 0x57e0b0 }),
        ),
      );
      navGroup.add(
        new Points(
          new BufferGeometry().setFromPoints(nav.nodes),
          new PointsMaterial({ color: 0x9affd8, size: 6, sizeAttenuation: false }),
        ),
      );
      navWarning.set(nav.components > 1 ? `Navmesh split into ${nav.components} regions` : null);
    } else {
      navWarning.set(null);
    }
    render();
  });
};
