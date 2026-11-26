// The checks of the 3D demo page that are about visitors being seen on the grounds: a customer
// comes in at the gate, walks up to the shop's door and in, and goes off the way she came; the
// carter comes up the back path from the lane. Run by check3d.ts.
import type { Browser, Page } from "@playwright/test";

import { pageTime } from "./check3d-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The house's front wall, and its back wall, as lines across the plan: south of the one, and north of the other, is out of doors. */
const FRONT = 12;
const BACK = 1;
/** The gate is this far south, and the lane this far north, about. */
const GATE_Z = 21.6;
const LANE_Z = -5;
/** How near the gate or the lane someone is who is at it, in metres: she is looked for once a second, and walks a little over a metre in one. */
const AT = 1.6;
/** Time for the page to draw a frame, and the longest it may take to draw someone who has only just come: her picture may have to be fetched. */
const DRAWN_MS = 300;
const NEWCOMER_MS = 5000;
/** Seconds of the house's time run at a go while something is waited for, and how many goes at the most. */
const STEP = 1;
const STEPS = 150;
/** How far below the ground floor the grounds lie, in metres. */
const GROUNDS_BELOW = 0.29;
/** Seconds a customer walks up before she is looked at again; she is still on the drive. */
const A_LITTLE_ON = 4;

type Seen = { id: string; x: number; z: number; carrying: string | null; drawn: boolean; onScreen: { x: number; y: number } | null } | null;
/** The first visitor of a kind who is in the world: where she is, what she has, and whether she is drawn. */
const visitor = (page: Page, kind: string): Promise<Seen> =>
  page.evaluate((prefix) => {
    const h = (window as unknown as { manor3d: { world: { actors: { id: string; carrying: string | null; walker: { pos: { x: number; z: number } } }[] }; shown: () => string[]; screenOf: (id: string) => { x: number; y: number } | null } }).manor3d;
    const actor = h.world.actors.find((a) => a.id.startsWith(prefix));
    return actor ? { id: actor.id, x: actor.walker.pos.x, z: actor.walker.pos.z, carrying: actor.carrying, drawn: h.shown().includes(actor.id), onScreen: h.screenOf(actor.id) } : null;
  }, kind);
/** Wait for a newcomer of a kind to be drawn, as long as that may take. */
const drawnSoon = (page: Page, kind: string): Promise<unknown> =>
  page
    .waitForFunction(
      (prefix) => {
        const h = (window as unknown as { manor3d: { world: { actors: { id: string }[] }; shown: () => string[] } }).manor3d;
        const actor = h.world.actors.find((a) => a.id.startsWith(prefix));
        return actor !== undefined && h.shown().includes(actor.id);
      },
      kind,
      { timeout: NEWCOMER_MS },
    )
    .catch(() => null);
const advance = (page: Page, seconds: number): Promise<unknown> => page.evaluate(`window.manor3d.advance(${seconds})`);
/** Run the house on, a little at a time, until something is so; and say how long it took, in seconds (-1 if it never was). */
const until = async (page: Page, so: () => Promise<boolean>): Promise<number> => {
  for (let n = 0; n < STEPS; n++) {
    if (await so()) return n * STEP;
    await advance(page, STEP);
  }
  return -1;
};

export const checkVisitors = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  await page.evaluate(`window.manor3d.paused.set(true)`);

  // A customer: seen from the gate.
  await until(page, async () => (await visitor(page, "customer-")) !== null);
  await drawnSoon(page, "customer-");
  const atGate = await visitor(page, "customer-");
  check(`a customer is first seen at the gate, and is drawn there (${atGate?.x.toFixed(1)}, ${atGate?.z.toFixed(1)})`, atGate !== null && Math.abs(atGate.z - GATE_Z) < AT && atGate.drawn && atGate.onScreen !== null);
  await advance(page, A_LITTLE_ON);
  await pageTime(page, DRAWN_MS);
  const onDrive = await visitor(page, "customer-");
  check(`…and walks up the drive: a few seconds on she is nearer the house, still out of doors, and has moved on the screen (${onDrive?.z.toFixed(1)})`, atGate !== null && onDrive !== null && onDrive.id === atGate.id && onDrive.z < atGate.z - 2 && onDrive.z > FRONT && onDrive.drawn && onDrive.onScreen !== null && atGate.onScreen !== null && Math.hypot(onDrive.onScreen.x - atGate.onScreen.x, onDrive.onScreen.y - atGate.onScreen.y) > 20);
  // On the drive her feet are on the gravel, which lies lower than the floors of the house: she does not walk on the air at their level.
  const feet = (await page.evaluate(`[window.manor3d.feetOf(${JSON.stringify(onDrive?.id ?? "")}), window.manor3d.feetOf("rose")]`)) as [number | null, number | null];
  check(`…with her feet on the gravel, lower than the floors of the house (${feet[0]?.toFixed(2)} m, against ${feet[1]?.toFixed(2)} m indoors)`, feet[0] !== null && feet[1] !== null && Math.abs(feet[1] - feet[0] - GROUNDS_BELOW) < 0.02);
  const walked = await until(page, async () => ((await visitor(page, "customer-"))?.z ?? Infinity) < FRONT);
  check(`…and in at the shop's door, a good ten seconds after she was first seen (${A_LITTLE_ON + walked} seconds)`, walked !== -1 && A_LITTLE_ON + walked >= 10);
  // She goes off the way she came, with her loaf; the last that is seen of her is at the gate.
  let last: Seen = null;
  let loafOutside = false;
  const left = await until(page, async () => {
    const now = await visitor(page, "customer-");
    if (!now || now.id !== atGate?.id) return true;
    last = now;
    loafOutside ||= now.z > FRONT && now.carrying === "bread";
    return false;
  });
  const lastSeen = last as Seen;
  check(`served, she walks off down the drive with her loaf, and is last seen at the gate (${lastSeen?.z.toFixed(1)})`, left !== -1 && loafOutside && lastSeen !== null && Math.abs(lastSeen.z - GATE_Z) < AT);

  // The carter: his cart is in the lane, and he comes up the back path.
  await page.evaluate(`(async () => { const { game } = window.manor3d; const rules = await import("/src/game/index.ts"); game.coin += 100; rules.orderFlour(game, 4); game.deliveries[0].due = game.clock + 1; })()`);
  await until(page, async () => (await visitor(page, "carter-")) !== null);
  await drawnSoon(page, "carter-");
  const inLane = await visitor(page, "carter-");
  check(`the carter is first seen in the lane behind the house, with his sacks, and is drawn there (${inLane?.z.toFixed(1)})`, inLane !== null && Math.abs(inLane.z - LANE_Z) < AT && inLane.carrying === "flour" && inLane.drawn);
  const inAtBack = await until(page, async () => ((await visitor(page, "carter-"))?.z ?? -Infinity) > BACK);
  let lastOfHim: Seen = null;
  const gone = await until(page, async () => {
    const now = await visitor(page, "carter-");
    if (!now) return true;
    lastOfHim = now;
    return false;
  });
  const lastCarter = lastOfHim as Seen;
  check(`…he walks up the back path and in at the kitchen's door (${inAtBack} seconds), and goes off to the lane again (${lastCarter?.z.toFixed(1)})`, inAtBack > 2 && gone !== -1 && lastCarter !== null && Math.abs(lastCarter.z - LANE_Z) < AT && lastCarter.carrying === null);
  check(`visitors on the grounds throw no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
