// The whole game state is plain data: deterministic given a seed and a list of commands, with no
// DOM, timers or randomness outside `rng`. The UI, the bots and the tests all drive the same sim.

export type GoodId = string;
export type RecipeId = string;
export type RoomId = string;
export type MaidId = string;
export type DeviceId = string;
export type TraitId = string;
export type SiteId = string;

/** The two complementary poles. An occasion scores Comfort × Grace: neither alone is worth much. */
export type Pole = "comfort" | "grace";

export type Stock = Record<GoodId, number>;

export type Good = {
  id: GoodId;
  name: string;
  glyph: string;
  /** Ingredients have no pole: they are for making things, though anything can be sold. */
  pole: Pole | null;
  /** What one serving adds to its pole at an occasion. */
  value: number;
  /** Coin a walk-in customer pays for one. */
  price: number;
  /** One line on what makes this good itself and not a clone of another. */
  note: string;
  /** Something the household would eat at supper. */
  edible: boolean;
  /** Bought, never made: there is no recipe for it. */
  luxury?: boolean;
};

export type RoomKind =
  | "closed"
  | "empty"
  | "pantry"
  | "kitchen"
  | "shop"
  | "parlour"
  | "lab"
  | "conservatory"
  | "stillroom"
  | "dining"
  | "music"
  | "bath";

/** What a maid assigned to a room of this kind does. */
export type RoomRole = "none" | "produce" | "serve" | "run" | "research" | "perform";

export type RoomDef = {
  kind: RoomKind;
  name: string;
  glyph: string;
  role: RoomRole;
  /** Seats for sit-in patrons by day and guests at an occasion. */
  seats: number;
  /** Coin to fit out an empty room as this. 0 = not offered. */
  cost: number;
  blurb: string;
};

export type Recipe = {
  id: RecipeId;
  makes: GoodId;
  /** Goods produced per batch. */
  batch: number;
  /** Seconds of work per batch. */
  seconds: number;
  /** Coin of ordinary provisions (flour, coal, tea leaf) used per batch. */
  coin: number;
  /** Special ingredients consumed per batch. */
  needs: Stock;
  room: RoomKind;
  /** Known from the start, or learned from an offer or a gift. */
  starter: boolean;
};

export type DeviceDef = {
  id: DeviceId;
  name: string;
  glyph: string;
  /** Room kinds this can be installed in; "tool" devices are carried by a maid instead. */
  fits: RoomKind[] | "tool" | "pack";
  /** The one thing it does. */
  effect: string;
};

export type TraitDef = {
  id: TraitId;
  name: string;
  effect: string;
};

export type MaidDef = {
  id: MaidId;
  name: string;
  trait: TraitId;
  /** Hair and dress colours for the little figure. */
  hair: string;
  dress: string;
  blurb: string;
  hireCost: number;
  /** Hired for one evening and dressed in livery, not an apron. */
  livery?: boolean;
  /** Lines she may say; picked by situation key. */
  lines: Record<string, string[]>;
};

export type Vec = { x: number; y: number };

export type Step =
  | { kind: "walk"; to: RoomId }
  | { kind: "take"; goods: Stock }
  | { kind: "put" }
  | { kind: "supplies" }
  | { kind: "work"; seconds: number; total: number; action: WorkAction };

export type WorkAction =
  | { kind: "batch"; recipe: RecipeId }
  | { kind: "serve"; visitor: number; good: GoodId }
  | { kind: "load" }
  | { kind: "research" }
  | { kind: "perform" }
  | { kind: "draw" };

export type Maid = {
  id: MaidId;
  isLord: boolean;
  pos: Vec;
  /** The room she is assigned to. Null = waiting in the hall. */
  room: RoomId | null;
  carrying: Stock;
  plan: Step[];
  tool: DeviceId | null;
  /** Days of "cuts and bruises" left: works and walks at half speed. */
  hurtDays: number;
  /** Away on an expedition: not in the house at all. */
  away: boolean;
  /** Short status the UI shows over her head ("needs honey", "shelf full"). */
  status: string;
  /** Where she was posted by day, remembered over an occasion so she goes back to it afterwards. */
  dayRoom?: RoomId | null;
  /** Her last batch burnt. She watches the next one like a hawk: it will not. */
  burntLast?: boolean;
  /** Seconds left on a speech bubble, and its text. */
  say: string;
  sayLeft: number;
};

