import { Scene, WebGLRenderer } from "three";

import { Scope } from "@scene-lib/scope";
import { Value, batch } from "@scene-lib/value";
import { mountKeyPan } from "@scene-lib/wasd-pan";

import { DEV_COMMANDS, HOUR, asleep, createGame, outingOf, runDev, stepGame } from "../game";
import { HOUSE, flightAt, floorOf, standingAt } from "../space";
import type { Actor } from "../space";
import type { Eye } from "./cutaway";
import { daylightAt, underground } from "./daylight";
import { mountFeats } from "./feats";
import { mountClicks } from "./clicks";
import { Figures } from "./figures";
import { focusAfter, mountGamepad, orbitView, panView } from "./gamepad";
import { CameraRig } from "./camera-rig";
import { mountCurtain } from "./curtain";
import { FollowZoom } from "./follow-zoom";
import { followerAcross } from "./follow-across";
import { GardenBeds } from "./garden-beds";
import { helpHidden, mountHelp } from "./help";
import type { KeyBinding } from "./help";
import { House, VIEWS } from "./house-view";
import type { View } from "./house-view";
import { closeTop, mountKeys, onPageKey } from "./keys";
import { devUnlocked, mountDevMenu } from "./dev-menu";
import { Devices } from "./devices";
import { loaded } from "./loading";
import { mountMap } from "./map-view";
import { occupantsOf } from "./occupants";
import { mountOddsRoom } from "./odds-room";
import { mountPaletteRoom } from "./palette-room";
import { mountPanel } from "./panel";
import { DEV_MENU_KEY, householdKeys, listed } from "./person-keys";
import { mountPanelFold } from "./panel-fold";
import { mountFurniture } from "./page-furniture";
import { ACTION, CENTRE, EYE_LIFT, FOLDED_SHIFT, FOLLOW_DISTANCE, FOLLOW_EASE, MAX_STEPS, MIDNIGHT, NOON, PANEL_SHIFT, PAN_KEYS, PAN_SPEED, STICK_MAP_SPEED, STICK_TURN_SPEED, SIM_STEP, SLOWEST_TURN, START, TURN_DONE, TURN_EASE, WIDE_SCREEN } from "./page-tuning";
import { mountPerf, perfShown } from "./perf";
import { plansOf, samePlans } from "./plans";
import type { Considering, DialPlan } from "./plans";
import { mountSceneStage } from "./scene-stage";
import { scriptHandle } from "./script-handle";
import { group } from "./parts";
import { SecretBook } from "./secret-book";
import { mountSettings } from "./settings";
import { Sky } from "./sky";
import { SPEEDS } from "./transport";
import { nextStop } from "./turn";
import { mountUiLayer } from "./ui-layer";
import { viewCentred } from "./view-centre";
import { bandOf, stepView, viewFollowing } from "./views";
import { toleranceSection, wallTolerance } from "./wall-tolerance";
import { mountWork } from "./work";
import { WORKPLACES } from "./workplaces";
import { wallsByRoom, wallsInstant } from "./walls-toggle";
import "./demo3d.css";

// The 3D game's page: the house as real space, with the household walking real routes through
// it. What they do is decided by the game's rules (src/game); this draws it and passes on what
// the player asks for.

const params = new URLSearchParams(location.search);
/** The game a script is given, and how many there are to be had by the clock. */
const FIRST_SEED = 1;
const SEEDS = 2 ** 31;
const startView = (VIEWS.find((v) => v === params.get("view")) ?? "ground") as View;

