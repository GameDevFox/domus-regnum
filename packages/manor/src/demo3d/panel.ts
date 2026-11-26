import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { nearing, outingOf, outingStatus, isMaster, needOf, progressOf } from "../game";
import type { Game, JobId, Need } from "../game";
import type { Actor } from "../space";
import { el } from "./dom";
import { GLYPHS } from "./figures";
import { faceOf, nameWithin } from "./map-places";
import { statusShort } from "./outing-says";
import { StepRow } from "./step-row";
import { outTitle } from "./who-says";
import { workplaceOf } from "./workplaces";

export { el } from "./dom";

// The household, as ordinary page elements over the picture: who is doing what, her face on a
// button that follows her, and a badge of the work each is at with a ring round it for how far
// through it she is. Work is not given out here: it is given at the place it is done, on that
// place's card (work-crew.ts), which her badge opens. (Until 2026-11-16 each row had a button
// for every job, and every new job was another column of them.)

type PanelProps = {
  game: Game;
  /** The people who live here, in the order they are listed. */
  household: Actor[];
  /** The key that follows the nth person on the list. */
  personKey: (n: number) => string;
  following: Value<string | null>;
  /** Someone's name has been pressed: follow her in the house, or find her on the map if she is out of it. */
  pick: (id: string) => void;
  /** Open the card of a place of work; and the map, where whoever is out is to be found. */
  openPlace: (job: JobId) => void;
  openMap: () => void;
  frame: Value<number>;
};

/** The list of who is doing what is redrawn this often, in seconds: often enough to read as live. */
const STATUS_EVERY = 0.25;

const ASLEEP = "💤";
const OUT = "🗺️";
/** The ring round a badge: how big the badge is drawn, how thick the ring, and the circle it runs on (px, in a box of 36). */
const RING = { box: 36, radius: 16, thick: 3 };
const RING_LENGTH = 2 * Math.PI * RING.radius;
const SVG = "http://www.w3.org/2000/svg";
const PERCENT = 100;
/** When what she was at is done and she begins again at nothing, the ring is shown whole for this long first (seconds): so that it is seen to close. */
const CLOSED_SECONDS = 0.8;
/** What someone at a job is waiting for, as a picture. */
const NEEDS: Record<Need, string> = { flour: "🌾?", oven: "🔥 ✋", room: "🍞 ✋", loaves: "🍞?", choice: "⚗️?" };
const NEED_SAYS: Record<Need, string> = { flour: "Waiting for flour", oven: "Waiting for the oven", room: "The shop's shelf is full", loaves: "Nothing on the shelf to sell", choice: "Waiting for a device to be chosen" };

