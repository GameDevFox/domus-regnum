import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { CURIOS, MASTERY_LOAVES, PACE_SAYS, PLACES, SHOPS, THINGS } from "../game";
import type { Feat, Game } from "../game";
import { MAP_ART, PIECES } from "./map-art";
import { el } from "./panel";
import { ui } from "./ui-layer";

// Marking a moment: when someone earns a mastery, the Master has an invention ready, or someone
// out of doors finds a place or a way on from one, it is seen and heard. A card drops in under
// the clock with her name and a picture of what it is, a few notes ring, and for a few seconds
// a sparkle floats over her head in the house.

type FeatsProps = { game: Game; /** Ticks once a frame, in seconds. */ frame: Value<number>; nameOf: (id: string) => string };

export type FeatsView = { /** Whether someone is still being cheered. */ cheering: (id: string) => boolean };

/** How long the card stays and the sparkle floats, in seconds. */
const CHEER_SECONDS = 6;
/** The picture and the words for each kind of feat. */
const FEATS: Record<Feat["what"], { glyph: string; says: (name: string, feat: Feat) => string }> = {
  bread: { glyph: "🥖", says: (name) => `${name} has baked ${MASTERY_LOAVES} loaves and mastered bread: her kneading and handling go ${PACE_SAYS}` },
  invention: { glyph: "⚗️", says: (name) => `${name} has an invention ready: choose which, under Inventions` },
  found: { glyph: "🗺️", says: (name, feat) => `${name} has found ${placeOf(feat)}: it is on the map` },
  way: { glyph: "🗺️", says: (name, feat) => `${name} has found a way on from ${placeOf(feat)}: there is a new place on the map` },
  curio: { glyph: "✨", says: (name, feat) => `${name} has come upon ${feat.curio ? CURIOS[feat.curio].name.toLowerCase() : "something"} at ${placeOf(feat)}, and is bringing it home` },
  shop: { glyph: "🏪", says: (name, feat) => `${name} has found ${shopOf(feat)} in town: things can be bought there now` },
  thing: { glyph: "🧺", says: (name, feat) => `${name} has found ${feat.thing ? THINGS[feat.thing].name.toLowerCase() : "something"} at ${placeOf(feat)}: they can be gathered there` },
};
const shopOf = (feat: Feat): string => SHOPS.find((s) => s.id === feat.shop)?.name.toLowerCase() ?? "a shop";
const placeOf = (feat: Feat): string => (feat.place ? PLACES[feat.place].name.toLowerCase() : "a place");

/** What the card shows for a feat: the piece of a place that has been found, as it is set down on the map; otherwise a glyph. */
const pictureOf = (feat: Feat): HTMLElement => {
  if (feat.what === "thing" && feat.thing) return el("span", "feat-glyph", THINGS[feat.thing].glyph);
  if (feat.what === "curio" && feat.curio) return el("span", "feat-glyph", CURIOS[feat.curio].glyph);
  if (feat.what === "shop" && feat.shop) return el("span", "feat-glyph", SHOPS.find((s) => s.id === feat.shop)?.glyph ?? FEATS.shop.glyph);
  if (feat.what !== "found" || !feat.place) return el("span", "feat-glyph", FEATS[feat.what].glyph);
  const piece = el("img", "feat-piece");
  piece.src = MAP_ART + PIECES[feat.place].file;
  piece.alt = "";
  return piece;
};
/** The notes of the chime, in hertz, one after another: a rising major chord. */
const CHIME = [523.25, 659.25, 783.99, 1046.5];
const NOTE_EVERY = 0.09;
const NOTE_LASTS = 0.5;
const CHIME_LOUDNESS = 0.12;

/** A few rising notes. Silent where the browser will not make sound yet: before the page has been clicked, or in a test. */
const chime = (): void => {
  try {
    const audio = new AudioContext();
    CHIME.forEach((pitch, n) => {
      const from = audio.currentTime + n * NOTE_EVERY;
      const note = audio.createOscillator();
      const loudness = audio.createGain();
      note.type = "triangle";
      note.frequency.value = pitch;
      loudness.gain.setValueAtTime(CHIME_LOUDNESS, from);
      loudness.gain.exponentialRampToValueAtTime(0.001, from + NOTE_LASTS);
      note.connect(loudness).connect(audio.destination);
      note.start(from);
      note.stop(from + NOTE_LASTS);
    });
    setTimeout(() => void audio.close(), (CHIME.length * NOTE_EVERY + NOTE_LASTS) * 1000 + 200);
  } catch {
    // No sound is no harm: the card and the sparkle still mark it.
  }
};

export const mountFeats = (scope: Scope, { game, frame, nameOf }: FeatsProps): FeatsView => {
  const host = el("div", "feats");
  host.setAttribute("role", "status");
  ui().append(host);
  scope.add(() => host.remove());

  /** Until when each person is cheered, by the frame's clock. */
  const until = new Map<string, number>();
  // Feats from before the page was opened are history, not news.
  let seen = game.feats.length;

  scope.effect((use) => {
    const now = use(frame);
    for (; seen < game.feats.length; seen++) {
      const feat = game.feats[seen];
      const card = el("div", "feat");
      card.title = FEATS[feat.what].says(nameOf(feat.who), feat);
      card.setAttribute("aria-label", card.title);
      card.append(el("span", "feat-star", "⭐"), pictureOf(feat), el("span", "feat-name", nameOf(feat.who)));
      host.append(card);
      setTimeout(() => card.remove(), CHEER_SECONDS * 1000);
      until.set(feat.who, now + CHEER_SECONDS);
      chime();
    }
  });

  return { cheering: (id) => (until.get(id) ?? 0) > frame.peek() };
};