const canvas = document.createElement("canvas");
document.getElementById("stage")?.appendChild(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new Scene();

const { camera, controls, aim } = CameraRig(canvas);

// The dice: `?seed=` says which game this is, and the same seed is the same game. Without it a game is its own, by the clock, so that what is
// found where, and when, differs from one to the next; but a page driven by a script (a check, a screenshot) is always the same one.
const game = createGame(HOUSE, params.has("seed") ? Number(params.get("seed")) : navigator.webdriver ? FIRST_SEED : Date.now() % SEEDS);
// `?hour=20` opens the page at eight in the evening of the first day: for looking at a time of day.
if (params.has("hour")) game.clock = Number(params.get("hour")) * HOUR;
const { world } = game;
/** The people who live here, in the order of the list: customers come and go, these stay. */
const household = listed(game.household).flatMap((id) => world.actors.filter((a) => a.id === id));

const scope = Scope();
const view = Value<View>(startView);
const frame = Value(0);
/** Seconds the house has been alive: like `frame`, but it stands still while time is paused. */
const life = Value(0);
const paused = Value(false);
/** Time stands still for someone told to stay, while she is being given something to do (stay-hold.ts). */
const staying = Value(false);
const speed = Value(1);
const following = Value<string | null>(params.get("follow"));
/** Whether walls slide up and down, or are there and gone at once. */
const slide = Value(!wallsInstant());
const WALLS_KEY = "t";
/** With nobody followed: whether only the rooms with someone in them are opened, or the whole storey. */
// (`?rooms=all` opens the page with the whole storey opened, whatever this browser remembers: for looking at that way, and for the page checks of it.)
const byRoom = Value(params.has("rooms") ? params.get("rooms") !== "all" : wallsByRoom());
const tolerance = wallTolerance(params);
/** Whether the picture (the house, and the map) is centred on the window, or in what the panel leaves of it (view-centre.ts). `?centre=0` opens the page the second way, whatever this browser remembers. */
const centred = Value(params.has("centre") ? params.get("centre") !== "0" : viewCentred());
const ROOMS_KEY = "o";
/** Whether the performance graph is showing. */
const graph = Value(perfShown());
const GRAPH_KEY = "p";
/** Whether the map of the country round the house is open. `?map=1` opens the page on it. */
const mapOpen = Value(params.get("map") === "1");
const MAP_KEY = "m";
/** Whether the calendar is open. */
const calendarOpen = Value(false);
const CALENDAR_KEY = "c";
/** Where the person being followed stands: the walls are cut for her, not for the whole storey. */
const focus = Value<Eye | null>(null);

/** The game's clock, in minutes; and the light of that time of day. */
const daytime = Value(game.clock);
/** True while the whole household is in bed. */
const sleeping = Value(false);
/** The outing the player is thinking of, if any: the pointer is on someone's button. */
const considering = Value<Considering | null>(null);
/** What the house is waiting for, drawn on the dial: the same list until something in it changes. */
const plans = Value<DialPlan[]>(plansOf(game), { equals: samePlans });
// Looking into the cellar, the light is the cellar's: lamplight at any hour, with the lamps out only while the house sleeps.
const light = scope.computed((use) => (use(view) === "cellar" ? underground(daylightAt(use(daytime)), !use(sleeping)) : daylightAt(use(daytime))));

/** The devices the Master has made: each is seen in its room from the moment it is. */
// A copy: the game's own list grows in place, and a list is told from the last by its length.
const devices = Value([...game.devices], { equals: (a, b) => a.length === b.length });
// The places of work: their cards, and their icons over the places themselves (work.ts).
const work = mountWork(scope, { game, frame, view });
const house = House(scope, { plan: HOUSE, view, frame, life, camera, focus, slide, byRoom, occupants: (floor) => occupantsOf(world, floor), tolerance, daytime, light, doors: world, extras: { ...work.icons.floors, ground: group(Devices(scope, { made: devices }).mesh, work.icons.floors.ground) }, outdoors: group(GardenBeds(scope, { game, frame }).mesh, work.icons.outdoors) });
const band = scope.computed((use) => bandOf(HOUSE.storeys, use(view)), { equals: (a, b) => a.low === b.low && a.high === b.high });
// By the household's own list: whoever is named may be out of the house when she is.
const feats = mountFeats(scope, { game, frame, nameOf: (id) => household.find((a) => a.id === id)?.name ?? id });
const figures = Figures(scope, { world, camera, frame, life, band, light, asleep: (id) => game.abed[id] === "in", cheering: feats.cheering });
scene.add(Sky(scope, { light }).mesh, house.mesh, figures.mesh);

/** Whether the dev menu is unlocked: by the false book in the laboratory, or by the page's address (`?dev=1`). */
const dev = Value(devUnlocked(params));
const falseBook = SecretBook(scope, { root: house.mesh, pulled: dev, frame });

const eyeHeight = (v: View): number => (v === "house" ? 2.6 : HOUSE.storeys[v].y + EYE_LIFT);
controls.target.set(Number(params.get("tx") ?? CENTRE.x), eyeHeight(startView), Number(params.get("tz") ?? CENTRE.z));
aim(Number(params.get("az") ?? START.azimuth), Number(params.get("polar") ?? START.polar), Number(params.get("dist") ?? START.distance));

const azimuthNow = (): number => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);

