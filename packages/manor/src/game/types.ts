import type { Playing } from "../cutscene";
import type { Actor, World } from "../space";
import type { BakeId } from "./bakes";
import type { Known, PlaceId, ThingId } from "./country";
import type { CurioId } from "./curios";
import type { CropId, Garden, Tending } from "./garden";
import type { Search, Searching } from "./discovery";
import type { ClothingId, GoodId, ShopId, WareId } from "./wares";

// The 3D game's rules, headless. The house (src/space) knows where things are and how long a walk
// takes; this knows what the household is trying to do and what it has. It is its own game, not
// the 2D one's (src/sim): rules are carried over from there and reshaped, never shared.

/** A job. It has as many places as its station has (tuning.ts, JOB_PLACES), and that many people can hold it. */
export type JobId = "bake" | "shop" | "garden" | "lab";

export type BakeStep = "fetch" | "knead" | "bake" | "deliver" | "return";
export type ShopStep = "serve" | "return";

/** The steps of a batch: `return` is only the walk back to her place to wait. */
export type BatchStep = Exclude<BakeStep, "return">;

export type BakeTask = {
  job: "bake";
  /** What she is in the middle of; null while she waits. */
  step: BakeStep | null;
  /** The step she takes up next, once what it needs is there. */
  next: BatchStep;
  /** What the batch she has in hand is to be: settled as she takes its makings from the pantry. */
  makes: BakeId;
  /** The batch in her arms, as far as it has got: flour and dough go back to the pantry, as a sack and whatever else went in, if she is taken off. */
  has: "flour" | "dough" | BakeId | null;
  /** Her own place at the kitchen table, where she kneads and where she waits. */
  place: string | null;
  /** Taken off the job with loaves in her arms: this delivery is her last. */
  last: boolean;
};

export type GardenTask = {
  job: "garden";
  /** What she is in the middle of: seeing to a square of a plot, or coming in with what she has picked; null between. */
  step: Tending | "in" | null;
  /** The plot she is stood beside, and the square of it she is seeing to. */
  plot: number | null;
  square: number | null;
  /** What she has picked and not yet brought in. */
  has: Partial<Record<CropId, number>>;
  /** Taken off the garden while out of doors, or with something picked: she comes in, puts it away, and that is her last of it. */
  last: boolean;
};

/** What someone with a job is in the middle of. `step` is null while she waits. */
export type Task = BakeTask | GardenTask | LabTask | { job: "shop"; step: ShopStep | null; /** Who she is serving. */ customer: string | null };

/** The alchemy: `step` is null while he waits, for a device to be chosen or with nothing left to invent. */
export type LabTask = { job: "lab"; step: "work" | null };

export type Customer = {
  /** Also their id in the house. */
  id: string;
  /** Which place at the counter is theirs: none until they are in at the shop's door, and find one free. */
  place: number | null;
  /** Walking up from the gate; walking in to a place at the counter; standing unserved; being fetched for; walking out and away. */
  state: "coming" | "arriving" | "waiting" | "attended" | "leaving";
  /** Seconds stood unserved. */
  waited: number;
};

/** Something worth marking when it happens: a mastery earned, an invention ready to be made, a place found, a way on from a place, or a thing found to gather there. */
export type Feat = { who: string; what: "bread" | "invention" | "found" | "way" | "thing" | "curio" | "shop"; /** The clock at which it happened. */ at: number; /** The place found, or the place a way on, a thing or a curio was found at. */ place?: PlaceId; /** The thing found. */ thing?: ThingId; /** The curio come upon. */ curio?: CurioId; /** The shop found. */ shop?: ShopId };

/** The inventions there are. */
export type DeviceId = "dumbwaiter" | "everwarm" | "till";

/** The Master's inventing: his work in the laboratory fills a measure, and when it is full there is a device to choose. */
export type Lab = {
  /** Minutes of work towards the next invention, and how many it takes. */
  progress: number;
  needed: number;
  /** The measure is full, and the choice has not been made. */
  ready: boolean;
};

