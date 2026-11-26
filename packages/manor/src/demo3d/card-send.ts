import type { Scope } from "@scene-lib/scope";

import { enqueue, outingOf, sendParty, whyNotAdd, whyNotParty } from "../game";
import type { Errand, Game, Terms } from "../game";
import { el } from "./dom";
import { namesSay } from "./ask-says";
import { addAfterSays, addNotNowSays, chosenSays, notNowSays, partyFromHouseSays } from "./who-says";
import type { WhoState } from "./who-row";

// How pressing a face on a place's card sends her (map-card.ts), beyond sending her alone to do
// the thing at once: two toggles in a row of their own, each a picture lit while it is on. ➕
// Then (the author agreed it, 2026-11-16, "Queuing several steps ahead"): lit, a face pressed
// adds the thing after what she is at, at the end of her queue (the rules' `enqueue`); someone
// at home is sent, as by a press unlit. It stays lit until it is pressed again, from card to
// card, so that steps at several places can be queued one after another. 👥 Together ("Several
// people together"): lit, a face pressed is chosen, and pressed again is not; and the Send
// button at the end of the row sends those chosen out together, as one party (`sendParty`).
// Only someone at home can be chosen: a party is sent from the house. Together lit, Then is
// put by; the chosen are forgotten when they are sent and when the card is made anew. Unlike
// Then, Together goes out once the party is sent, and the card that Stay puts up is never in
// it (`sendAlone`): someone told to stay is out, and can never be chosen for a party, so a
// card left lit would refuse her face (the playtest of 2026-11-17, 1.1). (Then is left lit:
// someone waiting with nothing queued is sent at once by it, so Stay's card takes her face.)

/** Whether each toggle is lit, kept from card to card. */
let then = false;
let together = false;

/** The next card sends each alone, as the card Stay puts up does: Together goes out. */
export const sendAlone = (): void => {
  together = false;
};

export type SendModes = {
  node: HTMLElement;
  /** A face was pressed: "queued" or "chosen" if the press was taken here, false if she is to be sent as ever. */
  press: (id: string) => "queued" | "chosen" | false;
  /** How her face stands, where a toggle has it otherwise than as ever; else null. */
  stateOf: (id: string, label: string) => WhoState | null;
  /** Whether a face pressed for someone out adds the thing after what she is at: ➕ lit, and 👥 not. Added, it is done on the terms of the outing it joins, not the card's. */
  queuing: () => boolean;
  refresh: () => void;
};

type ModesProps = {
  game: Game;
  /** What a press would send her to do just now, and on what terms; null with nothing to be done. */
  errand: () => Errand | null;
  terms: () => Terms;
  /** A toggle was pressed: the card is brought up to the moment. */
  changed: () => void;
  /** A party was sent. */
  sent: () => void;
  /** Why she cannot be sent alone, in words, as the card has it; null if she can be. For whoever is chosen. */
  whyAlone: (id: string) => string | null;
};

const THEN = { glyph: "➕", on: "Then: lit, a face pressed is added after what she is at. Press to send her at once instead", off: "Then: unlit, a face pressed sends her at once. Press to add it after what she is at instead" };
const TOGETHER = { glyph: "👥", on: "Together: lit, faces pressed are chosen, and Send sends them as one party. Press to send each alone instead", off: "Together: unlit, a face pressed is sent alone. Press to choose several, and send them as one party" };
const SEND_GLYPH = "▶";

export const SendModes = (scope: Scope, { game, errand, terms, changed, sent, whyAlone }: ModesProps): SendModes => {
  const chosen = new Set<string>();
  const node = el("div", "map-card-row map-card-sends");
  const toggle = (glyph: string): HTMLButtonElement => el("button", "chip map-bed map-send-mode", glyph);
  const thenChip = toggle(THEN.glyph);
  thenChip.dataset.mode = "then";
  const togetherChip = toggle(TOGETHER.glyph);
  togetherChip.dataset.mode = "together";
  const go = el("button", "chip map-send-party");
  go.dataset.send = "party";
  const count = el("span", "map-send-count");
  go.append(el("span", "", SEND_GLYPH), count);
  node.append(thenChip, togetherChip, go);
  scope.listen(thenChip, "click", () => {
    then = !then;
    changed();
  });
  scope.listen(togetherChip, "click", () => {
    together = !together;
    chosen.clear();
    changed();
  });
  /** In the order of the household, as the party is sent: the first of it pays. */
  const party = (): string[] => game.household.filter((id) => chosen.has(id));
  scope.listen(go, "click", () => {
    const now = errand();
    if (!now || !sendParty(game, party(), now, terms())) return;
    chosen.clear();
    sendAlone();
    sent();
  });

  const press = (id: string): "queued" | "chosen" | false => {
    const now = errand();
    if (!now) return false;
    if (together) {
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
      return "chosen";
    }
    // (Someone at home is sent as by a press unlit: the card's own sending says how.)
    if (!then || !outingOf(game, id)) return false;
    return enqueue(game, id, now, terms()) ? "queued" : false;
  };

  const stateOf = (id: string, label: string): WhoState | null => {
    const now = errand();
    if (!now) return null;
    if (together) {
      const why = outingOf(game, id) ? partyFromHouseSays(id) : whyAlone(id);
      const on = chosen.has(id);
      const says = why ?? chosenSays(id, on);
      return { label, title: `${label}. ${says}`, disabled: why !== null, on: why === null && on };
    }
    if (!then || !outingOf(game, id)) return null;
    const why = whyNotAdd(game, id, now, terms());
    const says = why === null ? addAfterSays(id, label) : `${label}. ${addNotNowSays(id, why)}`;
    return { label: addAfterSays(id, label), title: says, disabled: why !== null, out: true };
  };

  const refresh = (): void => {
    for (const [chip, lit, words] of [
      [thenChip, then, THEN],
      [togetherChip, together, TOGETHER],
    ] as const) {
      chip.classList.toggle("on", lit);
      chip.setAttribute("aria-pressed", String(lit));
      chip.title = lit ? words.on : words.off;
      chip.setAttribute("aria-label", chip.title);
    }
    // Together lit, Then is put by.
    thenChip.disabled = together;
    for (const id of [...chosen]) if (outingOf(game, id)) chosen.delete(id);
    const ids = party();
    go.hidden = !together;
    count.textContent = ids.length > 0 ? `${ids.length}` : "";
    const now = errand();
    const notNow = now && ids.length > 0 ? whyNotParty(game, ids, now, terms()) : null;
    const why = ids.length === 0 ? "Choose who is to go, by her face" : !now ? "Nothing to be done here" : notNow === null ? null : notNowSays(notNow) || "They cannot be sent just now";
    go.disabled = why !== null;
    go.title = why === null ? `Send ${namesSay(ids, true)} together, as one party` : `Send them together. ${why}`;
    go.setAttribute("aria-label", go.title);
  };
  refresh();
  return { node, press, stateOf, queuing: () => then && !together, refresh };
};
