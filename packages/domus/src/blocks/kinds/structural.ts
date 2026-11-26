import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector2,
} from "three";

import { Dir } from "../grid";

import {
  blackCap,
  color,
  getFloorNormal,
  getFloorTexture,
  getWallsAtlas,
  mat,
  num,
  standingBox,
  wallBoxMats,
  wallpaperMat,
  withRepeat,
} from "../block-materials";
import { BlockParams } from "../types";
import { STOREY_RISE, WALL_HEIGHT, WALL_THICKNESS } from "../dims";

// Structural, grid-anchored block kinds: floors, walls, doorways, windows, corner posts, columns.
// Each is a factory (scope, params) -> { mesh } built in LOCAL space with its footprint on local
// y=0 (the interpreter positions/rotates it). `params.tile`/`span` are injected by the interpreter
// so a block knows how wide its cell/run is. Surface helpers live in block-materials.ts.

// A floor tile filling one cell. Thin slab with its TOP flush at y=0.
export const Floor = (_scope: unknown, params: BlockParams) => {
  const tile = num(params, "tile", 1);
  // Region extent in cells (injected by the interpreter from a placement's `size`; default 1×1). A
  // w×h floor is ONE merged box spanning the rectangle, not w*h separate tiles.
  const w = num(params, "sizeW", 1);
  const h = num(params, "sizeH", 1);
  const thickness = num(params, "thickness", 0.08);
  const material = mat(color(params, "color", 0x9a7752));
  const region = w !== 1 || h !== 1;
  // Wood grain + its surface relief (normal map), each tiled once per cell across the (possibly
  // merged) quad. A region clones the shared textures so its repeat is independent; a single cell
  // reuses them directly. Color still tints the map. Both are browser-only (null headlessly).
  const tex = getFloorTexture();
  if (tex) material.map = region ? withRepeat(tex, w, h) : tex;
  const normal = getFloorNormal();
  if (normal) material.normalMap = region ? withRepeat(normal, w, h) : normal;
  const mesh = new Mesh(new BoxGeometry(w * tile, thickness, h * tile), material);
  mesh.geometry.translate(0, -thickness / 2, 0);
  mesh.receiveShadow = true;
  return { mesh };
};

// A ramp: a thin sloped surface (v0 — sides/rails are layered later via other components). Built
// like a region Floor slab, then SHEARED so it climbs `rise` metres along the run toward `dir`
// (N=-Z, S=+Z, E=+X, W=-X). The low edge sits at the placement's elevation, the high edge `rise`
// above it; a shear (not a rotate) keeps the X/Z footprint EXACT so every cell-centre lands on the
// surface — matching the per-step navmesh elevation level-nav.ts paints, so agents don't sink.
export const Ramp = (_scope: unknown, params: BlockParams) => {
  const tile = num(params, "tile", 1);
  const w = num(params, "sizeW", 1); // region extent in cells (injected like Floor)
  const h = num(params, "sizeH", 1);
  const rise = num(params, "rise", STOREY_RISE);
  const dir = (typeof params.dir === "string" ? params.dir : "N") as Dir;
  const thickness = num(params, "thickness", 0.08);
  const widthM = w * tile;
  const depthM = h * tile;

  const material = mat(color(params, "color", 0x8a7860));
  const tex = getFloorTexture();
  if (tex) material.map = withRepeat(tex, w, h);
  const normal = getFloorNormal();
  if (normal) material.normalMap = withRepeat(normal, w, h);

  const geom = new BoxGeometry(widthM, thickness, depthM);
  geom.translate(0, -thickness / 2, 0); // flat top flush at local y=0, like Floor

  // Shear y by the run coordinate: y' = y + kX·x + kZ·z. Slope = rise / run-length; the uphill sign
  // follows `dir`. After shearing about the centre the surface spans ±rise/2; lift +rise/2 so the
  // low edge sits at local y=0 (world = placement elevation) and the high edge at +rise.
  const alongZ = dir === "N" || dir === "S";
  const slope = rise / (alongZ ? depthM : widthM);
  const kZ = dir === "N" ? -slope : dir === "S" ? slope : 0;
  const kX = dir === "E" ? slope : dir === "W" ? -slope : 0;
  // prettier-ignore
  geom.applyMatrix4(new Matrix4().set(
    1,  0, 0,  0,
    kX, 1, kZ, 0,
    0,  0, 1,  0,
    0,  0, 0,  1,
  ));
  geom.translate(0, rise / 2, 0);

  const mesh = new Mesh(geom, material);
  mesh.receiveShadow = true;
  return { mesh };
};

