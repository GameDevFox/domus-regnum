import type { Object3D } from "three";

import { BRASS, CREAM, EMBER, IRON, b, ball, cyl, legs, moving, tall, timber } from "./furniture-kit";
import type { Build, Kind } from "./furniture-kit";
import { block, group, skinOf } from "./parts";
import { texture } from "./textures";

// The family side of the house and the laboratory: the furniture people are meant to see.

const MARBLE = "#d8d2c6";
const LINEN = "#f1ece0";
const GREEN_BAIZE = "#2f5d50";

/** A chair facing +Z, its seat centred on (x, z). */
const chair = (x: number, z: number, turn: number, color = "#6d4a2c"): Object3D[] => {
  const parts: Object3D[] = [b(0.42, 0.06, 0.42, color, 0, 0.42), b(0.42, 0.5, 0.05, color, 0, 0.48, -0.19), ...legs(0.42, 0.42, 0.42, false, 0.05)];
  return parts.map((p) => {
    const px = p.position.x;
    const pz = p.position.z;
    p.position.x = x + px * Math.cos(turn) + pz * Math.sin(turn);
    p.position.z = z - px * Math.sin(turn) + pz * Math.cos(turn);
    p.rotation.y = turn;
    return p;
  });
};

const diningtable: Build = (w, d) => {
  const parts: Object3D[] = [...legs(w - 0.3, d - 0.3, 0.74, false, 0.1), timber(w, 0.06, d, 0, 0.74), b(w - 0.5, 0.012, 0.5, LINEN, 0, 0.8)];
  const places = Math.floor(w / 0.85);
  for (let i = 0; i < places; i++) {
    const x = -w / 2 + (w / places) * (i + 0.5);
    parts.push(...chair(x, -d / 2 - 0.2, 0), ...chair(x, d / 2 + 0.2, Math.PI));
    parts.push(cyl(0.12, 0.015, "#e6ecef", x, 0.8, -d / 2 + 0.24), cyl(0.12, 0.015, "#e6ecef", x, 0.8, d / 2 - 0.24));
  }
  parts.push(cyl(0.03, 0.34, BRASS, 0, 0.812, 0), ball(0.035, "#f6d98a", 0, 1.18, 0), cyl(0.14, 0.1, "#a02c3a", w / 4, 0.812, 0, 0.17));
  return parts;
};

const fireplace: Build = (w, d) => [
  b(w, 1.25, d, MARBLE),
  b(w + 0.2, 0.07, d + 0.12, MARBLE, 0, 1.25, 0.03),
  b(w * 0.56, 0.78, 0.04, "#1b1512", 0, 0, d / 2),
  b(w * 0.34, 0.2, 0.05, EMBER, 0, 0.04, d / 2 + 0.005),
  b(w * 0.22, 0.3, 0.05, "#f2b04a", 0, 0.1, d / 2 + 0.01),
  // The chimney breast, and a looking-glass over the mantel: the tall part.
  ...tall(block(w * 0.9, 1.5, d * 0.8, skinOf(texture("plaster")), 0, 1.32, -d * 0.1), b(w * 0.5, 0.7, 0.03, BRASS, 0, 1.6, d * 0.32), b(w * 0.42, 0.6, 0.035, "#a9c3cc", 0, 1.65, d * 0.33)),
  cyl(0.05, 0.22, "#3a4a70", -w * 0.35, 1.32, 0.05),
  cyl(0.05, 0.22, "#3a4a70", w * 0.35, 1.32, 0.05),
];

const teatable: Build = (w) => [
  cyl(0.07, 0.68, "#5e3d25"),
  cyl(0.22, 0.04, "#5e3d25"),
  cyl(w / 2, 0.04, "#7a5330", 0, 0.68),
  cyl(w / 2 - 0.06, 0.012, LINEN, 0, 0.72),
  cyl(0.1, 0.13, "#dfe6ea", 0, 0.732, 0, 0.07),
  b(0.12, 0.03, 0.03, "#dfe6ea", 0.13, 0.79, 0),
  cyl(0.05, 0.05, "#dfe6ea", -0.24, 0.732, 0.12),
  cyl(0.05, 0.05, "#dfe6ea", 0.2, 0.732, -0.2),
  cyl(0.13, 0.03, "#f1d9d3", -0.1, 0.732, -0.25),
];

const piano: Build = (w, d) => [
  timber(w, 1.25, d * 0.55, 0, 0, -d * 0.22),
  timber(w, 0.08, d * 0.5, 0, 0.7, d * 0.2),
  b(w - 0.12, 0.02, 0.16, LINEN, 0, 0.78, d * 0.3),
  b(w * 0.4, 0.3, 0.02, "#e8dcc0", 0, 0.95, d * 0.06),
  cyl(0.18, 0.05, "#7d3038", 0, 0.45, d * 0.75),
  cyl(0.04, 0.45, "#5e3d25", 0, 0, d * 0.75),
];

