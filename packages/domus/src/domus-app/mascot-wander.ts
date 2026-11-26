import { Object3D, Vector3 } from "three";

import { HUMAN_WALK_ACCEL, HUMAN_WALK_SPEED, trapezoidStep } from "@kitsune/common";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { findPath, graph as fancyGraph } from "../domus/path/fancy-floor-graph";
import { pathLength, pointAtDistance } from "../world/path-follow";

import { random } from "lodash";
import { frameDelta } from "@kitsune/common-web/src/animate";

// The mascot's wander: when the current walk finishes (plus a beat of rest), pick a random
// reachable node on the floor graph, A* a path to it, and walk there with MOMENTUM — the same
// trapezoidal velocity profile the sims' agents use (@kitsune/common movement.ts): accelerate
// from rest, cruise, brake to land exactly on the destination. This replaced an eased-lerp
// (quadInOut over the whole journey), which only imitated acceleration and scaled its ramps
// with trip length.
//
// Lives here (an effect with closure state) so the walk state never leaks to module scope, and
// the position is PUBLISHED as a Value — the camera-follow effect (composition.ts) depends on it
// explicitly instead of relying on frame-loop ordering.

const PACE = 1.2; // the mascot strides a touch brisker than the average walk
const TOP_SPEED = HUMAN_WALK_SPEED * PACE; // m/s
const REST_TIME = 0.5; // seconds standing at a destination before picking the next

const START_NODE = 464; // the floor node the mascot stands on at boot
const FIRST_TARGET = 399;

// Mounts the wander on `scope` and returns the mascot's live position (a fresh Vector3 per move,
// so subscribers fire). The mascot Object3D is still moved directly — the Value is the reactive
// mirror consumers should depend on.
export const mountMascotWander = (
  scope: Scope,
  time: Value<number>,
  mascot: Object3D,
): Value<Vector3> => {
  let lastEndId = FIRST_TARGET;
  let path: Vector3[] = findPath(START_NODE, lastEndId).map((node) => node.data);
  let total = pathLength(path);
  let traveled = 0;
  let velocity = 0;
  let restLeft = 0;

  const position = Value(mascot.position.clone());

  const nextPath = () => {
    let endId = 0;
    do {
      endId = random(19 * 23);
    } while (endId === lastEndId || fancyGraph.getNode(endId) === undefined);
    path = findPath(lastEndId, endId).map((node) => node.data);
    total = pathLength(path);
    traveled = 0;
    velocity = 0; // departs from rest
    lastEndId = endId;
  };

  const delta = frameDelta(scope, time, { maxStep: 0.1 }); // clamps tab-switch gaps
  scope.effect((use) => {
    const dt = use(delta);

    if (restLeft > 0) {
      restLeft -= dt;
      if (restLeft <= 0) nextPath();
      return;
    }

    velocity = trapezoidStep(velocity, dt, {
      accel: HUMAN_WALK_ACCEL,
      topSpeed: TOP_SPEED,
      remaining: total - traveled,
    });
    traveled += velocity * dt;

    if (traveled >= total) {
      mascot.position.copy(path[path.length - 1]); // land exactly on the destination
      restLeft = REST_TIME;
    } else {
      mascot.position.copy(pointAtDistance(path, traveled));
    }
    position.set(mascot.position.clone());
  });

  return position;
};
