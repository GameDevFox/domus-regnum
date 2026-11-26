import { CanvasTexture, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, SRGBColorSpace } from "three";

// Every surface is painted here, a few dozen pixels at a time, and stretched over the house with
// hard pixel edges: the hand-painted, low-resolution look of an early 3D tactics map. No image
// files; one tile of any of these covers a square metre.

const TILE = 32;

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number) => void;

/** A small repeatable random source, so the house looks the same every time it is built. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashName = (name: string): number => [...name].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const paint = (name: string, painter: Painter, size = TILE): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas to paint textures on");
  painter(ctx, seeded(hashName(name)));
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.name = name;
  return texture;
};

type Rgb = [number, number, number];

const hex = (c: string): Rgb => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const css = ([r, g, b]: Rgb): string => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
/** Lighter above 1, darker below. */
const shade = (c: Rgb, k: number): Rgb => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** How much one pixel may differ from its neighbour: the grain of hand-painting. */
const SPECKLE = 0.07;

const fill = (ctx: CanvasRenderingContext2D, rnd: () => number, base: Rgb, x = 0, y = 0, w = TILE, h = TILE, grain = SPECKLE): void => {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      ctx.fillStyle = css(shade(base, 1 + (rnd() - 0.5) * 2 * grain));
      ctx.fillRect(px, py, 1, 1);
    }
  }
};

const line = (ctx: CanvasRenderingContext2D, c: Rgb, x: number, y: number, w: number, h: number): void => {
  ctx.fillStyle = css(c);
  ctx.fillRect(x, y, w, h);
};

/** Rows of blocks with staggered joints: bricks, flagstones, tiles. */
const courses = (base: Rgb, mortar: Rgb, blockW: number, blockH: number, vary: number): Painter => (ctx, rnd) => {
  line(ctx, mortar, 0, 0, TILE, TILE);
  for (let row = 0; row * blockH < TILE; row++) {
    const offset = row % 2 === 0 ? 0 : blockW / 2;
    for (let x = -blockW; x < TILE; x += blockW) {
      const tone = shade(base, 1 + (rnd() - 0.5) * vary);
      fill(ctx, rnd, tone, Math.round(x + offset) + 1, row * blockH + 1, blockW - 1, blockH - 1, 0.04);
    }
  }
};

const planks = (base: Rgb, plankH: number): Painter => (ctx, rnd) => {
  for (let y = 0; y < TILE; y += plankH) {
    const tone = shade(base, 0.9 + rnd() * 0.2);
    fill(ctx, rnd, tone, 0, y, TILE, plankH, 0.05);
    line(ctx, shade(base, 0.62), 0, y, TILE, 1);
    line(ctx, shade(base, 0.62), Math.floor(rnd() * TILE), y, 1, plankH);
  }
};

const FLOORS: Record<string, Painter> = {
  chequer: (ctx, rnd) => {
    const half = TILE / 2;
    for (const [x, y, c] of [[0, 0, "#e9dfc8"], [half, 0, "#3b3a40"], [0, half, "#3b3a40"], [half, half, "#e9dfc8"]] as [number, number, string][]) fill(ctx, rnd, hex(c), x, y, half, half, 0.04);
  },
  flag: courses(hex("#9a9588"), hex("#6f6a60"), 16, 11, 0.22),
  quarry: courses(hex("#a8553a"), hex("#6d3a2a"), 8, 8, 0.16),
  board: planks(hex("#8a6238"), 8),
  parquet: (ctx, rnd) => {
    const block = 8;
    for (let by = 0; by < TILE; by += block) {
      for (let bx = 0; bx < TILE; bx += block) {
        const across = (bx / block + by / block) % 2 === 0;
        fill(ctx, rnd, shade(hex("#a9783f"), across ? 1.06 : 0.9), bx, by, block, block, 0.05);
        for (let k = 2; k < block; k += 3) line(ctx, shade(hex("#a9783f"), 0.72), across ? bx : bx + k, across ? by + k : by, across ? block : 1, across ? 1 : block);
      }
    }
  },
  cobble: (ctx, rnd) => {
    line(ctx, hex("#3d3b3c"), 0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y += 6) for (let x = (y / 6) % 2 === 0 ? 0 : -3; x < TILE; x += 6) fill(ctx, rnd, shade(hex("#6f6c6a"), 0.8 + rnd() * 0.4), x + 1, y + 1, 5, 5, 0.06);
  },
  grass: (ctx, rnd) => {
    fill(ctx, rnd, hex("#5f8a3c"), 0, 0, TILE, TILE, 0.1);
    for (let i = 0; i < 26; i++) line(ctx, shade(hex("#5f8a3c"), rnd() < 0.5 ? 1.25 : 0.78), Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 1, 2);
  },
  gravel: (ctx, rnd) => fill(ctx, rnd, hex("#b7a98a"), 0, 0, TILE, TILE, 0.16),
  earth: (ctx, rnd) => {
    for (let y = 0; y < TILE; y += 4) fill(ctx, rnd, shade(hex("#6a4a34"), 1.15 - (y / TILE) * 0.45), 0, y, TILE, 4, 0.09);
  },
};

