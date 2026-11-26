import { Mesh } from "three";
import type { Group, Object3D } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { HOUR } from "../game";
import { FACE_ANGLE } from "../space";
import type { Fixture } from "../space";
import { FAMILY_KINDS } from "./furniture-family";
import { BRASS, CREAM, EMBER, IRON, b, ball, cyl, isTall, legs, tall, timber } from "./furniture-kit";
import type { Build, Kind } from "./furniture-kit";
import { glowOf, lamp, lampstand, stepGlows } from "./lamplight";
import type { Glow } from "./lamplight";
import { block, group, skinOf } from "./parts";
import { texture } from "./textures";

// Furniture, each piece a handful of boxes. Nothing here is solid or walkable — that is the
// plan's business; this only draws. The service side of the house is here; the family side is
// in furniture-family.ts.

/** What is on a shelf, by the last part of its name: so the flour shelf looks like flour. */
const STOCK: Record<string, { color: string; w: number; h: number; round?: boolean }> = {
  flour: { color: "#e9e2d0", w: 0.26, h: 0.3 },
  jam: { color: "#a02c3a", w: 0.11, h: 0.16, round: true },
  tea: { color: "#3f6b54", w: 0.14, h: 0.18 },
  honey: { color: "#d9a13a", w: 0.11, h: 0.15, round: true },
  bread: { color: "#b9793c", w: 0.24, h: 0.12 },
  shelf: { color: "#d8a878", w: 0.2, h: 0.13 },
  cheese: { color: "#e2c14e", w: 0.24, h: 0.12, round: true },
  reagents: { color: "#5fa39b", w: 0.1, h: 0.2, round: true },
};
const SHELF_LEVELS = [0.35, 0.85, 1.35];

const shelf: Build = (w, d, id) => {
  const stock = STOCK[id.split(".")[1]] ?? STOCK.shelf;
  const parts: Object3D[] = [timber(w, 1.9, 0.04, 0, 0, -d / 2 + 0.02), timber(0.05, 1.9, d, -w / 2 + 0.025), timber(0.05, 1.9, d, w / 2 - 0.025), timber(w, 0.05, d, 0, 1.85)];
  for (const y of SHELF_LEVELS) {
    parts.push(timber(w - 0.06, 0.04, d - 0.04, 0, y, 0, true));
    const count = Math.max(1, Math.floor((w - 0.16) / (stock.w + 0.05)));
    const step = (w - 0.16) / count;
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + 0.08 + step * (i + 0.5);
      parts.push(stock.round ? cyl(stock.w / 2, stock.h, stock.color, x, y + 0.04, 0.02) : b(stock.w, stock.h, Math.min(d - 0.12, stock.w), stock.color, x, y + 0.04, 0.02));
    }
  }
  return parts;
};

const range: Build = (w, d) => [
  b(w, 0.85, d, IRON),
  b(w + 0.04, 0.04, d + 0.04, "#3a3a40", 0, 0.85),
  b(0.36, 0.3, 0.02, EMBER, -w / 4, 0.3, d / 2 + 0.005),
  b(0.4, 0.36, 0.02, "#1a1a1c", w / 4, 0.28, d / 2 + 0.006),
  cyl(0.02, 0.04, BRASS, 0, 0.7, d / 2 + 0.05),
  b(w * 0.8, 0.02, 0.02, BRASS, 0, 0.74, d / 2 + 0.05),
  cyl(0.16, 0.16, "#b5673a", -w / 4, 0.89, 0),
  cyl(0.13, 0.22, "#8a8f96", w / 4, 0.89, 0.03),
  // The hood and flue against the wall: tall, where the range itself is not.
  ...tall(b(w, 0.5, d * 0.7, "#55504a", 0, 1.7, -d * 0.15), b(0.5, 0.75, 0.3, "#55504a", 0, 2.2, -d / 2 + 0.15)),
];

