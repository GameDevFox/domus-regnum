import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

import { HUMAN_WALK_ACCEL, HUMAN_WALK_SPEED } from "@kitsune/common";
import type { ThreeApp } from "@kitsune/common-web/src/react";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { disposeDeep } from "../blocks/dispose";

import { Agent } from "../world/agent";
import { buildTwoFloorNav } from "../world/floors-nav";
import { buildGridNav } from "../world/grid-nav";
import { Bin, CAPACITY, HaulAgent, HaulWorld, Item } from "../world/haul";
import { NavMesh } from "../world/navmesh";
import { Frame, recordTimeline } from "../world/timeline";
import { World, randomDestination } from "../world/world";

import { OrbitControls } from "../domus/orbit-controls";

import { LoadSession, runInitialLoad } from "./load-session";
import { shiftToZoom } from "./shift-to-zoom";

// A top-down debug visualizer for the headless agent sim. It records a deterministic timeline up
// front; a `frame` Value (driven by a slider / play button) scrubs through it. `loadScenario`
// swaps in a different setup at runtime — rebuilding the graph wireframe, agents, and timeline.
export type PathDebugApp = ThreeApp & {
  frame: Value<number>;
  frameCount: Value<number>; // length of the loaded timeline (haul runs record until clean)
  loadScenario: (index: number, seed?: string) => void;
  currentScenario: number;
  currentSeed: string;
  perspective: Value<boolean>; // true = perspective camera (default), false = orthographic
  loading: Value<LoadSession | null>;
};

// Each scenario is a different agent-sim setup the dropdown can load.
export type ScenarioConfig = {
  id: string;
  name: string;
  agents: number;
  seed: string; // default seed text (user-overridable in the UI)
  dt: number; // sim-seconds per frame
  frames: number; // recorded ticks (cap; haul scenarios stop early once the room is clean)
  buildNav: () => NavMesh; // the world to path on (flat grid, multi-floor, …)
  trash?: { items: number; bins: number }; // present => "haul" scenario (trash -> bins) vs wander
};

export const scenarios: ScenarioConfig[] = [
  { id: "grid", name: "Grid — 8×8 · 4 agents", agents: 4, seed: "domus", dt: 0.1, frames: 300, buildNav: () => buildGridNav(8, 8, 1) },
  { id: "crowd", name: "Crowd — 12×12 · 14 agents", agents: 14, seed: "domus", dt: 0.1, frames: 400, buildNav: () => buildGridNav(12, 12, 1) },
  { id: "corridor", name: "Corridor — 18×5 · 6 agents", agents: 6, seed: "domus", dt: 0.1, frames: 350, buildNav: () => buildGridNav(18, 5, 1) },
  { id: "floors", name: "Two Floors — ramp · 10 agents", agents: 10, seed: "domus", dt: 0.1, frames: 420, buildNav: () => buildTwoFloorNav(7, 7, 2.5, 1) },
  { id: "trash", name: "Trash Day — 10×10 · 6 agents · 30 trash", agents: 6, seed: "domus", dt: 0.1, frames: 2000, buildNav: () => buildGridNav(10, 10, 1), trash: { items: 30, bins: 3 } },
];

const COLORS = [
  "#ff5252", "#40c4ff", "#69f0ae", "#ffd740", "#e040fb", "#ff6e40", "#18ffff",
  "#b2ff59", "#f48fb1", "#9fa8da", "#ffab40", "#80d8ff", "#ff8a80", "#ccff90",
];

// A real seedable PRNG keyed by any string: xmur3 hashes the seed text into a 32-bit state, then
// mulberry32 generates the stream. Same seed text -> identical run, every time.
const seededRng = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type ScenarioData = { mesh: NavMesh; timeline: Frame[]; bins: Bin[] };

// Pick `count` distinct random items (seeded) via a partial Fisher–Yates shuffle.
const pickDistinct = <T>(items: T[], count: number, rng: () => number): T[] => {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
};

