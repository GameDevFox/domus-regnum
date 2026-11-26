// The check of the climbers on the outside of the 3D demo's house (src/demo3d/climbers.ts): that
// they are drawn, that what grows on a wall above its rail comes down with the wall and rises with
// it, and that all of it is cheap to draw. Run by check3d.ts.
import type { Browser } from "@playwright/test";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

/** The camera's two sides: from the south-east, and from the north-west, in degrees; and how it is tilted and how far off. */
const SOUTH_EAST = 45;
const NORTH_WEST = 225;
const TILT = 0.9;
const FAR = 30;
/** The front wall of the parlour, as the page names it, which the wisteria is on: and where its outside face is, from its rail up. */
const PARLOUR_FRONT = "x 12 12-18";
const ON_PARLOUR_FRONT = { x: [12, 18], z: [12, 12.5], y: [0.9, 3] };
/** Anywhere about the house, upstairs; and anywhere at all. */
const UPSTAIRS = { x: [-10, 30], z: [-10, 30], y: [3, 7] };
const ANYWHERE = { x: [-10, 30], z: [-10, 30], y: [-1, 7] };
/** Anywhere about the house, under the rail of the ground floor's walls. */
const UNDER_THE_RAIL = { x: [-10, 30], z: [-10, 30], y: [-1, 0.9] };
/** A house with its climbers on has at least this many triangles of leaf; and they are no more than this many things to draw. */
const LEAVES_AT_LEAST = 5000;
const DRAWN_AT_MOST = 16;

type Where = { x: number[]; z: number[]; y: number[] };
type Leaves = { triangles: number; drawn: number; coloured: boolean };

export const checkClimbers = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const open = async (view: string): Promise<void> => {
    // (The whole storey is opened, as it was before rooms were opened one by one: which walls come down is then the camera's to say.)
    await page.goto(`${base}demo3d.html?view=${view}&rooms=all&help=0`);
    await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
    await page.evaluate(`window.manor3d.paused.set(true)`);
  };
  /** The leaves drawn just now whose middle is in a place, seen from a side: how many triangles, in how many things to draw, and whether each has kept its colours. */
  const leaves = (degrees: number, where: Where): Promise<Leaves> =>
    page.evaluate(`(() => {
      const h = window.manor3d;
      h.aim(${(degrees * Math.PI) / 180}, ${TILT}, ${FAR});
      h.settle();
      const where = ${JSON.stringify(where)};
      const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const found = { triangles: 0, drawn: 0, coloured: true };
      h.scene.updateMatrixWorld(true);
      h.scene.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material) || !o.material.vertexColors || !shown(o)) return;
        // (A vector to work in is borrowed from the thing itself: the page's three.js cannot be asked for by name from here.)
        o.geometry.computeBoundingBox();
        const middle = o.geometry.boundingBox.getCenter(o.position.clone()).applyMatrix4(o.matrixWorld);
        if (middle.x < where.x[0] || middle.x > where.x[1] || middle.z < where.z[0] || middle.z > where.z[1] || middle.y < where.y[0] || middle.y > where.y[1]) return;
        found.triangles += o.geometry.getAttribute("position").count / 3;
        found.drawn += 1;
        found.coloured &&= o.geometry.hasAttribute("color");
      });
      return found;
    })()`) as Promise<Leaves>;
  const standing = (): Promise<string[]> => page.evaluate(`window.manor3d.standing("ground")`) as Promise<string[]>;

  await open("house");
  const whole = await leaves(SOUTH_EAST, ANYWHERE);
  check(`the house has climbers on it: leaves are drawn, each with its own colour (${whole.triangles} triangles)`, whole.triangles >= LEAVES_AT_LEAST && whole.coloured);
  check(`…and all of them are few things to draw, whatever their colours (${whole.drawn})`, whole.drawn > 0 && whole.drawn <= DRAWN_AT_MOST);
  const wisteria = await leaves(SOUTH_EAST, ON_PARLOUR_FRONT);
  const upstairs = await leaves(SOUTH_EAST, UPSTAIRS);
  check(`the wisteria is on the front of the parlour, and the ivy goes on up the storey above (${wisteria.triangles} and ${upstairs.triangles} triangles)`, wisteria.triangles > 0 && upstairs.triangles > 0);

  await open("ground");
  const cut = await leaves(SOUTH_EAST, ON_PARLOUR_FRONT);
  const cutWalls = await standing();
  check(`looked into from the south-east, the parlour's front wall is cut, and what grows on it above the rail is gone with it (${cut.triangles} triangles)`, !cutWalls.includes(PARLOUR_FRONT) && cut.triangles === 0);
  const back = await leaves(NORTH_WEST, ON_PARLOUR_FRONT);
  const backWalls = await standing();
  check(`from the north-west that wall stands again, and its wisteria with it (${back.triangles} triangles)`, backWalls.includes(PARLOUR_FRONT) && back.triangles === wisteria.triangles);
  const lifted = await leaves(NORTH_WEST, UPSTAIRS);
  const low = await leaves(NORTH_WEST, UNDER_THE_RAIL);
  check(`the storey above is lifted away with its ivy, and what grows under the rails is always there (${lifted.triangles} upstairs, ${low.triangles} under the rails)`, lifted.triangles === 0 && low.triangles > 0);
  check("the climbers throw no errors", errors.length === 0);
  await page.close();
};
