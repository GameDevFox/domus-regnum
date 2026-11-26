// Every number the balance depends on, named. Bots in bin/bots.ts are how these get tuned.

/** Fixed sim step, seconds. */
export const TICK = 0.1;

/** Length of the working day and of an occasion's evening, in sim seconds. */
export const DAY_SECONDS = 96;
export const OCCASION_SECONDS = 60;

/** House grid: two rooms each side of a central stair, four floors (0 = cellar). */
export const COLS = 5;
export const FLOORS = 4;
export const STAIR_COL = 2;
export const WEST_WING_COL = 0;
export const EAST_WING_COL = 4;

/** Columns per second on the flat; floors per second on the stair. */
export const WALK_SPEED = 1.25;
export const CLIMB_SPEED = 1.0;

/** Goods a maid carries per trip, and how many of one good a working shelf holds before it jams. */
export const CARRY = 4;
export const SHELF_CAP = 8;
/** A serving room keeps this many of each wanted good on hand when it has a quiet moment. */
export const PRESTOCK = 4;

/** Provisions a kitchen holds per pantry trip; each batch uses one. */
export const SUPPLY_LOAD = 4;
export const LOAD_SECONDS = 1.5;

export const SERVE_SECONDS = 1.6;
/** Seconds a guest takes over one serving before accepting another. */
export const SAVOUR_SECONDS = 2.5;

/** Walk-in customers: seconds of patience, queue length at the counter, and base arrivals per second. */
export const CUSTOMER_PATIENCE = 16;
export const SHOP_QUEUE = 5;
export const SHOP_RATE = 0.3;
/** Each point of renown adds this fraction to walk-in traffic. */
export const RENOWN_TRAFFIC = 0.2;
/** Sit-in patrons order this many things and pay this multiple for each. */
export const PATRON_ORDERS = 2;
export const PATRON_PAY = 2;
export const PATRON_PATIENCE = 22;
export const PATRON_RATE = 0.07;

/** Bath: seconds to draw and heat one, coin a bather pays, seconds they soak. */
export const BATH_DRAW_SECONDS = 6;
export const BATH_PRICE = 14;
export const BATH_SOAK_SECONDS = 8;
export const BATH_RATE = 0.06;

/** Lab seconds for the first invention, and how much longer each further one takes. */
export const RESEARCH_FIRST = 70;
export const RESEARCH_STEP = 45;
export const INVENTION_CHOICES = 3;

/** Hearth points needed to reach each level; the level multiplies every occasion. */
export const HEARTH_LEVELS = [0, 3, 9, 18, 30, 45, 63, 84, 108, 135];
/** The household pulling together after falling short. */
export const SHORTFALL_HEARTH = 4;
export const SABBATH_HEARTH = 1;

/** Triumph = this many times the target. */
export const TRIUMPH_FACTOR = 2;

export const START_COIN = 12;
/** The Crown's stipend, each morning: small, but the house can never be left with nothing at all. */
export const STIPEND = 4;
export const MAX_MAIDS = 7;
export const OFFER_COUNT = 3;
export const REROLL_BASE = 3;

/** Expeditions: seconds out, seconds per further step, seconds home; and what a bad step costs. */
export const TRAVEL_SECONDS = 14;
export const STEP_SECONDS = 9;
export const HURT_DAYS = 2;
export const PACK_SLOTS = 2;
/** Seconds she waits for an answer before turning back on her own. */
export const DECIDE_SECONDS = 20;

/** A guest's fancy: seconds it lasts, what catching it is worth, and the gap between fancies. */
export const FANCY_SECONDS = 10;
export const FANCY_FACTOR = 3;
export const FANCY_GAP = 4.5;
/** A samovar starts pouring this long into the evening, so the host can be seated first. */
export const SAMOVAR_DELAY = 5;
/** With nothing left that anyone would take, the evening ends after this many seconds. */
export const EVENING_LINGER = 3;

/** Bulk orders at the shop: arrivals per second, how long the customer waits, what they pay. */
export const ORDER_RATE = 1 / 45;
export const ORDER_PATIENCE = 42;
export const ORDER_PAY = 2;

/** Someone at the door: arrivals per second while the house is open, and how long they wait. */
export const TRADER_RATE = 1 / 55;
export const TRADER_SECONDS = 22;

/** Wages per maid per night; generous wages grow the Hearth. */
export const WAGE = { fair: 1, generous: 4 } as const;
export const GENEROUS_HEARTH = 2;

/** A gift to the parish: each costs twice the last. */
export const DONATION_BASE = 30;
/** Each gift costs this many times the last. */
export const DONATION_GROWTH = 1.5;
export const DONATION_HEARTH = 2;

/** After the fourth occasion the season can roll on: each further target is this many times the last. */
export const ENDLESS_GROWTH = 6;

export const WING_COST = 90;

/** Repapering a room: costs coin and does nothing but look different. */
export const PAPER_COST = 6;
