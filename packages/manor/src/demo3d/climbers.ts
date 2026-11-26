import type { Axis, FloorId, Wall } from "../space";

// The climbing plants on the outside of the house: ivy, wisteria and climbing roses. Each is a
// great many small flat boxes against a wall, and each box belongs to the wall it is on: what is
// above the rail is of the wall's upper part, and comes down with it when the wall is cut; what is
// below is always there. Nothing here draws: this says where the boxes are, and shell.ts makes them.

export type ClimberKind = "ivy" | "wisteria" | "rose";

export type Climber = {
  kind: ClimberKind;
  /** The line of the wall it grows on: its axis, and its fixed coordinate. */
  axis: Axis;
  at: number;
  /** Where along the wall its middle is, how far it spreads along it, and how high it goes from the ground (m). For wisteria, how high its leaves begin. */
  pos: number;
  wide: number;
  tall: number;
};

/** What grows on the house, and where. */
export const CLIMBERS: Climber[] = [
  // Ivy up the west gable, round the bathroom's window…
  { kind: "ivy", axis: "z", at: 2, pos: 9.6, wide: 4.6, tall: 6.6 },
  // …up the back of the house, round the landing's…
  { kind: "ivy", axis: "x", at: 1, pos: 10, wide: 3.8, tall: 6.2 },
  // …and up the east end of the dining room's wing.
  { kind: "ivy", axis: "z", at: 19, pos: 3, wide: 4.4, tall: 6.5 },
  // Wisteria along the front of the parlour, out of the flower bed there: its leaves begin just over the heads of the windows.
  { kind: "wisteria", axis: "x", at: 12, pos: 15, wide: 5.6, tall: 2.75 },
  // A climbing rose on a trellis either side of the parlour's bay.
  { kind: "rose", axis: "z", at: 18, pos: 6.8, wide: 1.1, tall: 2.5 },
  { kind: "rose", axis: "z", at: 18, pos: 11.2, wide: 1.1, tall: 2.5 },
];

/** One piece of a climber: a small flat box against the wall, by where it is along the wall's line and how high (in the world's metres). */
export type Sprig = {
  along: number;
  wide: number;
  from: number;
  to: number;
  /** How far it stands out from the wall. */
  out: number;
  color: string;
  /**
   * How it holds to the wall. What climbs (ivy) has come up from the ground, so it is neither over a door or a window nor
   * anywhere above one; what clings (a trained branch, a trellis) is only not over one; what hangs (a wisteria's flowers) is
   * free of the wall, and may hang before a window.
   */
  hold: "climbs" | "clings" | "hangs";
};

