import { Vector3 } from "three";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Value } from "@scene-lib/value";

import { stepGame } from "../game";
import type { Game } from "../game";
import type { FiguresView } from "./figures";
import type { HouseView, View } from "./house-view";
import type { Work } from "./work";
import type { MapHandle } from "./map-view";

// A handle for looking at the page from a script: run time forward, change the view, and read
// what is drawn. The checks (bin/check3d*.ts) and the screenshots (bin/shot3d.ts) work through it.

/** How far above her feet someone's waist is, in metres: where a click on her is aimed. */
const WAIST = 0.9;

type HandleParts = {
  game: Game;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  renderer: WebGLRenderer;
  house: HouseView;
  figures: FiguresView;
  view: Value<View>;
  following: Value<string | null>;
  paused: Value<boolean>;
  speed: Value<number>;
  slide: Value<boolean>;
  byRoom: Value<boolean>;
  /** How much of a room a wall may hide and still stand, as a share of its floor. */
  tolerance: Value<number>;
  /** The places of work: their cards and their icons. */
  work: Work;
  /** The dev menu: whether it is unlocked, the names of the game's dev commands, and the running of one by its name. */
  dev: { unlocked: Value<boolean>; list: () => string[]; run: (id: string) => boolean; /** The colours picked for palette swaps, by whose they are. */ painted: () => Record<string, string> };
  /** The map: whether it is open, and what of it is being looked at. */
  map: { open: Value<boolean>; /** Whether time stands still for someone told to stay (stay-hold.ts). */ staying: Value<boolean> } & MapHandle;
  /** The black before a scene and after it: whether the house is held for it (a scene due, or over), and whether it is on the page. */
  curtain: { held: () => boolean; on: () => boolean };
  /** The length of one step of the game, in seconds. */
  simStep: number;
  aim: (azimuth: number, polar: number, distance: number) => void;
  distance: () => number;
  /** Let every wall finish rising or dropping, then draw one frame. */
  settle: () => void;
};

export const scriptHandle = ({ game, scene, camera, controls, renderer, house, figures, view, following, paused, speed, slide, byRoom, tolerance, work, map, dev, curtain, simStep, aim, distance, settle }: HandleParts) => ({
  slide,
  byRoom,
  tolerance,
  /** The places of work: whether each one's card is open (`work.open.bake`), and how each one's icon stands. */
  work: { open: work.open, icons: work.icons.says },
  map,
  dev,
  /** How far up each wall of a storey is drawn just now: 0 down, 1 standing, between while it slides. */
  wallHeights: house.heights,
  /** The tall furniture and stairs that are see-through just now, by name. */
  faded: house.faded,
  game,
  world: game.world,
  /** Everything drawn, for a script to look through: the lights, the glass, the hands of the clocks. */
  scene,
  view,
  following,
  paused,
  speed,
  curtain,
  /** Run the house on, as the page does: it stops where the page would, as a scene is due or over, for the black (curtain.ts). */
  advance: (seconds: number): void => {
    for (let t = 0; t < seconds && !curtain.held(); t += simStep) stepGame(game, simStep);
  },
  aim,
  /** How far the camera is from what it looks at, in metres. */
  distance,
  /** What the camera looks at, as text. */
  targetAt: (): string => controls.target.toArray().map((n) => n.toFixed(2)).join(","),
  /** Where the camera is, as text: for telling whether it has moved. */
  cameraAt: (): string => camera.position.toArray().map((n) => n.toFixed(2)).join(","),
  /** How far the picture is slid aside for the panel, in pixels: 0 while it has the whole window (main.ts, `resize`). */
  slidAside: (): number => (camera.view?.enabled ? -camera.view.offsetX : 0),
  /** Which way the camera looks from, in degrees: 0 is from the south, 90 from the east. */
  azimuth: (): number => (Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) * 180) / Math.PI,
  /** How tall each person's picture is drawn just now: it changes as they breathe. */
  breathing: (): number[] => [...figures.pick.keys()].map((card) => card.scale.y),
  /** The people drawn just now, by id: those on a storey that is on show, or on a stair it draws, and not in bed. */
  /** How high someone's feet are drawn, in metres: for a script that checks she stands on what is under her. */
  feetOf: (id: string): number | null => [...figures.pick].find(([, who]) => who === id)?.[0].parent?.position.y ?? null,
  shown: (): string[] => [...figures.pick].filter(([card]) => card.visible && card.parent?.visible).map(([, id]) => id),
  /** The outside walls of a storey standing at full height just now. */
  standing: house.standing,
  /** Where someone's waist is on the screen, in the page's pixels: for a script that clicks on her. */
  screenOf: (id: string): { x: number; y: number } | null => {
    const actor = game.world.actors.find((a) => a.id === id);
    if (!actor) return null;
    const { x, y, z } = actor.walker.pos;
    const at = new Vector3(x, y + WAIST, z).project(camera);
    const box = renderer.domElement.getBoundingClientRect();
    return { x: box.left + ((at.x + 1) / 2) * box.width, y: box.top + ((1 - at.y) / 2) * box.height };
  },
  /** Where something drawn is on the screen, by its name, in the page's pixels, and how far it is turned about its x: for a script that clicks on it, or watches it tip. */
  named: (name: string): { x: number; y: number; tipped: number } | null => {
    const thing = scene.getObjectByName(name);
    if (!thing) return null;
    const at = thing.getWorldPosition(new Vector3()).project(camera);
    const box = renderer.domElement.getBoundingClientRect();
    return { x: box.left + ((at.x + 1) / 2) * box.width, y: box.top + ((1 - at.y) / 2) * box.height, tipped: thing.rotation.x };
  },
  /** How much the last frame cost to draw. */
  cost: (): { calls: number; triangles: number } => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  settle,
});
