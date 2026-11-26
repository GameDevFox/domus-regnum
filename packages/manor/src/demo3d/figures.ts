import { CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader } from "three";
import type { Group, PerspectiveCamera, Texture } from "three";

import { yawBillboard } from "@scene-lib/billboard";
import type { Scope } from "@scene-lib/scope";
import type { Value } from "@scene-lib/value";

import { CROPS, CROP_IDS } from "../game";
import { standingAt } from "../space";
import type { Actor, World } from "../space";
import type { Daylight } from "./daylight";
import { leanFor } from "./lean";
import { group } from "./parts";
import { glyphTexture } from "./textures";

// People are flat pictures stood upright that always turn to face the camera, as in the old
// tactics games. Each has two drawings — seen from the front and from behind, both turned a
// little to the left — and each is mirrored, which gives the four directions.

/** The sprite sheet's canvas, and how tall the drawn figure is on it (public/sprites/manifest.json). */
const CANVAS = { w: 256, h: 352 };
// People are drawn a fifth larger than life, as tactics-game figures are: they have to read from across a house.
const FIGURES: Record<string, { drawnPx: number; metres: number }> = {
  evelyn: { drawnPx: 300, metres: 1.82 },
  "maid-rose": { drawnPx: 300, metres: 1.8 },
  "maid-sage": { drawnPx: 300, metres: 1.78 },
  master: { drawnPx: 325, metres: 2.02 },
  townswoman: { drawnPx: 300, metres: 1.8 },
  townsman: { drawnPx: 315, metres: 1.92 },
};
/** Pictures fetched as the page opens, so the first customer through the door is not a blank card. */
const VISITORS = ["townswoman", "townsman"];
/** Blank rows under the soles on the sheet. */
const FOOT_PAD_PX = 4;

const STRIDE = 0.62;
const BOB_HEIGHT = 0.045;
const SWAY = 0.035;
/** How far past edge-on a walker must turn before the drawing changes, so it does not flicker. */
const FLIP_MARGIN = 0.14;
const SHADOW_RADIUS = 0.3;
const GLYPH_SIZE = 0.36;
/** How far over her head what she carries floats. */
const GLYPH_LIFT = 0.3;
/**
 * A card is drawn this far nearer the camera than the person really stands, along the line of
 * sight, so it looks no different but the steps and posts just behind her do not cut into it.
 */
const CARD_FORWARD = 0.25;
/** How quickly the feet come up on to the next step of a stair, per second. */
const STEP_EASE = 16;
/** Someone asleep is not drawn: a sign floats over her bed, this far in front of where she stood to get into it, and this high. */
const ASLEEP = "asleep";
const BED_REACH = 1.4;
const BED_SIGN_HEIGHT = 1.05;
/** The sign of sleep is drawn larger than what someone carries: it is all there is to see of her. */
const SLEEP_SIGN_SCALE = 1.8;

export const GLYPHS: Record<string, string> = {
  // What the garden bears, each by its own sign.
  ...Object.fromEntries(CROP_IDS.map((crop) => [crop, CROPS[crop].glyph])),
  flour: "🌾", dough: "🥣", berries: "🫐", herbs: "🌿", jam: "🍓", tea: "🍃", honey: "🍯", bread: "🍞", cake: "🍰", pie: "🥧", teapot: "🍵", wine: "🍷", cheese: "🧀", cider: "🍺", elixir: "🧪", book: "📕", linen: "🧺", towels: "🧺", china: "🍽️",
};

/** Someone who has just done something worth marking has this over her head for a few seconds. */
const CHEER = "cheer";
/** The signs that float over people: what each is carrying, sleep, and a moment of triumph. */
const SIGNS: Record<string, string> = { ...GLYPHS, [ASLEEP]: "💤", [CHEER]: "✨" };

type FigureProps = {
  world: World;
  /** The light of the time of day: the pictures are painted, and are tinted to it by hand. */
  light: Value<Daylight>;
  /** Whether someone is in bed. */
  asleep: (id: string) => boolean;
  /** Whether someone has just done something worth marking: the sign of it shows over her in place of what she carries. */
  cheering?: (id: string) => boolean;
  camera: PerspectiveCamera;
  /** Ticks once a frame. */
  frame: Value<number>;
  /** Seconds the house has been alive: it stops while time is paused, so breathing and bobbing stop with it. */
  life: Value<number>;
  /** People are drawn only between these two heights: the storeys that are on show. */
  band: Value<{ low: number; high: number }>;
};