/**
 * Why someone out of doors asks what she is to do next: she has found the place itself; exploring,
 * she has found something it holds; what she was at there is done (a ware bought, goods sold);
 * her basket is full; the time she might spend at it is up; she has come to a place she was only
 * told to go to; or what she was at was stopped.
 */
export type AskWhy = "place" | "found" | "done" | "full" | "time" | "arrived" | "stopped" | "stuck";

/** Why someone cannot be sent, or go on to what is queued, just now (outing-send.ts). */
export type NotNow = "nobody" | "out" | "night" | "coin" | "late" | "needless" | "shop" | "nothing" | "full";

/**
 * What someone is sent to do, or has queued: where, and what there (nothing, only to go); and
 * the ware to buy, or the goods to sell. Queued, a place of home is the walk home.
 */
export type Errand = {
  to: PlaceId;
  doing: OutingDoing | null;
  ware?: WareId;
  good?: GoodId;
  /** Put first in her queue by the game, not the player: what she was sent to explore or gather at a place not yet found, as she asks on finding it (outing-place.ts). Told something else instead, only this is taken out (outing-tell.ts). */
  carried?: true;
};

/** What she was doing at a place when it came to an end: the thing, and the ware she bought or the goods she sold. */
export type Did = { doing: OutingDoing; ware?: WareId; good?: GoodId };

/** Someone out of doors asking what she is to do next, at the place she is at. */
export type Ask = {
  who: string;
  place: PlaceId;
  why: AskWhy;
  /** What she has just found there, exploring it, by its id (discovery.ts): only where `why` is "found". */
  news?: string[];
  /** What she was at, where it is what came to an end: done, full, her time up, or stopped. */
  did?: Did;
  /** The others of her party, who ask with her: one question, answered for all. Left out for someone out alone. */
  with?: string[];
  /** Where `why` is "stuck": the step queued next, which cannot be done, and why; and why she would have asked without it (`plain`), were it taken out. */
  stuck?: { next: Errand; why: NotNow; plain?: AskWhy };
};

/** What someone is sent out to do at a place: buy a ware in town, sell goods there, explore a place, or gather what a place holds. */
export type OutingDoing = "buy" | "sell" | "explore" | "gather";

/**
 * How an outing is bounded, whatever it is for: the longest she may spend at any one thing at a
 * place, in minutes; and whether she is to be home before bed. And, sending her, whether she is
 * to come home when what she is sent for is done, without asking (false unless asked for): that
 * is the walk home queued after it (`Outing.queue`), and is not kept with the outing's terms.
 */
export type Terms = { limit: number; homeByBed: boolean; thenHome?: boolean };

/** Lots of goods, by kind: what is in a basket. */
export type Goods = Partial<Record<GoodId, number>>;

/**
 * Someone sent out of the house to a place on the map. She does there what she was sent for,
 * and then asks what she is to do next; she comes home when she is told to, or when the return
 * was asked for beforehand, or in time for bed if she is to be home by then (outing.ts).
 */
