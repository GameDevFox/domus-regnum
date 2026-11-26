import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from "three";
import type { Object3D, Raycaster } from "three";

import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import type { Game, JobId } from "../game";
import { FLOOR_ORDER } from "../space";
import type { FloorId } from "../space";
import type { View } from "./house-view";
import { WORKPLACES } from "./workplaces";
import type { Workplace } from "./workplaces";

// The icons that float over the places of work in the 3D view: pressed, each opens its place's
// card (the author's, 2026-11-16: "I'm wondering if we should put the icons over the areas, like
// move our garden icon over the actual garden, so someone would look at the actual garden and
// then click the icon that kind of hovers above it. And then we could do the same thing for the
// kitchen and for the storefront."). They are things of the scene that face the camera, so a
// wall may be in front of one; and each is of its storey, and is there only while that storey is
// the one looked into ("they should only be shown if their current level is visible … The garden
// is always shown because it's outside as long as we're not in the basement").
//
// An icon says how its place stands: how many work there, in a small round at its corner. A place
// nobody works at is the one that wants looking at, so its icon is the one that stands out (the
// author's, 2026-11-16, of the first version, which greyed it: "we want to bring attention to the
// user that no one is assigned at that location … a icon that doesn't have anyone assigned should
// be more noticeable, not less than an icon that already has people assigned"): its nought is
// bigger and bright, its edge is the same bright colour, and it swells and settles as if breathing.

/** How big an icon is, in metres across; and the square of pixels it is drawn on. */
const ICON_SIZE = 1.25;
const DRAWN_PX = 128;
/** The icons are looked to this often, in seconds, for who works where. */
const READ_EVERY = 0.25;
const PAPER = "#f3ead6";
const INK = "#2b2420";
const ACCENT = "#7d3038";
/** The colour of a place that wants someone: a bright amber, which nothing else on the page is. */
const WANTS = "#f5b417";
/** The disc, its edge, the glyph, and the small round count at its lower right, as shares of the square. */
const DISC = { radius: 0.38, edge: 0.05, edgeOpen: 0.085, edgeWants: 0.075, glyph: 0.42, lift: 0.03 };
const COUNT = { at: 0.74, radius: 0.125, size: 0.24 };
/** The nought of a place nobody works at: bigger than a count, with a dark edge to it. */
const NOUGHT = { radius: 0.19, size: 0.32, edge: 0.03 };
/** Such a place's icon swells by this share of itself and settles again, once in this many seconds. */
const BREATHES = { by: 0.14, every: 1.6 };

type IconsProps = {
  game: Game;
  /** Ticks once a frame, in seconds. */
  frame: Value<number>;
  view: Value<View>;
  /** Whether a place's card is open: its icon is ringed while it is. */
  isOpen: (job: JobId) => boolean;
};

export type PlaceIcons = {
  /** The icons of each storey's places, to stand on that storey; and those of the grounds. */
  floors: Record<FloorId, Group>;
  outdoors: Group;
  /** The place whose icon a ray into the picture is on, if there is one and it is on show. */
  at: (ray: Raycaster) => JobId | null;
  /** How each icon stands just now: for a script. */
  says: () => { job: JobId; workers: number; open: boolean; shown: boolean; /** How big it is drawn just now, against its size at rest. */ swollen: number }[];
};

const draw = (canvas: HTMLCanvasElement, place: Workplace, workers: number, open: boolean): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const px = (share: number): number => share * DRAWN_PX;
  const wants = workers === 0;
  ctx.clearRect(0, 0, DRAWN_PX, DRAWN_PX);
  ctx.beginPath();
  ctx.arc(px(0.5), px(0.5), px(DISC.radius), 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = px(open ? DISC.edgeOpen : wants ? DISC.edgeWants : DISC.edge);
  ctx.strokeStyle = open ? ACCENT : wants ? WANTS : INK;
  ctx.stroke();
  ctx.font = `${px(DISC.glyph)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText(place.glyph, px(0.5), px(0.5 + DISC.lift));
  // How many work here, at the lower right: a small dark round; or, for none, a bigger bright one.
  ctx.beginPath();
  ctx.arc(px(COUNT.at), px(COUNT.at), px(wants ? NOUGHT.radius : COUNT.radius), 0, Math.PI * 2);
  ctx.fillStyle = wants ? WANTS : ACCENT;
  ctx.fill();
  if (wants) {
    ctx.lineWidth = px(NOUGHT.edge);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.font = `700 ${px(wants ? NOUGHT.size : COUNT.size)}px sans-serif`;
  ctx.fillStyle = wants ? INK : PAPER;
  ctx.fillText(String(workers), px(COUNT.at), px(COUNT.at + 0.01));
};

const onShow = (thing: Object3D): boolean => {
  for (let o: Object3D | null = thing; o; o = o.parent) if (!o.visible) return false;
  return true;
};

export const PlaceIcons = (scope: Scope, { game, frame, view, isOpen }: IconsProps): PlaceIcons => {
  const floors = Object.fromEntries(FLOOR_ORDER.map((floor) => [floor, new Group()])) as Record<FloorId, Group>;
  const outdoors = new Group();
  const icons = WORKPLACES.map((place) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = DRAWN_PX;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({ map: texture, transparent: true });
    const sprite = new Sprite(material);
    sprite.name = `place-${place.job}`;
    sprite.scale.setScalar(ICON_SIZE);
    sprite.position.set(place.at.x, place.at.y, place.at.z);
    (place.floor === "grounds" ? outdoors : floors[place.floor]).add(sprite);
    scope.add(() => {
      texture.dispose();
      material.dispose();
    });
    return { place, canvas, texture, sprite, drawn: "" };
  });
  const workersAt = (job: JobId): number => game.household.filter((id) => game.posts[id] === job).length;

  // A storey's are there only while it is the storey looked into: under the floor above, or under the roof, there is nothing to press them for.
  scope.effect((use) => {
    const looked = use(view);
    for (const floor of FLOOR_ORDER) floors[floor].visible = looked === floor;
  });

  let next = 0;
  scope.effect((use) => {
    const now = use(frame);
    // A place nobody works at breathes; one that somebody does is still.
    for (const icon of icons) icon.sprite.scale.setScalar(ICON_SIZE * (workersAt(icon.place.job) === 0 ? 1 + BREATHES.by * (0.5 - 0.5 * Math.cos((2 * Math.PI * now) / BREATHES.every)) : 1));
    if (now < next) return;
    next = now + READ_EVERY;
    for (const icon of icons) {
      const [workers, open] = [workersAt(icon.place.job), isOpen(icon.place.job)];
      const state = `${workers} ${open}`;
      if (state === icon.drawn) continue;
      icon.drawn = state;
      draw(icon.canvas, icon.place, workers, open);
      icon.texture.needsUpdate = true;
    }
  });

  return {
    floors,
    outdoors,
    at: (ray) => {
      const hit = ray.intersectObjects(icons.map((i) => i.sprite).filter(onShow), false)[0];
      return hit ? (icons.find((i) => i.sprite === hit.object)?.place.job ?? null) : null;
    },
    says: () => icons.map((i) => ({ job: i.place.job, workers: workersAt(i.place.job), open: isOpen(i.place.job), shown: onShow(i.sprite), swollen: i.sprite.scale.x / ICON_SIZE })),
  };
};