/** A number from 0 up to 1 that is always the same for the same place: what makes a plant ragged, and the same plant every time. */
const noise = (a: number, b: number, salt: number): number => {
  // (Any large odd numbers do: they only have to scatter.)
  let h = (Math.round(a * 1000) * 374761393 + Math.round(b * 1000) * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
};

const pick = (colors: string[], n: number): string => colors[Math.min(colors.length - 1, Math.floor(n * colors.length))];

/** A leaf of ivy: how big a square of wall it covers, and how far it stands out at the least and at the most. */
const LEAF = 0.26;
const LEAF_OUT = { least: 0.04, more: 0.09 };
/** Leaves lap over one another: each is up to this much bigger than its square, and may sit this far off the middle of it. */
const LEAF_LAP = 0.4;
const LEAF_STRAY = 0.35;
const IVY_GREENS = ["#2f5a2c", "#366532", "#3d7037", "#2b5229", "#467a3c"];
/** Ivy is tallest at its middle and has lost this share of that by its edges; and each column of it is from this share of its height, by up to this much more. */
const IVY_SHOULDER = 0.5;
const IVY_RAGGED = { least: 0.78, more: 0.3 };

const ivy = (c: Climber, ground: number): Sprig[] => {
  const sprigs: Sprig[] = [];
  const half = c.wide / 2;
  for (let x = c.pos - half + LEAF / 2; x < c.pos + half; x += LEAF) {
    const u = (x - c.pos) / half;
    const top = c.tall * (1 - IVY_SHOULDER * u * u) * (IVY_RAGGED.least + IVY_RAGGED.more * noise(x, c.at, 1));
    for (let y = 0, row = 0; y < top; y += LEAF, row++) {
      const n = (salt: number): number => noise(x + c.at, row, salt);
      sprigs.push({ along: x + (n(3) - 0.5) * LEAF * LEAF_STRAY, wide: LEAF * (1 + n(4) * LEAF_LAP), from: ground + y, to: ground + y + LEAF * (1 + n(7) * LEAF_LAP), out: LEAF_OUT.least + LEAF_OUT.more * n(5), color: pick(IVY_GREENS, n(6)), hold: "climbs" });
    }
  }
  return sprigs;
};

const BARK = "#6b4a32";
const WISTERIA_GREENS = ["#6f9a4a", "#86ad58", "#5c8a3e"];
const WISTERIA_BLOOMS = ["#b59ad8", "#9f84c9", "#c9b3e6"];
/** Its trunk: how thick, how far it wanders to either side as it goes up, and in lengths of how much. */
const TRUNK = { thick: 0.1, wanders: 0.07, length: 0.45, out: 0.09 };
/** Its leaves are a band this deep along the wall, over the branch they hang from. */
const WISTERIA_BAND = 0.5;
const BRANCH = { thick: 0.06, up: 0.2, out: 0.07 };
/** Its flowers: how far apart they hang, what share of the places have one, how long one is at the least and the most, how wide at its top and its tip, and how far it stands out. */
const RACEME = { apart: 0.3, share: 0.75, least: 0.3, more: 0.4, wide: 0.15, tip: 0.08, out: 0.15 };

const wisteria = (c: Climber, ground: number): Sprig[] => {
  const sprigs: Sprig[] = [];
  const [from, to] = [c.pos - c.wide / 2, c.pos + c.wide / 2];
  const band = ground + c.tall;
  // The trunk, from the ground to the branch, a little to one side and then the other.
  for (let y = ground, n = 0; y < band + BRANCH.up; y += TRUNK.length, n++) sprigs.push({ along: c.pos + (n % 2 === 0 ? -1 : 1) * TRUNK.wanders * noise(c.pos, n, 1), wide: TRUNK.thick, from: y, to: Math.min(band + BRANCH.up, y + TRUNK.length), out: TRUNK.out, color: BARK, hold: "clings" });
  // The branch along the wall, and the leaves about it.
  sprigs.push({ along: c.pos, wide: c.wide, from: band + BRANCH.up, to: band + BRANCH.up + BRANCH.thick, out: BRANCH.out, color: BARK, hold: "clings" });
  for (let x = from + LEAF / 2; x < to; x += LEAF) {
    for (let y = 0, row = 0; y < WISTERIA_BAND; y += LEAF, row++) {
      const n = (salt: number): number => noise(x + c.at, row, salt);
      sprigs.push({ along: x + (n(3) - 0.5) * LEAF * LEAF_STRAY, wide: LEAF * (1 + n(4) * LEAF_LAP), from: band + y, to: Math.min(band + WISTERIA_BAND, band + y + LEAF * (1 + n(7) * LEAF_LAP)), out: LEAF_OUT.least + LEAF_OUT.more * n(5), color: pick(WISTERIA_GREENS, n(6)), hold: "clings" });
    }
  }
  // The flowers, hanging from under the leaves: each in two lengths, the lower the narrower.
  for (let x = from + RACEME.apart / 2; x < to; x += RACEME.apart) {
    const n = (salt: number): number => noise(x + c.at, 0, salt);
    if (n(8) > RACEME.share) continue;
    const long = RACEME.least + RACEME.more * n(9);
    const color = pick(WISTERIA_BLOOMS, n(10));
    sprigs.push({ along: x, wide: RACEME.wide, from: band - long / 2, to: band + LEAF / 2, out: RACEME.out, color, hold: "hangs" }, { along: x, wide: RACEME.tip, from: band - long, to: band - long / 2, out: RACEME.out, color, hold: "hangs" });
  }
  return sprigs;
};

const TRELLIS = "#e6dcc6";
/** A trellis: how wide and thick a lath is, and how far apart the laths are across it and up it. */
const LATH = { wide: 0.035, out: 0.03, across: 0.27, up: 0.3 };
const ROSE_GREENS = ["#3f6b34", "#4f8040", "#5c9148"];
const ROSE_BLOOMS = ["#c9697a", "#b84a5e", "#e3a0ab", "#f1ece0"];
/** A rose's leaves: how big, and what share of the trellis they cover; and what share of the leaves have a bloom on them, how big, and how far out. */
const ROSE_LEAF = 0.22;
const ROSE_COVERS = 0.7;
const BLOOM = { share: 0.3, size: 0.11, out: 0.14 };

const rose = (c: Climber, ground: number): Sprig[] => {
  const sprigs: Sprig[] = [];
  const [from, to] = [c.pos - c.wide / 2, c.pos + c.wide / 2];
  for (let x = from + LATH.wide / 2; x <= to; x += LATH.across) sprigs.push({ along: x, wide: LATH.wide, from: ground, to: ground + c.tall, out: LATH.out, color: TRELLIS, hold: "clings" });
  for (let y = LATH.up; y <= c.tall; y += LATH.up) sprigs.push({ along: c.pos, wide: c.wide, from: ground + y - LATH.wide, to: ground + y, out: LATH.out, color: TRELLIS, hold: "clings" });
  for (let x = from + ROSE_LEAF / 2; x < to; x += ROSE_LEAF) {
    for (let y = 0, row = 0; y < c.tall - ROSE_LEAF; y += ROSE_LEAF, row++) {
      const n = (salt: number): number => noise(x + c.at + c.pos, row, salt);
      if (n(2) > ROSE_COVERS) continue;
      const along = x + (n(3) - 0.5) * ROSE_LEAF * LEAF_STRAY;
      const out = LEAF_OUT.least + LEAF_OUT.more * n(5);
      sprigs.push({ along, wide: ROSE_LEAF * (1 + n(4) * LEAF_LAP), from: ground + y, to: ground + y + ROSE_LEAF * (1 + n(7) * LEAF_LAP), out, color: pick(ROSE_GREENS, n(6)), hold: "clings" });
      if (n(8) < BLOOM.share) sprigs.push({ along, wide: BLOOM.size, from: ground + y + ROSE_LEAF / 2 - BLOOM.size / 2, to: ground + y + ROSE_LEAF / 2 + BLOOM.size / 2, out: BLOOM.out, color: pick(ROSE_BLOOMS, n(9)), hold: "clings" });
    }
  }
  return sprigs;
};

const GROWS: Record<ClimberKind, (c: Climber, ground: number) => Sprig[]> = { ivy, wisteria, rose };

/** Every piece of a climber, from the ground up. */
export const sprigsOf = (climber: Climber, ground: number): Sprig[] => GROWS[climber.kind](climber, ground);

/** What of a wall's making a climber has to know: where the ground is, how high the wall is cut, how thick it and the slab under it are, and how high a door and a window go. */
export type WallMeasures = { ground: number; cut: number; thick: number; slab: number; doorHead: number; windowHead: number };

/** A box of a wall's own, in the wall's frame (shell.ts): its middle and its size. `y` is measured from the foot of the part it is of. */
export type Box = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };

