import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from "three";

// A Blender-style "infinite" grid: no line geometry at all — one big plane whose fragment
// shader paints the lines procedurally from WORLD coordinates (`fract` of x/z over the tile
// size, anti-aliased to ~1px via screen-space derivatives) and fades them out by distance from
// the camera. The fade ends long before the plane's real edge, so no boundary is ever visible;
// the plane is just a canvas, the world-space math is the grid. Cost: 2 triangles, 1 draw call,
// no per-frame JS (three's built-in `cameraPosition` uniform drives the fade).
//
// Lines sit at WORLD-METER tile multiples (x = c·tile), so a line crosses the ORIGIN and round-
// meter coordinates land on the grid: a parametric point/rect in world meters — e.g. a railing
// endpoint bound to a point at (0,0) — sits exactly on the origin crossing. A brighter "major" line
// every `majorEvery` cells. (Earlier the grid was offset half a tile to trace cell BOUNDARIES, from
// the grid-unit era; the parametric editor works in world meters, so the origin-crossing phase is
// the one that matches authored geometry. Hand-tool cells, centered at c·tile, now center ON
// crossings rather than in squares.)

export type InfiniteGridOptions = {
  tile: number; // world units between minor lines (the cell size)
  majorEvery?: number; // cells per brighter major line
  size?: number; // plane extent in world units — only needs to outrun fadeEnd + panning
  fadeStart?: number; // distance from the camera (xz) where lines start fading
  fadeEnd?: number; // fully transparent past this
  color?: number; // minor line color
  majorColor?: number; // major line color
};

export const infiniteGrid = ({
  tile,
  majorEvery = 10, // Blender's convention: a thick line every 10
  size = 2000,
  fadeStart = 30,
  fadeEnd = 80,
  color = 0x2c3440,
  majorColor = 0x4a5870,
}: InfiniteGridOptions): Mesh => {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false, // overlay — never occludes the level's real geometry
    side: DoubleSide, // visible from below too (free camera can dip under the plane)
    uniforms: {
      uTile: { value: tile },
      uMajorEvery: { value: majorEvery },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
      uColor: {
        value: [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255],
      },
      uMajorColor: {
        value: [
          ((majorColor >> 16) & 255) / 255,
          ((majorColor >> 8) & 255) / 255,
          (majorColor & 255) / 255,
        ],
      },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTile;
      uniform float uMajorEvery;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform vec3 uColor;
      uniform vec3 uMajorColor;
      varying vec3 vWorld;

      // 1.0 on a line (at integer coords), 0.0 off it — one pixel wide at any zoom: distance
      // to the nearest integer, converted to pixels by the screen-space derivative.
      float gridLine(vec2 coord) {
        vec2 px = abs(fract(coord + 0.5) - 0.5) / fwidth(coord);
        return 1.0 - min(min(px.x, px.y), 1.0);
      }

      void main() {
        // Integer coords land on world-meter tile multiples (c * tile) → a line crosses the origin.
        vec2 coord = vWorld.xz / uTile;
        float minor = gridLine(coord);
        float major = gridLine(coord / uMajorEvery);
        float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(vWorld.xz, cameraPosition.xz));
        float alpha = max(minor * 0.55, major) * fade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(mix(uColor, uMajorColor, major), alpha);
      }
    `,
  });

  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
};
