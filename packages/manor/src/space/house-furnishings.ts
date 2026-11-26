import { FACE_DIR } from "./types";
import type { Facing, Fixture, FloorId, Spot } from "./types";

// What stands in each room, where you stand to use it, and what is kept where. Sizes follow the
// furniture table in docs/design/08-scale-and-architecture.md §11.

/** How far in front of a piece of furniture someone stands to use it. */
const STAND_OFF = 0.5;

const fx = (id: string, kind: string, floor: FloorId, x: number, z: number, w: number, d: number, face: Facing, solid = true): Fixture => ({ id, kind, floor, x, z, w, d, face, solid });

/** The place to stand in front of a fixture, facing it. */
const before = (f: Fixture, id = f.id): Spot => {
  const dir = FACE_DIR[f.face];
  const reach = (dir.x !== 0 ? f.w : f.d) / 2 + STAND_OFF;
  const back: Record<Facing, Facing> = { n: "s", s: "n", e: "w", w: "e" };
  return { id, floor: f.floor, x: f.x + dir.x * reach, z: f.z + dir.z * reach, face: back[f.face] };
};

const spot = (id: string, floor: FloorId, x: number, z: number, face: Facing): Spot => ({ id, floor, x, z, face });

/** How much floor a lamp takes: nothing is kept clear round one, so each stands on a table or in a corner nobody walks through. */
const LAMP_FOOT = 0.3;
/** The tops of the things lamps stand on, in metres above the floor. */
const ON_A_CONSOLE = 0.85;
const ON_A_SIDEBOARD = 0.96;
const ON_THE_DRESSER = 0.94;
const ON_A_DESK = 0.78;
const ON_THE_DRESSING_TABLE = 0.79;
/** An oil lamp standing on a piece of furniture, facing the room: away from the wall the piece is against. */
const lamp = (id: string, floor: FloorId, x: number, z: number, lift: number, face: Facing): Fixture => ({ ...fx(id, "lamp", floor, x, z, LAMP_FOOT, LAMP_FOOT, face, false), lift });
/** The same on a tall stand, in the corner of a room. */
const lampstand = (id: string, floor: FloorId, x: number, z: number): Fixture => fx(id, "lampstand", floor, x, z, LAMP_FOOT, LAMP_FOOT, "s", false);

/** Every room has a lamp of its own, lit at dusk. */
const LAMPS: Fixture[] = [
  lamp("hall.lamp", "ground", 11.65, 6.55, ON_A_CONSOLE, "w"),
  lamp("passage.lamp", "ground", 10, 1.35, ON_A_SIDEBOARD, "s"),
  lamp("kitchen.lamp", "ground", 5.5, 6.55, ON_THE_DRESSER, "n"),
  lampstand("pantry.lamp", "ground", 0.08, 6.72),
  lampstand("shop.lamp", "ground", 7.7, 7.3),
  lamp("dining.lamp", "ground", 17.25, 0.4, ON_A_SIDEBOARD, "s"),
  lampstand("parlour.lamp", "ground", 17.55, 11.55),

  lamp("landing.lamp", "first", 11.65, 5.55, ON_A_CONSOLE, "w"),
  lampstand("dormitory.lamp", "first", 7.6, 6.6),
  lampstand("bath.lamp", "first", 7.6, 7.4),
  lamp("study.lamp", "first", 16.7, 2.4, ON_A_DESK, "s"),
  lamp("bedroom.lamp", "first", 17.6, 11.05, ON_THE_DRESSING_TABLE, "w"),

  // The cellar has no window and dark stone: two to a room.
  lampstand("undercroft.lamp", "cellar", 8.4, 11.6),
  lampstand("undercroft.lamp2", "cellar", 11.65, 8.2),
  lampstand("store.lamp", "cellar", 7.6, 1.4),
  lampstand("store.lamp2", "cellar", 2.35, 4.5),
  lamp("lab.lamp", "cellar", 16.8, 5.65, ON_A_DESK, "n"),
  lampstand("lab.lamp2", "cellar", 12.4, 0.4),
];

// --- Ground floor -------------------------------------------------------------------------

