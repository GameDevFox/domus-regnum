import type { MapPoint, PlaceId } from "../game";
import { PIECES } from "./map-art";

// Someone at a place on the map is busy about it: she walks in a straight line to another spot
// of the place, some way off, stops there a moment, and walks to another, for as long as she is
// there. She walks at one pace and steps as she goes (a small bounce), so that she is seen to
// walk and not to drift. (The author's asking, 2026-11-13: "a subtle bouncing animation in a
// straight line to a random minimum distance away from the current location inside the bounds
// of the area, repeated until complete with task".)
//
// Where she is depends on nothing but who she is, where she is and how long she has been there:
// no chance, and nothing kept from one moment to the next. The same minute is the same spot,
// time stopped is her stood still, and a scene looked at twice is the same twice.
//
// She goes her rounds: each round begins and ends at the place's own point, but for the first,
// which begins where she comes into the place, at the end of the way to it. So a round is
// worked out from its start and never from the rounds before it, and the thousandth costs what
// the first does.

/** How long a round is, in the game's minutes: out from the place's own point, about it, and back. */
const ROUND_MINUTES = 60;
/** How fast she walks across the paper, in the map's units a minute: a little quicker than on the ways between places, which are drawn far shorter than they are. */
const PACE = 0.012;
/** How long she stops at each spot, in minutes. */
const REST_MINUTES = 3;
/** How much of a place's width, and of its height, she keeps within: its ground, not its roofs and tree-tops. The ground is seen from in front and above, so it is shallower down the paper than across it. */
const REACH = { across: 0.3, down: 0.14 };
/** No walk is shorter than this share of the place's reach: she does not shuffle on the spot. */
const LEAST_WALK = 0.45;
/** How long one step takes, in minutes, and how high it lifts her, in the map's units. (Twice as quick as it was first made, at the author's word.) */
const STEP_MINUTES = 0.375;
const STEP_LIFT = 0.006;

/** A spot of a place's ground: from its own point, in shares of its reach across and down (within a round of 1). */
type Spot = { x: number; y: number };
/** One walk of a round: from a spot to a spot, begun and ended at these minutes of the round. She stands at its end until the next begins. */
export type Walk = { from: Spot; to: Spot; start: number; end: number };

const MIDDLE: Spot = { x: 0, y: 0 };
const apart = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A number from 0 to 1 that is always the same for the same things: her name, which round it is, and which draw of the round. */
const chance = (who: string, round: number, n: number): number => {
  let seed = Math.imul(round + 1, 374761393) ^ Math.imul(n + 1, 2246822519);
  for (const letter of who) seed = Math.imul(seed ^ letter.charCodeAt(0), 668265263);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((seed ^ (seed >>> 16)) >>> 0) / 0xffffffff;
};

/** How far a place's ground reaches from its own point, across the paper and down it, in the map's units. */
const reachOf = (place: PlaceId): { x: number; y: number } => ({ x: PIECES[place].width * REACH.across, y: PIECES[place].width * PIECES[place].tall * REACH.down });

/**
 * The walks of one of her rounds at a place, in order. She sets out from the place's own point
 * (or, on the first round, from where she came into the place: `gate`, from the place's own
 * point, in the map's units), goes from spot to spot for as long as there is time to get back
 * to the place's own point, and walks back to it.
 */
export const roundOf = (who: string, place: PlaceId, round: number, gate: MapPoint = { x: 0, y: 0 }): Walk[] => {
  const reach = reachOf(place);
  /** How long a walk from one spot to another takes: by how far it is across the paper, at her pace. */
  const minutes = (a: Spot, b: Spot): number => Math.hypot((a.x - b.x) * reach.x, (a.y - b.y) * reach.y) / PACE;
  const walks: Walk[] = [];
  const first: Spot = round === 0 && (gate.x !== 0 || gate.y !== 0) ? { x: gate.x / reach.x, y: gate.y / reach.y } : MIDDLE;
  let at = first;
  let clock = 0;
  for (let n = 0; ; n++) {
    // Somewhere on the ground that is not the middle of it: a turn, and a distance out.
    const turn = chance(who, round, n * 2) * Math.PI * 2;
    const out = LEAST_WALK + (1 - LEAST_WALK) * Math.sqrt(chance(who, round, n * 2 + 1));
    const drawn = { x: Math.cos(turn) * out, y: Math.sin(turn) * out };
    // Too near where she stands, she goes to the far side of the place instead: no walk is a shuffle.
    const far = Math.max(1, Math.hypot(at.x, at.y));
    const to = apart(drawn, at) >= LEAST_WALK ? drawn : { x: -at.x / far, y: -at.y / far };
    const end = clock + minutes(to, at);
    // No time left to go there, stop, and be back by the end of the round: she walks back now.
    if (end + REST_MINUTES + minutes(to, MIDDLE) > ROUND_MINUTES) break;
    walks.push({ from: at, to, start: clock, end });
    at = to;
    clock = end + REST_MINUTES;
  }
  if (at !== MIDDLE) walks.push({ from: at, to: MIDDLE, start: clock, end: clock + minutes(at, MIDDLE) });
  return walks;
};

/** Where someone who has been at a place for some minutes is, from the place's own point, and how far her step lifts her. `gate` is where she came into it. */
export const wanderAt = (who: string, place: PlaceId, minutes: number, gate: MapPoint = { x: 0, y: 0 }): MapPoint & { lift: number } => {
  const round = Math.floor(minutes / ROUND_MINUTES);
  const into = minutes - round * ROUND_MINUTES;
  const scale = reachOf(place);
  const walks = roundOf(who, place, round, gate);
  // The walk she is on, or the one she last finished and is stood at the end of.
  const walk = [...walks].reverse().find((w) => w.start <= into);
  if (!walk) return { x: 0, y: 0, lift: 0 };
  const length = walk.end - walk.start;
  const walked = length > 0 ? Math.min(1, (into - walk.start) / length) : 1;
  // Stood at its end, she is at the spot itself.
  if (walked >= 1) return { x: walk.to.x * scale.x, y: walk.to.y * scale.y, lift: 0 };
  const steps = Math.max(1, Math.round(length / STEP_MINUTES));
  return {
    x: (walk.from.x + (walk.to.x - walk.from.x) * walked) * scale.x,
    y: (walk.from.y + (walk.to.y - walk.from.y) * walked) * scale.y,
    lift: Math.abs(Math.sin(walked * steps * Math.PI)) * STEP_LIFT,
  };
};

/** How far from a place's own point someone going about it can be, across and down the map: for whoever checks that she keeps to it. */
export const wanderReach = (place: PlaceId): { across: number; down: number } => ({ across: reachOf(place).x, down: reachOf(place).y });

export const WANDER = { ROUND_MINUTES, REST_MINUTES, LEAST_WALK, STEP_LIFT };