const buildScenario = (config: ScenarioConfig, seed: string): ScenarioData => {
  const mesh = config.buildNav();
  const { nav } = mesh;
  // One PRNG stream seeds everything (placement + choices) for a reproducible run.
  const rng = seededRng(seed);

  if (config.trash) {
    // Haul scenario: scatter bins, trash, and agents across distinct seeded nodes; record the run
    // until the room is clean.
    const picked = pickDistinct(nav.nodeIds, config.trash.bins + config.trash.items + config.agents, rng);
    let k = 0;
    const bins: Bin[] = Array.from({ length: config.trash.bins }, (_, i) => {
      const n = picked[k++];
      return { id: `bin${i}`, node: n, position: nav.positionOf(n) };
    });
    const items: Item[] = Array.from({ length: config.trash.items }, (_, i) => {
      const n = picked[k++];
      return { id: `t${i}`, node: n, position: nav.positionOf(n), state: "loose", carrier: null };
    });
    const agents = Array.from({ length: config.agents }, (_, i) => {
      const n = picked[k++];
      return HaulAgent({ id: `a${i}`, location: n, position: nav.positionOf(n), speed: HUMAN_WALK_SPEED, accel: HUMAN_WALK_ACCEL });
    });
    const world = HaulWorld({ nav, agents, items, bins, capacity: CAPACITY });
    const timeline = recordTimeline({ world, dt: config.dt, frames: config.frames, until: () => world.done() });
    return { mesh, timeline, bins };
  }

  // Wander scenario.
  const starts = pickDistinct(nav.nodeIds, config.agents, rng);
  const agents = starts.map((n, i) =>
    Agent({ id: `a${i}`, location: n, position: nav.positionOf(n), speed: 1.4 }),
  );
  const world = World({ nav, agents, chooseDest: randomDestination(nav, rng) });
  const timeline = recordTimeline({ world, dt: config.dt, frames: config.frames });
  return { mesh, timeline, bins: [] };
};

