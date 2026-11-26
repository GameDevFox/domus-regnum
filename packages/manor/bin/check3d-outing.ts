// The checks of the 3D demo page that are about outings, from the pressing of a place to the
// coming home of whoever was sent: the card and what is chosen on it, the going, the finding,
// the question asked there, the exploring, the gathering and the minutes spent, the way on, the
// caves and the town's flour. The evening, the night and the road turned round are
// check3d-outing-night.ts's, which goes on from here. Run by check3d.ts.
import type { Browser } from "@playwright/test";

import { pageTime, shown } from "./check3d-kit";
import type { Outing } from "./check3d-outing-kit";
import { REDRAWN_MS, DRAG_PX, FOREST_WALK, LONGEST, WAY_NEEDS, HELD, GATHER_LEARNS, DEAD_ENDS, state, advance, until, advanceTo } from "./check3d-outing-kit";

type Checks = {
  browser: Browser;
  base: string;
  viewport: { width: number; height: number };
  check: (name: string, ok: boolean) => void;
};

export const checkOuting = async ({ browser, base, viewport, check }: Checks): Promise<void> => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // (Opened with the map centred in what the panel leaves, not on the window as a first visit has it: on a window this wide the forest would lie under the panel, where it cannot be pressed. check3d-map-panel.ts looks at the first visit's way.)
  await page.goto(`${base}demo3d.html?help=0&view=ground&map=1&centre=0`);
  await page.waitForFunction(() => Boolean((window as unknown as { manor3d?: unknown }).manor3d));
  // (The town's shops are found to begin with, as they were when this was written: the finding of them is check3d-shops.ts's.)
  await page.evaluate(`window.manor3d.game.shops.push("miller", "greengrocer", "books", "herbalist", "clothes")`);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await pageTime(page, REDRAWN_MS);
  const count = (selector: string): Promise<number> => page.locator(selector).count();
  const place = (id: string) => page.locator(`button[data-place="${id}"]`);
  // (As from the keyboard: someone's face on the map takes a press, and may lie over the place.)
  const press = (id: string): Promise<void> => place(id).evaluate((b) => (b as HTMLElement).click());
  const face = (who: string) => page.locator(`.who[data-who="${who}"]`);
  const card = page.locator(".map-card");

  // Pressing a place puts its card up.
  check("no card is up until a place is pressed; home is to be pressed too, as the way back to the house (check3d-map.ts)", (await count(".map-card")) === 0 && (await count('button[data-place="manor"]')) === 1);
  await place("forest").click();
  check("pressing a question mark puts up a card that does not say what the place is", (await card.getAttribute("aria-label")) === "A place not yet visited" && (await card.locator(".map-card-name").textContent()) === "Not yet visited" && (await count(".map-card-piece")) === 0);
  check(`…but says how far it is (${await card.locator(".map-card-text").first().textContent()})`, (await card.locator(".map-card-text").first().textContent()) === "38 min");
  check("…offers only to go there first, and to explore it, and nothing else", (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore");
  check("…for as long as it takes up to the longest there is, and home before bed, unless told otherwise", (await count(".map-stay")) === 5 && (await page.getByRole("button", { name: "At most 8 hours there" }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "Home before bed" }).getAttribute("aria-pressed")) === "true");
  const stayLines = await card.locator(".map-stay, .map-card-stays .map-bed").evaluateAll((chips) => chips.map((chip) => { const s = getComputedStyle(chip); const inner = chip.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth); return `${chip.textContent}:${Math.round(inner / parseFloat(s.fontSize) < 2 ? 1 : 2)}`; }));
  const staysFit = await card.locator(".map-card-stays").evaluate((row) => row.scrollWidth <= row.clientWidth && row.getBoundingClientRect().right <= (row.closest(".map-card") as HTMLElement).getBoundingClientRect().right);
  check(`…each of those chips on one line, and the row of them within the card (${stayLines.join(" ")})`, stayLines.length === 7 && stayLines.every((line) => line.endsWith(":1")) && staysFit);
  const unnamed = await card.locator(".map-card-close, .map-stay, .map-card-stays .map-bed").evaluateAll((nodes) => nodes.filter((node) => !node.getAttribute("title") || node.getAttribute("title") !== node.getAttribute("aria-label")).map((node) => `${node.textContent || node.className}: "${node.getAttribute("aria-label")}" / "${node.getAttribute("title")}"`));
  check(`…its cross, stay chips, bed and house each say the same in their name and their tooltip (${unnamed.join("; ") || "all do"})`, unnamed.length === 0);
  check("…and has a face for each of the household", (await count(".who")) === 4 && (await page.getByRole("button", { name: "Explore: Sage" }).count()) === 1);
  check("…with nothing yet about what exploring has found there", (await count(".map-slot")) === 0);
  check("the question mark that was pressed is marked", ((await place("forest").getAttribute("class")) ?? "").includes("picked"));
  await place("forest").click();
  check("pressing it again takes the card down", (await count(".map-card")) === 0);
  await place("lake").click();
  await page.locator(".map-card-close").click();
  check("so does the card's own ×", (await count(".map-card")) === 0);
  await place("lake").click();
  const box = await page.locator(".map-frame").boundingBox();
  if (!box) throw new Error("the map has no frame");
  await page.mouse.click(box.x + box.width - 200, box.y + box.height - 40);
  check("and so does a press on the bare map", (await count(".map-card")) === 0);
  // A drag that begins on a place is the map being slid, not the place being pressed.
  const mark = await place("forest").boundingBox();
  if (!mark) throw new Error("the forest is not on the map");
  await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
  await page.mouse.down();
  await page.mouse.move(mark.x + mark.width / 2 + DRAG_PX, mark.y + mark.height / 2 + DRAG_PX, { steps: 4 });
  await page.mouse.up();
  check("a drag that begins on a place puts no card up", (await count(".map-card")) === 0);
  await place("forest").focus();
  await page.keyboard.press("Enter");
  check("from the keyboard a place is pressed as any button is", (await card.getAttribute("data-card")) === "forest");

  // Thinking of sending someone: the dial shows how long she would be gone at the most.
  await face("rose").hover();
  await pageTime(page, REDRAWN_MS);
  check("with the pointer on a face, the dial shows how long she might be gone", (await count(".dial-plan-explore.ghost")) === 1);
  await page.mouse.move(box.x + box.width - 200, box.y + box.height - 40);
  await pageTime(page, REDRAWN_MS);
  check("…and no longer when it is off her", (await count(".dial-plan.ghost")) === 0);

  // Sent to explore a place not yet found: she is to find it, and no coin is asked.
  const outing = async (who: string): Promise<Outing> => {
    const found = (await state(page)).outings.find((o) => o.who === who);
    if (!found) throw new Error(`${who} was not sent`);
    return found;
  };
  const before = await state(page);
  await face("sage").click();
  await shown(async () => (await face("sage").isDisabled()) && (await count(".dial-plan-explore:not(.ghost)")) === 1);
  const first = await outing("sage");
  check(`pressing a face sends her to find the place: there a walk from now, and at the latest as long there as she may be (${first.arrive - before.clock} + ${first.depart - first.arrive})`, first.to === "forest" && first.doing === "explore" && first.seeks === "forest" && !first.done && first.arrive - before.clock === FOREST_WALK && first.depart - first.arrive === LONGEST && (await state(page)).coin === before.coin);
  check("…her face is greyed, and the dial shows her outing in earnest", (await face("sage").isDisabled()) && (await count(".dial-plan-explore:not(.ghost)")) === 1);
  check("…and the panel has no button to send her for flour by any more: an errand is given here, on the town's card", (await page.getByRole("button", { name: /^Send to town for flour/ }).count()) === 0);

  // She is seen to go; the place is found when she is there, its piece is set down, and she turns for home at once.
  check("she is on the map once she is out of the house", await until(page, async () => (await count('.map-token[data-who="sage"]')) === 1));
  check("the forest is a question mark until she is there", (await count('.map-unknown[data-place="forest"]')) === 1);
  await advanceTo(page, first.arrive + 1);
  check("when she is there it is found: its piece is set down where the question mark was", (await count('.map-place.arrived[data-place="forest"] img')) === 1 && (await count('.map-unknown[data-place="forest"]')) === 0);
  check("…a card under the clock marks it, with the piece on it", (await count(".feat .feat-piece")) === 1 && ((await page.locator(".feat").last().getAttribute("aria-label")) ?? "").startsWith("Sage has found the forest"));

  // There is now something to do there: she asks what she is to do, and time stands still until she is told.
  const asking = page.getByRole("alertdialog", { name: "Sage has found the forest" });
  const told = (): Promise<string[]> => page.locator(".map-ask-choice").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.told ?? ""));
  check(`she asks what she is to do next: to stay, to go on with the exploring she was sent for, or to come home (${(await told()).join(", ")})`, (await asking.count()) === 1 && (await told()).join() === "stay,on,home");
  const asked = (await state(page)).clock;
  await page.evaluate(`window.manor3d.paused.set(false)`);
  await pageTime(page, 700);
  await page.evaluate(`window.manor3d.paused.set(true)`);
  await advance(page, 20);
  check("time stands still while she waits to be told", (await state(page)).clock === asked);
  // The question can be put aside: home, pressed from the keyboard (the question lies over the map, and the pointer cannot reach it), puts the map away with it, and it stays away; the mark by the clock brings it back (the author's list, 2026-11-16).
  await page.locator('button[data-place="manor"]').evaluate((b) => (b as HTMLElement).click());
  await pageTime(page, REDRAWN_MS * 2);
  const putAside = (await asking.count()) === 0 && (await page.getByRole("dialog", { name: "The map" }).count()) === 0;
  await page.locator(".pill-ask").click();
  await asking.waitFor({ timeout: REDRAWN_MS * 10 });
  check("the question can be put aside: pressing the manor puts the map away with it, and it stays away until the mark by the clock is pressed", putAside && (await asking.count()) === 1 && (await state(page)).clock === asked);
  await asking.locator('[data-told="home"]').click();
  await advance(page, 1);
  const turned = await outing("sage");
  check(`told to come home, she turns for home, and time goes on (${(turned.back - before.clock).toFixed(0)} minutes in all)`, (await asking.count()) === 0 && turned.done && Math.abs(turned.back - (before.clock + 2 * FOREST_WALK)) < 3 && (await state(page)).clock > asked);
  await press("forest");
  check("…the place's card now says what it is, with a way on and two things to gather there, none of them found and none of them next: which turns up first is as it falls out", (await card.locator(".map-card-name").textContent()) === "The forest" && (await count(".map-card-piece")) === 1 && (await count(".map-way-slot:not(.known)")) === 1 && (await count(".map-thing-slot:not(.known)")) === 2 && (await count(".map-slot.sought")) === 0);
  check(`…and offers only going and exploring: nothing has been found there to gather (${(await page.locator(".map-doing").allTextContents()).join(" | ")})`, (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore");
  await advanceTo(page, turned.back + 2);
  check("she is home when she said, and off the map", (await state(page)).outings.length === 0 && (await count(".map-token")) === 0);

  // Sent to explore a place that has been found: she is out for whatever turns up, and comes home with the first of it.
  await page.getByRole("button", { name: "At most 30 minutes there" }).click();
  check("the longest she may stay is chosen by pressing it", (await page.getByRole("button", { name: "At most 30 minutes there" }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "At most 8 hours there" }).getAttribute("aria-pressed")) === "false");
  await page.getByRole("button", { name: "At most 8 hours there" }).click();
  await face("sage").click();
  await pageTime(page, REDRAWN_MS);
  const looking = await outing("sage");
  check("sent again, she is out for no one thing, for eight hours at the most", looking.seeks === null && looking.doing === "explore" && looking.depart - looking.arrive === LONGEST);
  const slip = page.locator('.map-token[data-who="rose"] .map-token-status');
  const hers = page.locator('.map-token[data-who="sage"] .map-token-status');
  await advanceTo(page, looking.arrive + 4);
  await pageTime(page, REDRAWN_MS * 2);
  // (The author's list, 2026-11-16: "We should only have progress when exploration is deterministic".)
  check(`at it, with several things left to find, the slip under her face is a compass and no more: which turns up when is the dice's, and no share is made up (${await hers.textContent()}; ${await page.locator('.map-token[data-who="sage"]').getAttribute("aria-label")})`, (await hers.textContent()) === "🧭" && (await page.locator('.map-token[data-who="sage"]').getAttribute("aria-label")) === "Sage, at the forest, exploring");
  await until(page, async () => ((await state(page)).finds.forest ?? []).length > 0);
  await advance(page, 1);
  const [turnedUp] = (await state(page)).finds.forest ?? [];
  // She does not turn for home with it: she asks what she is to do next (the author's list, 2026-11-16).
  const next = page.locator(".map-ask");
  const stood = (await state(page)).clock;
  await advance(page, 5);
  check(`finding it, she asks what she is to do next, saying what she has found, and time stands still (${await next.getAttribute("aria-label")}: ${await next.locator(".map-ask-says").textContent()})`, (await next.getAttribute("aria-label")) === `Sage has found ${turnedUp} at the forest` && (await next.locator(".map-ask-says").textContent()) === `Sage has found ${turnedUp} at the forest.` && (await told()).join() === "stay,home" && (await state(page)).clock === stood && !(await outing("sage")).done);
  await next.locator('[data-told="home"]').click();
  await advance(page, 1);
  const lucky = await outing("sage");
  const held = HELD[turnedUp] ?? HELD.berries;
  const thing = page.locator(`.map-thing-slot[data-slot="thing:${turnedUp}"]`);
  const brings = page.locator(".map-card-brings");
  check(`something the forest holds turns up, whichever it is (${turnedUp}, after ${(lucky.depart - lucky.arrive).toFixed(0)} minutes), and a card marks it (${await page.locator(".feat").last().getAttribute("aria-label")})`, turnedUp in HELD && ((await page.locator(".feat").last().getAttribute("aria-label")) ?? "").startsWith(`Sage has found ${turnedUp} at the forest`));
  check("…told to come home, she turns for home with hours of her time unspent", lucky.done && lucky.depart - lucky.arrive < 45 && Math.abs(lucky.back - lucky.depart - FOREST_WALK) < 0.01);
  await advanceTo(page, lucky.back + 2);
  // (The card is left as it was put up, before anything was found: it is made again of itself when what can be done at the place is otherwise.)
  await pageTime(page, REDRAWN_MS);
  check(`…the place's card, left open the while, shows it of itself, the other thing is a question mark still, and gathering is offered now (${(await page.locator(".map-doing").allTextContents()).join(" | ")})`, (await thing.textContent()) === held.glyph && ((await thing.getAttribute("class")) ?? "").includes("known") && (await count(".map-thing-slot.known")) === 1 && (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore|🧺 Gather");

  // Gathering: at a place where something to gather has been found, a basket of it is brought home, and only of it.
  const pantry = page.getByRole("img", { name: new RegExp(`^Lots of ${turnedUp} in the pantry`) });
  check(`found, it is on the house's books, with none of it in yet (${await pantry.getAttribute("aria-label")}), and what has not been found is not`, (await pantry.getAttribute("aria-label")) === `Lots of ${turnedUp} in the pantry: 0` && (await page.getByRole("img", { name: new RegExp(`^Lots of ${turnedUp === "berries" ? "herbs" : "berries"} in the pantry`) }).count()) === 0);
  await page.locator('.map-doing[data-doing="gather"]').click();
  check(`gathering is chosen by pressing it, and the card says how much she would bring at the most: a full basket of the one thing found (${await brings.textContent()})`, (await page.locator('.map-doing[data-doing="gather"]').getAttribute("aria-pressed")) === "true" && (await brings.textContent()) === `${held.glyph} ×12`);
  await page.getByRole("button", { name: "At most 30 minutes there" }).click();
  check(`with half an hour, that is as many lots as half an hour picks (${await brings.textContent()})`, (await brings.textContent()) === `${held.glyph} ×${held.inHalfHour}`);
  const learnt = (await state(page)).explored.forest ?? 0;
  // (With the return asked for beforehand, by the house chip on the card: this is about what she brings home, and she comes home with it without asking.)
  await page.locator(".map-then").click();
  await face("rose").click();
  await pageTime(page, REDRAWN_MS);
  const picking = await outing("rose");
  check("pressing a face sends her to gather, and the dial shows it", picking.doing === "gather" && picking.to === "forest" && picking.depart - picking.arrive === 30 && (await count(".dial-plan-gather:not(.ghost)")) === 1);
  // What she is at is under her face on the map and in the list of the household.
  const listed = page.locator(".person", { hasText: "Rose" }).locator(".doing");
  await advanceTo(page, picking.arrive + 5);
  await pageTime(page, REDRAWN_MS * 2);
  check(`at the place with nothing picked yet, the slip under her face is an empty basket, and the list says the same (${await slip.textContent()})`, (await slip.textContent()) === "🧺 ×0" && (await listed.textContent()) === "🧺 ×0" && (await page.locator('.map-token[data-who="rose"]').getAttribute("aria-label")) === "Rose, at the forest, gathering: nothing yet");
  await advanceTo(page, picking.arrive + held.every + 1);
  await pageTime(page, REDRAWN_MS * 2);
  check(`with a lot picked, it is what she has and how many (${await slip.textContent()}; ${await page.locator('.map-token[data-who="rose"]').getAttribute("aria-label")})`, (await slip.textContent()) === `${held.glyph} ×1` && (await listed.textContent()) === `${held.glyph} ×1` && (await page.locator('.map-token[data-who="rose"]').getAttribute("aria-label")) === `Rose, at the forest, gathering: 1 lot of ${turnedUp}; 1 of the 12 her basket holds`);
  await until(page, async () => (await state(page)).outings.every((o) => o.who !== "rose"));
  const picked = await state(page);
  const other = turnedUp === "berries" ? "herbs" : "berries";
  check(`home, she carries them through to the pantry: half an hour's lots of what was found, on the house's books, and none of what was not (${await pantry.getAttribute("aria-label")})`, (picked.stock as Record<string, number>)[turnedUp] === held.inHalfHour && (picked.stock as Record<string, number>)[other] === 0 && (await pantry.getAttribute("aria-label")) === `Lots of ${turnedUp} in the pantry: ${held.inHalfHour}`);
  check(`gathering has taught a little of the place too: a quarter of her half hour (${learnt.toFixed(1)}, then ${picked.explored.forest?.toFixed(1)})`, Math.abs((picked.explored.forest ?? 0) - learnt - 30 * GATHER_LEARNS) < 0.01);

  // (From here on both of the things the forest holds are known, however the dice fell: what follows is about the way on, and the gathering of both.)
  await page.evaluate(`window.manor3d.game.finds.forest = ["berries", "herbs"]`);
  await press("forest");
  await press("forest");
  await pageTime(page, REDRAWN_MS);

  // Told how long she may stay: she stays so long and no longer, and every minute of it is counted.
  // (As if the forest were a great deal bigger for the while, all of it dead ends: so that the way on is not found in her half hour, whatever the dice.)
  await page.evaluate(`window.manor3d.game.searches.forest.main.blanks = ${DEAD_ENDS}`);
  await page.locator('.map-doing[data-doing="explore"]').click();
  await page.getByRole("button", { name: "At most 30 minutes there" }).click();
  // (With the return asked for beforehand, by the house chip on the card: this is about what she brings home, and she comes home with it without asking.)
  await page.locator(".map-then").click();
  await face("sage").click();
  await pageTime(page, REDRAWN_MS);
  const short = await outing("sage");
  check("sent to explore for half an hour at the most, she is out so long", short.seeks === null && short.depart - short.arrive === 30);
  await advanceTo(page, short.back + 2);
  const home = await state(page);
  check(`her half hour is up before the way on is found, and every minute of it is counted (${home.explored.forest?.toFixed(2)})`, home.outings.length === 0 && Math.abs((home.explored.forest ?? 0) - (picked.explored.forest ?? 0) - 30) < 0.01 && home.places.caves === undefined);
  await page.evaluate(`window.manor3d.game.searches.forest.main.blanks = 0`);
  const slot = page.locator(".map-way-slot");
  const come = (await page.evaluate(`window.manor3d.game.searches.forest.main.got["way:caves"] ?? 0`)) as number;
  check(`the way on is a question mark until it is found, filled by as many of its own points as have been come upon (${come} of ${WAY_NEEDS}: ${await slot.getAttribute("title")})`, (await slot.textContent()) === "?" && ((await slot.getAttribute("title")) ?? "").startsWith("A way on, not yet found") && Math.abs(Number(await slot.evaluate((node) => (node as HTMLElement).style.getPropertyValue("--got"))) - come / WAY_NEEDS) < 0.01);
  await page.locator('.map-doing[data-doing="gather"]').click();
  await page.getByRole("button", { name: "At most 8 hours there" }).click();
  check(`with both things known and time enough, a basket is twelve lots of the two (${await brings.textContent()})`, (await brings.textContent()) === "🫐 ×9  🌿 ×3");

  // Sent to explore with time to spare: she is out until the way on is found, and then comes home.
  await page.locator('.map-doing[data-doing="explore"]').click();
  await face("rose").click();
  await pageTime(page, REDRAWN_MS);
  const second = await outing("rose");
  await advanceTo(page, second.arrive + 1);
  await pageTime(page, REDRAWN_MS * 2);
  // (The author's list, 2026-11-16: "Let's disable exploration progress under the character for now. We can keep it on the card icons.")
  check(`with it not yet found, nothing new is on the map, and she is still at it; with the one thing left to find, the slip under her is still the compass and no more (${await slip.textContent()})`, (await count('[data-place="caves"]')) === 0 && !(await outing("rose")).done && (await slip.textContent()) === "🧭");
  await until(page, async () => (await state(page)).places.caves !== undefined);
  await advance(page, 1);
  check(`finding the way on, she asks again (${await page.locator(".map-ask").getAttribute("aria-label")})`, (await page.locator(".map-ask").getAttribute("aria-label")) === "Rose has found a way on at the forest" && (await told()).join() === "stay,home");
  await page.locator('.map-ask [data-told="home"]').click();
  await advance(page, 1);
  const found = await state(page);
  const done = await outing("rose");
  // (The forest's points last eighty-two minutes of exploring in all: it is found before they run out, whatever the dice.)
  check(`the way on is found: a new question mark, and a way drawn to it (${found.explored.forest?.toFixed(1)} minutes of the forest learnt in all)`, found.places.caves === "unknown" && (await count('.map-unknown[data-place="caves"]')) === 1 && (await count(".map-way")) === 4);
  check(`…and told to come home, she turns for home with hours of her time unspent (${(done.depart - done.arrive).toFixed(1)} minutes there)`, done.done && done.depart - done.arrive < 82 && Math.abs(done.back - done.depart - FOREST_WALK) < 0.01);
  await press("forest");
  await press("forest");
  await pageTime(page, REDRAWN_MS);
  check("…the forest's card shows the way found, to a place not yet visited, and exploring is offered there still, for whatever may be hidden", (await count(".map-way-slot.known")) === 1 && (await slot.textContent()) === "🗺️" && (await slot.getAttribute("title")) === "A way on, to a place not yet visited" && (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore|🧺 Gather");
  await advanceTo(page, done.back + 2);

  // The new place can be gone to, past the forest.
  await place("caves").click();
  check(`the new place is farther off, by way of the forest (${await card.locator(".map-card-text").first().textContent()})`, (await card.locator(".map-card-text").first().textContent()) === "74 min");
  await face("sage").click();
  await pageTime(page, REDRAWN_MS);
  // (She is out: sent, and on her way to the caves.)
  await outing("sage");
  await until(page, async () => (await count(".map-ask")) === 1);
  check(`it too is found when she is there, and she asks what she is to do, though nothing is known of there to find (${await page.locator(".map-ask").getAttribute("aria-label")})`, (await state(page)).places.caves === "found" && (await count('.map-place[data-place="caves"] img')) === 1 && (await page.locator(".map-ask").getAttribute("aria-label")) === "Sage has found the caves");
  check(`…and its card says with a tick that nothing is known of there to be found, and offers exploring all the same (${await card.locator(".map-slot.known").getAttribute("title")})`, (await card.locator(".map-slot.known").textContent()) === "✓" && (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧭 Explore");
  await page.locator('.map-ask [data-told="home"]').click();
  await until(page, async () => (await state(page)).outings.length === 0);

  // Town: flour is bought there, for coin, and is of a fixed length.
  await page.evaluate(`window.manor3d.game.coin = 0`);
  await place("town").click();
  await pageTime(page, REDRAWN_MS);
  // (Exploring was the last thing chosen, and the town is explored still: buying is pressed.)
  await page.locator('.map-doing[data-doing="buy"]').click();
  check("in town, with every shop found, something is bought or sold, or the place explored still; buying, there is nothing to set about how long; what has been found there is its shops and stalls", (await page.locator(".map-doing").allTextContents()).join("|") === "🚶 Go|🧺 Buy|💰 Sell|🧭 Explore" && (await page.locator('.map-ware[aria-pressed="true"]').getAttribute("data-ware")) === "flour" && (await page.locator(".map-stay").first().isHidden()) && (await page.locator(".map-then").isVisible()) && (await page.locator(".map-card .map-slot").allTextContents()).join("") === "🌾🥬📚🌿👗" && (await page.getByRole("button", { name: "Buy flour: Evelyn" }).count()) === 1);
  check("without the coin nobody can be sent for it", (await face("evelyn").isDisabled()) && ((await face("evelyn").getAttribute("title")) ?? "").includes("coin"));
  await page.evaluate(`window.manor3d.game.coin = 100`);
  await pageTime(page, REDRAWN_MS * 2);
  // (With the return asked for beforehand, by the house chip on the card: this is about what she brings home, and she comes home with it without asking.)
  await page.locator(".map-then").click();
  await face("evelyn").click();
  await pageTime(page, REDRAWN_MS * 2);
  const bought = await state(page);
  check("with it, pressing a face sends her for flour, and her badge in the panel says she is out", bought.outings.some((o) => o.who === "evelyn" && o.doing === "buy" && o.to === "town" && o.done) && bought.coin === 88 && (await page.locator(".person", { hasText: "Evelyn" }).locator(".work").textContent()) === "🗺️");

  // (An error on the page fails the run at once: the night, which goes on from here, has its own line for it.)
  if (errors.length > 0) throw new Error(`outings threw errors: ${errors.slice(0, 3).join(" | ")}`);
  await page.close();
};
