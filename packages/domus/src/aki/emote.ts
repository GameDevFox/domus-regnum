// Emote system — rendered IN the scene (textured planes), driven by an `emote` trigger Value. Lifecycle
// of one emote:
//   1. POP    — a bubble (glyph on a soft oval) fades in above the head and holds.
//   2. HANDOFF— the bubble fades out in place while the glyph (staying opaque) arcs to ITS slot in the
//               COLUMN on the right; the existing glyphs shift down a slot. Once shifted (or once the
//               arc lands) a glyph hands off to a critically-damped spring, so it re-aims smoothly when
//               the stack shifts again mid-flight instead of snapping (the burst-jitter fix).
//   3. COLUMN — the glyph rests in its slot (spring). New arrivals push the stack down; the glyph pushed
//               past the bottom fades out as it slides below the pillar.
// The bubble and glyph are SEPARATE planes (so the bubble can fade while the glyph persists). A single
// RAF steps every live emote; it runs only while some are alive.
//
// Everything tunable lives in the config blocks below (bubble lengths are FRACTIONS of the bubble height,
// so they're resolution-independent; column values are WORLD units in the scene frame).

import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";

import { frameDelta, peek, type Scope, type UsedAs, type Value } from "@kitsune/common-web";

// ── tunables ────────────────────────────────────────────────────────────────
export const EMOTE_TIMING = { fadeIn: 0.3, hold: 1.5, fadeOut: 0.3 }; // seconds (fadeOut = bubble handoff)

// Bubble shape + look. `aspect` is width/height; other lengths are FRACTIONS of the bubble height.
export const EMOTE_BUBBLE = {
  aspect: 1.35,
  texHeightPx: 220,
  margin: 0.1,
  fill: "rgba(255, 251, 244, 0.5)",
  rim: "rgba(120, 90, 60, 0.9)",
  rimWidth: 0.018,
  shadow: "rgba(40, 25, 15, 0.35)",
  shadowBlur: 0.05,
  shadowOffsetY: 0.02,
};

// The glyph (drawn on its OWN transparent texture so it can outlive the bubble). Size fractions are
// relative to the bubble height.
export const EMOTE_GLYPH = {
  texPx: 200,
  fontFrac: 0.72, // font px vs texture px (leaves headroom so shadows don't clip)
  scale: 0.52, // glyph size vs bubble height (matches how it sat inside the bubble)
  shadow: "rgba(30, 20, 10, 0.45)",
  shadowBlur: 0,
  shadowOffsetX: 0.02, // frac of glyph size
  shadowOffsetY: 0.03,
  font: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
};

// Pop (above the head).
export const EMOTE_MOTION = {
  size: 0.18, // world HEIGHT of the pop bubble (aki-app overrides via the `size` prop)
  popFrom: 0.7, // scale multiplier at the start of the pop
  drift: 0.03, // world units the pop rises during its hold
  spread: 0.22, // horizontal scatter so concurrent pops don't stack
  renderOrder: 10,
};

// The fresh-launch bezier flight (pop → the glyph's slot) before the spring takes over.
export const EMOTE_FLIGHT = { duration: 0.7, arc: 0.16 }; // seconds; arc = world-units of upward bow

// The column/pillar on the right (all WORLD units in the scene frame).
export const EMOTE_COLUMN = {
  x: 0.62, // centre x
  top: 0.5, // y of the top slot
  spacing: 0.1, // y between slots (glyph stays bubble-size, so they pack tighter → more fit)
  capacity: 8, // slots before the bottom one overflows
  springTime: 0.18, // critically-damped settle time (s) for the column slide/redirect — smaller = snappier
  exitFade: 0.4, // seconds to fade a glyph pushed past the bottom
  // The glyph keeps its bubble size in the column (see the `glyph()` helper) — no `glyphSize` here.
  bg: {
    width: 0.13, top: 0.59, bottom: -0.32,
    color: "255, 251, 244", midAlpha: 0.8, fadeFrac: 0.16
  },
};
// z-depths of the emote planes (renderOrder does the real layering; z keeps depth honest).
export const EMOTE_Z = { column: 0.015, bubble: 0.02, glyph: 0.03 };
// ─────────────────────────────────────────────────────────────────────────────

const TEX_ANISOTROPY = 4; // crisp glyph/bubble textures at glancing angles
const GRADIENT_TEX_W = 8; // the pillar gradient only varies vertically — width can be tiny
const GRADIENT_TEX_H = 256;
const MAX_STEP_S = 0.05; // clamp big frame gaps (tab switches)

export type EmoteState = { glyph: string }; // set a NEW object each trigger (reference change → spawn)

