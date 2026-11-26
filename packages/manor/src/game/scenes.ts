import { arrive, call, choice, enter, face, focus, leave, play, say, start, stepScene, tell, walk } from "../cutscene";
import type { Scene } from "../cutscene";
import { stepWorld } from "../space";
import { dayOf, isNight, minuteOfDay } from "./clock";
import { FRONT_STEPS, GATE } from "./grounds";
import { castHome, stage, unstage } from "./staging";
import { HOUR, OCCASION_AFTER_DAYS, SPOT } from "./tuning";
import type { Game } from "./types";

// The scenes the game plays, and when. A scene is played once, when what it waits for has come
// about and its people of the household are at home; while it plays, the clock and the house's
// own doings stand still, and only the people in the scene move. Each is staged: everyone else
// is put away while it plays, and put back as she was after (staging.ts). What a scene is made
// of is src/cutscene.

/**
 * Where the Master stands as the first caller comes up the drive: at the far end of the passage
 * from the front door, so that his walk to it is the same every time, and about as long as the
 * caller's up the drive (the author's asking, 2026-11-16: "place the master so it takes him the
 * same amount of time to come to the door each time").
 */
export const MASTER_MARK = "passage.sideboard";
/** The length of that walk, in metres, by the floors of the house: about seven seconds of his. */
export const MASTER_WALK_METRES = 9.2;
/** How the first caller is looked at: into the ground floor, from the south-east, as the page first opens on the house, and close. */
const FIRST_CALLER_VIEW = { storey: "ground", azimuth: Math.PI / 4, distance: 12 } as const;

/**
 * The first caller: someone from the parish asks whether the Master is At Home, and the house
 * chooses its first occasion. PLACEHOLDER WORDING, written so that the scene can be played: every
 * line is the author's to rewrite or strike. The caller and the two occasions are the 2D game's
 * (src/sim/content/world.ts): the young priest, An Afternoon Tea, The Squire's Lady to Tea.
 */
const firstCaller = (game: Game): Scene => ({
  id: "first-caller",
  cast: {
    master: { name: "The Master", portrait: "master", side: "left" },
    evelyn: { name: "Evelyn", portrait: "evelyn", side: "left" },
    priest: { name: "The young priest", portrait: "priest", side: "right", sprite: "townsman" },
  },
  // (Evelyn is of the cast, and has no step in it: she is not put on a mark, and is put away with the rest.)
  stage: { marks: { master: MASTER_MARK }, view: FIRST_CALLER_VIEW },
  steps: [
    enter("priest", GATE),
    focus("priest"),
    start("master", SPOT.frontDoor),
    walk("priest", FRONT_STEPS),
    arrive("master"),
    face("priest", "master"),
    focus("master"),
    say("priest", "Good morning! Forgive me calling unannounced. I am new to the parish, and I am told this is the house to call at."),
    say("master", "You are told wrongly, I am afraid. Nobody calls here."),
    say("priest", "Then I shall be the first. The parish would like to know its neighbours. Might the Master be At Home, one afternoon soon?"),
    say("master", "At Home. To company."),
    tell("It is the first time anyone has asked."),
    say("master", "…Very well. What had you in mind?"),
    choice(
      { id: "tea", text: "An afternoon tea, for a few friends of the parish", then: [say("priest", "Splendid! Three of us, and we are easily pleased."), say("master", "Evelyn will see to it. I had better find out what one serves.")] },
      { id: "squire", text: "The squire's lady to tea: aim a little higher", then: [say("priest", "The squire's lady? She has been heard to wonder aloud what goes on in this house."), say("master", "Then she had better come and see. Heaven help us.")] },
    ),
    // The occasion is on the calendar from now: a week from today.
    call(({ vars }) => {
      game.goal = String(vars.choice);
      game.occasionDay = dayOf(game.clock) + OCCASION_AFTER_DAYS;
    }),
    say("priest", "I shall send word of the day. Good morning to you!"),
    focus("priest"),
    walk("priest", GATE),
    leave("priest"),
  ],
});

/** Each scene, and what it waits for. The first that is due and has not been played is played. */
export const SCENES: { id: string; due: (game: Game) => boolean; scene: (game: Game) => Scene }[] = [
  // On the second morning, once the house has had a day to find its feet: at ten, with the shop open and everyone about.
  { id: "first-caller", due: (game) => dayOf(game.clock) >= 2 && minuteOfDay(game.clock) >= 10 * HOUR && !isNight(game.clock), scene: firstCaller },
];

/** The scene to begin now, if any: the one asked for by name, or else the first that is due and not yet played; either only once its people of the household are home, and nobody is asking what she is to do (the clock stands still for her, and the scene would shut the map she is answered on). */
export const sceneDue = (game: Game): Scene | null => {
  if (game.scene || game.asks.length > 0) return null;
  const entry = game.cue !== null ? SCENES.find((s) => s.id === game.cue) : SCENES.find((s) => !game.seen.includes(s.id) && s.due(game));
  const scene = entry?.scene(game);
  return scene && castHome(game, scene) ? scene : null;
};

/**
 * Begin a scene, if none is playing: it is staged (everyone not in it put away, its people on
 * their marks) and its opening steps are taken, those that need no time: whoever it brings on is
 * there, and it is looking where it looks first.
 */
export const beginScene = (game: Game, scene: Scene): boolean => {
  if (game.scene) return false;
  stage(game, scene);
  if (!game.seen.includes(scene.id)) game.seen.push(scene.id);
  if (game.cue === scene.id) game.cue = null;
  game.scene = play(scene);
  stepScene(game.scene, game.world, 0);
  return true;
};

/** End the scene playing, over or not: everyone is put back as she stood when it began. */
export const endScene = (game: Game): void => {
  game.scene = null;
  unstage(game);
};

/**
 * Play the scene that is playing, or begin one that is due. True while a scene has the house:
 * the caller lets everything else stand still. The people in it walk; nothing else moves. A
 * scene that is over is ended at the next moment, not the one it ends in, so that whoever draws
 * it has a moment in which to see that it is over before the house is put back.
 */
export const playScenes = (game: Game, dt: number): boolean => {
  if (game.scene?.done) endScene(game);
  if (!game.scene) {
    const due = sceneDue(game);
    if (!due) return false;
    beginScene(game, due);
  }
  if (!game.scene) return false;
  stepScene(game.scene, game.world, dt);
  stepWorld(game.world, dt);
  return true;
};