const seat = (w: number, d: number, color: string): Object3D[] => [
  b(w, 0.4, d, color),
  b(w - 0.24, 0.1, d - 0.18, color, 0, 0.4, 0.06),
  b(w, 0.52, 0.18, color, 0, 0.4, -d / 2 + 0.09),
  b(0.14, 0.26, d, color, -w / 2 + 0.07, 0.4),
  b(0.14, 0.26, d, color, w / 2 - 0.07, 0.4),
  b(w, 0.06, d, "#3d2a1c"),
];

const sofa: Build = (w, d) => [...seat(w, d, "#7d3038"), b(0.34, 0.26, 0.1, "#c9a85a", -w / 4, 0.52, -d / 4).rotateZ(0.2)];
const armchair: Build = (w, d) => seat(w, d, GREEN_BAIZE);

const console_: Build = (w, d) => [...legs(w, d, 0.8), timber(w, 0.05, d, 0, 0.8), cyl(0.07, 0.2, "#3a4a70", 0, 0.85, 0, 0.05), ball(0.09, "#c9697a", -0.04, 1.14, 0), ball(0.08, "#e9c46a", 0.06, 1.1, 0.03), ball(0.08, "#f1ece0", 0, 1.2, -0.04)];

/** A long-case clock's face: how high its middle is, how far across, and how far it stands out from the case. */
const FACE_HEIGHT = 1.74;
const FACE_RADIUS = 0.15;
const FACE_PROUD = 0.03;
/** A hand sticks out a little behind its pivot, as a real one does. */
const HAND_TAIL = 0.02;
const HAND_THICK = 0.006;

/**
 * A hand of a clock, pointing at twelve: a group that turns about the middle of the face. It is
 * named for what it counts, and whatever draws the furniture turns it (furniture.ts).
 */
const hand = (counts: "hours" | "minutes", length: number, width: number, z: number): Object3D => {
  const pivot = moving(group(b(width, length + HAND_TAIL, HAND_THICK, IRON, 0, -HAND_TAIL, 0)));
  pivot.position.set(0, FACE_HEIGHT, z);
  pivot.userData.hand = counts;
  return pivot;
};

const clock: Build = (w, d) => {
  const face = d / 2 + FACE_PROUD;
  return [
    timber(w, 0.5, d), timber(w * 0.72, 1.0, d * 0.8, 0, 0.5), timber(w, 0.48, d, 0, 1.5), timber(w + 0.06, 0.06, d + 0.06, 0, 1.98),
    cyl(FACE_RADIUS, 0.02, CREAM, 0, FACE_HEIGHT, d / 2 + 0.01).rotateX(Math.PI / 2),
    cyl(0.07, 0.02, BRASS, 0, 0.9, d * 0.42).rotateX(Math.PI / 2),
    // The hour hand under the minute hand, each a hair clear of the face and of the other.
    hand("hours", FACE_RADIUS * 0.55, 0.022, face + HAND_THICK),
    hand("minutes", FACE_RADIUS * 0.85, 0.014, face + HAND_THICK * 2.5),
  ];
};

const plant: Build = () => [cyl(0.17, 0.3, "#a8553a", 0, 0, 0, 0.21), ball(0.24, "#3f6b34", 0, 0.52, 0), ball(0.19, "#4f8040", 0.12, 0.72, 0.05), ball(0.17, "#356030", -0.12, 0.7, -0.06), ball(0.14, "#4f8040", 0, 0.9, 0)];

const BOOK_COLOURS = ["#7d3038", "#2f5d50", "#3a4a70", "#8a5a2c", "#5b3a5e", "#b89a55", "#3d3b3c"];

/**
 * The false book: one book in the laboratory's bookcase is not like the rest, and is a switch.
 * Which bookcase, which shelf from the floor, and which book along it; and the name it is found
 * by (secret-book.ts pulls it, and the dev menu is what it opens).
 */
const FALSE_BOOK = { in: "lab.books", shelf: 2, along: 11 };
export const SECRET_BOOK = "secret.book";
const FALSE_BOOK_TALL = 0.34;
const FALSE_BOOK_THICK = 0.075;

/** A book that tips forward on the front of its foot when it is pulled: bound in the colour alchemy burns with, banded in brass. */
const falseBook = (x: number, y: number, deep: number): Object3D => {
  const back = -deep / 2;
  const pivot = moving(group(b(FALSE_BOOK_THICK, FALSE_BOOK_TALL, deep, "#3fa99b", 0, 0, back), b(FALSE_BOOK_THICK + 0.006, 0.02, deep + 0.006, BRASS, 0, 0.05, back), b(FALSE_BOOK_THICK + 0.006, 0.02, deep + 0.006, BRASS, 0, FALSE_BOOK_TALL - 0.07, back)));
  pivot.position.set(x + FALSE_BOOK_THICK / 2, y, 0.02 + deep / 2);
  pivot.name = SECRET_BOOK;
  return pivot;
};