// The world length of an edge block spanning `span` cells (default 1). Authored long along X; the
// interpreter rotates it for E/W edges.
const edgeLen = (params: BlockParams) => num(params, "span", 1) * num(params, "tile", 1);

// The visual width a "0.9 m door" reads as. A single-cell (span-1) doorway is NAV-centred on one node
// but, to still look like a real door, its opening is widened to this by pulling its two flanking
// wall segments back. A wall flagged `doorStart`/`doorEnd` (its −run / +run end faces a wide door)
// trims that end by (DOOR_OPENING − cell)/2; the door's lintel then spans the whole opening.
const DOOR_OPENING = 0.9;

// A solid wall segment spanning `span` cell edges (default 1). Bottom rests on the floor. ~3 m tall =
// a realistic gentry ceiling. Either end can be pulled back: `doorStart`/`doorEnd` trim beside a
// wide door (DOOR_OPENING), and numeric `trimStart`/`trimEnd` (meters) shorten the mesh toward a
// corner post so runs cap cleanly instead of clipping through it. The wallpaper offset shifts with
// the trim so the pattern stays aligned across segments either way. `runStartBack` (optional)
// anchors the BACK face on its own texture circuit (perimeter continuity — its u-start is the
// box's RIGHT end, so the trim on that side is trimEnd).
export const Wall = (_scope: unknown, params: BlockParams) => {
  const height = num(params, "height", WALL_HEIGHT);
  const thickness = num(params, "thickness", WALL_THICKNESS);
  const tile = num(params, "tile", 1);
  const fullLen = edgeLen(params);
  const doorTrim = Math.max((DOOR_OPENING - tile) / 2, 0); // pull-back beside a wide door
  const trimS = (params.doorStart ? doorTrim : 0) + num(params, "trimStart", 0);
  const trimE = (params.doorEnd ? doorTrim : 0) + num(params, "trimEnd", 0);
  const len = Math.max(fullLen - trimS - trimE, 0.01);
  const runStart = num(params, "runStart", 0);
  const left = runStart + trimS; // world-left of the shortened segment
  const backLeft = num(params, "runStartBack", runStart) + trimE;
  const mesh = standingBox(
    len,
    height,
    thickness,
    wallBoxMats(params, height, len, left, 0, height, thickness, backLeft),
  );
  mesh.geometry.translate((trimS - trimE) / 2, 0, 0); // recenter the shortened segment along the run
  return { mesh };
};

