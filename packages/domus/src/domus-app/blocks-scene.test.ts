import { Group, Object3D, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";

import { Value } from "@kitsune/common-web/src/value";

import { ServantView } from "../world/household";

import { buildBlocksScene } from "./blocks-scene";

// A minimal stand-in for the mascot-demo objects buildBlocksScene hides while a room mode is active.
const demoStub = () => ({
  foundation: new Object3D(),
  mascot: new Object3D(),
  roomModel: new Object3D(),
  lights: [] as Object3D[],
});

// The mode groups (room / haul / tidy) are Groups under the stage; the fill light is not — count
// only the Groups so the assertions are robust to the added light.
const modeGroups = (stage: Object3D) => stage.children.filter((c) => c instanceof Group);

// A headless smoke test for the live integration: it mounts the authored room + the haul sim into a
// bare Scene (no renderer) and drives the frame clock, checking the reactive wiring and the sim tick
// loop don't throw and that teardown is clean. The WebGL render path is verified visually, but this
// catches the wiring regressions that wouldn't show up until runtime.
describe("buildBlocksScene", () => {
  it("mounts a stage, room, and running sim, then tears down cleanly", () => {
    const scene = new Scene();
    const time = Value(0);
    const showBlocks = Value(true);
    const runHaul = Value(true);
    const runTidy = Value(true);
    const cleanliness = Value(1);
    const staff = Value<ServantView[]>([]);

    const scope = buildBlocksScene({
      scene,
      sceneObjects: demoStub(),
      time,
      showBlocks,
      runHaul,
      runTidy,
      cleanliness,
      staff,
      billboards: Value(false),
      camera: new PerspectiveCamera(),
    });
    expect(scene.children).toHaveLength(1); // the offset stage group

    const stage = scene.children[0];
    expect(modeGroups(stage).length).toBeGreaterThan(0); // room + haul + tidy groups mounted

    // Drive ~5 seconds of frames; the haul + tidy sims should advance without throwing.
    for (let t = 16; t <= 5000; t += 16) time.set(t);
    expect(cleanliness.peek()).toBeLessThan(1); // grime accrued, meter moved off spotless
    expect(staff.peek().length).toBeGreaterThan(0); // roster published
    expect(staff.peek()[0]).toHaveProperty("activity"); // view-model shape

    scope.cleanup();
    expect(staff.peek()).toHaveLength(0); // roster cleared on teardown
    expect(scene.children).toHaveLength(0); // stage removed on teardown
  });

  it("toggles the room and sim independently via their Values", () => {
    const scene = new Scene();
    const time = Value(0);
    const showBlocks = Value(false);
    const runHaul = Value(false);
    const runTidy = Value(false);
    const cleanliness = Value(1);
    const staff = Value<ServantView[]>([]);

    const scope = buildBlocksScene({
      scene,
      sceneObjects: demoStub(),
      time,
      showBlocks,
      runHaul,
      runTidy,
      cleanliness,
      staff,
      billboards: Value(false),
      camera: new PerspectiveCamera(),
    });
    const stage = scene.children[0];
    expect(modeGroups(stage)).toHaveLength(0); // nothing shown yet

    showBlocks.set(true);
    expect(modeGroups(stage)).toHaveLength(1); // room mounts

    runHaul.set(true);
    expect(modeGroups(stage)).toHaveLength(2); // sim mounts alongside

    runTidy.set(true);
    expect(modeGroups(stage)).toHaveLength(3); // tidy-house mounts alongside

    showBlocks.set(false);
    expect(modeGroups(stage)).toHaveLength(2); // room unmounts, sims stay

    scope.cleanup();
  });

  it("hides the mascot demo while a room mode is active and restores it when all are off", () => {
    const scene = new Scene();
    const time = Value(0);
    const showBlocks = Value(false);
    const runHaul = Value(false);
    const runTidy = Value(false);
    const cleanliness = Value(1);
    const staff = Value<ServantView[]>([]);
    const sceneObjects = demoStub();

    const scope = buildBlocksScene({
      scene,
      sceneObjects,
      time,
      showBlocks,
      runHaul,
      runTidy,
      cleanliness,
      staff,
      billboards: Value(false),
      camera: new PerspectiveCamera(),
    });

    const visible = () => sceneObjects.foundation.visible && sceneObjects.mascot.visible;
    expect(visible()).toBe(true); // demo shown by default

    runTidy.set(true);
    expect(visible()).toBe(false); // any room mode hides the demo

    runTidy.set(false);
    expect(visible()).toBe(true); // restored once all modes are off

    scope.cleanup();
  });
});
