import { Rect } from "../types";

// Texture-circuit math for the `walls` perimeter kind: the wallpaper should flow CONTINUOUSLY
// around the room — around corners, through the corner posts, on the inside AND the outside.
//
// Three facts make this pure offset bookkeeping (no geometry changes):
//
//   1. Box UV directions already form two coherent circuits. Per three's BoxGeometry, a face's
//      u axis runs +x on +Z, −x on −Z, −z on +X, +z on −X. Combined with the edge rotations
//      (N/S runs unrotated; E/W runs rotY=90° so local +X = world north), every INTERIOR face's
//      u advances along the clockwise walk N→E→S→W, and every EXTERIOR face's u advances along
//      the counterclockwise walk N→W→S→E. The corner posts' faces match too.
//   2. So continuity only needs each face's u-START to equal its position along its circuit.
//   3. The posts consume ARC LENGTH, like a real pilaster being papered: walking a circuit
//      crosses TWO post faces per corner (arrive on the previous wall's plane, turn the post's
//      edge, depart on the next wall's plane), so each circuit's total length is
//      2(w+h) + 4·postSize and side starts space out by postSize per corner passed. The post's
//      two faces show CONSECUTIVE pattern windows — never the same slice twice (the same-slice
//      shortcut printed any pattern border that fell on a post onto BOTH faces: the
//      "double seam"). One mismatch per circuit remains where the loop closes (a loop whose
//      length isn't a panel multiple can't tile seamlessly) — it lands on the anchor post's
//      turn edge, the least visible spot.
//
// All values are world units along the circuit; `wallpaperMat` turns them into UV offsets
// (negative values wrap via RepeatWrapping). Pure, so the continuity equations are unit-tested.

export type SideUv = { front: number; back: number }; // u-start per box face (+Z / −Z)
export type CornerUv = { uPosX: number; uNegX: number; uPosZ: number; uNegZ: number };

export type PerimeterUv = {
  sides: { N: SideUv; S: SideUv; W: SideUv; E: SideUv };
  corners: { NW: CornerUv; NE: CornerUv; SW: CornerUv; SE: CornerUv };
};

type Side = "N" | "E" | "S" | "W";
type Vertex = "NW" | "NE" | "SE" | "SW";

// Which post face lies on a given side's plane, per circuit (interior faces look into the room,
// exterior faces away; +Z is world south, +X east).
const INT_FACE: Record<Side, keyof CornerUv> = { N: "uPosZ", E: "uNegX", S: "uNegZ", W: "uPosX" };
const EXT_FACE: Record<Side, keyof CornerUv> = { N: "uNegZ", E: "uPosX", S: "uPosZ", W: "uNegX" };

// Each circuit's walk order and, per vertex, the [arrival side, departure side].
const INT_ORDER: Side[] = ["N", "E", "S", "W"]; // clockwise from NW
const EXT_ORDER: Side[] = ["N", "W", "S", "E"]; // counterclockwise from NE
const INT_VERTS: Record<Vertex, [Side, Side]> = {
  NW: ["W", "N"],
  NE: ["N", "E"],
  SE: ["E", "S"],
  SW: ["S", "W"],
};
const EXT_VERTS: Record<Vertex, [Side, Side]> = {
  NE: ["E", "N"],
  NW: ["N", "W"],
  SW: ["W", "S"],
  SE: ["S", "E"],
};

export const perimeterUv = (r: Rect, postSize: number): PerimeterUv => {
  // The rect is already world meters (doc v2), so side lengths are direct.
  const lengths: Record<Side, number> = {
    N: r.w,
    S: r.w,
    E: r.d,
    W: r.d,
  };
  const half = postSize / 2;

  // Side starts along a circuit: each side begins postSize after the previous one ends (the
  // corner post's surface owns that stretch of pattern).
  const starts = (order: Side[]): Record<Side, number> => {
    const out = {} as Record<Side, number>;
    let s = 0;
    order.forEach((side) => {
      out[side] = s;
      s += lengths[side] + postSize;
    });
    return out;
  };
  const int = starts(INT_ORDER);
  const ext = starts(EXT_ORDER);

  // A post face spans postSize centered on the vertex; walking through a corner, the ARRIVAL
  // face continues the previous side ([end − half, end + half]) and the DEPARTURE face leads
  // into the next ([start − half, start + half]) — consecutive windows, exactly postSize apart.
  const corners = {} as Record<Vertex, CornerUv>;
  (Object.keys(INT_VERTS) as Vertex[]).forEach((v) => {
    const c = {} as CornerUv;
    const [intArr, intDep] = INT_VERTS[v];
    c[INT_FACE[intArr]] = int[intArr] + lengths[intArr] - half;
    c[INT_FACE[intDep]] = int[intDep] - half;
    const [extArr, extDep] = EXT_VERTS[v];
    c[EXT_FACE[extArr]] = ext[extArr] + lengths[extArr] - half;
    c[EXT_FACE[extDep]] = ext[extDep] - half;
    corners[v] = c;
  });

  return {
    // A run's u-start is its side's circuit start. Which face is which: +Z faces south for N/S
    // runs (interior for N, exterior for S) and east for E/W runs (interior for W, ext for E).
    sides: {
      N: { front: int.N, back: ext.N },
      E: { front: ext.E, back: int.E },
      S: { front: ext.S, back: int.S },
      W: { front: int.W, back: ext.W },
    },
    corners,
  };
};