// A wall with a passable doorway: full-height jambs either side of a ~2.1 m opening, a solid lintel
// above. Fills the wall height so there's no gap over the door. Spans `span` cells. A `wide` span-1
// door opens to DOOR_OPENING — wider than its own cell — relying on the flanking walls being trimmed
// back (so the jambs vanish and the opening's sides are the neighbours' cut faces = the door reveal).
export const Doorway = (_scope: unknown, params: BlockParams) => {
  const len = edgeLen(params);
  const height = num(params, "height", WALL_HEIGHT);
  const thickness = num(params, "thickness", WALL_THICKNESS);
  const fitOpening = Math.min(DOOR_OPENING, len - 0.1); // an opening that fits within the span
  const openW = num(params, "opening", params.wide ? DOOR_OPENING : fitOpening);
  const openH = num(params, "openingHeight", 2.1);
  const runStart = num(params, "runStart", 0); // world-left of the block along the run
  // Back-face circuit anchor (see Wall): each piece's back u-start mirrors from the block's
  // right end, so the back faces tile continuously too (and line up with the wall's exterior
  // circuit when the parametric `door` kind supplies runStartBack).
  const runStartBack = num(params, "runStartBack", runStart);
  const backLeft = (pieceEnd: number) => runStartBack + (len - pieceEnd);

  const group = new Group();
  const jambW = (len - openW) / 2;
  if (jambW > 0.001) {
    // Wallpaper offsets use each jamb's world-left so the pattern lines up with the walls beside it.
    const left = standingBox(
      jambW,
      height,
      thickness,
      wallBoxMats(params, height, jambW, runStart, 0, height, thickness, backLeft(jambW)),
    );
    left.position.x = -(openW + jambW) / 2;
    const right = standingBox(
      jambW,
      height,
      thickness,
      wallBoxMats(
        params,
        height,
        jambW,
        runStart + jambW + openW,
        0,
        height,
        thickness,
        backLeft(len),
      ),
    );
    right.position.x = (openW + jambW) / 2;
    group.add(left, right);
  }
  // Lintel from the top of the opening up to the ceiling line (samples the top slice of the panel).
  const lintelH = height - openH;
  if (lintelH > 0.001) {
    const lintel = standingBox(
      openW,
      lintelH,
      thickness,
      wallBoxMats(
        params,
        height,
        openW,
        runStart + jambW,
        openH,
        lintelH,
        thickness,
        backLeft(jambW + openW),
      ),
    );
    lintel.position.y = openH;
    group.add(lintel);
  }

  // Swing leaf: a thin panel hinged at one jamb, pivoting about its vertical edge; closed lies in the
  // wall plane (pivot.rotation.y = 0). A realistic ONE-WAY door — `hingeRight` picks the jamb, `swingOut`
  // the direction; together they fix a constant open sign (`doorOpenSign`), so the door always swings
  // the same way regardless of which side a maid approaches (no flip mid-crossing). The door-swing
  // controller (domus-app/sims/doors.ts) rotates `pivot` toward `doorOpenSign · OPEN_ANGLE` when a maid's
  // path crosses, exposed via userData like Candelabra's flames. PoC: visual only (opening stays nav-passable).
  const hingeRight = params.hingeRight === true;
  const swingOut = params.swingOut === true;
  const leafW = openW - 0.02;
  const leafH = openH - 0.04;
  const leafDir = hingeRight ? -1 : 1; // leaf extends from its hinge toward the opposite jamb
  const leafGeo = new BoxGeometry(leafW, leafH, thickness); // as deep as the wall — fills the opening
  leafGeo.translate((leafDir * leafW) / 2, leafH / 2, 0); // hinge edge at x=0, centered on z=0 (wall mid)
  const leaf = new Mesh(leafGeo, new MeshStandardMaterial({ color: color(params, "leafColor", 0x6b4f3a) }));
  leaf.castShadow = true;
  const pivot = new Group();
  pivot.position.set((hingeRight ? 1 : -1) * (openW / 2), 0, 0); // chosen jamb's inner edge, on z=0
  pivot.add(leaf);
  group.add(pivot);
  group.userData.doorLeaf = pivot;
  group.userData.openW = openW;
  // +rotation.y swings a +X leaf toward −Z (right-hand rule); combine hinge + swing to the fixed side.
  group.userData.doorOpenSign = (hingeRight ? 1 : -1) * (swingOut ? 1 : -1);

  return { mesh: group };
};