export type Outing = {
  who: string;
  /** Where she is bound, or is: a place on the map; or home, once she has been turned for it on the road. */
  to: PlaceId;
  /** What she is to do there, or is doing: nothing, sent only to go there, or while she asks, waits, or is on her way home. */
  doing: OutingDoing | null;
  /** Buying: the ware she is to buy, its price paid out of the house's coin and the ware not yet hers. */
  buys: WareId | null;
  /** Selling: the goods she is to sell, all she carries of them. */
  sells: GoodId | null;
  terms: Terms;
  /** The bedtime she is to be at the door by, if she was told to be home before bed. */
  bedBy: number | null;
  /** On her way out, to the front door and down the drive to the gate; off the property; on the drive again, coming up to the door; in at the door and carrying what she has to the pantry. */
  state: "leaving" | "away" | "coming" | "returning";
  /** What she has with her: lots of goods in her basket (gathered, or taken from the pantry to sell); wares bought, how many of each; the coin what she sold fetched. */
  basket: Goods;
  bought: Partial<Record<WareId, number>>;
  purse: number;
  /** Her basket as it was when she began gathering: what the gathering picks goes in on top of it. */
  kept: Goods;
  /** What she has come upon that she was not sent for, and is bringing home. */
  found: CurioId[];
  /**
   * The clocks at which she was sent, is at the place, sets off home from it, and is at the
   * front door again. Until she has turned for home, the last two are when she would, if she came
   * home the moment what she is at there is done (at the latest).
   */
  sent: number;
  arrive: number;
  depart: number;
  back: number;
  /** She has turned for home, or will at `depart`: nothing more is done out of doors. */
  homeward: boolean;
  /** Told to stay where she is and do nothing: she waits at the place, and does not ask. */
  waits: boolean;
  /** The times above are settled: she has turned for home, or is at a thing of fixed length with the return asked for. */
  done: boolean;
  /** Exploring, what she is out to find: the place itself, while it has not been found. */
  seeks: PlaceId | null;
  /** How many things exploring has found at the place since she was set to it. */
  news: number;
  /**
   * The clock at which she went out at the gate; null until she has. Turned on the road, or sent
   * on from a place (`turned`), it is the clock at which she was: her way there is walked from then.
   */
  left: number | null;
  /**
   * Turned on the road, or sent on from one place to another (outing-send.ts): the point she was
   * at, and the places she makes for from it, the last of them where she is bound. Null for
   * someone who set out from the house and has not been turned.
   */
  turned: { from: Whereabouts; via: PlaceId[] } | null;
  /** The clock up to which her time at what she is doing has been counted, and how many minutes of it that has come to. */
  counted: number;
  spent: number;
  /** Whether she has set off for the door: first she puts down what she was at. */
  setOff: boolean;
  /** Herself, while she is out of the house. */
  gone: Actor | null;
  /** What she was at was cancelled in the night: when the house wakes she says she stopped, and asks (or goes on). */
  stopped?: true;
  /**
   * What she is to do after what she is at, in order (outing-queue.ts): a thing at a place, or
   * only to go there, or the walk home, which is always the last. Empty, she asks what next.
   */
  queue: Errand[];
  /**
   * The party she is out with, herself among them, the first of them the one who pays for what
   * the party buys (outing-party.ts). Left out for someone out alone.
   */
  party?: string[];
};

/** Where someone out of doors is: at a place, or so far along the way from one to the next (0 at the first, 1 at the second). */
export type Whereabouts = { at: PlaceId } | { from: PlaceId; to: PlaceId; along: number };

/** Flour that has been ordered and paid for. */
export type Delivery = {
  /** Also the carter's id in the house, while he is in it. */
  id: string;
  sacks: number;
  /** The clocks at which it was ordered, and at which the cart is in the lane behind the house. */
  ordered: number;
  due: number;
  /** On its way; being carried in to the pantry; set down, and the carter on his way out. */
  state: "coming" | "carrying" | "leaving";
};

/** Someone as she stood: where, which way and how fast she was walking, what she was told to do and how far through it she was, and what she carried. */
export type Stood = Pick<Actor, "orders" | "next" | "carrying" | "busy" | "label" | "faceTo" | "sidestep" | "walked" | "errands"> & { walker: Actor["walker"] };

/** The house as it stood when a scene was staged: everyone who was in it, in order, each as she stood; and who was in bed. */
export type Staged = { actors: Actor[]; stood: Record<string, Stood>; abed: Game["abed"] };

/** What someone at a job is waiting for: flour to bake with, her turn at the oven, room on the shop's shelf, or something to sell (loaves, or anything else that is baked). */
export type Need = "flour" | "oven" | "room" | "loaves" | "choice";