const range = fx("kitchen.range", "range", "ground", 5.25, 1.45, 1.8, 0.7, "s");
const oven = fx("kitchen.oven", "oven", "ground", 7.3, 1.6, 1.1, 1.0, "s");
const sink = fx("kitchen.sink", "sink", "ground", 2.45, 2, 0.7, 1.2, "e");
const kitchenTable = fx("kitchen.table", "worktable", "ground", 5, 4.25, 2.2, 1.1, "s");
const dresser = fx("kitchen.dresser", "dresser", "ground", 6.25, 6.65, 2.0, 0.5, "n");

const flourShelf = fx("pantry.flour", "shelf", "ground", -0.7, 3.75, 0.5, 1.1, "e");
const jamShelf = fx("pantry.jam", "shelf", "ground", -0.7, 5, 0.5, 1.1, "e");
const teaShelf = fx("pantry.tea", "shelf", "ground", -0.7, 6.25, 0.5, 1.1, "e");
const honeyShelf = fx("pantry.honey", "shelf", "ground", 1.2, 3.3, 1.2, 0.5, "s");
const breadShelf = fx("pantry.bread", "shelf", "ground", 1.2, 6.7, 1.2, 0.5, "n");

const counter = fx("shop.counter", "counter", "ground", 5.5, 9.6, 3.0, 0.7, "n");
const shopShelf = fx("shop.shelf", "shelf", "ground", 6.2, 7.3, 2.4, 0.5, "s");
const shopWindow = fx("shop.window", "display", "ground", 5.75, 12.3, 1.6, 0.55, "n");

const sideboard = fx("passage.sideboard", "sideboard", "ground", 10, 1.35, 1.6, 0.5, "s");

const diningTable = fx("dining.table", "diningtable", "ground", 15.75, 2.9, 3.6, 1.3, "s");
const diningSideboard = fx("dining.sideboard", "sideboard", "ground", 17.25, 0.4, 1.8, 0.5, "s");

const teaTable = fx("parlour.table", "teatable", "ground", 15.2, 9.3, 1.0, 1.0, "w");
const piano = fx("parlour.piano", "piano", "ground", 13, 11.3, 1.5, 0.8, "n");

/** How far either side of the middle of the shop's shelf its two users stand. */
const SHELF_ENDS = 0.65;
/** Where along the counter each customer stands, measured from its middle. */
const CUSTOMER_PLACES = [-1, 0, 1];

// --- Cellar -------------------------------------------------------------------------------

const wineRack = fx("store.wine", "winerack", "cellar", 2.45, 2.5, 0.6, 2.0, "e");
const cheeseShelf = fx("store.cheese", "shelf", "cellar", 5, 1.35, 2.4, 0.5, "s");
const ciderBarrel = fx("store.cider", "barrels", "cellar", 3, 6.1, 1.6, 1.2, "e");

const bench = fx("lab.bench", "labbench", "cellar", 15.5, 2.8, 2.6, 1.0, "s");
const furnace = fx("lab.furnace", "furnace", "cellar", 18.2, 0.9, 1.2, 1.2, "s");
const labBooks = fx("lab.books", "bookcase", "cellar", 13.75, 0.35, 2.0, 0.5, "s");
const reagents = fx("lab.reagents", "shelf", "cellar", 18.7, 4.25, 0.5, 1.6, "w");
const labDesk = fx("lab.desk", "desk", "cellar", 16.25, 5.6, 1.6, 0.7, "n");

// --- First floor --------------------------------------------------------------------------