// A wall with a glazed window opening: sill below, lintel above, jambs at the sides, and a
// translucent pane in the gap. Same edge orientation rules as Wall.
export const Window = (_scope: unknown, params: BlockParams) => {
  const len = edgeLen(params);
  const height = num(params, "height", WALL_HEIGHT);
  const thickness = num(params, "thickness", WALL_THICKNESS);
  const openW = Math.min(num(params, "opening", 0.7) * len, len - 0.1);
  const sillH = num(params, "sill", 0.9); // wall below the glazing
  const headH = num(params, "head", 2.4); // glazing head; wall fills head -> ceiling
  const runStart = num(params, "runStart", 0);
  const runStartBack = num(params, "runStartBack", runStart); // back-face circuit (see Doorway)
  const backLeft = (pieceEnd: number) => runStartBack + (len - pieceEnd);
  const jambW = (len - openW) / 2;
  const openLeft = runStart + jambW; // world-left of the glazed strip

  const group = new Group();
  // Sill wall (below the opening) and head wall (above, up to the ceiling) — each samples its slice.
  group.add(
    standingBox(
      openW,
      sillH,
      thickness,
      wallBoxMats(params, height, openW, openLeft, 0, sillH, thickness, backLeft(jambW + openW)),
    ),
  );
  const headWallH = height - headH;
  if (headWallH > 0.001) {
    const lintel = standingBox(
      openW,
      headWallH,
      thickness,
      wallBoxMats(
        params,
        height,
        openW,
        openLeft,
        headH,
        headWallH,
        thickness,
        backLeft(jambW + openW),
      ),
    );
    lintel.position.y = headH;
    group.add(lintel);
  }
  // Jambs to either side, full height.
  if (jambW > 0.001) {
    const left = standingBox(
      jambW,
      height,
      thickness,
      wallBoxMats(params, height, jambW, runStart, 0, height, thickness, backLeft(jambW)),
    );
    left.position.x = -(openW + jambW) / 2;
    const right = standingBox(
      jambW,
      height,
      thickness,
      wallBoxMats(
        params,
        height,
        jambW,
        runStart + jambW + openW,
        0,
        height,
        thickness,
        backLeft(len),
      ),
    );
    right.position.x = (openW + jambW) / 2;
    group.add(left, right);
  }
  // Glass pane.
  const paneH = headH - sillH;
  const pane = new Mesh(
    new BoxGeometry(openW, paneH, 0.02),
    new MeshStandardMaterial({
      color: 0x9fd3e0,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
    }),
  );
  pane.geometry.translate(0, paneH / 2, 0);
  pane.position.y = sillH;
  group.add(pane);
  return { mesh: group };
};

// A corner post that fills the junction where a horizontal and a vertical wall meet — a bare grid
// corner leaves an unfilled outer wedge and shows the walls' stretched end-caps. A square post,
// wallpapered like the walls (black top/bottom cap to match), placed by `addWallCorners` (flat
// levels) and the parametric `walls` kind (one per rect vertex). Sized a touch proud of the wall
// thickness so it cleanly caps the wall ends instead of z-fighting their coplanar faces — reads
// as a tidy corner pilaster.
export const cornerPostSize = (thickness: number): number => thickness + 0.02;

export const Corner = (_scope: unknown, params: BlockParams) => {
  const height = num(params, "height", WALL_HEIGHT);
  const size = cornerPostSize(num(params, "thickness", WALL_THICKNESS));
  // Perimeter continuity: the parametric `walls` kind hands each face its own texture-circuit
  // start (`uPosX`/`uNegX`/`uPosZ`/`uNegZ` — the slice centered on the vertex, see
  // parametric/kinds/perimeter-uv.ts), so the pattern turns the corner through the post.
  // Without them (hand-placed corners via addWallCorners) fall back to the shared runStart.
  if (
    params.uPosX !== undefined ||
    params.uNegX !== undefined ||
    params.uPosZ !== undefined ||
    params.uNegZ !== undefined
  ) {
    const face = (key: string) =>
      wallpaperMat(params, height, size, num(params, key, num(params, "runStart", 0)));
    const mesh = standingBox(size, height, size, [
      face("uPosX"),
      face("uNegX"),
      blackCap,
      blackCap,
      face("uPosZ"),
      face("uNegZ"),
    ]);
    return { mesh };
  }
  return {
    // depth = size: the post is square, so its ±X faces are the same width as its ±Z faces.
    mesh: standingBox(
      size,
      height,
      size,
      wallBoxMats(params, height, size, num(params, "runStart", 0), 0, height, size),
    ),
  };
};

