import { CanvasTexture, SRGBColorSpace } from "three";
import type { Texture } from "three";

import type { Scope } from "@scene-lib/scope";

import { recolour } from "./recolour";
import type { RGB, Swatch } from "./recolour";

// Palette swaps, tried out: one person's dress is given another colour, in the picture of her
// that walks the house and in her portrait at once, from the same two pictures she always had.
// A proof of the idea, reached from the dev menu: a room of its own (palette-room.ts) in which
// each of those whose clothes can be told by their hue is looked at large, turned about, and
// given a colour. What is picked is kept in this browser.
//
// The recolouring itself is recolour.ts. This finds the pictures, repaints them, and hands them
// on: the figures are given new skins, and whoever shows a portrait asks here where it is.

/**
 * Someone whose clothes can be recoloured: the pictures she is drawn from, the part of them that
 * is recoloured (what it is called, and how it is told from the rest), the colour it is drawn in,
 * and whether her portrait can be repainted as the picture of her that walks the house can.
 */
export type Wearer = { id: string; name: string; sprite: string; portrait: string; part: string; dress: Swatch; worn: string; portraitPaints: boolean };

/**
 * Each dress is one hue in a picture of skin, hair and linen of others, so it can be told by
 * its hue. The Master's portrait cannot be repainted: his coat is charcoal there, which is no
 * hue at all, and a part with no colour of its own would need a mask drawn for it.
 */
export const WEARERS: Wearer[] = [
  { id: "evelyn", name: "Evelyn", sprite: "evelyn", portrait: "evelyn", part: "Dress", dress: { hue: 222, width: 28, minSat: 0.25 }, worn: "#28365a", portraitPaints: true },
  // Her dress is bright, and the dark lines her face and hair are drawn with are of its hue: only what is bright is dress.
  { id: "rose", name: "Rose", sprite: "maid-rose", portrait: "rose", part: "Dress", dress: { hue: 352, width: 14, minSat: 0.3, minVal: 0.42 }, worn: "#d0767b", portraitPaints: true },
  { id: "sage", name: "Sage", sprite: "maid-sage", portrait: "sage", part: "Dress", dress: { hue: 115, width: 40, minSat: 0.1 }, worn: "#6c8765", portraitPaints: true },
  { id: "master", name: "The Master", sprite: "master", portrait: "master", part: "Coat", dress: { hue: 325, width: 25, minSat: 0.2 }, worn: "#3d2632", portraitPaints: false },
];

const VIEWS = ["front", "back"] as const;
const KEPT = "manor3d.palette";
const PORTRAITS = `${import.meta.env.BASE_URL}portraits/`;
const SPRITES = `${import.meta.env.BASE_URL}sprites/`;

/** The portraits that have been repainted, by name: each as a picture's address that holds the picture itself. */
const repainted = new Map<string, string>();
/** The same for each face of each figure's picture, by the picture's name and the face. */
const figureShots = new Map<string, string>();

/** Where a portrait is to be had: repainted, if it has been; else as it was drawn. */
export const portraitUrl = (name: string): string => repainted.get(name) ?? `${PORTRAITS}${name}.webp`;

/** The same for one face of the picture of someone who walks the house. */
export const figureUrl = (sprite: string, view: "front" | "back"): string => figureShots.get(`${sprite}-${view}`) ?? `${SPRITES}${sprite}-${view}.png`;

/** A colour as it is kept: `#` and six hex digits. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * What this browser kept of the colours picked, by whose they are. Read with care: what is kept
 * may be anything, and the page must open whatever it is. What is not a colour is let go of.
 */
export const keptColours = (kept: string | null): Record<string, string> => {
  let read: unknown;
  try {
    read = JSON.parse(kept ?? "{}");
  } catch {
    return {};
  }
  if (typeof read !== "object" || read === null || Array.isArray(read)) return {};
  return Object.fromEntries(Object.entries(read).filter((entry): entry is [string, string] => typeof entry[1] === "string" && HEX_COLOUR.test(entry[1])));
};