const oven: Build = (w, d) => [
  block(w, 1.5, d, skinOf(texture("brick"))),
  // The chimney over it.
  ...tall(block(w * 0.7, 1.5, d * 0.6, skinOf(texture("brick")), 0, 1.5, -d * 0.2)),
  b(0.56, 0.42, 0.03, "#1b1512", 0, 0.62, d / 2 + 0.005),
  b(0.44, 0.24, 0.03, EMBER, 0, 0.64, d / 2 + 0.012),
  b(0.7, 0.06, 0.12, "#8d8a84", 0, 0.56, d / 2 + 0.03),
  b(0.5, 0.3, 0.03, IRON, 0, 0.14, d / 2 + 0.005),
];

const sink: Build = (w, d) => [
  ...legs(w, d, 0.6, true),
  b(w, 0.22, d, "#b9b4a8", 0, 0.6),
  b(w - 0.12, 0.03, d - 0.12, "#7f9aa3", 0, 0.8),
  cyl(0.02, 0.3, BRASS, -w / 2 + 0.1, 0.82, 0),
  b(0.16, 0.03, 0.03, BRASS, -w / 2 + 0.17, 1.1, 0),
];

const worktable: Build = (w, d) => [
  ...legs(w, d, 0.82, true, 0.09),
  timber(w, 0.07, d, 0, 0.82, 0, true),
  timber(w - 0.3, 0.04, d - 0.3, 0, 0.2, 0, true),
  cyl(0.17, 0.11, "#d9cfb8", -w / 4, 0.89, 0, 0.21),
  b(0.34, 0.12, 0.16, "#b9793c", w / 5, 0.89, 0.12),
  cyl(0.03, 0.4, "#c9a26b", w / 4, 0.92, -0.2).rotateZ(Math.PI / 2),
  b(0.3, 0.02, 0.22, "#e9e2d0", 0, 0.89, -0.2),
];

const dresser: Build = (w, d) => {
  const parts: Object3D[] = [timber(w, 0.9, d), timber(w + 0.04, 0.04, d + 0.04, 0, 0.9, 0, true)];
  // The plate rack that stands on it is the tall part.
  const rack: Object3D[] = [timber(w, 1.1, 0.06, 0, 0.94, -d / 2 + 0.03), timber(w, 0.05, 0.3, 0, 2.0, -d / 2 + 0.15)];
  for (const y of [1.25, 1.62]) {
    rack.push(timber(w, 0.03, 0.22, 0, y, -d / 2 + 0.14, true));
    for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.3) rack.push(cyl(0.11, 0.02, "#dfe6ea", x, y + 0.13, -d / 2 + 0.1).rotateX(Math.PI / 2.4));
  }
  for (const x of [-w / 4, w / 4]) parts.push(cyl(0.02, 0.02, BRASS, x, 0.5, d / 2 + 0.01));
  return [...parts, ...tall(...rack)];
};

const barrel = (x = 0, y = 0, z = 0): Object3D[] => [cyl(0.26, 0.7, "#7a5330", x, y, z), cyl(0.275, 0.05, IRON, x, y + 0.14, z), cyl(0.275, 0.05, IRON, x, y + 0.5, z), cyl(0.22, 0.02, "#5e3d25", x, y + 0.7, z)];

const counter: Build = (w, d) => [
  timber(w, 0.95, d),
  timber(w + 0.08, 0.05, d + 0.1, 0, 0.95, 0, true),
  b(w - 0.2, 0.5, 0.02, "#6d4a2c", 0, 0.25, d / 2 + 0.005),
  // The till, the scales, and a basket of loaves.
  b(0.3, 0.26, 0.3, BRASS, -w / 2 + 0.4, 1.0, 0),
  b(0.22, 0.12, 0.04, "#2a2a2e", -w / 2 + 0.4, 1.26, -0.1),
  cyl(0.03, 0.22, IRON, w / 2 - 0.45, 1.0, 0),
  b(0.36, 0.02, 0.05, IRON, w / 2 - 0.45, 1.22, 0),
  cyl(0.08, 0.02, BRASS, w / 2 - 0.62, 1.14, 0),
  cyl(0.08, 0.02, BRASS, w / 2 - 0.28, 1.14, 0),
  cyl(0.2, 0.1, "#c9a26b", 0.1, 1.0, 0, 0.24),
  b(0.26, 0.1, 0.14, "#b9793c", 0.1, 1.08, 0),
];