// A guard railing / balustrade on a cell edge — a waist-high (1.07 m guard, per the scale doc §8)
// barrier with see-through gaps, given real DEPTH (~0.10 m footprint). Rather than model balusters,
// it's the railing ART from the wall atlas extruded: the front & back faces are the textured frame
// and the EXTRUDED side walls are the gap reveals + perimeter edges — the "inner borders" you see
// through the openings at an angle. An edge block like Wall (the navmesh blocks passage — not a door).
//
// Texture: `walls.png` (192² atlas), bottom strip of the top-right quadrant — atlas px x[96,192],
// y[64,96] (a 96×32, 3:1 strip). The 3 transparent gaps, measured from the alpha channel in
// strip-local px (y from the strip's top): the LAST transparent pixel is x{28,60,89}, y22, but a
// pixel at index N spans the continuous range [N, N+1), so the holes' right & bottom EDGES sit at
// {29,61,90} and 23 (half-open). The left/top edges (x{6,35,67}, y9) are already on the pixel's
// leading edge. Cutting the holes at these exact edges lines the geometry up 1:1 with the art.
const RAIL_STRIP = { u0: 96 / 192, u1: 1, vTop: 1 - 64 / 192, vBot: 1 - 96 / 192, wpx: 96, hpx: 32 };
const RAIL_GAPS = [
  [6, 29],
  [35, 61],
  [67, 90],
].map(([x0, x1]) => ({ x0, x1, yTop: 9, yBot: 23 }));

