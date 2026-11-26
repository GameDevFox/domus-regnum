// AkiRig — the RAW layer: a pure puppet whose props map 1:1 to Three.js state. Each prop directly sets
// what's drawn — `eyes="closed"` shows the closed-eye mesh, full stop; no blink, no talk, no autonomy.
// Deterministic. The behavior layer (`Aki`, aki.ts) drives these Values over time. Mount AkiRig directly
// when you want frame-perfect manual control (scripted animation, an emote sequence); mount Aki for the
// autonomous character. All layers share `PIXELS_PER_UNIT` (layout.ts) so overlays stay on the base's
// pixel grid — no seams. Adapted from workout-waifu's mesh-per-layer + rouge's Godot scene.

import { type BufferGeometry, DoubleSide, Group, type Mesh, type MeshBasicMaterial, Vector3 } from "three";

import { Image, type Scope, type UsedAs } from "@kitsune/common-web";

import { BASE_HEIGHT, BASE_WIDTH, LAYER_BOX, type LayerBox, PIXELS_PER_UNIT } from "./layout";
import { EYES, type EyesName, MOUTHS, type MouthName, POSES, type PoseName } from "./names";

const ASSETS = "/aki";

// Stacking: one layer number drives BOTH renderOrder (alpha-blend order — depthWrite is off) and the
// tiny z offset (keeps raycasts/depth honest), so the two can never drift apart per mesh.
const LAYER = { base: 0, ears: 1, face: 2, glasses: 3, marker: 4 } as const;
const LAYER_Z_STEP = 0.001;

// Every prop is direct: the visible pose/eyes/mouth, the accessory/marker toggles, and the transform.
export type AkiRigProps = {
  pose?: UsedAs<PoseName>;
  eyes?: UsedAs<EyesName>;
  mouth?: UsedAs<MouthName>;
  glasses?: UsedAs<boolean>;
  ears?: UsedAs<boolean>;
  angryMark?: UsedAs<boolean>;
  drop?: UsedAs<boolean>;
  position?: UsedAs<Vector3>;
  scale?: UsedAs<number>;
};

export const AkiRig = (scope: Scope, props: AkiRigProps = {}): { mesh: Group; ready: Promise<void> } => {
  const {
    pose = "relaxed-hands",
    eyes = "open",
    mouth = "closed",
    glasses = false,
    ears = false,
    angryMark = false,
    drop = false,
    position = new Vector3(),
    scale = 1,
  } = props;

  const group = new Group();
  const disposables: { geometry: BufferGeometry; material: MeshBasicMaterial }[] = [];
  const loads: Promise<unknown>[] = []; // texture loads → the `ready` signal (for a loading screen)

  // Place a plane for `box` in the base's pixel space → world units (y flipped for Three's y-up).
  const sizedImage = (box: LayerBox, url: string, layer: number): Mesh => {
    const { geometry, material, mesh, texturePromise } = Image(url);
    loads.push(texturePromise);
    material.transparent = true;
    material.side = DoubleSide;
    material.depthWrite = false; // alpha-blended; order via renderOrder
    const { x, y, width, height } = box;
    mesh.scale.set(width / PIXELS_PER_UNIT, height / PIXELS_PER_UNIT, 1);
    mesh.position.set((-(BASE_WIDTH / 2) + x + width / 2) / PIXELS_PER_UNIT, (BASE_HEIGHT / 2 - y - height / 2) / PIXELS_PER_UNIT, layer * LAYER_Z_STEP);
    mesh.renderOrder = layer;
    disposables.push({ geometry, material });
    group.add(mesh);
    return mesh;
  };
  const layerSet = <N extends string>(names: readonly N[], box: LayerBox, dir: string, layer: number) => {
    const meshes = {} as Record<N, Mesh>;
    names.forEach((name) => {
      const mesh = sizedImage(box, `${ASSETS}/${dir}/${name}.png`, layer);
      mesh.visible = false;
      meshes[name] = mesh;
    });
    return meshes;
  };

  const poseMeshes = layerSet(POSES, LAYER_BOX.base, "poses", LAYER.base);
  const eyeMeshes = layerSet(EYES, LAYER_BOX.eyes, "eyes", LAYER.face);
  const mouthMeshes = layerSet(MOUTHS, LAYER_BOX.mouth, "mouths", LAYER.face);
  const catEars = sizedImage(LAYER_BOX.catEars, `${ASSETS}/other/cat-ears.png`, LAYER.ears);
  const glassesMesh = sizedImage(LAYER_BOX.glasses, `${ASSETS}/other/glasses.png`, LAYER.glasses);
  const angryMarkMesh = sizedImage(LAYER_BOX.angryMark, `${ASSETS}/other/angry-mark.png`, LAYER.marker);
  const dropMesh = sizedImage(LAYER_BOX.drop, `${ASSETS}/other/drop.png`, LAYER.marker);

  // Track which mesh is visible (so we know which to hide) — a rendering detail, NOT intent; the prop is truth.
  const showIn = <N extends string>(meshes: Record<N, Mesh>) => {
    let shown: N | null = null;
    return (n: N) => {
      if (shown) meshes[shown].visible = false;
      meshes[n].visible = true;
      shown = n;
    };
  };
  const showPose = showIn(poseMeshes);
  const showEyes = showIn(eyeMeshes);
  const showMouth = showIn(mouthMeshes);

  // ---- props → scene, direct (one effect each; no timers) ----
  scope.effect((use) => showPose(use(pose)));
  scope.effect((use) => showEyes(use(eyes)));
  scope.effect((use) => showMouth(use(mouth)));
  scope.effect((use) => void (glassesMesh.visible = use(glasses)));
  scope.effect((use) => void (catEars.visible = use(ears)));
  scope.effect((use) => void (angryMarkMesh.visible = use(angryMark)));
  scope.effect((use) => void (dropMesh.visible = use(drop)));
  scope.effect((use) => void group.position.copy(use(position)));
  scope.effect((use) => void group.scale.setScalar(use(scale)));

  scope.add(() =>
    disposables.forEach((d) => {
      d.geometry.dispose();
      d.material.map?.dispose();
      d.material.dispose();
    }),
  );

  return { mesh: group, ready: Promise.all(loads).then(() => undefined) };
};