/** Wallpapers: a ground colour, a figure colour, and the kind of pattern. */
const PAPERS: Record<string, { ground: string; figure: string; pattern: "plain" | "stripe" | "sprig" | "tile" | "block" | "panel" }> = {
  panel: { ground: "#d9c9a6", figure: "#b9a67e", pattern: "panel" },
  cream: { ground: "#e3d8bf", figure: "#d3c6a8", pattern: "plain" },
  tile: { ground: "#e6e9e2", figure: "#aab4ad", pattern: "tile" },
  sage: { ground: "#9fb08a", figure: "#869a72", pattern: "stripe" },
  crimson: { ground: "#8e3a3c", figure: "#b45a52", pattern: "sprig" },
  rose: { ground: "#d9a6a0", figure: "#c58a86", pattern: "stripe" },
  ink: { ground: "#34495a", figure: "#b89a55", pattern: "sprig" },
  plum: { ground: "#6d4a66", figure: "#8a6583", pattern: "stripe" },
  stone: { ground: "#7b7872", figure: "#56534f", pattern: "block" },
};

/** The patterns that are courses of stone or tiles: such a wall is the one pattern from the floor up, darker below the rail, and is not begun again at it. */
const LAID_FROM_THE_FLOOR = ["block", "tile"];
/** Whether a wallpaper's pattern runs up from the floor through the rail; any other begins at the rail, over panelling. */
export const runsThroughRail = (name: string): boolean => LAID_FROM_THE_FLOOR.includes(PAPERS[name]?.pattern);

const paper = (name: string, dado: boolean): Painter => (ctx, rnd) => {
  const { ground, figure, pattern } = PAPERS[name];
  // Below the rail a wall is darker and plainer; that band is what is left when a wall is cut low.
  const g = shade(hex(ground), dado ? 0.72 : 1);
  const f = shade(hex(figure), dado ? 0.72 : 1);
  if (pattern === "block") return courses(g, f, 16, 8, 0.2)(ctx, rnd);
  if (pattern === "tile") {
    line(ctx, f, 0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y += 8) for (let x = 0; x < TILE; x += 8) fill(ctx, rnd, g, x + 1, y + 1, 7, 7, 0.025);
    return;
  }
  fill(ctx, rnd, g, 0, 0, TILE, TILE, 0.035);
  if (dado || pattern === "panel") {
    // Panelling: a frame of moulding every half metre.
    for (let x = 0; x < TILE; x += 16) {
      line(ctx, shade(g, 0.8), x + 2, 4, 12, 1);
      line(ctx, shade(g, 0.8), x + 2, TILE - 5, 12, 1);
      line(ctx, shade(g, 0.8), x + 2, 4, 1, TILE - 8);
      line(ctx, shade(g, 1.12), x + 13, 4, 1, TILE - 8);
    }
    return;
  }
  if (pattern === "stripe") for (let x = 2; x < TILE; x += 8) line(ctx, f, x, 0, 3, TILE);
  if (pattern === "sprig") {
    for (let y = 0; y < TILE; y += 8) {
      for (let x = (y / 8) % 2 === 0 ? 2 : 6; x < TILE; x += 8) {
        line(ctx, f, x, y + 2, 1, 3);
        line(ctx, f, x - 1, y + 3, 3, 1);
      }
    }
  }
};

const OTHER: Record<string, Painter> = {
  brick: courses(hex("#9c5a45"), hex("#cdbfa6"), 8, 4, 0.24),
  slate: (ctx, rnd) => {
    for (let y = 0; y < TILE; y += 8) {
      for (let x = (y / 8) % 2 === 0 ? 0 : -4; x < TILE; x += 8) fill(ctx, rnd, shade(hex("#4f5b6b"), 0.85 + rnd() * 0.3), x, y, 8, 8, 0.04);
      line(ctx, hex("#333c48"), 0, y, TILE, 1);
    }
  },
  wood: planks(hex("#5e3d25"), 16),
  oak: planks(hex("#9a6f42"), 16),
  hedge: (ctx, rnd) => {
    fill(ctx, rnd, hex("#3f6b34"), 0, 0, TILE, TILE, 0.16);
    for (let i = 0; i < 40; i++) line(ctx, shade(hex("#3f6b34"), 1.3), Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 2, 1);
  },
  plaster: (ctx, rnd) => fill(ctx, rnd, hex("#e4dccb"), 0, 0, TILE, TILE, 0.03),
};

const cache = new Map<string, CanvasTexture>();

const cached = (key: string, painter: Painter | undefined): CanvasTexture => {
  const have = cache.get(key);
  if (have) return have;
  if (!painter) throw new Error(`No such texture: ${key}`);
  const made = paint(key, painter);
  cache.set(key, made);
  return made;
};

export const floorTexture = (name: string): CanvasTexture => cached(`floor:${name}`, FLOORS[name]);
export const paperTexture = (name: string, dado = false): CanvasTexture => cached(`paper:${name}:${dado ? "dado" : "field"}`, PAPERS[name] ? paper(name, dado) : undefined);
export const texture = (name: string): CanvasTexture => cached(`other:${name}`, OTHER[name]);

/** One glyph (an emoji) drawn large, for the thing someone is carrying. */
export const glyphTexture = (glyph: string): CanvasTexture => {
  const key = `glyph:${glyph}`;
  const have = cache.get(key);
  if (have) return have;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas to draw glyphs on");
  ctx.font = `${size * 0.72}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, size / 2, size / 2 + 3);
  const made = new CanvasTexture(canvas);
  made.colorSpace = SRGBColorSpace;
  cache.set(key, made);
  return made;
};