export type FiguresView = {
  mesh: Group;
  pick: Map<Mesh, string>;
  /** Give everyone drawn with one picture another skin for one of its faces: a palette swap. Null gives the face its own again. */
  reskin: (sprite: string, view: "front" | "back", map: Texture | null) => void;
};

const loader = new TextureLoader();
const load = (file: string): Texture => {
  const map = loader.load(`${import.meta.env.BASE_URL}sprites/${file}`);
  map.colorSpace = SRGBColorSpace;
  return map;
};

const shadowSkin = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.26, depthWrite: false });

/** What everyone drawn with one picture shares: the card's shape and its two faces. */
type Kit = { shape: PlaneGeometry; front: MeshBasicMaterial; back: MeshBasicMaterial; metres: number; /** The faces as they were drawn, to go back to. */ drawn: { front: Texture; back: Texture } };

type Figure = {
  actor: Actor;
  kit: Kit;
  root: Group;
  card: Mesh;
  shadow: Mesh;
  glyph: Mesh;
  glyphSkin: MeshBasicMaterial;
  showsBack: boolean;
  mirrored: boolean;
  carried: string | null;
  /** The height she is drawn at: it follows her feet, easing up each step of a stair. */
  y: number;
  /** The frame she was last found in the house: one she is not found in, she has left. */
  seen: number;
  /** What is hers alone, to be let go of when she leaves. */
  own: Scope;
};

