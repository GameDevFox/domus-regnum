// The evening, the night and the road turned round of the outing checks: the same page opened as check3d-outing.ts left it (the forest found and its berries and herbs known, the town explored, three berries in the pantry, the day at its
// last light before eight), and the rest of the day run on from there. Run by check3d.ts.

import { pageTime } from "./check3d-kit";
import type { Checks } from "./check3d-kit";
import type { Outing } from "./check3d-outing-kit";
import { REDRAWN_MS, DIAL_DRAWN_MS, TURN_STILL_PX, DAY, WAKE, EIGHT_AT_NIGHT, NINE_AT_NIGHT, BEDTIME, FOREST_WALK, LAKE_WALK, PIE_BERRIES, state, advance, until, advanceTo } from "./check3d-outing-kit";

export const checkOutingNight = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}demo3d.html?help=0&view=ground&map=1`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The page is made as the day's checks of check3d-outing.ts leave it: the shops and the forest found, what is gathered there known, the lake not, and a little in the pantry.)
  await page.evaluate(`(() => { const { game } = window.manor3d; game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes"); game.places.forest = "found"; game.places.town = "found"; game.finds.forest = ["berries", "herbs"]; game.stock.berries = 3; game.stock.herbs = 0; game.coin = 88; })()`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await pageTime(page, REDRAWN_MS);
  const count = (selector: string): Promise<number> => page.locator(selector).count();
  const place = (id: string) => page.locator(`button[data-place="${id}"]`);
  // (As from the keyboard: someone's face on the map takes a press, and may lie over the place.)
  const press = (id: string): Promise<void> => place(id).evaluate((b) => (b as HTMLElement).click());
  const face = (who: string) => page.locator(`.who[data-who="${who}"]`);
  const brings = page.locator(".map-card-brings");
  const outing = async (who: string): Promise<Outing> => {
    const found = (await state(page)).outings.find((o) => o.who === who);
    if (!found) throw new Error(`${who} was not sent`);
    return found;
  };
  const picked = await state(page);

  // Home before bed: she leaves the place in time to be at the door by bedtime.
  await advanceTo(page, EIGHT_AT_NIGHT);
  await press("forest");
  // (Exploring is offered there too, and was chosen last: gathering is pressed.)
  await page.locator('.map-doing[data-doing="gather"]').click();
  const bed = page.getByRole("button", { name: "Home before bed" });
  check(`in the evening the card says when she would have to leave to be home before bed (${await bed.getAttribute("title")})`, ((await bed.getAttribute("title")) ?? "").includes("she leaves here by 21:22") && (await brings.textContent()) === "🫐 ×4  🌿 ×1");
  await bed.click();
  check("told she may stay out overnight, the bed is unlit and the basket would be full", (await bed.getAttribute("aria-pressed")) === "false" && (await brings.textContent()) === "🫐 ×9  🌿 ×3");
  await bed.click();
  await face("sage").click();
  await pageTime(page, REDRAWN_MS);
  const evening = await outing("sage");
  check(`sent with the bed lit, she will leave the forest at 21:22 and be at the door at bedtime (${evening.depart.toFixed(0)}, ${evening.back.toFixed(0)})`, Math.abs(evening.depart - (BEDTIME - FOREST_WALK)) < 0.01 && Math.abs(evening.back - BEDTIME) < 0.01);
  await advanceTo(page, NINE_AT_NIGHT);
  // (The card is read again from the game a few times a second: it is given the time to be, which it was not, and failed for it once in a full run, 2026-11-16.)
  await pageTime(page, REDRAWN_MS * 2);
  check(`an hour before bed nobody can be sent there and be home before it, and the card says why (${await face("rose").getAttribute("title")})`, (await face("rose").isDisabled()) && ((await face("rose").getAttribute("title")) ?? "").includes("before bed"));
  await bed.click();
  await pageTime(page, REDRAWN_MS);
  check("…but can be, told she may stay out overnight", await face("rose").isEnabled());

  // Out overnight: the house does not wait up.
  await place("lake").click();
  await face("master").click();
  // (The dial is drawn again a few times a second, and later than that when the machine is busy: it is waited for, not given a set time. It failed for that twice in whole runs, 2026-11-17.)
  await page.locator(".dial-plan-explore.runs-on").first().waitFor({ state: "attached", timeout: DIAL_DRAWN_MS }).catch(() => undefined);
  const late = await outing("master");
  const runsOn = await count(".dial-plan-explore.runs-on");
  check(`sent to the lake with the bed unlit, he will be home after bedtime, and the dial says so (there at ${late.arrive.toFixed(0)}, ${runsOn} on the dial running on)`, late.arrive + LAKE_WALK > BEDTIME && runsOn === 1);
  // Finding the lake, he asks what he is to do, as anyone finding a place does; told to come home, he does, late.
  await until(page, async () => (await count(".map-ask")) === 1);
  await page.locator('.map-ask [data-told="home"]').click();
  const morning = await until(page, async () => (await state(page)).clock >= DAY + WAKE);
  await advance(page, 3);
  const woke = await state(page);
  // (Seven lots of berries have come home in all; two go into each batch of pies the baker has made of them since.)
  const intoPies = picked.stock.berries + 4 - woke.stock.berries;
  check(`Sage was in at bedtime with what she had picked (${woke.stock.berries} lots of berries in the pantry, ${intoPies} gone into pies, and ${woke.stock.herbs} of herbs)`, intoPies >= 0 && intoPies % PIE_BERRIES === 0 && woke.stock.herbs === picked.stock.herbs + 1);
  check("the night passed without waiting for him, and by morning he is home and the lake is found", morning && woke.outings.length === 0 && woke.places.lake === "found" && Object.keys(woke.abed).length === 0);

  // Someone on the road is turned round where she is (the author's list, 2026-11-16).
  // (As if the lake had not been found in the night: so that there is something to send her there for.)
  await page.evaluate(`(() => { const { game } = window.manor3d; game.finds.forest = ["berries", "herbs"]; game.places.lake = "unknown"; })()`);
  await press("forest");
  await pageTime(page, REDRAWN_MS);
  await page.locator('.map-doing[data-doing="gather"]').click();
  await face("rose").click();
  await pageTime(page, REDRAWN_MS);
  const bound = await outing("rose");
  await until(page, async () => (await count('.map-token[data-who="rose"]')) === 1);
  await advance(page, 10);
  check(`sent to the forest and on the road to it, she is not sent there again for the same (${await face("rose").getAttribute("title")})`, (await face("rose").isDisabled()) && ((await face("rose").getAttribute("title")) ?? "").startsWith("Gather: Rose. Out. She asks what next when it is done"));
  await place("lake").click();
  await pageTime(page, REDRAWN_MS * 2);
  const turnsSays = (await face("rose").getAttribute("title")) ?? "";
  check(`…but on the lake's card her face can be pressed, and says she would turn for it where she is (${turnsSays})`, (await face("rose").isEnabled()) && turnsSays.includes("She is on the road, and turns for here where she is"));
  const turnedAt = (await state(page)).clock;
  const tokenTurning = await page.locator('.map-token[data-who="rose"]').boundingBox();
  await face("rose").click();
  await pageTime(page, REDRAWN_MS);
  const rerouted = await outing("rose");
  const walked = turnedAt - (bound.arrive - FOREST_WALK);
  check(`pressed, she is turned round on the road: bound for the lake, the way she had come and the walk to the lake off, and still the one outing (${(rerouted.arrive - turnedAt).toFixed(0)} minutes off)`, rerouted.to === "lake" && rerouted.doing === "explore" && (await state(page)).outings.filter((o) => o.who === "rose").length === 1 && rerouted.arrive - turnedAt > LAKE_WALK && rerouted.arrive - turnedAt < LAKE_WALK + walked + 3);
  const tokenBefore = await page.locator('.map-token[data-who="rose"]').boundingBox();
  const jumped = tokenTurning && tokenBefore ? Math.hypot(tokenBefore.x - tokenTurning.x, tokenBefore.y - tokenTurning.y) : Infinity;
  check(`…and her token stays where she was on the road as she is turned (it moved ${jumped.toFixed(1)} px)`, jumped <= TURN_STILL_PX);
  await advance(page, 8);
  await pageTime(page, REDRAWN_MS * 2);
  const tokenAfter = await page.locator('.map-token[data-who="rose"]').boundingBox();
  // (The forest is to the left of the house on the map, and the lake to its right.)
  check(`…and her token goes back along the road she was on, towards the house (${tokenBefore?.x.toFixed(0)} to ${tokenAfter?.x.toFixed(0)})`, tokenBefore !== null && tokenAfter !== null && tokenAfter.x > tokenBefore.x + 2 && (await page.locator('.map-token[data-who="rose"]').getAttribute("aria-label")) !== null);

  check(`outings throw no errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
  await page.close();
};