const easeOut = (p: number) => 1 - (1 - p) ** 3;
const slotY = (i: number) => EMOTE_COLUMN.top - i * EMOTE_COLUMN.spacing;

// Critically-damped approach (Unity-style SmoothDamp): eases `cur`→`target` while carrying `vel`, so a
// target that moves mid-flight is absorbed smoothly (no snap) — the column's retarget-safe motion.
const smoothDamp = (cur: number, target: number, vel: number, smoothTime: number, dt: number) => {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return { pos: target + (change + temp) * exp, vel: (vel - omega * temp) * exp };
};

// Bubble texture (glyph-agnostic → shared): a rounded oval with fill, rim, and drop shadow.
const bubbleTexture = (): CanvasTexture => {
  const b = EMOTE_BUBBLE;
  const h = b.texHeightPx;
  const w = Math.round(h * b.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - h * b.margin;
  const ry = h / 2 - h * b.margin;
  const ellipse = () => ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.shadowColor = b.shadow;
  ctx.shadowBlur = h * b.shadowBlur;
  ctx.shadowOffsetY = h * b.shadowOffsetY;
  ctx.beginPath();
  ellipse();
  ctx.fillStyle = b.fill;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ellipse();
  ctx.lineWidth = h * b.rimWidth;
  ctx.strokeStyle = b.rim;
  ctx.stroke();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = TEX_ANISOTROPY;
  return tex;
};

// Glyph-only texture (transparent background + its own drop shadow).
const glyphTexture = (glyph: string): CanvasTexture => {
  const g = EMOTE_GLYPH;
  const px = g.texPx;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.shadowColor = g.shadow;
  ctx.shadowBlur = px * g.shadowBlur;
  ctx.shadowOffsetX = px * g.shadowOffsetX;
  ctx.shadowOffsetY = px * g.shadowOffsetY;
  ctx.font = `${Math.round(px * g.fontFrac)}px ${g.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, px / 2, px / 2);
  ctx.restore();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = TEX_ANISOTROPY;
  return tex;
};

// Vertical gradient for the pillar: transparent at both ends, semi-opaque in the middle.
const columnBgTexture = (): CanvasTexture => {
  const bg = EMOTE_COLUMN.bg;
  const canvas = document.createElement("canvas");
  canvas.width = GRADIENT_TEX_W;
  canvas.height = GRADIENT_TEX_H;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `rgba(${bg.color}, 0)`);
  grad.addColorStop(bg.fadeFrac, `rgba(${bg.color}, ${bg.midAlpha})`);
  grad.addColorStop(1 - bg.fadeFrac, `rgba(${bg.color}, ${bg.midAlpha})`);
  grad.addColorStop(1, `rgba(${bg.color}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
};

type Phase = "pop" | "column";
type Live = {
  glyph: Mesh;
  glyphMat: MeshBasicMaterial;
  bubble: Mesh | null;
  bubbleMat: MeshBasicMaterial | null;
  phase: Phase;
  age: number; // seconds in the current phase (in "column", also drives the fly-in arc)
  popX: number; // pop anchor x (with spread)
  popY: number;
  slot: number; // column slot (0 = top); assigned when it leaves the pop
  mode: "bezier" | "spring"; // column motion: the fresh arc, then the retarget-safe spring
  vx: number; // spring velocity — also the seed captured from the bezier at the handoff
  vy: number;
  x: number;
  y: number; // current world position (during the fly-in this rides the bezier arc)
  exiting: boolean;
  exitAge: number;
};

export const Emote = (
  scope: Scope,
  props: {
    emote: Value<EmoteState | null>;
    time: Value<number>; // the host app's frame clock — animation rides it (no private RAF)
    position?: UsedAs<Vector3>;
    size?: UsedAs<number>;
    // The column feed is OPT-OUT-able: while false the pillar is hidden and an emote simply
    // dissolves in place after its hold (no flight, no slot) — for scenes that aren't using
    // the feed yet (the Tea intro). Flips live; emotes already in the column finish normally.
    column?: UsedAs<boolean>;
  },
): { mesh: Group } => {
  const { emote, time, position = new Vector3(), size = EMOTE_MOTION.size, column = true } = props;
  // Glyph world height — the SAME in the bubble and in the column (so they don't resize on the way over).
  const glyphHeight = () => peek(size) * EMOTE_GLYPH.scale;

  const group = new Group();
  const bubbleGeom = new PlaneGeometry(1, 1);
  const glyphGeom = new PlaneGeometry(1, 1);
  const bubbleTex = bubbleTexture(); // shared across all bubbles
  const glyphTextures = new Map<string, CanvasTexture>();
  const glyphTexFor = (g: string) => glyphTextures.get(g) ?? glyphTextures.set(g, glyphTexture(g)).get(g)!;

  // pillar background
  const bg = EMOTE_COLUMN.bg;
  const bgTex = columnBgTexture();
  const bgMesh = new Mesh(bubbleGeom, new MeshBasicMaterial({ map: bgTex, transparent: true, depthWrite: false }));
  bgMesh.position.set(EMOTE_COLUMN.x, (bg.top + bg.bottom) / 2, EMOTE_Z.column);
  bgMesh.scale.set(bg.width, bg.top - bg.bottom, 1);
  bgMesh.renderOrder = EMOTE_MOTION.renderOrder - 1;
  group.add(bgMesh);
  scope.effect((use) => void (bgMesh.visible = use(column)));
  // The group stays at the origin; `position` is the POP anchor (read per-spawn), and the column uses
  // absolute world coords from EMOTE_COLUMN — so everything shares one world space.

  const live: Live[] = [];
  const { fadeIn, hold, fadeOut } = EMOTE_TIMING;

  const remove = (e: Live) => {
    group.remove(e.glyph);
    e.glyphMat.dispose();
    if (e.bubble) group.remove(e.bubble);
    e.bubbleMat?.dispose();
    live.splice(live.indexOf(e), 1);
  };
  const dropBubble = (e: Live) => {
    if (!e.bubble) return;
    group.remove(e.bubble);
    e.bubbleMat?.dispose();
    e.bubble = null;
    e.bubbleMat = null;
  };

  // Everything already in the column (fly/rest) shifts down a slot to make room at the top.
  const reslot = () => {
    live.forEach((e) => {
      if (e.phase !== "pop") {
        e.slot += 1;
        if (e.slot >= EMOTE_COLUMN.capacity) e.exiting = true;
        e.mode = "spring"; // a shifted glyph leaves its fresh arc → spring to its (new) slot
      }
    });
  };

  let order = 0; // per-spawn layer counter → each emote's glyph sits above ITS OWN bubble only
  const step = (dt: number) => {
    for (const e of [...live]) {
      e.age += dt;
      if (e.phase === "pop") {
        const grow = EMOTE_MOTION.popFrom + (1 - EMOTE_MOTION.popFrom) * Math.min(e.age / fadeIn, 1);
        const bubbleH = peek(size);
        const yDrift = EMOTE_MOTION.drift * Math.min(e.age / (fadeIn + hold), 1);
        e.x = e.popX;
        e.y = e.popY + yDrift;
        if (e.exiting) {
          // No-column dissolve: bubble and glyph fade out together, in place.
          e.exitAge += dt;
          const fade = Math.max(0, 1 - e.exitAge / EMOTE_COLUMN.exitFade);
          e.glyphMat.opacity = fade;
          if (e.bubbleMat) e.bubbleMat.opacity = fade;
        } else {
          const op = Math.min(e.age / fadeIn, 1);
          e.glyphMat.opacity = op;
          if (e.bubbleMat) e.bubbleMat.opacity = op;
        }
        placeBubble(e, bubbleH * grow);
        placeGlyph(e, bubbleH * grow * EMOTE_GLYPH.scale);
        if (e.exiting) {
          if (e.exitAge >= EMOTE_COLUMN.exitFade) remove(e);
        } else if (e.age >= fadeIn + hold) {
          if (peek(column)) {
            reslot(); // push the column down as this one launches (shifted glyphs → spring)
            e.slot = 0;
            e.phase = "column";
            e.age = 0;
            e.mode = "bezier"; // this one gets the fresh arc; it springs once a newer emote shifts it
          } else {
            e.exiting = true; // no feed to fly to — dissolve where it floats
          }
        }
      } else {
        // COLUMN — two retarget-safe motion modes:
        //   • BEZIER: the fresh pop→slot arc flourish, until this glyph is reslotted OR the arc lands.
        //   • SPRING: a critically-damped SmoothDamp toward the current slot, carrying velocity across
        //     the handoff. It re-solves from the LIVE position + velocity each frame, so a reslot merely
        //     moves the target — no from-origin re-derivation, no snap, smooth across repeated shifts.
        const oldX = e.x;
        const oldY = e.y;
        if (e.mode === "bezier") {
          const ep = easeOut(Math.min(e.age / EMOTE_FLIGHT.duration, 1));
          const toX = EMOTE_COLUMN.x;
          const toY = slotY(e.slot);
          const ctrlX = (e.popX + toX) / 2;
          const ctrlY = Math.max(e.popY, toY) + EMOTE_FLIGHT.arc;
          e.x = (1 - ep) ** 2 * e.popX + 2 * (1 - ep) * ep * ctrlX + ep ** 2 * toX;
          e.y = (1 - ep) ** 2 * e.popY + 2 * (1 - ep) * ep * ctrlY + ep ** 2 * toY;
          if (dt > 0) { // live velocity — seeds the spring at the handoff (no analytic derivative needed)
            e.vx = (e.x - oldX) / dt;
            e.vy = (e.y - oldY) / dt;
          }
          if (e.age >= EMOTE_FLIGHT.duration) e.mode = "spring"; // arc landed → rest/push under the spring
        } else {
          const t = EMOTE_COLUMN.springTime;
          const sx = smoothDamp(e.x, EMOTE_COLUMN.x, e.vx, t, dt);
          const sy = smoothDamp(e.y, slotY(e.slot), e.vy, t, dt);
          e.x = sx.pos;
          e.vx = sx.vel;
          e.y = sy.pos;
          e.vy = sy.vel;
        }
        if (e.bubbleMat) {
          e.bubbleMat.opacity = Math.max(0, 1 - e.age / fadeOut); // bubble fades out during the handoff
          placeBubble(e, peek(size));
          if (e.age >= fadeOut) dropBubble(e);
        }
        placeGlyph(e, glyphHeight());
        if (e.exiting) {
          e.exitAge += dt;
          e.glyphMat.opacity = Math.max(0, 1 - e.exitAge / EMOTE_COLUMN.exitFade);
          if (e.exitAge >= EMOTE_COLUMN.exitFade) remove(e);
        }
      }
    }
  };

  // Drive the lifecycle from the app's clock: one step per frame while anything is alive.
  // Riding `time` (via frameDelta) instead of a private RAF/performance.now keeps the whole
  // system steerable by a virtual clock.
  const delta = frameDelta(scope, time, { maxStep: MAX_STEP_S });
  scope.effect((use) => {
    const dt = use(delta);
    if (live.length) step(dt);
  });

  const placeBubble = (e: Live, h: number) => {
    if (!e.bubble) return;
    e.bubble.scale.set(h * EMOTE_BUBBLE.aspect, h, 1);
    e.bubble.position.set(e.x, e.y, EMOTE_Z.bubble);
  };
  const placeGlyph = (e: Live, h: number) => {
    e.glyph.scale.set(h, h, 1);
    e.glyph.position.set(e.x, e.y, EMOTE_Z.glyph);
  };

  const spawn = (glyph: string) => {
    if (!live.length) order = 0; // reset when the field is empty → keep render orders bounded across bursts
    const layer = EMOTE_MOTION.renderOrder + order++ * 2; // this emote's own 2-deep layer
    const glyphMat = new MeshBasicMaterial({ map: glyphTexFor(glyph), transparent: true, depthWrite: false, opacity: 0 });
    const glyphMesh = new Mesh(glyphGeom, glyphMat);
    glyphMesh.renderOrder = layer + 1; // glyph just above ITS bubble
    const bubbleMat = new MeshBasicMaterial({ map: bubbleTex, transparent: true, depthWrite: false, opacity: 0 });
    const bubbleMesh = new Mesh(bubbleGeom, bubbleMat);
    bubbleMesh.renderOrder = layer; // the next emote (layer+2) sits fully in front of this one
    group.add(bubbleMesh, glyphMesh);
    const anchor = peek(position);
    const e: Live = {
      glyph: glyphMesh,
      glyphMat,
      bubble: bubbleMesh,
      bubbleMat,
      phase: "pop",
      age: 0,
      popX: anchor.x + (Math.random() - 0.5) * EMOTE_MOTION.spread,
      popY: anchor.y,
      slot: 0,
      mode: "bezier",
      vx: 0,
      vy: 0,
      x: anchor.x,
      y: anchor.y,
      exiting: false,
      exitAge: 0,
    };
    live.push(e);
  };

  scope.effect((use) => {
    const e = use(emote); // re-runs on each new trigger object
    if (e) spawn(e.glyph);
  });

  // Fixed resources are owned by the scope; the per-emote materials + glyph texture cache
  // still need the custom sweep (they're created dynamically).
  scope.own(bubbleGeom, glyphGeom, bubbleTex, bgTex, bgMesh.material as MeshBasicMaterial);
  scope.add(() => {
    live.forEach((e) => {
      e.glyphMat.dispose();
      e.bubbleMat?.dispose();
    });
    live.length = 0;
    glyphTextures.forEach((t) => t.dispose());
  });

  return { mesh: group };
};
