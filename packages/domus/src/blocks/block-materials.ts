import {
  BoxGeometry,
  ClampToEdgeWrapping,
  Color,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

import { loadGLTF } from "@kitsune/common-web";
import { Value } from "@kitsune/common-web/src/value";

import { BlockParams } from "./types";
import { WALL_THICKNESS } from "./dims";

// Bumped each time a lazily-loaded block texture finishes decoding. Block textures load async, so a
// wall/floor built before its image arrives renders black (the material has a `map` whose image
// hasn't uploaded yet). A continuous render loop self-heals on the next frame, but render-on-demand
// surfaces (the level editor) and a paused harness do NOT — so they subscribe to this and repaint
// when it changes. Stays 0 headlessly (no loads happen without a document).
export const textureEpoch = Value(0);
const bumpTextureEpoch = () => textureEpoch.update((n) => n + 1);

// The material / texture / mesh-primitive toolkit for the block factories (kinds/*). Split
// out so block-kinds is just the geometry of each kind; everything about *surfaces* — param readers,
// lazy texture loading (browser-guarded), the wallpaper tiling math, the black caps, and the
// standing-box helper — lives here. The tiling math (`wallpaperUv`) is pure and unit-tested.

// --- param readers -----------------------------------------------------------------------------

export const num = (params: BlockParams, key: string, fallback: number): number =>
  typeof params[key] === "number" ? (params[key] as number) : fallback;

export const color = (params: BlockParams, key: string, fallback: number): Color =>
  new Color().setHex(
    typeof params[key] === "number" ? (params[key] as number) : fallback,
    SRGBColorSpace,
  );

export const mat = (c: Color, roughness = 0.85, metalness = 0): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: c, roughness, metalness });

// Clone a texture with its own repeat (a region tiles its pattern w×h across one quad). The clone
// shares the source image, so it's cheap. Used for both the colour map and the normal map.
export const withRepeat = (tex: Texture, x: number, y: number): Texture => {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(x, y);
  return t;
};

// --- lazy textures (browser only) --------------------------------------------------------------
// Loaded LAZILY and only in a browser. Deferral (guarded on `document`) keeps importing the block
// system under the node test runner — where sim/level tests mount blocks headlessly — from touching
// Three's DOM-based image loader. `undefined` = not tried, `null` = unavailable (headless).

// One lazy getter per texture, sharing the load/cache/repaint plumbing. `srgb` marks COLOUR maps
// (normal maps are linear data); `tiled` applies the per-cell repeat-wrapping setup. A failed load
// logs loudly — a 404'd texture otherwise renders silently black.
const lazyTexture = (path: string, opts: { srgb?: boolean; tiled?: boolean } = {}) => {
  let cached: Texture | null | undefined;
  return (): Texture | null => {
    if (cached !== undefined) return cached;
    if (typeof document === "undefined") return (cached = null);
    const tex = new TextureLoader().load(
      path,
      bumpTextureEpoch, // repaint on-demand surfaces once the image is in
      undefined,
      () => console.error(`[blocks] failed to load texture "${path}"`),
    );
    if (opts.srgb) tex.colorSpace = SRGBColorSpace;
    if (opts.tiled) {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.magFilter = NearestFilter;
      tex.repeat.set(1, 1);
    }
    return (cached = tex);
  };
};

export const getFloorTexture = lazyTexture("/textures/wood-floor-tile/wood-floor-tile.png", {
  srgb: true,
  tiled: true,
});

// Wood-grain surface relief for the floor (the `-normal.png`, not the deep/bumps variants). Normal
// maps are LINEAR data, so no sRGB. Tiled per-cell to match the colour map's repeat.
export const getFloorNormal = lazyTexture("/textures/wood-floor-tile/wood-floor-tile-normal.png", {
  tiled: true,
});

export const getWallpaper = lazyTexture("/textures/walls/wallpaper-red.png", { srgb: true });