export const pathDebugApp = (): PathDebugApp => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 480;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x10141a, 1);

  const scene = new Scene();
  const worldGroup = new Group(); // everything scenario-specific lives here, cleared on reload
  scene.add(worldGroup);

  // Two cameras the user can toggle between (perspective is the default). Both are kept positioned
  // along the same view direction, so switching just swaps the projection.
  const orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const perspCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
  let camera: OrthographicCamera | PerspectiveCamera = perspCamera;

  const render = () => renderer.render(scene, camera);

  // Blender-style, matching the Builder: RIGHT-drag orbits, Ctrl/Cmd+RIGHT pans; zoom is Shift+Scroll
  // (plain scroll scrolls the page). MIDDLE disabled (middle-drag = autoscroll on Firefox/Linux).
  const controls = new OrbitControls(camera);
  controls.enableDamping = false;
  controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
  controls.connect(renderer.domElement);
  shiftToZoom(controls);
  controls.addEventListener("change", render);

  // Per-scenario state — reassigned on each load.
  let timeline: Frame[] = [];
  let pathLines: Line[] = [];
  let markers: Mesh[] = [];
  let itemMarkers: Mesh[] = [];
  let viewRadius = 5;
  let viewW = canvas.width;
  let viewH = canvas.height;
  let currentIndex = 0;
  let currentSeed = scenarios[0].seed;
  const center = new Vector3();
  const cameraOffsetDir = new Vector3(0, 1, 0); // direction from target to camera (set per scenario)

  // Place both cameras along the scenario's view direction at a distance that frames it. The ortho
  // camera ignores distance (it sizes via its frustum); the perspective camera relies on it.
  const positionCameras = () => {
    const fov = (perspCamera.fov * Math.PI) / 180;
    const dist = (viewRadius / Math.tan(fov / 2)) * 1.3;
    const pos = center.clone().addScaledVector(cameraOffsetDir, dist);
    perspCamera.position.copy(pos);
    orthoCamera.position.copy(pos);
    controls.target.copy(center);
    controls.update();
  };

  const fitCamera = (width: number, height: number) => {
    const aspect = width / height;
    const halfH = Math.max(viewRadius, viewRadius / aspect);
    const halfW = halfH * aspect;
    orthoCamera.left = -halfW;
    orthoCamera.right = halfW;
    orthoCamera.top = halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.updateProjectionMatrix();
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();
  };

  const resize = (width: number, height: number) => {
    viewW = width;
    viewH = height;
    renderer.setSize(width, height, false);
    fitCamera(width, height);
    render();
  };

  const applyFrame = (f: number) => {
    const snap = timeline[f];
    if (!snap) return;
    snap.agents.forEach((s, i) => {
      markers[i].position.copy(s.position);
      const line = pathLines[i];
      if (s.path.length >= 2) {
        line.visible = true;
        line.geometry.dispose();
        line.geometry = new BufferGeometry().setFromPoints(s.path);
      } else {
        line.visible = false;
      }
    });
    snap.items.forEach((s, i) => {
      const m = itemMarkers[i];
      if (s.state === "binned") m.visible = false;
      else {
        m.visible = true;
        m.position.copy(s.position);
      }
    });
  };

  const clearWorld = () => {
    worldGroup.children.forEach(disposeDeep);
    worldGroup.clear();
    pathLines = [];
    markers = [];
    itemMarkers = [];
  };

  const frame = Value(0);
  const frameCount = Value(1);
  const perspective = Value(true);

  const loadScenario = (index: number, seed: string = scenarios[index].seed) => {
    currentIndex = index;
    currentSeed = seed;
    const config = scenarios[index];
    const data = buildScenario(config, seed);
    timeline = data.timeline;
    frameCount.set(timeline.length);
    const { nodes, edges } = data.mesh;

    clearWorld();

    // Graph wireframe + node dots.
    const edgePoints: Vector3[] = [];
    edges.forEach(([a, b]) => edgePoints.push(nodes[a], nodes[b]));
    worldGroup.add(
      new LineSegments(
        new BufferGeometry().setFromPoints(edgePoints),
        new LineBasicMaterial({ color: 0x333a45 }),
      ),
    );
    worldGroup.add(
      new Points(
        new BufferGeometry().setFromPoints(nodes),
        new PointsMaterial({ color: 0x55606e, size: 4, sizeAttenuation: false }),
      ),
    );

    // Direction arrows on one-way edges (a cone at the midpoint pointing a -> b). Bidirectional
    // edges (their reverse is also present) get none, so flat grids and the two-way floors stay
    // arrow-free; only the one-way ramp lanes are marked.
    if (data.mesh.oriented) {
      const directed = new Set(edges.map(([a, b]) => `${a}->${b}`));
      const arrowGeo = new ConeGeometry(0.07, 0.2, 8);
      const arrowMat = new MeshBasicMaterial({ color: 0x9aa3b0 });
      const up = new Vector3(0, 1, 0);
      edges.forEach(([a, b]) => {
        if (directed.has(`${b}->${a}`)) return; // two-way pair — no arrow
        const cone = new Mesh(arrowGeo, arrowMat);
        cone.position.copy(nodes[a]).lerp(nodes[b], 0.5);
        cone.quaternion.setFromUnitVectors(up, nodes[b].clone().sub(nodes[a]).normalize());
        worldGroup.add(cone);
      });
    }

    // Per-agent path line + marker.
    const agentCount = timeline[0].agents.length;
    for (let i = 0; i < agentCount; i++) {
      const color = new Color(COLORS[i % COLORS.length]);
      const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color }));
      line.frustumCulled = false; // geometry changes as we scrub — skip stale-bounds culling
      pathLines.push(line);
      worldGroup.add(line);
      const marker = new Mesh(new SphereGeometry(0.16, 16, 12), new MeshBasicMaterial({ color }));
      markers.push(marker);
      worldGroup.add(marker);
    }

    // Bins (static, green) and trash items (beige; positioned per frame, hidden once binned).
    const binGeo = new BoxGeometry(0.4, 0.4, 0.4);
    const binMat = new MeshBasicMaterial({ color: 0x3ddc84 });
    data.bins.forEach((bin) => {
      const m = new Mesh(binGeo, binMat);
      m.position.copy(bin.position);
      worldGroup.add(m);
    });

    const itemCount = timeline[0].items.length;
    const itemGeo = new BoxGeometry(0.18, 0.18, 0.18);
    const itemMat = new MeshBasicMaterial({ color: 0xb0a18f });
    for (let i = 0; i < itemCount; i++) {
      const m = new Mesh(itemGeo, itemMat);
      m.frustumCulled = false; // rides carriers to arbitrary spots — skip stale-bounds culling
      itemMarkers.push(m);
      worldGroup.add(m);
    }

    // Reframe the camera to the navmesh's bounds: near top-down when flat, tilted to an iso angle
    // when there's vertical extent (so stacked floors read as 3D).
    const bounds = new Box3().setFromPoints(nodes);
    const size = bounds.getSize(new Vector3());
    bounds.getCenter(center);
    if (size.y < 0.5) {
      viewRadius = Math.max(size.x, size.z, 1) / 2 + 1;
      cameraOffsetDir.set(0, 10, 2).normalize(); // near top-down, slight tilt
    } else {
      viewRadius = (Math.max(size.x, size.z) * 0.85 + size.y) / 2 + 1.5;
      cameraOffsetDir.set(1, 1, -2.5).normalize(); // iso angle so stacked floors read as 3D
    }
    positionCameras();
    fitCamera(viewW, viewH);

    // Reset playhead and draw frame 0.
    frame.set(0);
    applyFrame(0);
    render();
  };

  const scope = Scope();
  loadScenario(0);

  // Swap the active camera when perspective toggles, preserving the current orbit angle.
  scope.effect((use) => {
    const next = use(perspective) ? perspCamera : orthoCamera;
    next.position.copy(camera.position);
    camera = next;
    controls.object = camera;
    controls.update();
    fitCamera(viewW, viewH);
    render();
  });

  scope.effect((use) => {
    const f = Math.min(Math.max(0, Math.round(use(frame))), timeline.length - 1);
    applyFrame(f);
    render();
  });

  resize(canvas.width, canvas.height);

  // Initial load (mostly a no-op here — the path-debug scene is abstract geometry with no textures —
  // but it pre-warms shaders and proves the loader is reusable across every canvas).
  const loading = Value<LoadSession | null>(null);
  void runInitialLoad(loading, { renderer, scene, camera });

  return {
    renderer,
    resize,
    frame,
    frameCount,
    loadScenario,
    perspective,
    loading,
    get currentScenario() {
      return currentIndex;
    },
    get currentSeed() {
      return currentSeed;
    },
  };
};
