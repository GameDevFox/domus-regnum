import { describe, expect, it } from "vitest";

import { MASTERY_LOAVES, assign, explore, mayWork, outingOf, tell } from "../game";
import type { Game, NotNow, Outing, OutingStatus } from "../game";
import { atMost } from "../game/outing-kit";
import { HOUR } from "../game/tuning";
import { quiet, until } from "../game/test-kit";
import { pronounsOf } from "./map-places";
import { statusSays } from "./outing-says";
import { addAfterSays, addNotNowSays, answerFirstSays, askMarkSays, asksAfterSays, backSays, bakedText, chosenSays, crewSays, fromWhereSays, homewardSays, hereAlreadySays, noneWithSays, notNowSays, outTitle, partyFromHouseSays } from "./who-says";
import { WORKPLACES } from "./workplaces";
import type { Workplace } from "./workplaces";

// Every sentence of the page that speaks of one of the household by a pronoun takes it from the
// cast: the Master is "he" in all of them, and the maids are "she" as before.

const SHE_WORDS = /\b(she|her|hers)\b/i;
const HE_WORDS = /\b(he|him|his)\b/i;
const EVERY_WHY: NotNow[] = ["nobody", "out", "night", "coin", "late", "needless", "shop", "nothing", "full"];
const BAKE = WORKPLACES.find((w) => w.job === "bake") as Workplace;
const LAB = WORKPLACES.find((w) => w.job === "lab") as Workplace;
const outing = (game: Game, id: string): Outing => outingOf(game, id) as Outing;

/** Her face on a place of work, as work-crew.ts puts it to the sentence. */
const crew = (game: Game, place: Workplace, id: string): string => {
  const other = WORKPLACES.find((w) => w.job === game.posts[id]);
  return crewSays(game, place, id, { may: mayWork(id, place.job), held: game.posts[id] === place.job, other });
};

/** Every sentence there is of someone, in each of its forms that names her: out at a place asking, out waiting, on the road, at work. */
const sentencesOf = (id: string): string[] => {
  const lines: string[] = [];
  const game = quiet();
  // At work, or not, in the house.
  assign(game, id, "bake");
  lines.push(crew(game, BAKE, id), crew(game, LAB, id));
  assign(game, id, null);
  lines.push(crew(game, BAKE, id));
  lines.push(askMarkSays(id), bakedText(id, 1, false), bakedText(id, 30, true));
  lines.push(homewardSays(id), answerFirstSays(id), hereAlreadySays(id), noneWithSays(id), asksAfterSays(id, true), asksAfterSays(id, false));
  lines.push(partyFromHouseSays(id), chosenSays(id, true), chosenSays(id, false), addAfterSays(id, "Explore"));
  for (const why of EVERY_WHY) lines.push(notNowSays(why, id), addNotNowSays(id, why));
  // On the road; then asking at the forest, found; then waiting there.
  explore(game, id, "forest", atMost(2 * HOUR));
  until(game, () => outing(game, id).state === "away", HOUR);
  lines.push(fromWhereSays(game, id, "forest", atMost(HOUR)), backSays(outing(game, id)), crew(game, BAKE, id));
  until(game, () => game.asks.length > 0, 2 * HOUR);
  lines.push(outTitle(game, outing(game, id)));
  tell(game, id, "stay");
  lines.push(fromWhereSays(game, id, "forest", atMost(HOUR)), fromWhereSays(game, id, "lake", atMost(HOUR)));
  // What she is at out there, each way it names her.
  const statuses: OutingStatus[] = [{ is: "leaving" }, { is: "returning" }, { is: "walking", to: "forest", minutes: 5, idle: true }, { is: "asking", at: "forest" }, { is: "gathering", at: "forest", picked: [{ thing: "berries", lots: 1 }], load: 1, holds: 12 }];
  for (const status of statuses) lines.push(statusSays(game, status, id));
  return lines.filter((line) => line !== "");
};

describe("the sentences that speak of someone of the household", () => {
  it("take her or his pronouns from the cast, with a capital to begin a sentence", () => {
    expect(pronounsOf("master")).toEqual({ subject: "he", object: "him", possessive: "his", Subject: "He", Possessive: "His" });
    expect(pronounsOf("sage")).toEqual({ subject: "she", object: "her", possessive: "her", Subject: "She", Possessive: "Her" });
    // (No one in particular, or someone not of the cast: as the sentences are written.)
    expect(pronounsOf()).toMatchObject({ subject: "she" });
    expect(pronounsOf("townsman")).toMatchObject({ subject: "she" });
  });

  it("never call the Master she or her, and call him he, him or his", () => {
    const lines = sentencesOf("master");
    expect(lines.filter((line) => SHE_WORDS.test(line))).toEqual([]);
    // (Those that speak of him by a pronoun at all; the rest say only what is so.)
    expect(lines.filter((line) => HE_WORDS.test(line)).length).toBeGreaterThan(lines.length / 2);
    expect(crew(quiet(), BAKE, "master")).toBe(`Baking: The Master. Press to give it to him: he leaves the laboratory for it. 0 of ${MASTERY_LOAVES} loaves towards mastering it.`);
  });

  it("say of someone out that they are on their way home already, his or hers", () => {
    expect(homewardSays("master")).toBe("He is on his way home already");
    expect(homewardSays("sage")).toBe("She is on her way home already");
  });

  it("call a maid she and her, as before", () => {
    const lines = sentencesOf("sage");
    expect(lines.filter((line) => HE_WORDS.test(line))).toEqual([]);
    expect(lines.filter((line) => SHE_WORDS.test(line)).length).toBeGreaterThan(lines.length / 2);
  });

  it("of no one in particular, why she cannot be sent says it as it was", () => {
    expect(notNowSays("out")).toBe("She is out already");
    expect(notNowSays("full")).toBe("Her basket is full");
  });
});