// The full 192² wall atlas (RGBA, alpha = cut-outs). Used directly — not via a cropped quadrant —
// by blocks that address a sub-region through their own UVs and don't tile, e.g. the railing strip
// in the top-right quadrant's bottom third (`kinds/structural.ts` → Railing). ClampToEdge default.
export const getWallsAtlas = lazyTexture("/textures/walls/walls.png", { srgb: true });

// Lazy GLB loader for model-backed blocks (the geometry counterpart to lazyTexture). A texture can
// be back-filled into a live material once it decodes; a model's GEOMETRY cannot — the block has to
// RECEIVE the meshes when they arrive. So callers pass a `mount` callback: if the model's already
// loaded it fires at once with a fresh clone; otherwise it's queued and fired (per pending caller)
// when the load resolves, after which `textureEpoch` bumps so render-on-demand surfaces repaint.
// Browser-only (no fetch headlessly → the callback simply never fires, so the block stays empty).
export const lazyModel = (path: string) => {
  let template: Object3D | null = null;
  let started = false;
  const pending: ((m: Object3D) => void)[] = [];
  const start = () => {
    if (started || typeof window === "undefined") return;
    started = true;
    loadGLTF(path)
      .then((gltf) => {
        template = gltf.scene;
        pending.splice(0).forEach((cb) => cb(template!.clone(true)));
        bumpTextureEpoch(); // repaint render-on-demand surfaces now the geometry exists
      })
      .catch(() => console.error(`[blocks] failed to load model "${path}"`));
  };
  return (mount: (model: Object3D) => void) => {
    if (template) mount(template.clone(true));
    else {
      pending.push(mount);
      start();
    }
  };
};

// Surface relief for the wallpaper. `walls-normal.png` is a 2×2 atlas (four 96×96 wall normals); the
// red-wallpaper diffuse (`wallpaper-red.png`) is its BOTTOM-LEFT quadrant, pre-cropped to a standalone
// `wallpaper-red-normal.png` so it lines up 1:1 with the colour map and tiles cleanly. (If you change
// `getWallpaper`'s diffuse to a different quadrant, crop the matching normal to pair with it.) Linear
// data; `wallpaperMat` applies it per-piece with the SAME repeat/offset as the colour.
export const getWallNormal = lazyTexture("/textures/walls/wallpaper-red-normal.png");

// The dark paneled-wood wall finish — the TOP-LEFT quadrant of the `walls.png` atlas (+ its normal
// from `walls-normal.png`), pre-cropped like the wallpaper pair: RepeatWrapping can't tile a
// quadrant of an atlas, so each style ships as a standalone 96×96 image.
export const getWoodPanel = lazyTexture("/textures/walls/wood-panel.png", { srgb: true });
export const getWoodPanelNormal = lazyTexture("/textures/walls/wood-panel-normal.png");

// Wall finishes, selected by `params.wallStyle` (the inspector's Style enum / a parametric kind's
// `style` input). Each is a matched diffuse + normal pair at the same panel scale.
export const WALL_STYLE = "wallStyle";
const WALL_STYLES: Record<string, { map: () => Texture | null; normal: () => Texture | null }> = {
  wallpaper: { map: getWallpaper, normal: getWallNormal },
  wood: { map: getWoodPanel, normal: getWoodPanelNormal },
};

// --- wallpaper tiling --------------------------------------------------------------------------

export type WallpaperUv = { repeat: [number, number]; offset: [number, number] };

// Pure tiling math for a wallpaper panel. The panel fits the FULL wall height once (gold rail at the
// ceiling, wainscot at the floor) and tiles horizontally at square scale — one panel == `wallH`
// wide — offset by `left` so the pattern flows continuously across adjacent segments. A partial-
// height piece (a lintel/sill) samples just its vertical slice via `bottom`/`pieceH`. `wallH` is the
// scale unit. Pure (no Three), so the ratios are unit-tested.
export const wallpaperUv = (
  width: number,
  pieceH: number,
  left: number,
  bottom: number,
  wallH: number,
): WallpaperUv => ({
  repeat: [width / wallH, pieceH / wallH],
  offset: [left / wallH, bottom / wallH],
});

