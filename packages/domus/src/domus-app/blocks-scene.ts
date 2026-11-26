import { Box3, Group, HemisphereLight, Object3D, PerspectiveCamera, Scene, Vector3 } from "three";

import { children } from "@kitsune/common-web/src/registry";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { currentLevel } from "../blocks/current-level";
import { disposeDeep } from "../blocks/dispose";
import { buildLevelNav, LevelNav } from "../blocks/level-nav";
import { mountLevel } from "../blocks/level";
import { Level } from "../blocks/types";
import { applyViewCull } from "../blocks/view-cull";
import { ServantView } from "../world/household";

import { mountDoors } from "./sims/doors";
import { buildHaul } from "./sims/haul-demo";
import { buildTidy } from "./sims/tidy-house";

// Mounts the authored building-block level into the LIVE game scene and runs sims inside it: the
// trash-haul demo (sims/haul-demo.ts) and the "Tidy House" cleaning loop (sims/tidy-house.ts). Three
// reactive toggles gate the pieces, and each reads `currentLevel` reactively — so a room authored in
// the Builder tab (then "Sent to game") hot-swaps into all of them. Sim coordinates (level space) and
// rendered geometry stay aligned because each piece offsets its own group by the level's center.

// The original mascot-demo content we hide while a room/sim mode is active, so the two worlds don't
// overlap. Typed structurally (all Object3D) to avoid coupling to the full sceneObjects shape.
type DemoObjects = {
  foundation: Object3D;
  mascot: Object3D;
  roomModel: Object3D;
  lights: Object3D[];
};

type BlocksSceneDeps = {
  scene: Scene;
  camera: PerspectiveCamera; // for camera-side wall culling (look through the near side of the house)
  sceneObjects: DemoObjects;
  time: Value<number>;
  showBlocks: Value<boolean>;
  runHaul: Value<boolean>;
  runTidy: Value<boolean>;
  cleanliness: Value<number>; // published for the React "house cleanliness" meter
  staff: Value<ServantView[]>; // published for the React servant roster
  billboards: Value<boolean>; // agent look: 2D maid sprites (true) vs 3D cone+sphere models (false)
};

// Create a fresh group under `stage`, offset so the level centers on the world origin (where the
// orbit camera looks). Returns the group + the navmesh derived from the level. Cleanup removes it.
const stagedGroup = (
  stage: Group,
  scope: Scope,
  level: Level,
  furniture = false,
): { group: Group; levelNav: LevelNav } => {
  // `furniture` carves furniture footprints out of the navmesh. The haul demo uses the carved graph
  // (trash/bins/agents only spawn on walkable non-furniture nodes, and agents path AROUND furniture),
  // but the Tidy House keeps the un-carved graph because its dishes sit ON tables — carving those
  // cells out would remove the very nodes the dish jobs target.
  const levelNav = buildLevelNav(level, { furniture });
  const center =
    levelNav.nodes.length > 0
      ? new Box3().setFromPoints(levelNav.nodes).getCenter(new Vector3())
      : new Vector3();
  const group = new Group();
  group.position.set(-center.x, 0, -center.z);
  stage.add(group);
  scope.add(() => {
    stage.remove(group);
    disposeDeep(group); // free GPU buffers on level swap / toggle off
  });
  return { group, levelNav };
};

export const buildBlocksScene = ({
  scene,
  camera,
  sceneObjects,
  time,
  showBlocks,
  runHaul,
  runTidy,
  cleanliness,
  staff,
  billboards,
}: BlocksSceneDeps): Scope => {
  const scope = Scope();

  const stage = new Group();
  scene.add(stage);
  scope.add(() => scene.remove(stage));

  // "Room mode" = any of the authored-room toggles is on. While it's active we hide the original
  // mascot demo (so the two scenes don't overlap) and add a soft fill light so any authored room is
  // lit even if it brings no lamps of its own. Flipping all modes off restores the demo.
  const demo: Object3D[] = [
    sceneObjects.foundation,
    sceneObjects.mascot,
    sceneObjects.roomModel,
    ...sceneObjects.lights,
  ];
  const fillLight = new HemisphereLight(0xfff4e0, 0x404048, 0.8);
  const roomMode = scope.computed((use) => use(showBlocks) || use(runHaul) || use(runTidy));
  scope.effect((use) => {
    const on = use(roomMode);
    demo.forEach((o) => (o.visible = !on));
    if (on) stage.add(fillLight);
    else stage.remove(fillLight);
  });

  children(scope, stage, ({ when }) => {
    // Each piece reads `currentLevel` reactively via an effect, so swapping the level (from the
    // editor) rebuilds it. The effect's per-run scope owns the group + sim, torn down on each swap.
    when(showBlocks, ({ scope }) => {
      scope.effect((use, runScope) => {
        const level = use(currentLevel);
        const { group } = stagedGroup(stage, runScope, level);
        mountLevel(runScope, group, level);
        // Doors swing open as a maid's path runs through them (reads the live sim roster). Mounted
        // here with the doorway meshes; re-collects handles on each level swap (runScope rebuild).
        mountDoors(runScope, group, time);
        // Camera-side culling: every frame, hide walls/doors/windows flagged `viewSide` when the
        // camera is on their excluded side — so the near side of the house renders out of the way.
        runScope.effect((use2) => {
          use2(time);
          applyViewCull(camera, group);
        });
      });
    });

    when(runHaul, ({ scope }) => {
      scope.effect((use, runScope) => {
        const level = use(currentLevel);
        const { group, levelNav } = stagedGroup(stage, runScope, level, true); // carved: trash off furniture
        buildHaul(group, runScope, levelNav, time, billboards);
      });
    });

    when(runTidy, ({ scope }) => {
      scope.effect((use, runScope) => {
        const level = use(currentLevel);
        const { group, levelNav } = stagedGroup(stage, runScope, level);
        buildTidy(group, runScope, levelNav, level, time, cleanliness, staff, billboards);
      });
      // Clear the roster when the sim stops.
      scope.add(() => staff.set([]));
    });
  });

  return scope;
};