export type Room = {
  id: RoomId;
  col: number;
  floor: number;
  kind: RoomKind;
  device: DeviceId | null;
  shelf: Stock;
  recipe: RecipeId | null;
  /** Recipes this room turns out in rotation: whichever the house has least of is made next. */
  rota: RecipeId[];
  /** Provisions on hand: one is used per batch; a pantry trip refills. */
  supplies: number;
  /** Bath water drawn and hot, in baths. */
  water: number;
  /** Wallpaper chosen for the room. Purely for looks. */
  paper?: string;
};

export type VisitorKind = "customer" | "patron" | "guest" | "order";

export type Visitor = {
  id: number;
  kind: VisitorKind;
  room: RoomId | null;
  /** Customers and patrons: the specific goods they still want. */
  wants: GoodId[];
  /** Goods already had (a guest takes each kind once). */
  had: GoodId[];
  patience: number;
  patienceMax: number;
  claimedBy: MaidId | null;
  /** Seat or queue index for drawing. */
  spot: number;
  /** Guest of honour at an occasion. */
  honour: boolean;
  /** Seconds still savouring a serving (or soaking); nothing more is accepted meanwhile. */
  busy: number;
  /** Seconds since leaving, for the exit animation; -1 while present. */
  leaving: number;
  happy: boolean;
  face: string;
  /** At an occasion: the one thing this guest has taken a fancy to, and how long the fancy lasts. */
  fancy: GoodId | null;
  fancyLeft: number;
  /** The host has noticed the fancy: whoever is serving the room will bring it next. */
  noted: boolean;
};

export type OfferKind = "hire" | "room" | "recipe" | "tool" | "wing" | "luxury";

export type Offer = {
  kind: OfferKind;
  /** MaidId, RoomKind, RecipeId, DeviceId or wing name. */
  ref: string;
  cost: number;
  sold: boolean;
  /** How many, for goods bought by the case. */
  qty?: number;
};

export type Tier = "shortfall" | "success" | "triumph";
export type Grade = "humble" | "grand" | "royal";

export type TwistId = string;

export type OccasionDef = {
  id: string;
  name: string;
  /** Humble is always on the table; grand needs the last occasion to have gone well; royal needs a triumph. */
  grade: Grade;
  chapter: number;
  guests: number;
  target: number;
  honourName: string;
  honourFace: string;
  twist: TwistId;
  intro: string;
  /** Gift on success. */
  gift: { kind: "recipe" | "tool" | "coin" | "device"; ref: string; amount?: number };
};

export type OccasionState = {
  def: OccasionDef;
  comfort: number;
  grace: number;
  /** Seconds elapsed of the evening. */
  t: number;
  served: number;
  /** Reception rooms lit by candles tonight. */
  lit: RoomId[];
  /** What is being served tonight, fixed when the evening begins. */
  menu: GoodId[];
  /** Fancies caught: servings that were just what the guest wanted. */
  fancies: number;
  /** Seconds with nothing left that anyone would take; the evening ends early once this runs on. */
  idle: number;
  /** Seconds the evening lasts (a twist can shorten it). */
  length: number;
  done: boolean;
  tier: Tier | null;
  /** The score and the Hearth level it was reckoned at, fixed when the evening ends. */
  score: number;
  level: number;
};

export type ExpeditionTurn = {
  found: Stock;
  /** Chance the next step goes wrong, 0..1. */
  nextRisk: number;
  text: string;
};

export type Expedition = {
  maid: MaidId;
  site: SiteId;
  pack: (GoodId | DeviceId)[];
  depth: number;
  haul: Stock;
  /** Seconds until the next turn resolves or she gets home. */
  timer: number;
  state: "travelling" | "deciding" | "pressing" | "returning" | "home";
  hurt: boolean;
  log: string[];
  nextRisk: number;
};

export type SiteDef = {
  id: SiteId;
  name: string;
  glyph: string;
  blurb: string;
  /** Loot table per depth: each entry is [good, min, max]. */
  depths: { text: string; loot: [GoodId, number, number][]; risk: number; hazard: string }[];
  /** Gear that halves the risk here. */
  key: DeviceId | null;
  closedOnSabbath: boolean;
};

export type Phase = "title" | "invite" | "morning" | "day" | "occasion" | "result" | "evening" | "offers" | "sabbath" | "ended";

export type Pending =
  | { kind: "invention"; options: DeviceId[] }
  | { kind: "gift"; text: string }
  | { kind: "note"; title: string; text: string };

