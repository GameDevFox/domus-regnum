// The canvas (Three.js) sprite renderer — the in-canvas counterpart to the DOM stage. It owns an
// orthographic scene + camera, subscribes to engine snapshots, and manages one textured quad per
// on-screen entry (create on show, dispose on hide, swap texture on re-show). It draws nothing on
// its own clock: the host calls `render(renderer)` as a pass in its render loop, so the VN layer
// composites between the 3D game pass and whatever renders on top — the "sandwich".
//
// `three` is an optional peer dependency: this module lives behind the `@kitsune/vn/three` entry
// point so the core (ast + runtime + DOM stage) stays free of Three.js.

import {
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from "three";

import { Engine, SceneEntry, Snapshot } from "../runtime";
import { Box, coverBackground, placeSprite } from "./placement";

// Progress for a preload pass; wire to a loading bar.
export type LoadProgress = { loaded: number; total: number };

export type SpriteRendererOptions = {
  // Map a script image name to an asset URL. Return null (default) to draw a flat-tinted placeholder
  // quad, so a script renders before art exists.
  resolveImage?: (image: string) => string | null;
  // Layer names drawn as full-bleed backgrounds (cover) rather than standing sprites. Default ["bg"].
  backgroundLayers?: string[];
  // Fade-in duration (ms) when a sprite appears or its image swaps. Default 220; 0 disables.
  fadeMs?: number;
  // Clock for fade timing. Default performance.now; domus passes its per-frame virtual clock.
  now?: () => number;
};

export type SpriteRenderer = {
  scene: Scene;
  camera: OrthographicCamera;
  // Draw the VN layer with the given renderer. Caller owns clear/clearDepth and pass ordering.
  render: (renderer: WebGLRenderer) => void;
  // Decode + cache the textures for these image names up front (call before starting the scene so
  // sprites never pop in untextured). Resolves when all are ready; reports progress as it goes.
  // Unresolvable names (no URL) and load failures are counted as done, not fatal.
  preload: (images: string[], onProgress?: (p: LoadProgress) => void) => Promise<void>;
  unmount: () => void;
};

type Tracked = {
  isBg: boolean;
  mesh: Mesh;
  material: MeshBasicMaterial;
  texAspect: number; // refined once the texture loads
  transform: SceneEntry["transform"];
  bornAt: number; // fade-in start (reset on image swap)
  image: string;
  enter?: SceneEntry["enter"]; // entrance slide, set once at creation
  slideStart: number; // creation time; the slide runs from here (never reset on swap)
  ready: boolean; // texture (or placeholder) resolved — kept invisible until then
  exitStart?: number; // set when hidden: the sprite is sliding back out toward its entrance side
  fadeDur?: number; // override the swap fade-in duration (used by `dissolve`); defaults to fadeMs
};

// A frozen copy of an entry's OLD image, held at full opacity beneath the new one while it fades in,
// then disposed — that's how a `dissolve` crossfades (e.g. between backgrounds).
type Ghost = {
  mesh: Mesh;
  material: MeshBasicMaterial;
  isBg: boolean;
  transform: SceneEntry["transform"];
  texAspect: number;
  start: number;
  dur: number;
};

const BG_RENDER_ORDER = -1000;

// Slide easings — directional: decelerate IN (settle softly), accelerate OUT (push off). This reads
// better for one-way entrances/exits than one symmetric curve. The exit uses a quadratic (not cubic)
// so it stays visible as it leaves rather than lingering then darting off. (Ren'Py's default move
// warper is `ease`, the cosine ease-in-out `0.5 - 0.5*cos(pi*t)` — swap both for that to match it.)
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3); // entrance
const easeInQuad = (p: number) => p * p; // exit