export const Figures = (scope: Scope, { world, camera, frame, life, band, light, asleep, cheering }: FigureProps): FiguresView => {
  const mesh = group();
  const pick = new Map<Mesh, string>();
  const shadowShape = scope.own(new CircleGeometry(SHADOW_RADIUS, 16));
  const glyphShape = scope.own(new PlaneGeometry(GLYPH_SIZE, GLYPH_SIZE));

  // One set of pictures for each sprite, however many people are drawn with it: customers come and go all day.
  const kits = new Map<string, Kit>();
  const kitOf = (sprite: string): Kit => {
    const have = kits.get(sprite);
    if (have) return have;
    const spec = FIGURES[sprite] ?? FIGURES.evelyn;
    const height = (CANVAS.h / spec.drawnPx) * spec.metres;
    const width = height * (CANVAS.w / CANVAS.h);
    const shape = scope.own(new PlaneGeometry(width, height));
    // Stand the card on its feet: the anchor is bottom-centre, a few blank rows above the edge.
    shape.translate(0, height / 2 - (FOOT_PAD_PX / CANVAS.h) * height, 0);
    // Cut out by the picture's own edge, and drawn as a solid thing: so glass in front of her tints her, as it should.
    const drawn = { front: scope.own(load(`${sprite}-front.png`)), back: scope.own(load(`${sprite}-back.png`)) };
    const skin = (view: "front" | "back"): MeshBasicMaterial => scope.own(new MeshBasicMaterial({ map: drawn[view], alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide }));
    const made = { shape, front: skin("front"), back: skin("back"), metres: spec.metres, drawn };
    kits.set(sprite, made);
    return made;
  };
  VISITORS.forEach(kitOf);
  // The light is worked out afresh as the clock moves, so this also reaches pictures first used since it last ran.
  scope.effect((use) => {
    const tint = use(light).figures;
    for (const kit of kits.values()) for (const face of [kit.front, kit.back]) face.color.setRGB(...tint, SRGBColorSpace);
  });

  const figures = new Map<string, Figure>();
  const enter = (actor: Actor): Figure => {
    const own = scope.child();
    const kit = kitOf(actor.sprite);
    const card = yawBillboard(new Mesh(kit.shape, kit.front));
    // Turned to face the camera first, then leant back about its own feet, then swayed: in that order.
    card.rotation.order = "YXZ";
    const shadow = new Mesh(shadowShape, shadowSkin);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    const glyphSkin = own.own(new MeshBasicMaterial({ alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide }));
    // What she carries is a sign, not a body: it faces the camera squarely, however steeply the view looks down.
    const glyph = new Mesh(glyphShape, glyphSkin);
    glyph.visible = false;
    const root = group(card, shadow, glyph);
    mesh.add(root);
    pick.set(card, actor.id);
    own.add(() => {
      mesh.remove(root);
      pick.delete(card);
    });
    const figure: Figure = { actor, kit, root, card, shadow, glyph, glyphSkin, showsBack: false, mirrored: false, carried: null, y: actor.walker.pos.y, seen: 0, own };
    figures.set(actor.id, figure);
    return figure;
  };

  let last = 0;
  let round = 0;
  scope.effect((use) => {
    const now = use(frame);
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    // Read without subscribing: the frame tick above already runs this every frame.
    const t = life.peek();
    const { low, high } = use(band);
    round += 1;
    for (const actor of world.actors) (figures.get(actor.id) ?? enter(actor)).seen = round;
    for (const f of figures.values()) {
      // Gone from the house: a customer who has walked out of the door.
      if (f.seen !== round) {
        figures.delete(f.actor.id);
        f.own.cleanup();
        continue;
      }
      const { walker } = f.actor;
      const at = standingAt(world, f.actor);
      // On a stair her feet go from tread to tread; a quick ease makes that a step and not a jump.
      f.y = walker.onStair ? f.y + (at.y - f.y) * Math.min(1, STEP_EASE * dt) : at.y;
      f.root.position.set(at.x, f.y, at.z);
      f.root.visible = walker.pos.y >= low && walker.pos.y < high;
      if (!f.root.visible) continue;
      // In bed she is not drawn: the sign over the bed stands for her.
      const abed = asleep(f.actor.id);
      f.card.visible = !abed;
      f.shadow.visible = !abed;

      // Which drawing: is she coming towards the camera or going away, and to which side?
      const vx = walker.pos.x - camera.position.x;
      const vz = walker.pos.z - camera.position.z;
      const reach = Math.hypot(vx, vz) || 1;
      const hx = Math.sin(walker.heading);
      const hz = Math.cos(walker.heading);
      const away = (hx * vx + hz * vz) / reach;
      const toRight = (hx * -vz + hz * vx) / reach;
      if (Math.abs(away) > FLIP_MARGIN) f.showsBack = away > 0;
      if (Math.abs(toRight) > FLIP_MARGIN) f.mirrored = toRight > 0;
      f.card.material = f.showsBack ? f.kit.back : f.kit.front;

      // A static picture still walks: a small hop each step and a lean from foot to foot.
      const striding = Math.min(1, walker.speed / 0.5);
      const step = (f.actor.walked / STRIDE) * Math.PI;
      const breathing = f.actor.busy > 0 ? Math.sin(t * 5 + f.root.id) * 0.012 : 0;
      // Towards the camera along the line of sight (see CARD_FORWARD).
      const sx = camera.position.x - at.x;
      const sy = camera.position.y - f.y;
      const sz = camera.position.z - at.z;
      const forward = CARD_FORWARD / (Math.hypot(sx, sy, sz) || 1);
      f.card.position.set(sx * forward, sy * forward + Math.abs(Math.sin(step)) * BOB_HEIGHT * striding, sz * forward);
      f.card.rotation.z = Math.sin(step) * SWAY * striding;
      // Lean back as the camera rises above the height the picture was drawn from (see lean.ts).
      f.card.rotation.x = -leanFor(Math.atan2(sy, Math.hypot(sx, sz)));
      f.card.scale.set(f.mirrored ? -1 : 1, 1 + breathing, 1);

      const sign = abed ? ASLEEP : cheering?.(f.actor.id) ? CHEER : f.actor.carrying;
      if (sign !== f.carried) {
        f.carried = sign;
        f.glyph.visible = sign !== null;
        if (sign) {
          f.glyphSkin.map = glyphTexture(SIGNS[sign] ?? "📦");
          f.glyphSkin.needsUpdate = true;
        }
      }
      if (f.glyph.visible) {
        const bob = Math.sin(t * 3 + f.root.id) * 0.03;
        // She stood facing her bed to get into it: the sign is over the bed, not over where she stood.
        const facing = f.actor.faceTo ?? walker.heading;
        f.glyph.scale.setScalar(abed ? SLEEP_SIGN_SCALE : 1);
        if (abed) f.glyph.position.set(Math.sin(facing) * BED_REACH, BED_SIGN_HEIGHT + bob, Math.cos(facing) * BED_REACH);
        else f.glyph.position.set(f.card.position.x, f.kit.metres + GLYPH_LIFT + bob + f.card.position.y, f.card.position.z);
        f.glyph.quaternion.copy(camera.quaternion);
      }
    }
  });

  const reskin: FiguresView["reskin"] = (sprite, view, map) => {
    const kit = kitOf(sprite);
    kit[view].map = map ?? kit.drawn[view];
    kit[view].needsUpdate = true;
  };
  return { mesh, pick, reskin };
};