// A wallpapered surface for one piece of a wall: a box `width` wide whose left edge sits at world
// coordinate `left` along the run, occupying world heights [bottom, bottom + pieceH]. The finish
// comes from `params.wallStyle` (default wallpaper) and the pattern slides horizontally by
// `params.texOffset` (meters — the author's seam-alignment knob; it feeds `left`, so every piece
// of a wall shifts together). Falls back to a flat colour headlessly (no texture available).
export const wallpaperMat = (
  params: BlockParams,
  wallH: number,
  width: number,
  left: number,
  bottom = 0,
  pieceH = wallH,
): MeshStandardMaterial => {
  const style = WALL_STYLES[params[WALL_STYLE] as string] ?? WALL_STYLES.wallpaper;
  const base = style.map();
  if (!base) return mat(color(params, "color", 0xc9bca6), 0.9);
  const { repeat, offset } = wallpaperUv(
    width,
    pieceH,
    left + num(params, "texOffset", 0),
    bottom,
    wallH,
  );
  const tile = (t: Texture, srgb: boolean) => {
    t.needsUpdate = true;
    if (srgb) t.colorSpace = SRGBColorSpace; // colour is sRGB; the normal map stays linear
    t.wrapS = RepeatWrapping; // tile horizontally
    t.wrapT = ClampToEdgeWrapping; // fit once vertically
    t.repeat.set(repeat[0], repeat[1]);
    t.offset.set(offset[0], offset[1]);
    return t;
  };
  const material = new MeshStandardMaterial({ map: tile(base.clone(), true), roughness: 0.9 });
  const normal = style.normal();
  if (normal) material.normalMap = tile(normal.clone(), false); // surface relief, same tiling
  return material;
};

// The full material set for a wall piece's box: wallpapered long faces (±Z), black ±Y caps, and
// the thin END faces (±X) mapped at their TRUE width — a thin slice of pattern at height scale,
// continuing from the adjacent world position (the right end picks up at left + width, the left
// end leads in at left − depth), so the finish wraps around the end instead of the long face's
// whole repeat being crushed into a 0.2 m sliver. Also what a doorway's cut faces (the reveal)
// and a window jamb's inner face show.
//
// `backLeft` anchors the BACK (−Z) face separately: its u axis runs −x (the box's mirror), so
// for perimeter walls the two faces sit on DIFFERENT texture circuits (interior vs exterior —
// see parametric/kinds/perimeter-uv.ts) and need different starts. Defaulting it to `left`
// reproduces the old shared-material look (free walls, hand-placed walls).
export const wallBoxMats = (
  params: BlockParams,
  wallH: number,
  width: number,
  left: number,
  bottom = 0,
  pieceH = wallH,
  depth = num(params, "thickness", WALL_THICKNESS),
  backLeft = left,
): MeshStandardMaterial[] => [
  wallpaperMat(params, wallH, depth, left + width, bottom, pieceH), // +X — the right end
  wallpaperMat(params, wallH, depth, left - depth, bottom, pieceH), // -X — the left end
  blackCap,
  blackCap,
  wallpaperMat(params, wallH, width, left, bottom, pieceH), // +Z — front (u along +x)
  wallpaperMat(params, wallH, width, backLeft, bottom, pieceH), // −Z — back (u along −x)
];

// --- mesh primitives ---------------------------------------------------------------------------

// A near-black cap for the top/bottom faces of wall boxes — so the ceiling/floor edges read as a
// dark trim line instead of the wallpaper stretched across a thin cap face.
export const blackCap = new MeshStandardMaterial({ color: 0x080808, roughness: 1 });

// Build a box whose BOTTOM sits at local y=0 (so it rests on the floor), centered in X/Z.
export const standingBox = (
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial | MeshStandardMaterial[],
): Mesh => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.geometry.translate(0, h / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};
