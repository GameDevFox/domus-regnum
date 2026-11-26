import type { Object3D, Raycaster } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { SECRET_BOOK } from "./furniture-family";

// The false book in the laboratory's bookcase: one book is not like the rest, and is a switch.
// Pressed, it tips forward on its foot, as a book does that is pulled by its head, and the dev
// menu is unlocked; pressed again, it stands back and the menu is locked. It is drawn with the
// bookcase (furniture-family.ts); this finds it, tips it, and says whether a press was on it.

type SecretBookProps = {
  /** The house, somewhere in which the book is. */
  root: Object3D;
  /** Whether it is pulled: the dev menu is unlocked while it is. */
  pulled: Value<boolean>;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
};

/** How far forward it tips, in radians; and how quickly it gets there, as a share of what is left each second. */
const TIPPED = 0.42;
const TIP_EASE = 9;
/** Nearer its rest than this, it is there. */
const TIP_DONE = 0.001;

export type SecretBook = { /** Whether a press, as a ray into the picture, is on the book: only when the book is on show. */ hit: (ray: Raycaster) => boolean };

export const SecretBook = (scope: Scope, { root, pulled, frame }: SecretBookProps): SecretBook => {
  const book = root.getObjectByName(SECRET_BOOK);
  if (!book) return { hit: () => false };
  let last = frame.peek();
  scope.effect((use) => {
    const now = use(frame);
    const dt = Math.max(0, now - last);
    last = now;
    const to = use(pulled) ? TIPPED : 0;
    const left = to - book.rotation.x;
    book.rotation.x = Math.abs(left) < TIP_DONE ? to : book.rotation.x + left * Math.min(1, TIP_EASE * dt);
  });
  const onShow = (): boolean => {
    for (let node: Object3D | null = book; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  return { hit: (ray) => onShow() && ray.intersectObject(book, true).length > 0 };
};