/** Someone at the door with something to sell, or wanting to buy. Gone if not answered. */
export type Trader = {
  face: string;
  text: string;
  /** Coin the house pays (negative: coin the house is paid). */
  cost: number;
  gives: Stock;
  takes: Stock;
  /** A device handed over with the goods. */
  device?: DeviceId;
  left: number;
};

export type LogEntry = { t: number; day: number; text: string; tone: "good" | "bad" | "plain" };

/** Standing order per good: sell it to walk-ins, or keep it for the household and the occasion. */
export type Order = "sell" | "keep";

export type Stats = {
  sold: number;
  lost: number;
  made: number;
  coinEarned: number;
  /** Coin gone on provisions and wages. */
  spent: number;
  suppers: number;
  feasts: number;
};

export type Game = {
  seed: number;
  rng: number;
  phase: Phase;
  /** Day counter across the run, from 1. */
  day: number;
  chapter: number;
  /** Day within the chapter, from 1. */
  chapterDay: number;
  /** Seconds into the current real-time phase. */
  t: number;
  coin: number;
  /** Shared suppers and hardships survived. Its level multiplies every occasion. */
  hearth: number;
  /** Standing with society: successes earn it, grand invitations need it. */
  favour: number;
  rooms: Room[];
  maids: Maid[];
  visitors: Visitor[];
  nextVisitorId: number;
  recipes: RecipeId[];
  orders: Record<GoodId, Order>;
  /** Kinds struck off the guests' menu. Everything else worth serving is on it. */
  offMenu: GoodId[];
  /** Devices shown at the last invention and passed over: not shown again straight away. */
  passedOver: DeviceId[];
  /** Devices invented but not yet installed. */
  spareDevices: DeviceId[];
  ownedDevices: DeviceId[];
  research: number;
  inventions: number;
  pending: Pending[];
  offers: Offer[];
  rerolls: number;
  occasion: OccasionState | null;
  /** The occasion this chapter is building toward. */
  upcoming: OccasionDef | null;
  expedition: Expedition | null;
  results: { occasion: string; grade: Grade; tier: Tier; score: number; target: number }[];
  log: LogEntry[];
  stats: Stats;
  today: Stats;
  arrivals: Record<RoomId, number>;
  /** Supper the household will share tonight if the pantry allows. */
  supperPlan: "none" | "shared" | "feast";
  lastSupper: "none" | "shared" | "feast";
  /** Renown: each success brings more walk-ins. */
  renown: number;
  wingsOpen: { west: boolean; east: boolean };
  endless: boolean;
  /** What the household is paid each night. Generous wages cost more and grow the Hearth. */
  wages: "fair" | "generous";
  trader: Trader | null;
  /** Gifts made to the parish; each costs more than the last. */
  donations: number;
  /** Things bought for their own sake. They do nothing. */
  ornaments?: string[];
  /** Help hired for the coming occasion only: a quartet, a chef, footmen. */
  hired?: string[];
  /** A maid lost in a wager and working elsewhere for a few days. */
  lent: { maid: MaidId; days: number } | null;
};

export type Command =
  | { kind: "assign"; maid: MaidId; room: RoomId | null }
  | { kind: "recipe"; room: RoomId; recipe: RecipeId | null }
  | { kind: "rota"; room: RoomId; recipe: RecipeId }
  | { kind: "menu"; good: GoodId; on: boolean }
  | { kind: "order"; good: GoodId; order: Order }
  | { kind: "invite"; grade: Grade }
  | { kind: "startDay" }
  | { kind: "buy"; index: number; room?: RoomId }
  | { kind: "reroll" }
  | { kind: "nextDay" }
  | { kind: "continue" }
  | { kind: "choose"; index: number }
  | { kind: "install"; device: DeviceId; room?: RoomId; maid?: MaidId }
  | { kind: "uninstall"; room: RoomId }
  | { kind: "carriages" }
  | { kind: "expedition"; maid: MaidId; site: SiteId; pack: (GoodId | DeviceId)[] }
  | { kind: "press" }
  | { kind: "turnBack" }
  | { kind: "supper"; plan: "none" | "shared" | "feast" }
  | { kind: "demolish"; room: RoomId }
  | { kind: "paper"; room: RoomId; paper: string }
  | { kind: "note"; visitor: number }
  | { kind: "trade" }
  | { kind: "dismiss" }
  | { kind: "wages"; plan: "fair" | "generous" }
  | { kind: "donate" }
  | { kind: "ornament"; id: string }
  | { kind: "engage"; id: string };
