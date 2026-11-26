// Every number the bakery's balance depends on, named. Times are seconds of the house's own clock;
// distances are not here at all: how long a walk takes comes from the house (src/space).

export const START_COIN = 12;
/** Sacks of flour on the pantry shelf when the game begins: plenty, two days' baking for one baker. */
export const START_FLOUR = 24;
/** What a sack costs. */
export const FLOUR_COST = 3;
/** What the cart costs, whatever it brings: the reason to order a lot at once. */
export const DELIVERY_FEE = 6;
/** Flour is ordered in these numbers of sacks. */
export const ORDER_SIZES = [4, 12, 24];
/** How long an order takes to come, in hours. */
export const DELIVERY_HOURS = 3;
/** One sack makes one batch. */
export const LOAVES_PER_SACK = 4;
export const LOAF_PRICE = 2;
/** A batch of berry pies: a sack of flour and so many lots of berries make so many pies, each sold for so much. (The 2D game's figures.) */
export const PIE_BERRIES = 2;
export const PIES_PER_BATCH = 3;
export const PIE_PRICE = 9;
/** The shop's shelf holds this many loaves; with no room for another batch the baker waits. */
export const SHOP_SHELF_HOLDS = 24;
/** Loaves on it when the game begins: the morning's baking, done before the shop opened. */
export const START_LOAVES = 12;

/** Taking something down from a shelf, or setting it down. */
export const HANDLING_SECONDS = 1.2;
export const KNEAD_SECONDS = 12;
export const BAKE_SECONDS = 8;
/** Reaching a loaf down for a customer, and handing it over. */
export const REACH_SECONDS = 0.6;
export const SERVE_SECONDS = 0.8;

/** Loaves someone must have baked to have the mastery of bread: after that her own part of a batch goes this many times as fast. */
export const MASTERY_LOAVES = 100;
export const MASTERY_PACE = 2;

/** Minutes of the Master's work in his laboratory that the first invention takes, and how many times as long each one after takes than the last. */
export const INVENTION_MINUTES = 60;
export const INVENTION_GROWTH = 2;
/** With the ever-warm oven a batch bakes this many times as fast. */
export const EVERWARM_PACE = 2;
/** With the clockwork till a customer is this long at the counter helping herself to a loaf. */
export const TILL_SECONDS = 2;

/** On the first day a customer comes about this often while the shop is kept: between half and one and a half times it. */
export const CUSTOMER_EVERY = 13;
/** The custom the shop opens with: one baker and one shopkeeper can serve it. */
export const FIRST_CUSTOM = 1;
/** What a day with nobody turned away adds to the custom: as much again as the first day's. */
export const CUSTOM_STEP = 1;
/** How long a customer stands at the counter unserved before giving up. */
export const CUSTOMER_PATIENCE = 25;

// The day. One second of the house's own clock is one minute of its day, so every time above
// is a number of minutes too. Times of day are minutes after midnight.
export const MINUTES_PER_SECOND = 1;
export const HOUR = 60;
export const DAY = 24 * HOUR;
/** The house wakes. */
export const WAKE = 6 * HOUR;
/** A new game begins in full day, as the shop opens, rather than at sunrise. */
export const START = 8 * HOUR;
/** Customers come between these two. */
export const SHOP_OPENS = 8 * HOUR;
export const SHOP_SHUTS = 18 * HOUR;
/** An errand into town: how long it is from being sent to being at the front door again, and how many sacks she can carry home. */
export const ERRAND_MINUTES = 2 * HOUR;
export const ERRAND_SACKS = 4;
/** A treatise, read, adds this share of what the Master's next invention takes. */
export const TREATISE_SHARE = 0.25;
/** How many days after it is taken on the house's first occasion is held: a week to make ready. */
export const OCCASION_AFTER_DAYS = 7;
/** How long before she is due at the front door someone coming home is seen at the gate: the walk up the drive, in minutes. */
export const DRIVE_MINUTES = 9;
/** How long it takes to walk the width of the first sheet of the map. It makes town 40 minutes from the house, the forest 38, the lake 44, and the caves 74 by way of the forest. */
export const WALK_MINUTES_PER_SHEET = 130;
/** The longest someone may be told to stay at a place, in minutes: what the player chooses between. She comes home sooner if what she went for is done. */
export const OUTING_LIMITS = [30, 60, 120, 240, 480];
/** Draws a minute that gathering makes of a deck of a place, unless the place says otherwise: she learns it by being in it, a quarter as fast as by exploring it (discovery.ts). */
export const GATHER_DRAWS = 1;
/** Gathering: how many minutes it takes to pick one lot of berries, and how many lots her basket holds. A full basket is two hours' picking. */
export const BERRY_MINUTES = 10;
/** Herbs are thinner on the ground than berries: a lot of them is this long in the finding. (The 2D game's forest gave two or three of berries to one of herbs.) */
export const HERB_MINUTES = 25;
export const BASKET_HOLDS = 12;
/** In the kitchen garden: how long it takes to sow a plot, to water one, and to pick one, in seconds. */
export const SOW_SECONDS = 3;
export const WATER_SECONDS = 1.5;
export const HARVEST_SECONDS = 2.5;
/** A minute spent gathering counts as this much of a minute spent exploring: something of the place is learned whatever is done there, and far less than by exploring it. */
export const GATHER_LEARNS = 0.25;
/** The carter calls between these two. What would come later comes first thing the next morning. */
export const CART_FROM = 7 * HOUR;
export const CART_UNTIL = 18 * HOUR;
/** The lamps are lit. */
export const DUSK = 19 * HOUR;
/** Everyone puts down her work and goes up to bed. */
export const BEDTIME = 22 * HOUR;
/** Seconds the night takes to pass once the whole house is in bed. */
export const NIGHT_SECONDS = 6;

/** Where things happen. Spots are the house's (src/space/house-furnishings.ts). */
export const SPOT = {
  /** The places at the kitchen table, in the order they are taken: one baker each. */
  knead: ["kitchen.table.n", "kitchen.table.s", "kitchen.table.e", "kitchen.table.w"],
  oven: "kitchen.oven",
  /** The baker stocks the shop's shelf at one end; whoever keeps the shop takes from the other. */
  stock: "shop.shelf.e",
  reach: "shop.shelf.w",
  counter: "shop.counter",
  door: "shop.door",
  /** Where flour comes up in the kitchen and loaves go through to the shop, once there is a dumbwaiter. */
  hatch: "kitchen.hatch",
  /** The way out to town, and back in. */
  frontDoor: "hall.door",
  /** Where the carter comes in with what was ordered. */
  backDoor: "kitchen.backdoor",
  places: ["shop.place.1", "shop.place.2", "shop.place.3"],
} as const;

/** How many people each job has room for: a place at the table for each baker, and one counter. One more than that takes the first off it. */
export const JOB_PLACES = { bake: SPOT.knead.length, shop: 1, garden: 1, lab: 1 } as const;