export const Railing = (_scope: unknown, params: BlockParams) => {
  const height = num(params, "height", 1);
  const depth = num(params, "thickness", 0.1);
  const len = edgeLen(params);
  const S = RAIL_STRIP;
  // The strip is aspect:1 (96:32 = 3:1). Keeping texels square, one strip spans `height·aspect` m of
  // run — the railing's natural PANEL (≈3 m at height 1). Like a wall's wallpaper the pattern TILES at
  // that pitch and never stretches; a run that isn't a whole number of panels CLIPS its tail — the
  // texture to a partial slice AND the hole geometry to match (gaps past the cut are dropped; a gap
  // straddling the cut is trimmed to the run end). So unlike the always-solid wall, the railing must
  // cull its extra geometry per panel. One ExtrudeGeometry mesh per panel (caps + reveal side walls).
  const aspect = S.wpx / S.hpx;
  const panelLen = height * aspect;
  const gy = (py: number) => height - (py / S.hpx) * height; // strip-y px (0 = top) → local y (up)

  const atlas = getWallsAtlas();
  const capMat = atlas
    ? new MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.7 })
    : mat(color(params, "color", 0x5a4632), 0.6); // headless / pre-load fallback
  const sideMat = mat(color(params, "innerColor", 0x4a1f16), 0.8); // gap reveals + perimeter + cut ends
  const group = new Group();

  // One panel (or the clipped tail) spanning run-x [runStart, runEnd] (run is centered on the block).
  // Gaps tile per panelLen; the texture u runs from the strip start and clips wherever the run ends.
  const addPanel = (runStart: number, runEnd: number) => {
    const cover = runEnd - runStart;
    if (cover < 1e-4) return;
    const left = runStart - len / 2;
    const right = runEnd - len / 2;

    const shape = new Shape();
    shape.moveTo(left, 0);
    shape.lineTo(right, 0);
    shape.lineTo(right, height);
    shape.lineTo(left, height);
    shape.closePath();
    for (const g of RAIL_GAPS) {
      const c0 = (g.x0 / S.wpx) * panelLen; // gap span within the panel, meters
      let c1 = (g.x1 / S.wpx) * panelLen;
      if (c1 > cover) c1 = cover - 1e-3; // straddles the cut → trim, kept off the boundary (earcut-safe;
      if (c1 - c0 < 1e-4) continue; // ...alphaTest hides the hair-thin sliver). Past the cut → culled.
      const y0 = gy(g.yBot); // lower edge (larger py)
      const y1 = gy(g.yTop); // upper edge (smaller py)
      const hole = new Path();
      hole.moveTo(left + c0, y0);
      hole.lineTo(left + c1, y0);
      hole.lineTo(left + c1, y1);
      hole.lineTo(left + c0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }

    // Caps (front + back) sample the strip, tiling per panel (u from the strip start) and clipping at
    // the cut; side walls (the reveals + cut ends) take the flat dark material.
    const uvGen = {
      generateTopUV: (_g: unknown, verts: number[], a: number, b: number, c: number): Vector2[] => {
        const at = (i: number) => {
          const x = verts[i * 3];
          const y = verts[i * 3 + 1];
          const u = S.u0 + ((x - left) / panelLen) * (S.u1 - S.u0); // tile + clip, never stretch
          const v = S.vTop - ((height - y) / height) * (S.vTop - S.vBot);
          return new Vector2(u, v);
        };
        return [at(a), at(b), at(c)];
      },
      generateSideWallUV: (): Vector2[] => [
        new Vector2(0, 0),
        new Vector2(1, 0),
        new Vector2(1, 1),
        new Vector2(0, 1),
      ],
    };

    const geom = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, UVGenerator: uvGen });
    geom.translate(0, 0, -depth / 2); // center the thickness across the cell edge (like a wall box)
    const mesh = new Mesh(geom, [capMat, sideMat]);
    mesh.castShadow = true;
    group.add(mesh);
  };

  for (let runStart = 0; runStart < len - 1e-4; runStart += panelLen)
    addPanel(runStart, Math.min(runStart + panelLen, len));

  return { mesh: group };
};

// A staircase: a flight of steps climbing from the floor to the next storey. Built climbing toward
// +Z (the `face`-rest forward direction) so `face` turns it toward its top landing — matching the
// navmesh connector, which links (cell, y) → (cell + face, y + rise). v0 geometry: a solid stepped
// profile at ~45° (override `run`/`rise`). Footprint carving + a step-chain climb path are follow-ups.
export const Stair = (_scope: unknown, params: BlockParams) => {
  const rise = num(params, "rise", STOREY_RISE); // vertical climb (one storey by default)
  const run = num(params, "run", rise); // horizontal length (default ~45°)
  const width = num(params, "width", num(params, "tile", 1) * 0.9);
  const stepH = 0.18;
  const count = Math.max(2, Math.round(rise / stepH));
  const stepDepth = run / count;
  const material = mat(color(params, "color", 0x6b5337), 0.7);
  const group = new Group();
  for (let i = 0; i < count; i++) {
    const h = (i + 1) * stepH; // solid profile: each tread box rises from the floor to its height
    const tread = standingBox(width, h, stepDepth, material);
    tread.position.z = (i + 0.5) * stepDepth; // march toward +Z (the rest-forward direction)
    group.add(tread);
  }
  return { mesh: group };
};

// A column/pillar — a vertical cylinder resting on the floor. Works grid-centered or free.
export const Column = (_scope: unknown, params: BlockParams) => {
  const height = num(params, "height", 2.8);
  const radius = num(params, "radius", 0.12);
  const geom = new CylinderGeometry(radius, radius, height, 10); // PS1-density (see furniture.ts)
  geom.translate(0, height / 2, 0);
  const mesh = new Mesh(geom, mat(color(params, "color", 0xd8cdbb)));
  mesh.castShadow = true;
  return { mesh };
};
