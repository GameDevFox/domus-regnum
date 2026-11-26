import { expect, test } from "@playwright/test";
import fs from "fs";

// Regression: HMR updates of vn-scene.ts must TEAR DOWN the old VN instance (Builder cleanUp on
// the vnScene node). Stacked live instances broke the preload-gates-start invariant — N
// preload→engine.start chains raced per play and the newest instance owned the render pass,
// which could leave the cutscene playing with no visible sprite. See docs/hmr.md.
const VN_SCENE = "src/domus-app/vn-scene.ts";

const poke = async (page: any, ms = 1500) => {
  const src = fs.readFileSync(VN_SCENE, "utf8");
  fs.writeFileSync(VN_SCENE, src + "\n// hmr-poke\n");
  await page.waitForTimeout(ms);
  fs.writeFileSync(VN_SCENE, src);
  await page.waitForTimeout(ms);
};

const probe = (page: any) =>
  page.evaluate(() => {
    const d = (window as any).__vnDebug;
    return (d?.instances ?? []).map((i: any) => ({
      disposed: i.disposed,
      active: i.isActivePass(),
      maidOpacity: i.details().find((x: any) => x.order !== 10000)?.opacity ?? null,
    }));
  });

// Open the cutscene resiliently: the "v" handler mounts with React slightly after window.domus
// appears, and under full-suite load that gap can exceed any fixed delay — so wait for the VN
// button to exist, then press-and-verify with retries (a lost press is just pressed again).
const openCutscene = async (page: any) => {
  await expect(page.getByRole("button", { name: "Toggle VN cutscene" })).toBeVisible({
    timeout: 15_000,
  });
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("v");
    try {
      await expect(page.getByText("Candlelight pools")).toBeVisible({ timeout: 2500 });
      return;
    } catch {
      /* not up yet — press again (an odd press that DID land is undone by the next one) */
    }
  }
  throw new Error("cutscene never opened");
};

const playToMaid = async (page: any) => {
  await openCutscene(page);
  await page.mouse.click(640, 300);
  await expect(page.getByText("Soft footsteps")).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(800); // entrance slide completes
};

test("vn cutscene — HMR of vn-scene.ts replaces (not stacks) the instance; sprite still shows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).domus), null, { timeout: 30_000 });
  await page.waitForTimeout(800);

  // Baseline play (also warms caches the way a real session would), then close.
  await playToMaid(page);
  await page.keyboard.press("v");
  await page.waitForTimeout(300);

  // Two HMR cycles while idle, then one MID-CUTSCENE (the script-authoring workflow).
  await poke(page);
  await playToMaid(page);
  await poke(page); // while the maid is on screen
  await page.keyboard.press("v");
  await page.waitForTimeout(300);

  // Exactly ONE live instance — every superseded one was torn down by the Builder cleanUp.
  const idle = await probe(page);
  expect(idle.filter((i: any) => !i.disposed)).toHaveLength(1);

  // And a fresh play renders the maid through the live instance's pass.
  await playToMaid(page);
  const playing = await probe(page);
  const live = playing.filter((i: any) => !i.disposed);
  expect(live).toHaveLength(1);
  expect(live[0].active).toBe(true);
  expect(live[0].maidOpacity).toBeGreaterThan(0.5);
  await page.keyboard.press("v");
});