const bookcase: Build = (w, d, id) => {
  const parts: Object3D[] = [timber(w, 2.1, 0.04, 0, 0, -d / 2 + 0.02), timber(0.06, 2.1, d, -w / 2 + 0.03), timber(0.06, 2.1, d, w / 2 - 0.03), timber(w + 0.08, 0.08, d + 0.04, 0, 2.1)];
  let n = id.length;
  [0.06, 0.52, 0.98, 1.44].forEach((y, shelf) => {
    parts.push(timber(w - 0.1, 0.04, d - 0.04, 0, y - 0.04, 0, true));
    for (let x = -w / 2 + 0.1, along = 0; x < w / 2 - 0.1; along++) {
      n = (n * 31 + 17) % 97;
      const secret = id === FALSE_BOOK.in && shelf === FALSE_BOOK.shelf && along === FALSE_BOOK.along;
      const thick = secret ? FALSE_BOOK_THICK : 0.05 + (n % 4) * 0.012;
      parts.push(secret ? falseBook(x, y, d * 0.6) : b(thick, 0.26 + (n % 5) * 0.025, d * 0.6, BOOK_COLOURS[n % BOOK_COLOURS.length], x + thick / 2, y, 0.02));
      x += thick + 0.006;
    }
  });
  return parts;
};

const desk: Build = (w, d) => [
  timber(w * 0.28, 0.72, d - 0.06, -w / 2 + w * 0.14),
  timber(w * 0.28, 0.72, d - 0.06, w / 2 - w * 0.14),
  timber(w, 0.06, d, 0, 0.72),
  b(w - 0.3, 0.008, d - 0.24, GREEN_BAIZE, 0, 0.78),
  b(0.3, 0.012, 0.22, LINEN, -0.2, 0.79, 0.05),
  cyl(0.04, 0.07, IRON, 0.25, 0.79, 0.1),
  // A lamp with a green shade.
  cyl(0.06, 0.02, BRASS, w / 2 - 0.25, 0.79, -0.1),
  cyl(0.015, 0.3, BRASS, w / 2 - 0.25, 0.79, -0.1),
  cyl(0.14, 0.12, GREEN_BAIZE, w / 2 - 0.25, 1.08, -0.1, 0.07),
  ...chair(0, d / 2 + 0.25, Math.PI),
];

const labbench: Build = (w, d) => [
  ...legs(w, d, 0.86, false, 0.12),
  timber(w, 0.1, d, 0, 0.86),
  timber(w - 0.3, 0.05, d - 0.3, 0, 0.25, 0, true),
  // The still: a copper pot, a glass head, and the long beak down to the receiver.
  cyl(0.05, 0.12, IRON, -w / 4, 0.96, 0),
  cyl(0.17, 0.26, "#b5673a", -w / 4, 1.08, 0, 0.12),
  ball(0.13, "#a8d5c8", -w / 4, 1.46, 0),
  cyl(0.02, 0.6, "#a8d5c8", -w / 4 + 0.28, 1.2, 0).rotateZ(1.05),
  ball(0.1, "#c7e3b0", -w / 4 + 0.58, 1.06, 0),
  cyl(0.06, 0.2, "#7a4fa3", w / 6, 0.96, -0.2, 0.025),
  cyl(0.05, 0.16, "#d24b3e", w / 6 + 0.2, 0.96, 0.05, 0.02),
  cyl(0.07, 0.12, "#e9c46a", w / 3 + 0.1, 0.96, -0.1, 0.03),
  b(0.34, 0.03, 0.26, "#e8dcc0", w / 3, 0.96, 0.22),
  cyl(0.02, 0.2, CREAM, 0, 0.96, 0.3),
  ball(0.03, "#f6d98a", 0, 1.19, 0.3),
];

const furnace: Build = (w, d) => [
  block(w, 1.1, d, skinOf(texture("brick"))),
  // The dome and the flue over it.
  ...tall(cyl(w * 0.42, 0.7, "#6d3a2a", 0, 1.1, 0, w * 0.26), cyl(w * 0.2, 1.2, "#3a3a40", 0, 1.8, 0)),
  b(0.44, 0.4, 0.04, IRON, 0, 0.3, d / 2),
  b(0.3, 0.24, 0.05, EMBER, 0, 0.38, d / 2 + 0.005),
  b(0.16, 0.12, 0.06, "#f2b04a", 0, 0.42, d / 2 + 0.01),
];