// Following someone brings the camera in close; letting go puts it back where it was (follow-zoom.ts).
const zoom = FollowZoom(scope, { camera, controls, canvas, following, view, close: FOLLOW_DISTANCE, aim });
const distanceNow = zoom.distance;

/** Radians still to turn, from a Turn button or key. */
let turning = 0;
const turn = (direction: 1 | -1): void => {
  // The view may still be coasting from a drag. Let it finish coasting at once, so the turn is
  // measured from where it would have come to rest and ends on the diagonal, not a little past it.
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
  const azimuth = azimuthNow();
  // A second press during a turn counts from where that turn was going to end.
  turning = nextStop(azimuth + turning, direction) - azimuth;
};

const panelFolded = mountPanelFold(scope);
// While a scene plays, all of the page's furniture is put away (ui-layer.ts): it goes and comes back in the black (curtain.ts).
const uiAway = mountUiLayer(scope, { frame, away: () => game.scene !== null });
const resize = (): void => {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? document.body;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camera.aspect = w / Math.max(1, h);
  // Centred on the window, the picture is never moved for the panel. Otherwise, on a wide screen, where the panel covers the left edge, it is slid right so that the house is centred in what is left; with the panel put away it has the whole window.
  if (w >= WIDE_SCREEN && !centred.peek() && !uiAway.peek()) camera.setViewOffset(w, h, -(panelFolded.peek() ? FOLDED_SHIFT : PANEL_SHIFT), 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
};
scope.listen(window, "resize", resize);
// Folding the panel away gives its room back to the picture, and so does putting it away for a scene; and the choice of where it is centred moves it.
scope.effect((use) => {
  use(panelFolded);
  use(uiAway);
  use(centred);
  resize();
});

// Clicks on the picture: someone to follow her, the icon of a place of work to open its card, the ground to let go (clicks.ts).
mountClicks(scope, { canvas, camera, plan: HOUSE, view, figures, following, falseBook, dev, place: work.press, overPlace: (ray) => work.icons.at(ray) !== null, held: () => (turning = 0) }); // (Taking hold of the view by hand ends any turn the buttons had under way.)

// What a key press means is decided in one place (keys.ts). It is mounted before mountKeyPan, whose own listener on the
// window cancels W A S D and the arrows (so that they do not scroll): heard after it, they would read as acted on already,
// and would no longer let go of whoever is followed (check3d.ts, "holding D … lets go of the person being followed").
mountKeys(scope);

// W, A, S and D (or the arrows) slide the view across the floor at the height it is at, the same
// helper the Game Demo's free camera uses. Moving it by hand lets go of whoever was being followed.
mountKeyPan(scope, controls, camera, { speed: PAN_SPEED, enabled: () => !mapOpen.peek() });

/** The view the person followed is to be seen in, starting from a given one (views.ts). */
const viewOf = (from: View, followed: Actor): View => viewFollowing(from, floorOf(world, followed), flightAt(HOUSE, followed.walker.pos));

/** Look into a storey (or at the whole house). Choosing one that the person followed would not be followed in lets go of them. */
const look = (v: View): void => {
  const followed = world.actors.find((a) => a.id === following.peek());
  if (followed && viewOf(v, followed) !== v) following.set(null);
  view.set(v);
};

// The list of keys greets a first visit, until told not to. `?help=0` keeps it away, for scripts taking pictures.
const helpOpen = Value(params.get("help") === "0" ? false : params.has("help") || !helpHidden());
/** The key that follows the nth person on the household list (person-keys.ts). */
const keys = householdKeys(household.map((actor) => actor.id));
const personKey = (n: number): string => keys[n];

/**
 * Someone is chosen, by her name or her number: the view goes to where she is, and she is
 * followed (or, chosen again, let go). Off the property she is on the map, and that is opened;
 * on it, if the map was open it is shut, so that she is seen.
 */
const pick = (id: string): void => {
  if (outingOf(game, id)?.state === "away") {
    following.set(following.peek() === id && mapOpen.peek() ? null : id);
    return mapOpen.set(true);
  }
  if (!mapOpen.peek()) return following.update((f) => (f === id ? null : id));
  mapOpen.set(false);
  following.set(id);
};

/** Everything that can be done from the keyboard or a controller: each action by its name, the keys bound to it, how they are shown in the help, and what it does. The one list the keys, a controller's buttons and the help are all made from. */
const BINDINGS: (KeyBinding & { keys: string[]; run: () => void })[] = [
  // The sliding itself is mountKeyPan's; the key also lets go of whoever was followed. With the map open the same keys slide the map (map-view.ts).
  { id: "pan", group: "view", keys: PAN_KEYS, shown: "W A S D  or  arrows", does: "Move the view across the floor (and let go of anyone followed); with the map open, slide the map", run: () => (mapOpen.peek() ? undefined : following.set(null)) },
  { id: ACTION.turnAnticlockwise, group: "view", keys: ["q"], shown: "Q", does: "Turn to the next diagonal view, anticlockwise", run: () => turn(1) },
  { id: ACTION.turnClockwise, group: "view", keys: ["e"], shown: "E", does: "Turn to the next diagonal view, clockwise", run: () => turn(-1) },
  { id: ACTION.floorUp, group: "view", keys: ["r"], shown: "R", does: "Up a floor; above the top floor is the whole house", run: () => look(stepView(view.peek(), 1)) },
  { id: ACTION.floorDown, group: "view", keys: ["f"], shown: "F", does: "Down a floor", run: () => look(stepView(view.peek(), -1)) },
  { id: "whole-house", group: "view", keys: ["h"], shown: "H", does: "Whole house", run: () => look("house") },
  // The number keys are the household, in the order of the list, and the backtick is the Master (person-keys.ts).
  ...household.map((actor, n) => ({ id: `person-${n + 1}`, group: "people" as const, keys: [personKey(n)], shown: personKey(n), does: `Follow ${actor.name}; again to let go. Out of the house, the map opens on them`, run: () => pick(actor.id) })),
  { id: "walls", group: "settings", keys: [WALLS_KEY], shown: WALLS_KEY.toUpperCase(), does: "Wall hiding: sliding, or instant", run: () => slide.update((s) => !s) },
  { id: "rooms", group: "settings", keys: [ROOMS_KEY], shown: ROOMS_KEY.toUpperCase(), does: "Wall hiding, with nobody followed: only the rooms with characters in them, or all rooms", run: () => byRoom.update((r) => !r) },
  { id: "graph", group: "settings", keys: [GRAPH_KEY], shown: GRAPH_KEY.toUpperCase(), does: "Show or hide the performance graph", run: () => graph.update((g) => !g) },
  { id: "map", group: "menus", keys: [MAP_KEY], shown: MAP_KEY.toUpperCase(), does: "Open or close the map", run: () => mapOpen.update((o) => !o) },
  { id: "calendar", group: "menus", keys: [CALENDAR_KEY], shown: CALENDAR_KEY.toUpperCase(), does: "Open or close the calendar", run: () => calendarOpen.update((o) => !o) },
  // (These two are heard by the menus themselves: menu.ts.)
  { id: "intel", group: "menus", keys: [], shown: "I", does: "Open or close the intel menu: what the house knows", run: () => undefined },
  ...WORKPLACES.map((place) => ({ id: place.job === "garden" ? "garden" : `work-${place.job}`, group: "menus" as const, keys: [], shown: place.key.toUpperCase(), does: `Open or close ${place.called}: ${place.holds}`, run: () => undefined })),
  // (Heard by the dev menu itself, while dev mode is on: dev-menu.ts.)
  { id: "dev", group: "menus", keys: [], shown: DEV_MENU_KEY, does: "In dev mode: open or close the dev menu", run: () => undefined },
  { id: "map-zoom", group: "menus", keys: ["+", "-"], shown: "+  -", does: "With the map open: nearer and farther", run: () => undefined },
  { id: "pause", group: "time", keys: [" "], shown: "Space", does: "Pause and resume", run: () => paused.update((p) => !p) },
  { id: "speed", group: "time", keys: ["tab"], shown: "Tab", does: "Change speed", run: () => speed.update((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]) },
  // Esc closes whatever is open on top, drawn highest and opened last (keys.ts); with nothing open, it lets go of the person followed.
  { id: "close", group: "menus", keys: ["escape"], shown: "Esc", does: "Close these controls, or the settings, or the calendar, or the map, or let go of the person followed", run: () => void (closeTop() || following.set(null)) },
  { id: "help", group: "menus", keys: ["?"], shown: "?", does: "Show or hide these controls", run: () => helpOpen.update((o) => !o) },
];
/** Keys the browser would otherwise act on itself: scroll the page, move the focus. */
const BROWSER_KEYS = [" ", "tab"];

/** Go to the next of the household, or the one before, or to nobody after the last: a controller's shoulder buttons, which have no one key. */
const goRound = (step: 1 | -1): void => {
  const next = focusAfter(household.map((a) => a.id), following.peek(), step);
  if (next === null) following.set(null);
  else pick(next);
};
/** Do an action, by its name: for a controller's buttons, which are bound to actions as the keys are. */
const act = (id: string): void => (id === ACTION.focusNext ? goRound(1) : id === ACTION.focusPrevious ? goRound(-1) : BINDINGS.find((b) => b.id === id)?.run());
// What a key press means, where the focus is and with what open, is decided in one place (keys.ts, mounted above mountKeyPan); these are the page's own keys as it hands them on.
onPageKey(scope, (key, e) => {
  const binding = BINDINGS.find((b) => b.keys.includes(key));
  if (!binding) return;
  if (BROWSER_KEYS.includes(key)) e.preventDefault();
  binding.run();
});

mountSettings(scope);
mountHelp(scope, { open: helpOpen, keys: BINDINGS });
mountPanel(scope, { game, household, following, pick, openPlace: (job) => work.open[job].set(true), openMap: () => mapOpen.set(true), frame, personKey });
mountFurniture(scope, { game, plan: HOUSE, frame, dev, following, paused, speed, daytime, plans, calendarOpen, view, look, turn, slide, wallsKey: WALLS_KEY, byRoom, roomsKey: ROOMS_KEY, centred, staying, openMap: () => mapOpen.set(true) });
const map = mountMap(scope, { game, open: mapOpen, frame, considering, key: MAP_KEY, dev, following, centred, staying });
// A controller's stick moves the view as W A S D do: the map while it is open, and otherwise the house, letting go of anyone followed.
// …and its right stick turns and tilts the house's view as a drag does: leant right, the house turns to the right; leant up, the view comes down towards the level.
mountGamepad(scope, { frame, act, heard: () => game.scene === null, look: (x, y, s) => (mapOpen.peek() ? undefined : orbitView(controls, camera, -x * STICK_TURN_SPEED * s, -y * STICK_TURN_SPEED * s)), lean: (x, y, s) => (mapOpen.peek() ? map.slide(-x * STICK_MAP_SPEED * s, -y * STICK_MAP_SPEED * s) : (following.set(null), panView(controls, camera, x * PAN_SPEED * s, -y * PAN_SPEED * s))) });
mountSceneStage(scope, { game, frame, following, mapOpen });
// The black before a scene and after it; while it is due, over, or the black is up, the house is stepped no further (curtain.ts).
const curtain = mountCurtain(scope, { game, frame, speed, paused, zoom });
const palette = mountPaletteRoom(scope, { reskin: figures.reskin });
const odds = mountOddsRoom(scope, { game });
mountDevMenu(scope, { game, unlocked: dev, windows: [palette.button, odds.button], sections: [toleranceSection(tolerance)] });
const perf = mountPerf(scope, { shown: graph, key: GRAPH_KEY, renderer });

const followAcross = followerAcross({ game, following, mapOpen });
let lastTime = performance.now();
let owed = 0;
let clock = 0;
let alive = 0;

const tick = (now: number): void => {
  const dt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  if (!paused.peek() && !curtain.held() && !staying.peek()) {
    owed += dt * speed.peek();
    for (let n = 0; owed >= SIM_STEP && n < MAX_STEPS * speed.peek() && !curtain.held(); n++) {
      stepGame(game, SIM_STEP);
      owed -= SIM_STEP;
    }
    owed = Math.min(owed, SIM_STEP);
  }
  clock += dt;

  // Turning to the next diagonal view, the way a tactics map is spun.
  if (Math.abs(turning) <= TURN_DONE) turning = 0;
  else {
    const by = Math.sign(turning) * Math.min(Math.abs(turning), Math.max(SLOWEST_TURN, Math.abs(turning) * TURN_EASE) * dt);
    turning -= by;
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    camera.position.x = controls.target.x + dx * Math.cos(by) + dz * Math.sin(by);
    camera.position.z = controls.target.z - dx * Math.sin(by) + dz * Math.cos(by);
  }

  zoom.step(dt);

  // Follow someone: the camera's aim drifts to them, at the height they are at, and the view goes
  // to their storey: down to the cellar as they step onto its stair, and otherwise as they arrive.
  // (A customer who was followed and has gone is let go of; one of the household is followed onto the map and home again: follow-across.ts.)
  followAcross();
  const followed = world.actors.find((a) => a.id === following.peek());
  const ease = Math.min(1, FOLLOW_EASE * dt);
  const goal = followed ? { x: followed.walker.pos.x, z: followed.walker.pos.z } : null;
  if (followed) view.set(viewOf(view.peek(), followed));
  const wantY = followed && view.peek() !== "house" ? followed.walker.pos.y + EYE_LIFT : eyeHeight(view.peek());
  const shift = { x: goal ? (goal.x - controls.target.x) * ease : 0, y: (wantY - controls.target.y) * ease, z: goal ? (goal.z - controls.target.z) * ease : 0 };
  controls.target.set(controls.target.x + shift.x, controls.target.y + shift.y, controls.target.z + shift.z);
  camera.position.set(camera.position.x + shift.x, camera.position.y + shift.y, camera.position.z + shift.z);
  controls.update();

  // The camera and the walls keep moving while time is paused; breathing, bobbing and firelight do not.
  if (!paused.peek()) alive += dt;
  batch(() => {
    focus.set(followed ? standingAt(world, followed) : null);
    daytime.set(game.clock);
    sleeping.set(asleep(game));
    plans.set(plansOf(game, considering.peek()));
    devices.set([...game.devices]);
    frame.set(clock);
    life.set(alive);
  });
  renderer.render(scene, camera);
  perf.frame();
};
// Lighting the lamps, and putting them out, changes how every surface is drawn, and the first
// time each way takes a moment to prepare. Both are drawn once now, while the page is opening,
// so that dusk and dawn do not stutter. (Drawn, not only prepared: a graphics card puts the work
// off until the first time it is really asked to draw.)
for (const hour of [NOON, MIDNIGHT]) {
  daytime.set(hour * HOUR);
  renderer.render(scene, camera);
}
daytime.set(game.clock);
renderer.setAnimationLoop(tick);
loaded();

/** Let every wall finish rising or dropping, then draw one frame: for a script taking a picture. */
const settle = (): void => {
  for (let i = 0; i < 40; i++) {
    clock += 0.05;
    controls.update();
    batch(() => {
      daytime.set(game.clock);
      frame.set(clock);
    });
  }
  renderer.render(scene, camera);
};
const handle = scriptHandle({ game, scene, camera, controls, renderer, house, figures, view, following, paused, speed, slide, byRoom, tolerance, work, map: { open: mapOpen, staying, ...map }, dev: { unlocked: dev, list: () => DEV_COMMANDS.map((c) => c.id), run: (id: string, amount?: number) => runDev(game, id, amount), painted: palette.picked }, curtain, simStep: SIM_STEP, aim, distance: distanceNow, settle });
(window as unknown as { manor3d: typeof handle }).manor3d = handle;
handle.advance(Number(params.get("t") ?? 0));