export type Game = {
  world: World;
  /** Minutes since the midnight before the first morning (see clock.ts). */
  clock: number;
  /** Whose bed is where: a spot of the house for each of the household. */
  beds: Record<string, string>;
  /** Who is on her way up to bed, and who is in it. Empty by day. */
  abed: Record<string, "going" | "in" | undefined>;
  /** The people who live here, by id, in the order they are listed. Customers are not among them. */
  household: string[];
  coin: number;
  /** Sacks of flour on the pantry shelf. */
  flour: number;
  /** The things the kitchen has ever baked: a recipe is known once a batch of it has come out of the oven. */
  recipes: BakeId[];
  /** What is on the shop's shelf: how many of each thing the kitchen bakes. */
  shelf: Record<BakeId, number>;
  /** Flour ordered and not yet on the shelf, in the order it was asked for; and how many orders there have been. */
  deliveries: Delivery[];
  orders: number;
  posts: Record<string, JobId | undefined>;
  tasks: Record<string, Task | undefined>;
  /** Who has each place that one person uses at a time: a place at the table, the oven. */
  claims: Record<string, string | undefined>;
  customers: Customer[];
  lab: Lab;
  /** The devices that have been made, in the order they were. */
  devices: DeviceId[];
  /** Who is on an outing: out of the house, or on her way out or in. */
  outings: Outing[];
  /** The cutscene being played, if one is: the house's own doings stand still while it is (scenes.ts). */
  scene: Playing | null;
  /** The house as it stood when the scene playing was staged, to be put back when it is over (staging.ts). */
  staged: Staged | null;
  /** A scene asked for by name (the dev menu's "play"), to begin as one that is due would: once its people of the household are home. */
  cue: string | null;
  /** The cutscenes that have been played, by name: each is played once. */
  seen: string[];
  /** The occasion the house has taken on as its first, if it has chosen one; and the day it is to be held, by the count of days since the game began. */
  goal: string | null;
  occasionDay: number | null;
  /** Questions waiting for the player, first come first: someone out of doors has nothing left to do, and asks what she is to do next. Time stands still until each is answered (outing-tell.ts, `answer`). */
  asks: Ask[];
  /** Minutes spent exploring each place, by everyone, ever. */
  explored: Partial<Record<PlaceId, number>>;
  /** The things found to gather at each place. */
  finds: Partial<Record<PlaceId, ThingId[]>>;
  /** The curios that are in the house. */
  curios: CurioId[];
  /** What there is to wear that has been bought and put by: how many of each (wares.ts). */
  wardrobe: Record<ClothingId, number>;
  /** The shops in town that the house has found: none to begin with (wares.ts). */
  shops: ShopId[];
  /** How far each place has been searched, deck by deck: the points left in its pools, and what has been come upon (discovery.ts). */
  searches: Partial<Record<PlaceId, Partial<Record<string, Search>>>>;
  /** The decks of places whose dials have been set anew in this game (the dev menu's odds window), place by place and deck by deck: none to begin with, and every other deck is searched as the code has it (discovery.ts, `retune`). */
  dials: Partial<Record<PlaceId, Partial<Record<string, Searching>>>>;
  /** What is in the pantry to cook with: lots of each thing gathered out of doors, and how many of each crop brought in from the garden. */
  stock: Record<ThingId | CropId, number>;
  /** The kitchen garden (garden.ts). */
  garden: Garden;
  /** What the house knows of the country round it: the places on its map, each found or still unknown (country.ts). */
  places: Partial<Record<PlaceId, Known>>;
  /** Loaves each person has baked in her life, by id: practice, which is what a mastery is made of. */
  baked: Record<string, number | undefined>;
  /** Feats in the order they happened. Nothing is ever taken off the list. */
  feats: Feat[];
  /** Loaves sold, and customers who gave up. */
  sold: number;
  lost: number;
  /** The same two, since this morning. */
  today: { sold: number; lost: number };
  /** How much custom the shop has: so many times the first day's. It goes up after a day on which nobody went away unserved. */
  custom: number;
  /** Seeded chance: with the same seed and the same commands, the same day. */
  rng: number;
  /** The seed the game was begun with: what is settled once for the whole game is settled by it. */
  seed: number;
  untilCustomer: number;
  /** Customers so far, for naming the next. */
  arrivals: number;
  /** How many rounds of housework each person has been given. */
  turns: Record<string, number>;
};