const cupboard: Build = (w, d) => [timber(w, 2.0, d), timber(w + 0.08, 0.08, d + 0.06, 0, 2.0), b(0.02, 1.8, 0.02, "#3d2a1c", 0, 0.1, d / 2 + 0.005), cyl(0.02, 0.02, BRASS, -0.06, 1.0, d / 2 + 0.01), cyl(0.02, 0.02, BRASS, 0.06, 1.0, d / 2 + 0.01)];

const wardrobe: Build = (w, d) => [...cupboard(w, d, ""), b(w * 0.3, 1.2, 0.02, "#a9c3cc", -w / 4, 0.5, d / 2 + 0.006)];

/** A bed lying along its depth: head at the back (-Z), foot at the front. */
const bedParts = (w: number, d: number, cover: string): Object3D[] => [
  timber(w, 0.3, d),
  b(w - 0.06, 0.16, d - 0.1, LINEN, 0, 0.3),
  b(w - 0.04, 0.05, d * 0.62, cover, 0, 0.46, d * 0.16),
  b(w * 0.7, 0.1, 0.34, "#ffffff", 0, 0.46, -d / 2 + 0.28),
  timber(w, 0.95, 0.07, 0, 0, -d / 2 + 0.035),
  timber(w, 0.55, 0.06, 0, 0, d / 2 - 0.03),
];

const bed: Build = (w, d, id) => bedParts(w, d, ["#7b8fa6", "#b98a8a", "#8aa68b", "#c4a86a"][id.length % 4]);

const fourposter: Build = (w, d) => {
  const x = w / 2 - 0.05;
  const z = d / 2 - 0.05;
  // The bed is low; its posts, canopy and hangings are not.
  const canopy = [...[[-x, -z], [x, -z], [-x, z], [x, z]].map(([px, pz]) => timber(0.09, 2.1, 0.09, px, 0, pz)), b(w + 0.06, 0.1, d + 0.06, "#4d3348", 0, 2.1), b(w + 0.1, 0.3, 0.03, "#6d4a66", 0, 1.82, -d / 2), b(0.03, 0.3, d + 0.1, "#6d4a66", -w / 2, 1.82), b(0.03, 0.3, d + 0.1, "#6d4a66", w / 2, 1.82)];
  return [...bedParts(w, d, "#6d4a66"), ...tall(...canopy)];
};

const tub: Build = (w, d) => [b(w, 0.5, d, "#f4f1ea", 0, 0.08), b(w - 0.14, 0.03, d - 0.14, "#9fc3cf", 0, 0.52), b(w + 0.06, 0.05, d + 0.06, "#f4f1ea", 0, 0.56), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ball(0.05, BRASS, sx * (w / 2 - 0.1), 0.05, sz * (d / 2 - 0.08))), cyl(0.02, 0.3, BRASS, -w / 2 + 0.12, 0.6, 0)];

const washstand: Build = (w, d) => [...legs(w, d, 0.78), b(w, 0.04, d, MARBLE, 0, 0.78), cyl(0.16, 0.08, "#dfe6ea", 0, 0.82, 0.08, 0.2), cyl(0.07, 0.2, "#dfe6ea", 0, 0.82, -0.22, 0.05), b(0.4, 0.5, 0.02, "#a9c3cc", 0, 1.1, -d / 2 + 0.02)];

const globe: Build = () => [cyl(0.04, 0.7, "#5e3d25"), cyl(0.2, 0.04, "#5e3d25"), ball(0.22, "#4f7f8f", 0, 0.92, 0), cyl(0.26, 0.02, BRASS, 0, 0.91, 0)];

const dressingtable: Build = (w, d) => [...legs(w, d, 0.74), timber(w, 0.05, d, 0, 0.74), b(0.5, 0.6, 0.03, BRASS, 0, 0.85, -d / 2 + 0.03), b(0.42, 0.52, 0.035, "#a9c3cc", 0, 0.89, -d / 2 + 0.035), cyl(0.04, 0.1, "#c9697a", -0.25, 0.79, 0)];

// `tall: true` is the whole piece going see-through in front of someone followed. The fireplace,
// the furnace and the four-poster are low with something tall on them, and mark those parts themselves.
export const FAMILY_KINDS: Record<string, Kind> = {
  diningtable: { build: diningtable },
  fireplace: { build: fireplace },
  teatable: { build: teatable },
  piano: { build: piano },
  sofa: { build: sofa },
  armchair: { build: armchair },
  console: { build: console_ },
  clock: { build: clock, tall: true },
  plant: { build: plant },
  bookcase: { build: bookcase, tall: true },
  desk: { build: desk },
  labbench: { build: labbench },
  furnace: { build: furnace },
  cupboard: { build: cupboard, tall: true },
  wardrobe: { build: wardrobe, tall: true },
  bed: { build: bed },
  fourposter: { build: fourposter },
  tub: { build: tub },
  washstand: { build: washstand },
  globe: { build: globe },
  dressingtable: { build: dressingtable },
};