const rgbOfHex = (hex: string): RGB => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as unknown as RGB;

const loaded = (url: string): Promise<HTMLImageElement> =>
  new Promise((done, failed) => {
    const picture = new Image();
    picture.onload = () => done(picture);
    picture.onerror = () => failed(new Error(`No picture at ${url}`));
    picture.src = url;
  });

/** A picture, repainted, on a canvas of its own size. */
const painted = (picture: HTMLImageElement, dress: Swatch, to: RGB): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const pen = canvas.getContext("2d", { willReadFrequently: true });
  if (!pen) return canvas;
  pen.drawImage(picture, 0, 0);
  const before = pen.getImageData(0, 0, canvas.width, canvas.height);
  const after = recolour(before, dress, to);
  pen.putImageData(new ImageData(new Uint8ClampedArray(after.data), after.width, after.height), 0, 0);
  return canvas;
};

type PaletteProps = { /** Give a figure's picture another skin, or (null) its own again. */ reskin: (sprite: string, view: "front" | "back", map: Texture | null) => void };

export type Palette = {
  /** The colours picked, by whose they are. */
  picked: () => Record<string, string>;
  /** Repaint someone in a colour, or (null) put her back as she was drawn. Done when her pictures are ready. */
  wear: (who: Wearer, hex: string | null) => Promise<void>;
  /** The colour she is in now: what was picked for her, or what she was drawn in. */
  colourOf: (who: Wearer) => string;
};

export const Palette = (scope: Scope, { reskin }: PaletteProps): Palette => {
  const read = (): Record<string, string> => {
    try {
      return keptColours(localStorage.getItem(KEPT));
    } catch {
      // (The browser's storage itself may be shut to the page.)
      return {};
    }
  };
  const picked = read();
  const keep = (): void => {
    try {
      localStorage.setItem(KEPT, JSON.stringify(picked));
    } catch {
      // Not kept, then: it lasts until the page is reloaded.
    }
  };
  /** The skins made for the figures, to be let go of when they are replaced. */
  const skins = new Map<string, CanvasTexture>();
  scope.add(() => skins.forEach((skin) => skin.dispose()));
  /** Which repainting of each person is the latest asked for: a slower one that finishes after it is thrown away. */
  const asked = new Map<string, number>();

  /** Repaint someone in a colour, or (null) put her back as she was drawn. */
  const wear = async (who: Wearer, hex: string | null): Promise<void> => {
    const turn = (asked.get(who.id) ?? 0) + 1;
    asked.set(who.id, turn);
    if (hex === null) delete picked[who.id];
    else picked[who.id] = hex;
    keep();
    const to = hex === null ? null : rgbOfHex(hex);
    if (who.portraitPaints) {
      if (to === null) repainted.delete(who.portrait);
      else {
        const canvas = painted(await loaded(`${PORTRAITS}${who.portrait}.webp`), who.dress, to);
        if (asked.get(who.id) !== turn) return;
        repainted.set(who.portrait, canvas.toDataURL("image/png"));
      }
    }
    for (const view of VIEWS) {
      const key = `${who.sprite}-${view}`;
      const canvas = to === null ? null : painted(await loaded(`${SPRITES}${key}.png`), who.dress, to);
      if (asked.get(who.id) !== turn) return;
      skins.get(key)?.dispose();
      skins.delete(key);
      if (canvas) figureShots.set(key, canvas.toDataURL("image/png"));
      else figureShots.delete(key);
      if (canvas) {
        const skin = new CanvasTexture(canvas);
        skin.colorSpace = SRGBColorSpace;
        skins.set(key, skin);
      }
      reskin(who.sprite, view, skins.get(key) ?? null);
    }
  };
  // What was picked before is worn again as the page opens.
  for (const who of WEARERS) if (picked[who.id]) void wear(who, picked[who.id]);

  return { picked: () => ({ ...picked }), wear, colourOf: (who) => picked[who.id] ?? who.worn };
};
