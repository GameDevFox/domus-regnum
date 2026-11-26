import type { FloorId, World } from "../space";

// A cutscene: a scene the house plays out by itself, to tell the player something. People walk
// about the real house, in it and out of doors, as they do at any other time; they speak, a line
// at a time; the player may be given a choice; and the scene can hand over to anything else (a
// menu, a game within the game) and take up again when that is done.
//
// A scene is written as plain data: a list of steps, some of which hold lists of their own. So a
// scene can be read, tested and stepped through without a screen, and the same scene plays the
// same way every time. What is drawn of it (the speakers' portraits, the line, the choices) is
// read off the playing scene by whoever draws (src/demo3d/scene-stage.ts).

/** Somewhere to stand: a spot of the house by its name, or any point of the ground, in the house or out of it. */
export type Where = string | { x: number; z: number };

/** Which side of the screen a speaker's portrait stands at. */
export type Side = "left" | "right";

/** Someone who takes part in a scene. */
export type Role = {
  /** As she is named over her lines. */
  name: string;
  /** Her portrait, by the name of its picture. */
  portrait: string;
  /** The side her portrait stands at. Left to the scene, the first to speak stands at the left and the next at the right. */
  side?: Side;
  /** The picture of her that walks the house, if the scene brings her on: someone of the household has hers already. */
  sprite?: string;
};

/** One answer the player can give when a scene asks. */
export type Option = {
  text: string;
  /** What the choice is remembered as, in the scene's `vars.choice`; its place in the list, if it has no name. */
  id?: string;
  /** What is played if it is chosen, before the scene goes on. */
  then?: Step[];
};

/** Returned by a called function that will say for itself when the scene may go on (`resume`). */
export const HOLD = Symbol("hold");

/** What a function called from a scene is given. */
export type Calling = {
  world: World;
  /** The scene's own notes: what was chosen, and whatever the functions it calls care to keep. */
  vars: Record<string, unknown>;
  /** Let the scene go on, after a function that returned HOLD; with steps, those are played first. */
  resume: (then?: Step[]) => void;
};

/**
 * A function a scene calls. It may simply do something and return; return steps, which are then
 * played (a branch decided as the scene runs); or return HOLD, to keep the scene waiting until
 * it calls `resume`: for a menu to be shut, or a game within the game to be played out.
 */
export type Call = (calling: Calling) => void | Step[] | typeof HOLD;

export type Step =
  /** A line. The scene waits to be moved on. Nobody's line (`who` null) is the scene's own voice. */
  | { do: "say"; who: string | null; text: string }
  /** Bring someone onto the scene, at a spot or a point. */
  | { do: "enter"; who: string; at: Where }
  /** Take someone off it, who was brought on. */
  | { do: "leave"; who: string }
  /** Send someone somewhere: by the floors of the house to a spot, or straight across the ground to a point. The scene waits for her unless told not to. */
  | { do: "walk"; who: string; to: Where[]; wait: boolean }
  /** Wait until these have arrived where they were sent. */
  | { do: "arrive"; who: string[] }
  /** Turn someone to face someone else, or a point. */
  | { do: "face"; who: string; toward: Where }
  | { do: "wait"; seconds: number }
  /** Who the scene is looking at: the view goes to her. Null lets the view be. */
  | { do: "focus"; who: string | null }
  /** Ask the player. The scene waits for an answer, plays what the answer holds, and goes on. */
  | { do: "choice"; options: Option[] }
  | { do: "call"; run: Call };

/** How a scene is looked at when it opens: into which storey, from which side, and from how far. */
export type StageView = {
  storey: FloorId;
  /** Radians, as the page's view turns: 0 looks from the south, a quarter turn from the east. */
  azimuth: number;
  /** Metres from whoever the scene first looks at. */
  distance: number;
};

/**
 * How a scene is staged, like a scene of a play: where each of its people of the household
 * stands when it opens (a mark, a spot of the house), and how it is looked at. Everyone else is
 * put away while it plays, and everyone is put back as she was when it is over (src/game/staging.ts).
 */
export type Stage = {
  marks: Record<string, string>;
  view: StageView;
};

export type Scene = {
  id: string;
  cast: Record<string, Role>;
  steps: Step[];
  /** How it is staged. Without one, it is played in the house as it stands, and nobody is put away. */
  stage?: Stage;
};

/** What a playing scene is waiting for before it goes on. */
export type Waiting = { for: "advance" } | { for: "choice"; options: Option[] } | { for: "arrive"; who: string[] } | { for: "time"; left: number } | { for: "call" };

/** A scene as it is being played. */
export type Playing = {
  scene: Scene;
  /** The lists of steps being played, the innermost last, and how far through each it is. */
  frames: { steps: Step[]; at: number }[];
  waiting: Waiting | null;
  /** The line being spoken. */
  line: { who: string | null; text: string } | null;
  /** Whose portrait stands at each side: the last to have spoken there. */
  sides: Record<Side, string | null>;
  focus: string | null;
  vars: Record<string, unknown>;
  done: boolean;
};
