import { FACE_ANGLE, spotOf } from "../space";
import type { Actor } from "../space";
import type { Scene } from "../cutscene";
import { outingOf } from "./outing";
import type { Game, Stood } from "./types";

// A scene is staged, as a scene of a play is (the author's, 2026-11-16: "During the black, the
// whole manor should be arranged specifically for how the cutscene is to be shot"). As it opens,
// everyone who is not in it is put away: taken out of the house, so that she is not drawn, does
// not move and is in nobody's way; and each of its people of the household is put on her mark.
// When it is over everyone is put back exactly as she stood: where, walking where, carrying what,
// at what task and how far through it, and in bed or not. Nothing she was at goes on while she
// is put away, and nothing is done for her: the house is as it was, as if no time had passed,
// which for the house it has not (its clock stands still while a scene plays).
//
// Someone away on an outing is not in the house, and is left as she is. A scene is not begun
// while one of its own people of the household is out (scenes.ts).

/** Her people of the household: those the scene puts on marks; or, a scene with no staging, those of its cast who live here. */
export const householdCast = (game: Game, scene: Scene): string[] => (scene.stage ? Object.keys(scene.stage.marks) : Object.keys(scene.cast)).filter((id) => game.household.includes(id));

/** Whether a scene's people of the household are all at home: none of them on an outing, on the drive or off the property. */
export const castHome = (game: Game, scene: Scene): boolean => householdCast(game, scene).every((id) => outingOf(game, id) === undefined);

const stoodOf = (actor: Actor): Stood => ({
  walker: { ...actor.walker, pos: { ...actor.walker.pos } },
  orders: [...actor.orders],
  next: actor.next && [...actor.next],
  carrying: actor.carrying,
  busy: actor.busy,
  label: actor.label,
  faceTo: actor.faceTo,
  sidestep: actor.sidestep,
  walked: actor.walked,
  errands: actor.errands,
});

const standAgain = (actor: Actor, stood: Stood): void => {
  const { walker, ...rest } = stood;
  Object.assign(actor, { ...rest, orders: [...rest.orders], next: rest.next && [...rest.next] });
  // (The walker is the same one, put back as it was: whatever else holds her holds the same walker.)
  Object.assign(actor.walker, { ...walker, pos: { ...walker.pos } });
};

/** Put someone on a mark: standing there, facing its way, with nothing in hand and nothing to do. */
const putOnMark = (game: Game, actor: Actor, mark: string): void => {
  const spot = spotOf(game.world, mark);
  Object.assign(actor, { orders: [], next: null, carrying: null, busy: 0, label: null, faceTo: null, sidestep: 0 });
  Object.assign(actor.walker, { pos: { x: spot.x, y: game.world.plan.storeys[spot.floor].y, z: spot.z }, heading: FACE_ANGLE[spot.face], speed: 0, route: null, s: 0, onStair: false });
};

/** Stage a scene: keep the house as it stands, put away everyone not in it, and put its people on their marks. */
export const stage = (game: Game, scene: Scene): void => {
  const { world } = game;
  const actors = [...world.actors];
  game.staged = { actors, stood: Object.fromEntries(actors.map((a) => [a.id, stoodOf(a)])), abed: { ...game.abed } };
  if (!scene.stage) return;
  const { marks } = scene.stage;
  world.actors.splice(0, world.actors.length, ...actors.filter((a) => marks[a.id] !== undefined));
  for (const actor of world.actors) {
    putOnMark(game, actor, marks[actor.id]);
    // Up, for the scene, whatever the hour.
    delete game.abed[actor.id];
  }
};

/** Put the house back as it stood when the scene was staged: everyone in it again, in the same order, each as she was; whoever the scene brought on is gone. */
export const unstage = (game: Game): void => {
  const { staged } = game;
  if (!staged) return;
  game.world.actors.splice(0, game.world.actors.length, ...staged.actors);
  for (const actor of staged.actors) standAgain(actor, staged.stood[actor.id]);
  game.abed = { ...staged.abed };
  game.staged = null;
};