/** Nothing that holds to the wall grows this near a door or a window (m): its frame and its sill are clear of leaves. */
const CLEAR = 0.1;
/** A sliver thinner than this is not worth a box (m). */
const SLIVER = 0.01;

const isOutside = (wall: Wall): boolean => (wall.low === null) !== (wall.high === null);

/** The house a wall is of: how high each storey stands, and every wall there is, for the doors and windows under this one. */
export type Standing = { storeys: Record<FloorId, { y: number; height: number }>; walls: Wall[] };

/**
 * What grows on one wall, as boxes of its lower part and of its upper. Only an outside wall grows
 * anything, and on its garden side; nothing that holds to the wall lies over a door or a window;
 * and nothing that has climbed from the ground is above one either, on this storey or one below.
 */
export const sprigsOn = (wall: Wall, { storeys, walls }: Standing, m: WallMeasures, climbers: Climber[] = CLIMBERS): { lower: Box[]; upper: Box[] } => {
  const grown = { lower: [] as Box[], upper: [] as Box[] };
  if (!isOutside(wall)) return grown;
  const storey = storeys[wall.floor];
  // In the wall's own frame +Z is its high side for a wall along X, its low side for one along Z.
  const side = (wall.axis === "x" ? 1 : -1) * (wall.low === null ? -1 : 1);
  const parts = [
    { into: grown.lower, from: storey.y - m.slab, to: storey.y + m.cut, foot: storey.y },
    { into: grown.upper, from: storey.y + m.cut, to: storey.y + storey.height, foot: storey.y + m.cut },
  ];
  // Every door and window on this wall's line, whatever the storey.
  const holes = walls
    .filter((other) => other.axis === wall.axis && other.at === wall.at && isOutside(other))
    .flatMap((other) =>
      other.openings.map((o) => ({
        a: o.pos - o.width / 2 - CLEAR,
        b: o.pos + o.width / 2 + CLEAR,
        from: storeys[other.floor].y + (o.kind === "window" ? m.cut - CLEAR : 0),
        to: storeys[other.floor].y + (o.kind === "door" ? m.doorHead : o.kind === "window" ? m.windowHead : storeys[other.floor].height) + CLEAR,
      })),
    );
  for (const climber of climbers) {
    if (climber.axis !== wall.axis || climber.at !== wall.at) continue;
    for (const s of sprigsOf(climber, m.ground)) {
      const [a, b] = [Math.max(wall.from, s.along - s.wide / 2), Math.min(wall.to, s.along + s.wide / 2)];
      if (b - a < SLIVER) continue;
      if (s.hold !== "hangs" && holes.some((hole) => a < hole.b && b > hole.a && s.to > hole.from && (s.hold === "climbs" || s.from < hole.to))) continue;
      for (const part of parts) {
        const [from, to] = [Math.max(part.from, s.from), Math.min(part.to, s.to)];
        if (to - from < SLIVER) continue;
        part.into.push({ x: (a + b) / 2, y: (from + to) / 2 - part.foot, z: side * (m.thick / 2 + s.out / 2), w: b - a, h: to - from, d: s.out, color: s.color });
      }
    }
  }
  return grown;
};