export const mountSprites = (engine: Engine, opts: SpriteRendererOptions = {}): SpriteRenderer => {
  const now = opts.now ?? (() => performance.now());
  const fadeMs = opts.fadeMs ?? 220;
  const bgLayers = new Set(opts.backgroundLayers ?? ["bg"]);
  const loader = new TextureLoader();
  const textures = new Map<string, Texture>(); // url -> decoded texture, shared by load + preload
  const geometry = new PlaneGeometry(1, 1); // unit quad; mesh.scale sets real size

  const scene = new Scene();
  // World: x ∈ [0, aspect], y ∈ [0, 1] (y up). right is updated to the live aspect in render().
  const camera = new OrthographicCamera(0, 1, 1, 0, -10, 10);
  camera.position.z = 1;

  const tracked = new Map<string, Tracked>(); // key = `${layer}:${tag}`
  const exiting: Tracked[] = []; // hidden sprites sliding out, disposed when off-screen
  const crossfading: Ghost[] = []; // old images held under a dissolving-in new one

  // The fade veil: a fullscreen quad on top of everything, animated 0→1→0 through a color for the
  // `fade` transition. Transparent (opacity 0) at rest.
  const veilMaterial = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const veilMesh = new Mesh(geometry, veilMaterial);
  veilMesh.renderOrder = 10000;
  scene.add(veilMesh);
  let fadeStart = 0;
  let fadeDur = 0;
  let fading = false;

  // Track the transition object so we trigger each `with` exactly once (the runtime leaves it on the
  // snapshot until the next advance, and re-emits it on unrelated re-renders).
  let lastTransition: Snapshot["transition"] = null;

  const orderFor = (isBg: boolean, z: number | undefined) =>
    (isBg ? BG_RENDER_ORDER : 0) + (z ?? 0);

  // Load (or reuse a cached) texture for a url. Resolves on success; rejects on failure.
  const loadTexture = (url: string): Promise<Texture> => {
    const cached = textures.get(url);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) =>
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = SRGBColorSpace;
          tex.minFilter = LinearFilter;
          textures.set(url, tex);
          resolve(tex);
        },
        undefined,
        reject,
      ),
    );
  };

  const applyTexture = (t: Tracked, tex: Texture) => {
    t.material.map = tex;
    t.material.color.set(0xffffff);
    t.material.needsUpdate = true;
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) t.texAspect = img.width / img.height;
    t.ready = true;
  };

  const loadImage = (t: Tracked, image: string) => {
    const url = opts.resolveImage?.(image) ?? null;
    if (!url) {
      // Placeholder: a flat-tinted quad (no texture) so layout still reads — ready immediately.
      t.material.map = null;
      t.material.color.set(0x8a94c8);
      t.material.needsUpdate = true;
      t.ready = true;
      return;
    }
    // Cache hit (e.g. preloaded) applies synchronously, so the sprite is visible from frame one.
    const cached = textures.get(url);
    if (cached) {
      applyTexture(t, cached);
      return;
    }
    t.ready = false; // stay invisible until the texture arrives — no white-quad flash
    void loadTexture(url)
      .then((tex) => applyTexture(t, tex))
      .catch(() => {
        // Failed to load: show the placeholder tint rather than an invisible/white sprite.
        t.material.color.set(0x8a94c8);
        t.material.needsUpdate = true;
        t.ready = true;
      });
  };

  const makeTracked = (layer: string, entry: SceneEntry): Tracked => {
    const isBg = bgLayers.has(layer);
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = orderFor(isBg, entry.transform.z);
    scene.add(mesh);
    const born = now();
    const t: Tracked = {
      isBg,
      mesh,
      material,
      texAspect: isBg ? 1.5 : 0.6,
      transform: entry.transform,
      bornAt: born,
      image: entry.image,
      enter: entry.enter,
      slideStart: born,
      ready: false,
    };
    loadImage(t, entry.image);
    return t;
  };

  // Textures are owned by the `textures` cache (shared across entries + ghosts), so we dispose only
  // the material here and free the textures once, on unmount.
  const disposeTracked = (t: Tracked) => {
    scene.remove(t.mesh);
    t.material.dispose();
  };

  // Freeze an entry's current (old) image into a ghost beneath it; the new image fades in on top over
  // `dur`, and the ghost is disposed once the crossfade completes.
  const spawnGhost = (src: Tracked, dur: number) => {
    if (!src.material.map) return;
    const material = new MeshBasicMaterial({
      map: src.material.map,
      transparent: true,
      opacity: src.transform.alpha ?? 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = src.mesh.renderOrder - 0.5; // just beneath the dissolving-in new image
    scene.add(mesh);
    crossfading.push({
      mesh,
      material,
      isBg: src.isBg,
      transform: src.transform,
      texAspect: src.texAspect,
      start: now(),
      dur,
    });
  };

  // Reconcile the live meshes with a new snapshot.
  const sync = (snap: Snapshot) => {
    // A `with` transition rides on the snapshot until the next advance — fire it once. `fade` plays a
    // veil; `dissolve` crossfades any image swaps happening in this same snapshot.
    const fresh = snap.transition && snap.transition !== lastTransition ? snap.transition : null;
    lastTransition = snap.transition;
    const dissolve = fresh?.kind === "dissolve" ? fresh : null;
    if (fresh?.kind === "fade") {
      veilMaterial.color.set(fresh.color ?? "#000000");
      fadeStart = now();
      fadeDur = fresh.durationMs;
      fading = true;
    }

    const present = new Set<string>();
    for (const layer of Object.keys(snap.layers)) {
      for (const entry of snap.layers[layer]) {
        const key = `${layer}:${entry.tag}`;
        present.add(key);
        const existing = tracked.get(key);
        if (!existing) {
          tracked.set(key, makeTracked(layer, entry));
          continue;
        }
        existing.transform = entry.transform;
        existing.mesh.renderOrder = orderFor(existing.isBg, entry.transform.z);
        if (existing.image !== entry.image) {
          if (dissolve && existing.ready && existing.material.map) {
            // `dissolve`: hold the old image as a ghost and fade the new one in over it.
            spawnGhost(existing, dissolve.durationMs);
            existing.fadeDur = dissolve.durationMs;
            existing.bornAt = now();
          } else {
            // Plain swap (e.g. an expression change): snap instantly. Keeping the quad at full
            // opacity (no bornAt reset) means the new texture simply replaces the old.
            existing.fadeDur = undefined;
          }
          existing.image = entry.image;
          loadImage(existing, entry.image);
        }
      }
    }
    for (const [key, t] of tracked) {
      if (present.has(key)) continue;
      tracked.delete(key);
      // A sprite that slid in slides back out the same way; others just disappear.
      if (t.enter) {
        t.exitStart = now();
        exiting.push(t);
      } else {
        disposeTracked(t);
      }
    }
  };

  const unsub = engine.subscribe(sync);
  sync(engine.snapshot());

  const applyBox = (mesh: Mesh, box: Box) => {
    mesh.position.set(box.x, box.y, 0);
    mesh.scale.set(box.w, box.h, 1);
  };

  const render = (renderer: WebGLRenderer) => {
    const canvas = renderer.domElement;
    const aspect = canvas.height > 0 ? canvas.width / canvas.height : 1;
    if (camera.right !== aspect) {
      camera.right = aspect;
      camera.updateProjectionMatrix();
    }

    const t = now();
    for (const tr of tracked.values()) {
      const box = tr.isBg
        ? coverBackground(aspect, tr.texAspect)
        : placeSprite(tr.transform, aspect, tr.texAspect);

      // Entrance slide: ease the sprite in from off the named side to its target x. Active only
      // while within the slide duration; the slide is the entrance, so skip the opacity fade then.
      let sliding = false;
      if (tr.enter) {
        const dur = tr.enter.durationMs ?? 500;
        const p = (t - tr.slideStart) / dur;
        if (p < 1) {
          sliding = true;
          const offscreenX = tr.enter.from === "left" ? -box.w : aspect + box.w;
          box.x = offscreenX + (box.x - offscreenX) * easeOutCubic(Math.max(0, p));
        }
      }

      applyBox(tr.mesh, box);
      // Invisible until the texture is ready — prevents an untextured white quad (notably while
      // sliding in, where the fade is skipped). Preloading makes `ready` true from frame one. The
      // fade-in duration is normally fadeMs, but a dissolve swap stretches it to the dissolve length.
      const fdur = tr.fadeDur ?? fadeMs;
      const fade = sliding || fdur <= 0 ? 1 : Math.min(1, (t - tr.bornAt) / fdur);
      tr.material.opacity = tr.ready ? (tr.transform.alpha ?? 1) * fade : 0;
    }

    // Crossfade ghosts: the old image holds full opacity beneath the dissolving-in new one, then goes.
    for (let i = crossfading.length - 1; i >= 0; i--) {
      const g = crossfading[i];
      const box = g.isBg
        ? coverBackground(aspect, g.texAspect)
        : placeSprite(g.transform, aspect, g.texAspect);
      applyBox(g.mesh, box);
      g.material.opacity = g.transform.alpha ?? 1;
      if ((t - g.start) / g.dur >= 1) {
        scene.remove(g.mesh);
        g.material.dispose();
        crossfading.splice(i, 1);
      }
    }

    // Fade veil: a fullscreen quad through the fade color, opacity 0→1→0 over the duration.
    veilMesh.position.set(aspect / 2, 0.5, 0);
    veilMesh.scale.set(aspect, 1, 1);
    if (fading) {
      const p = (t - fadeStart) / fadeDur;
      if (p >= 1) {
        fading = false;
        veilMaterial.opacity = 0;
      } else {
        veilMaterial.opacity = p < 0.5 ? p * 2 : (1 - p) * 2;
      }
    }

    // Exiting sprites: accelerate off toward the side they entered from, then dispose.
    for (let i = exiting.length - 1; i >= 0; i--) {
      const tr = exiting[i];
      const dur = tr.enter?.durationMs ?? 500;
      const p = (t - (tr.exitStart ?? t)) / dur;
      const box = placeSprite(tr.transform, aspect, tr.texAspect);
      const offscreenX = tr.enter?.from === "left" ? -box.w : aspect + box.w;
      box.x += (offscreenX - box.x) * easeInQuad(Math.min(1, Math.max(0, p)));
      applyBox(tr.mesh, box);
      tr.material.opacity = tr.transform.alpha ?? 1;
      if (p >= 1) {
        disposeTracked(tr);
        exiting.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  };

  const preload = (images: string[], onProgress?: (p: LoadProgress) => void): Promise<void> => {
    const urls = [
      ...new Set(images.map((i) => opts.resolveImage?.(i) ?? null).filter((u): u is string => !!u)),
    ];
    const total = urls.length;
    let loaded = 0;
    onProgress?.({ loaded, total });
    if (total === 0) return Promise.resolve();
    const done = () => {
      loaded += 1;
      onProgress?.({ loaded, total });
    };
    // A failed asset shouldn't block the scene — count it done and let the live sprite fall back.
    return Promise.all(urls.map((url) => loadTexture(url).then(done, done))).then(() => undefined);
  };

  return {
    scene,
    camera,
    render,
    preload,
    unmount: () => {
      unsub();
      for (const t of tracked.values()) disposeTracked(t);
      for (const t of exiting) disposeTracked(t);
      for (const g of crossfading) {
        scene.remove(g.mesh);
        g.material.dispose();
      }
      veilMaterial.dispose();
      for (const tex of textures.values()) tex.dispose(); // cache owns the textures
      textures.clear();
      tracked.clear();
      exiting.length = 0;
      crossfading.length = 0;
      geometry.dispose();
    },
  };
};
