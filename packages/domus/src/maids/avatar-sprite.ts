import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";

import { yawBillboard } from "@kitsune/common-web";

import { type Pixels, type RGB, tintUniform } from "./recolor";

// Billboard maid sprites for the in-game agents: the cleaned maid art tinted per agent color (via the
// same mask×multiply as the Color Demo tab) into a CanvasTexture, on a floor-anchored Sprite. The
// source art loads once and each color is tinted + cached, so repeat colors share one GPU texture.

const SPRITE_W = 320; // working/texture width — the art is downscaled to this; billboards render small
const DEFAULT_HEIGHT = 1.1; // world units, feet-on-floor (a touch taller than the 0.72 cone avatar)

let sourceP: Promise<Pixels> | null = null;
const loadSource = (): Promise<Pixels> =>
  (sourceP ??= new Promise<Pixels>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const h = Math.round((img.height / img.width) * SPRITE_W);
      const canvas = document.createElement("canvas");
      canvas.width = SPRITE_W;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.drawImage(img, 0, 0, SPRITE_W, h);
      resolve(ctx.getImageData(0, 0, SPRITE_W, h));
    };
    img.onerror = () => reject(new Error("failed to load maid.png"));
    img.src = "/textures/maid.png";
  }));

const hexToRgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const texCache = new Map<number, CanvasTexture>();
const tintedTexture = (src: Pixels, hex: number): CanvasTexture => {
  const hit = texCache.get(hex);
  if (hit) return hit;
  const tinted = tintUniform(src, hexToRgb(hex));
  const canvas = document.createElement("canvas");
  canvas.width = tinted.width;
  canvas.height = tinted.height;
  canvas
    .getContext("2d")
    ?.putImageData(new ImageData(tinted.data, tinted.width, tinted.height), 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter; // NPOT-safe, crisp at billboard size
  tex.generateMipmaps = false;
  texCache.set(hex, tex);
  return tex;
};

const fit = (mesh: Mesh, tex: CanvasTexture, height: number) => {
  const img = tex.image as { width: number; height: number };
  mesh.scale.set(height * (img.width / img.height), height, 1);
};

// One shared unit quad, feet at the origin (translate before scale) so the group sits on the floor.
const billboardGeometry = new PlaneGeometry(1, 1);
billboardGeometry.translate(0, 0.5, 0);

// A floor-anchored CYLINDRICAL billboard of the maid, tinted to `hex`: `yawBillboard` faces it to
// the camera each frame but keeps it upright (a fully camera-facing THREE.Sprite tilts backward
// under the high game camera and clips through walls and furniture). The texture is filled in once
// the art loads (the quad is zero-sized until then — agents start mid-screen and the toggle defaults
// to 2D, so this resolves well before it matters in practice).
export const maidSprite = (hex: number, height = DEFAULT_HEIGHT): Mesh => {
  const material = new MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const sprite = yawBillboard(new Mesh(billboardGeometry, material));
  sprite.scale.set(0, 0, 1); // zero-sized until the texture loads, so no white quad flashes
  // Guarded so the sims stay headless-safe (the deterministic vitest harness mounts them with no DOM).
  if (typeof document !== "undefined" && typeof Image !== "undefined") {
    void loadSource()
      .then((src) => {
        const tex = tintedTexture(src, hex);
        material.map = tex;
        material.needsUpdate = true;
        fit(sprite, tex, height);
      })
      .catch((err: unknown) => {
        // Missing asset: leave the sprite invisible rather than throw — but say so, or the
        // symptom is just "the maid isn't there" with nothing in the console.
        console.error("[maids] failed to load the maid sprite art", err);
      });
  }
  return sprite;
};