const linen = fx("dormitory.linen", "cupboard", "first", 5.5, 6.7, 1.4, 0.5, "n");
const press = fx("bath.press", "cupboard", "first", 5.5, 7.3, 1.4, 0.5, "s");
const tub = fx("bath.tub", "tub", "first", 3.2, 10.9, 1.8, 0.8, "n");
const studyDesk = fx("study.desk", "desk", "first", 16, 2.6, 1.8, 0.9, "s");
// The study's bookcases stand either side of its door, on the wall with no window in it.
const studyBooks = fx("study.books", "bookcase", "first", 12.35, 1.25, 0.5, 2.2, "e");
const masterBed = fx("bedroom.bed", "fourposter", "first", 16.7, 7.4, 2.1, 1.7, "w");
/** The maids' beds, along the dormitory's west wall. A fourth stands empty across the room. */
const maidBeds = [1.9, 3.5, 5.1].map((z, n) => fx(`dormitory.bed${n + 1}`, "bed", "first", 3.05, z, 1.9, 1.0, "e"));
// Between the bedroom's two front windows.
const wardrobe = fx("bedroom.wardrobe", "wardrobe", "first", 15, 11.6, 1.6, 0.6, "n");

export const FIXTURES: Fixture[] = [
  range, oven, sink, kitchenTable, dresser,
  fx("kitchen.barrel", "barrel", "ground", 2.5, 6.4, 0.6, 0.6, "s"),
  flourShelf, jamShelf, teaShelf, honeyShelf, breadShelf,
  counter, shopShelf, shopWindow,
  fx("shop.rug", "rug", "ground", 5.5, 10.9, 2.6, 1.2, "s", false),
  fx("hall.console", "console", "ground", 11.65, 7, 0.5, 1.2, "w"),
  fx("hall.clock", "clock", "ground", 11.65, 11.4, 0.5, 0.5, "w"),
  fx("hall.runner", "rug", "ground", 10.6, 8, 1.4, 5.5, "s", false),
  sideboard,
  diningTable, diningSideboard,
  fx("dining.fireplace", "fireplace", "ground", 18.75, 3, 0.5, 1.6, "w"),
  fx("dining.rug", "rug", "ground", 15.75, 2.9, 5, 3, "s", false),
  teaTable, piano,
  fx("parlour.sofa", "sofa", "ground", 15.2, 11.45, 2.0, 0.8, "n"),
  fx("parlour.armchair", "armchair", "ground", 16.7, 8.3, 0.8, 0.8, "w"),
  fx("parlour.bayseat", "armchair", "ground", 18.2, 9.9, 0.8, 0.8, "w"),
  fx("parlour.fireplace", "fireplace", "ground", 17, 6.3, 1.6, 0.5, "s"),
  fx("parlour.rug", "rug", "ground", 15.2, 9.3, 3.4, 3, "s", false),
  fx("parlour.plant", "plant", "ground", 12.55, 6.55, 0.5, 0.5, "s"),

  wineRack, cheeseShelf, ciderBarrel,
  fx("store.crates", "crates", "cellar", 6.9, 6.2, 1.4, 1.2, "n"),
  fx("undercroft.coal", "coal", "cellar", 11.1, 11.1, 1.4, 1.4, "n"),
  bench, furnace, labBooks, reagents, labDesk,
  fx("lab.rug", "rug", "cellar", 15.5, 4.4, 3, 1.4, "s", false),

  linen,
  ...maidBeds,
  fx("dormitory.bed4", "bed", "first", 6.6, 1.6, 1.9, 1.0, "w"),
  fx("dormitory.rug", "rug", "first", 5.2, 3.6, 1.6, 2.6, "s", false),
  press, tub,
  fx("bath.washstand", "washstand", "first", 2.4, 8.2, 0.5, 0.9, "e"),
  fx("landing.console", "console", "first", 11.65, 6, 0.5, 1.2, "w"),
  fx("landing.plant", "plant", "first", 11.55, 11.55, 0.5, 0.5, "s"),
  fx("landing.runner", "rug", "first", 10.75, 6, 1.2, 8, "s", false),
  studyDesk, studyBooks,
  fx("study.books2", "bookcase", "first", 12.35, 4.75, 0.5, 2.2, "e"),
  // The globe between the two back windows; the fire north of the side window, under the chimney the dining room's shares.
  fx("study.globe", "globe", "first", 15.5, 0.5, 0.6, 0.6, "s"),
  fx("study.armchair", "armchair", "first", 17.9, 4.9, 0.8, 0.8, "w"),
  fx("study.fireplace", "fireplace", "first", 18.75, 1.45, 0.5, 1.6, "w"),
  fx("study.rug", "rug", "first", 15.8, 3.6, 3.6, 2.2, "s", false),
  masterBed, wardrobe,
  fx("bedroom.dresser", "dressingtable", "first", 17.6, 10.6, 0.5, 1.2, "w"),
  fx("bedroom.rug", "rug", "first", 14.6, 8.4, 2, 3, "s", false),
  ...LAMPS,
];