export const mountPanel = (scope: Scope, { game, household, personKey, following, pick, openPlace, openMap, frame }: PanelProps): void => {
  const host = document.getElementById("cast");
  if (!host) return;

  const rows = household.map((actor, n) => {
    const row = el("div", "person");
    const follow = el("button", "follow");
    const key = el("kbd", "key", personKey(n));
    const doing = el("span", "doing");
    // (Her name is said here too: folded away, the row is her face and her badge alone, and this is then what the button is called.)
    follow.title = `${actor.name}. Key: ${personKey(n)}`;
    // The key is announced as the button's shortcut, not read out as part of the person's name.
    key.setAttribute("aria-hidden", "true");
    follow.setAttribute("aria-keyshortcuts", personKey(n));
    const name = el("span", "name", actor.name);
    // A mastery she has is shown beside her name, once she has it.
    const badge = el("span", "badge");
    badge.hidden = true;
    name.append(badge);
    // Her face, in her row (the author's, 2026-11-16: "Left side menu also shows Character profile in their row"), with her key before it ("the key binding to the left of the character icon").
    follow.append(key, faceOf(actor.id), name, doing);
    scope.listen(follow, "click", () => pick(actor.id));
    // What she is at, as a picture, with a ring round it for how far through it she is. Pressed, it opens the place she is at it.
    const work = el("button", "work");
    const glyph = el("span", "work-glyph");
    const ring = document.createElementNS(SVG, "svg");
    ring.setAttribute("viewBox", `0 0 ${RING.box} ${RING.box}`);
    ring.setAttribute("class", "work-ring");
    ring.setAttribute("aria-hidden", "true");
    const arc = document.createElementNS(SVG, "circle");
    for (const [name, value] of [["cx", RING.box / 2], ["cy", RING.box / 2], ["r", RING.radius], ["stroke-width", RING.thick], ["stroke-dasharray", RING_LENGTH]] as [string, number][]) arc.setAttribute(name, String(value));
    ring.append(arc);
    work.append(ring, glyph);
    scope.listen(work, "click", () => {
      const job = game.posts[actor.id];
      if (outingOf(game, actor.id)) openMap();
      else if (job) openPlace(job);
    });
    // Out of doors, her steps, under her name (step-row.ts).
    const steps = StepRow(scope, { game, id: actor.id });
    row.append(follow, work, steps.node);
    host.append(row);
    return { actor, row, doing, badge, work, glyph, ring, arc, steps, drawn: "", last: null as number | null, closedUntil: 0, lastStepSince: null as number | null };
  });

  scope.effect((use) => {
    const who = use(following);
    for (const { actor, row } of rows) row.classList.toggle("on", actor.id === who);
  });

  /** Her badge: the picture of what she is at, the ring round it, and what pressing it opens. Drawn again only when what it would show has changed. */
  const showWork = (row: (typeof rows)[number], abed: boolean, at: number): void => {
    const { actor, work, glyph, ring, arc } = row;
    const job = game.posts[actor.id];
    const out = outingOf(game, actor.id) !== undefined;
    const place = job ? workplaceOf(job) : null;
    const progress = progressOf(game, actor.id);
    // A ring for what has an end, as far round as she is through it; and a whole ring, of another colour, while she is stood waiting on something.
    const counted = progress?.share ?? null;
    // At the last step of a thing counted by steps, nothing more is counted till it is done: the ring goes on towards whole meanwhile, by the house's own time (progress.ts, `nearing`).
    row.lastStepSince = progress?.lastStep && !progress.waiting ? (row.lastStepSince ?? game.world.t) : null;
    const through = counted !== null && row.lastStepSince !== null ? nearing(counted, game.world.t - row.lastStepSince) : counted;
    // What she was at is done, and she is at the start of the next: the ring closes before it opens again (the author's, 2026-11-16, of a ring that never came round: "it doesn't quite go in a full circle").
    if (counted !== null && row.last !== null && counted < row.last && !progress?.waiting) row.closedUntil = at + CLOSED_SECONDS;
    row.last = counted;
    const closed = at < row.closedUntil;
    const share = progress === null ? null : progress.waiting || closed ? 1 : through;
    const now = `${job} ${out} ${abed} ${share === null ? "" : Math.round(share * PERCENT)} ${progress?.waiting}`;
    if (now === row.drawn) return;
    row.drawn = now;
    glyph.textContent = out ? OUT : abed ? ASLEEP : (place?.glyph ?? "");
    work.classList.toggle("idle", !out && !abed && !place);
    work.classList.toggle("waiting", progress?.waiting ?? false);
    work.dataset.share = share === null ? "" : String(Math.round(share * PERCENT));
    arc.style.strokeDashoffset = String(RING_LENGTH * (1 - (share ?? 0)));
    // With nothing to count, there is no ring: it is taken out of the badge, not left in it unseen.
    if (share === null) ring.remove();
    else if (!ring.isConnected) work.prepend(ring);
    work.disabled = !out && !place;
    const what = out ? "out of doors" : abed ? "asleep" : place ? place.label.toLowerCase() : "nothing";
    const says = share === null || progress?.waiting ? "" : `, ${Math.round(share * PERCENT)}% through`;
    const opens = out ? ". Open the map" : place ? `. Open ${place.called}` : "";
    const waits = progress?.waiting ? ", and waiting on something" : "";
    // (Not begun with her name: the button that follows her is the one that is called by it.)
    work.setAttribute("aria-label", `What ${nameWithin(actor.id)} is at: ${what}${says}${waits}${opens}`);
    work.title = `What ${nameWithin(actor.id)} is at: ${what}${says}${waits}${opens}${!out && !place && !abed ? ". Work is given at the place it is done: the kitchen, the shop, the garden" : ""}`;
  };

  let nextStatus = 0;
  scope.effect((use) => {
    const now = use(frame);
    if (now < nextStatus) return;
    nextStatus = now + STATUS_EVERY;
    for (const row of rows) {
      const { actor, doing, badge, steps } = row;
      steps.refresh();
      const master = isMaster(game, actor.id);
      if (master === badge.hidden) {
        badge.hidden = !master;
        badge.textContent = master ? "⭐" : "";
        badge.title = master ? "Has mastered bread" : "";
        // (Named as a picture, so that it is read out beside her name.)
        if (master) badge.setAttribute("role", "img");
        if (master) badge.setAttribute("aria-label", badge.title);
        else badge.removeAttribute("aria-label");
      }
      const need = needOf(game, actor.id);
      const carrying = actor.carrying ? ` ${GLYPHS[actor.carrying] ?? ""}` : "";
      const abed = game.abed[actor.id] === "in";
      const out = outingOf(game, actor.id);
      showWork(row, abed, now);
      if (out?.state === "away") {
        // What she is at out there: how far off she is, or how full her basket. When she is back is for whoever asks.
        const status = outingStatus(game, out);
        doing.textContent = statusShort(status);
        // Asking, time stands still until she is told: her name, pressed, opens the map, where her question is.
        doing.title = outTitle(game, out);
        continue;
      }
      // (There is the room now to say what she waits for, beside the picture of it.)
      const what = abed ? `${ASLEEP} asleep` : need ? `${NEEDS[need]} ${NEED_SAYS[need].toLowerCase()}` : (actor.label ?? (actor.walker.route ? "walking" : "waiting"));
      doing.textContent = `${what}${carrying}`;
      doing.title = abed ? "Asleep" : need ? NEED_SAYS[need] : "";
    }
  });
};