/** The window display: three tiers rising away from the glass (its back), so the street sees every shelf. */
const display: Build = (w, d) => {
  const tier = d / 3;
  const parts: Object3D[] = [];
  [0.45, 0.68, 0.91].forEach((h, n) => {
    const z = -d / 2 + tier * (n + 0.5);
    parts.push(timber(w, h, tier, 0, 0, z, true), b(w - 0.06, 0.012, tier - 0.03, CREAM, 0, h, z));
    const count = 5;
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + (w / count) * (i + 0.5);
      // Loaves on the bottom shelf, iced cakes in the middle, a row of tarts and a tall cake on top.
      if (n === 0) parts.push(b(0.22, 0.1, 0.12, i % 2 === 0 ? "#b9793c" : "#c98a47", x, h + 0.012, z));
      else if (n === 1) parts.push(cyl(0.085, 0.08, ["#f1d9d3", "#f6ecd9", "#e9c46a"][i % 3], x, h + 0.012, z), ball(0.025, "#a02c3a", x, h + 0.11, z));
      else if (i === 2) parts.push(cyl(0.11, 0.1, "#f6ecd9", x, h + 0.012, z), cyl(0.08, 0.09, "#f1d9d3", x, h + 0.112, z), ball(0.03, "#a02c3a", x, h + 0.22, z));
      else parts.push(cyl(0.07, 0.04, "#c98a47", x, h + 0.012, z), cyl(0.05, 0.015, "#a02c3a", x, h + 0.052, z));
    }
  });
  return parts;
};

const rug: Build = (w, d, id) => {
  const hue = ["#7d3038", "#2f5d50", "#3a4a70", "#8a5a2c"][id.length % 4];
  return [b(w, 0.012, d, "#d6c59a"), b(w - 0.24, 0.016, d - 0.24, hue), b(w - 0.7, 0.02, d - 0.7, "#c9a85a"), b(w - 0.82, 0.024, d - 0.82, hue)];
};

const sideboard: Build = (w, d) => [
  timber(w, 0.92, d),
  timber(w + 0.06, 0.04, d + 0.04, 0, 0.92),
  b(w * 0.42, 0.6, 0.02, "#6d4a2c", -w / 4, 0.2, d / 2 + 0.005),
  b(w * 0.42, 0.6, 0.02, "#6d4a2c", w / 4, 0.2, d / 2 + 0.005),
  cyl(0.16, 0.03, "#cfd3d6", -w / 4, 0.96, 0),
  ball(0.13, "#cfd3d6", -w / 4, 1.02, 0),
  cyl(0.025, 0.3, BRASS, w / 4, 0.96, 0),
  ball(0.03, "#f6d98a", w / 4, 1.3, 0),
];

const winerack: Build = (w, d) => {
  const parts: Object3D[] = [timber(w, 1.7, d)];
  for (let y = 0.2; y < 1.6; y += 0.24) for (let x = -w / 2 + 0.16; x < w / 2 - 0.05; x += 0.22) parts.push(cyl(0.05, 0.03, y > 1 ? "#31503c" : "#3b2a33", x, y, d / 2).rotateX(Math.PI / 2));
  return parts;
};

const barrels: Build = (w, d) => [...barrel(-w / 4, 0, -d / 6), ...barrel(w / 5, 0, -d / 5), ...barrel(-w / 20, 0, d / 4), ...barrel(-w / 12, 0.72, -d / 6)];

const crates: Build = (w, d) => [timber(w * 0.55, 0.5, d * 0.6, -w / 5, 0, 0, true), timber(w * 0.42, 0.42, d * 0.5, w / 4, 0, d / 8, true), timber(w * 0.45, 0.4, d * 0.5, -w / 6, 0.5, -d / 10, true), b(w * 0.4, 0.26, d * 0.3, "#b0a078", w / 4, 0.42, d / 8)];