export const SPOTS: Spot[] = [
  before(range), before(oven), before(sink), before(dresser),
  spot("kitchen.table.n", "ground", 5, 3.2, "s"),
  spot("kitchen.table.s", "ground", 5, 5.3, "n"),
  // The table's two ends: with all four places taken, four can knead at once.
  spot("kitchen.table.e", "ground", kitchenTable.x + kitchenTable.w / 2 + STAND_OFF, kitchenTable.z, "w"),
  spot("kitchen.table.w", "ground", kitchenTable.x - kitchenTable.w / 2 - STAND_OFF, kitchenTable.z, "e"),
  // Against the wall the kitchen shares with the pantry, north of the door between them: where a dumbwaiter would stand.
  spot("kitchen.hatch", "ground", 2.8, 3.6, "w"),
  // Just inside the kitchen's back door, where deliveries come in.
  spot("kitchen.backdoor", "ground", 3.25, 1.6, "s"),
  before(flourShelf), before(jamShelf), before(teaShelf), before(honeyShelf), before(breadShelf),
  before(counter), before(shopShelf), before(shopWindow),
  // Two can use the shop's shelf at once: whoever keeps the shop at its west end, whoever stocks it at its east.
  spot("shop.shelf.w", "ground", shopShelf.x - SHELF_ENDS, shopShelf.z + shopShelf.d / 2 + STAND_OFF, "n"),
  spot("shop.shelf.e", "ground", shopShelf.x + SHELF_ENDS, shopShelf.z + shopShelf.d / 2 + STAND_OFF, "n"),
  // Customers come in at the street door and stand along the front of the counter.
  spot("shop.door", "ground", 3.25, 11.4, "n"),
  ...CUSTOMER_PLACES.map((along, n) => spot(`shop.place.${n + 1}`, "ground", counter.x + along, counter.z + counter.d / 2 + STAND_OFF, "n")),
  before(sideboard),
  spot("dining.table.n", "ground", 15.75, 1.75, "s"),
  spot("dining.table.s", "ground", 15.75, 4.05, "n"),
  before(diningSideboard),
  before(teaTable), before(piano),
  spot("hall.door", "ground", 10, 11.2, "s"),

  before(wineRack), before(cheeseShelf), before(ciderBarrel),
  spot("lab.bench", "cellar", 15.5, 3.8, "n"),
  before(furnace), before(labBooks), before(reagents), before(labDesk),

  before(linen), before(press), before(tub),
  spot("study.desk", "first", 16, 1.65, "s"),
  before(studyBooks),
  before(masterBed), before(wardrobe),
  spot("dormitory.bed", "first", 4.5, 3.5, "w"),
  // Beside each maid's own bed, at its foot: where she stands to get into it.
  ...maidBeds.map((bed) => before(bed)),
  spot("landing.window", "first", 10, 11.3, "s"),
];

/** Each kind of goods has its own shelf, so two errands to "the pantry" are two different walks. */
export const STORES: Record<string, string> = {
  flour: "pantry.flour",
  jam: "pantry.jam",
  // What is gathered out of doors is kept with the jam it would be made into.
  berries: "pantry.jam",
  // …and herbs are hung to dry by the tea.
  herbs: "pantry.tea",
  tea: "pantry.tea",
  honey: "pantry.honey",
  bread: "pantry.bread",
  // What is brought in from the kitchen garden goes on the pantry's spare shelf: the loaves that were to be kept there go straight to the shop.
  produce: "pantry.bread",
  cake: "shop.shelf",
  wine: "store.wine",
  cheese: "store.cheese",
  cider: "store.cider",
  elixir: "lab.reagents",
  book: "study.books",
  linen: "dormitory.linen",
  towels: "bath.press",
  china: "kitchen.dresser",
};
