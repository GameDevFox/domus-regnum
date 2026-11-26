import { Raycaster, Vector2 } from "three";
import type { PerspectiveCamera } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Plan } from "../space";
import type { FiguresView } from "./figures";
import type { View } from "./house-view";
import { underFloor } from "./pick";
import type { SecretBook } from "./secret-book";
import { SHOWN_IN } from "./views";

// What a click on the picture is: on the icon of a place of work, it opens that place's card; on
// someone, it follows her; on the false book, it pulls it; on anything else, it lets go of whoever
// was followed. A press that is dragged is the camera being turned, and is none of these.

/** A press that has moved further than this before it is let go is a drag (px). */
const CLICK_SLACK_PX = 5;

type ClicksProps = {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  plan: Plan;
  view: Value<View>;
  figures: FiguresView;
  following: Value<string | null>;
  /** The false book, and whether the dev menu is unlocked, which a press on it turns over. */
  falseBook: SecretBook;
  dev: Value<boolean>;
  /** A press on the icon of a place of work: it does what is to be done, and says whether there was one under the press. */
  place: (ray: Raycaster) => boolean;
  /** Whether such an icon is under the pointer, which then shows that it can be pressed. */
  overPlace: (ray: Raycaster) => boolean;
  /** The picture has been taken hold of. */
  held: () => void;
};

export const mountClicks = (scope: Scope, { canvas, camera, plan, view, figures, following, falseBook, dev, place, overPlace, held }: ClicksProps): void => {
  const raycaster = new Raycaster();
  const aim = (e: PointerEvent): void => {
    const box = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), camera);
  };
  let pressedAt = { x: 0, y: 0 };
  scope.listen(canvas, "pointerdown", (e) => {
    pressedAt = { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
    held();
  });
  scope.listen(canvas, "pointerup", (e) => {
    const up = e as PointerEvent;
    if (Math.hypot(up.clientX - pressedAt.x, up.clientY - pressedAt.y) > CLICK_SLACK_PX) return;
    aim(up);
    // The icon of a place of work is over everything it is drawn over: a press on it is on it, whoever stands behind.
    if (place(raycaster)) return;
    // The nearest person the click is really on: not one under a floor that is drawn over her (pick.ts).
    const v = view.peek();
    const hit = raycaster.intersectObjects([...figures.pick.keys()].filter((m) => m.parent?.visible), false).find((h) => !underFloor(plan, SHOWN_IN[v], v === "house", camera.position, h.point));
    // A press on the false book pulls it, or stands it back: nobody is followed or let go by that.
    if (!hit && falseBook.hit(raycaster)) return dev.update((d) => !d);
    following.set(hit ? (figures.pick.get(hit.object as never) ?? null) : null);
  });
  // An icon shows that it can be pressed while the pointer is on it. (It is there to be seen whether or not: this is only the pointer's shape.)
  scope.listen(canvas, "pointermove", (e) => {
    if ((e as PointerEvent).buttons !== 0) return;
    aim(e as PointerEvent);
    canvas.style.cursor = overPlace(raycaster) ? "pointer" : "";
  });
};
