import type { PlaceId } from "../game";

// How each place on the map is drawn once it has been found: a set piece in the shape of the
// thing, set down on the parchment. Sizes are in the map's units (the first sheet is one unit
// square), and are chosen to read well, not to scale: a house is drawn far larger than it is,
// a forest far smaller. The pictures are in public/map; where they came from is art/map.
// (Halved on 2026-11-13, at the author's asking: there is more paper between places, and the
// ways are seen to be walked.)

export type Piece = {
  file: string;
  /** How wide it is drawn on the map. */
  width: number;
  /** How tall the picture is for its width. */
  tall: number;
  /** How far short of the place a way stops, so that it runs up to the piece and not under it. */
  clear: number;
};

export const MAP_ART = `${import.meta.env.BASE_URL}map/`;
export const PARCHMENT = "parchment.jpg";

export const PIECES: Record<PlaceId, Piece> = {
  // The manor is drawn on its grounds: the author's choice of the two (art/map has the house alone as well).
  manor: { file: "manor.webp", width: 0.1415, tall: 0.882, clear: 0.0625 },
  town: { file: "town.webp", width: 0.122, tall: 0.903, clear: 0.049 },
  forest: { file: "forest.webp", width: 0.132, tall: 0.852, clear: 0.056 },
  lake: { file: "lake.webp", width: 0.117, tall: 0.655, clear: 0.049 },
  caves: { file: "caves.webp", width: 0.073, tall: 1.002, clear: 0.034 },
};

/** How far down a piece the place's own point is: the pieces are seen from above and in front, so what they stand on is below their middle. */
export const PIECE_FOOT = 0.62;

/** A place not yet found is a round token with a question mark: one size for every place, so that it gives nothing away. */
export const UNKNOWN_RADIUS = 0.03;
/** The gap between the end of a way and the token it runs to. */
export const WAY_GAP = 0.008;

/** Someone out of doors is a round token with her face on it. */
export const TOKEN_RADIUS = 0.025;