const coal: Build = (w, d) => [cyl(w / 2, 0.3, "#1d1c20", 0, 0, 0, w / 3.2), cyl(w / 3.2, 0.24, "#26252a", 0.05, 0.3, 0.05, w / 8), b(0.05, 1.0, 0.05, "#6a5a48", w / 2 - 0.1, 0, -d / 2 + 0.1).rotateZ(-0.25)];

// `tall: true` is the whole piece going see-through in front of someone followed. The range, the
// oven and the dresser are low with something tall on them, and mark those parts themselves.
const KINDS: Record<string, Kind> = {
  shelf: { build: shelf, tall: true },
  range: { build: range },
  oven: { build: oven },
  sink: { build: sink },
  worktable: { build: worktable },
  dresser: { build: dresser },
  barrel: { build: () => barrel() },
  counter: { build: counter },
  display: { build: display },
  rug: { build: rug },
  sideboard: { build: sideboard },
  winerack: { build: winerack, tall: true },
  barrels: { build: barrels },
  crates: { build: crates },
  coal: { build: coal },
  lamp: { build: lamp },
  lampstand: { build: lampstand },
  ...FAMILY_KINDS,
};

/** Each hand of a clock: how many minutes it takes to go once round the face, and whether it ticks from minute to minute or creeps. */
const HANDS = { hours: { round: 12 * HOUR, ticks: false }, minutes: { round: HOUR, ticks: true } };

type FurnitureProps = {
  fixtures: Fixture[];
  /** Seconds the house has been alive, for the firelight: it stops while time is paused. */
  life: Value<number>;
  /** The game's clock, in minutes: every clock in the house shows it. */
  daytime: Value<number>;
  /** How far the lamps of this storey are lit, from 0 to 1. */
  lit: Value<number>;
};

export type FurnitureView = { mesh: Group; /** The tall pieces, and the tall parts of low ones, each a group of its own named for its fixture: they can go see-through one at a time. */ tall: Group[] };

/** All the furniture of one storey, in the storey's own frame (y = 0 is its floor). */
export const Furniture = (scope: Scope, { fixtures, life, daytime, lit }: FurnitureProps): FurnitureView => {
  const mesh = group();
  const high: Group[] = [];
  const glows: Glow[] = [];
  for (const f of fixtures) {
    const kind = KINDS[f.kind];
    if (!kind) throw new Error(`No drawing for furniture of kind "${f.kind}"`);
    const sideways = f.face === "e" || f.face === "w";
    const parts = kind.build(sideways ? f.d : f.w, sideways ? f.w : f.d, f.id);
    const stand = (...of: Object3D[]): Group => {
      const g = group(...of);
      g.position.set(f.x, f.lift ?? 0, f.z);
      g.rotation.y = FACE_ANGLE[f.face];
      g.name = f.id;
      mesh.add(g);
      return g;
    };
    const lofty = parts.filter((p) => kind.tall || isTall(p));
    const piece = stand(...parts.filter((p) => !lofty.includes(p)));
    if (lofty.length > 0) high.push(stand(...lofty));
    // A fire, or a lamp, throws light of its own (lamplight.ts).
    const thrown = glowOf(f.kind, sideways ? f.w : f.d, glows.length);
    if (thrown) {
      piece.add(thrown.light);
      glows.push(thrown);
    }
  }
  // Any piece with hands is a clock, wherever it stands: they are found by name and turned to the time.
  const hands: { hand: Object3D; round: number; ticks: boolean }[] = [];
  mesh.traverse((o) => {
    const counts = o.userData.hand as keyof typeof HANDS | undefined;
    if (counts) hands.push({ hand: o, ...HANDS[counts] });
  });
  scope.effect((use) => {
    const now = use(daytime);
    // Clockwise, seen from in front of the face. The minute hand stands on the minute until the next one.
    for (const { hand, round, ticks } of hands) hand.rotation.z = -(((ticks ? Math.floor(now) : now) % round) / round) * Math.PI * 2;
  });
  scope.effect((use) => stepGlows(glows, use(life), use(lit)));
  scope.add(() => {
    mesh.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  });
  return { mesh, tall: high };
};
