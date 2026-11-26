import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { defaultKinds } from "../../parametric/kinds";
import { EvaluatedDoc } from "../../parametric/evaluate";
import { Frame, ParametricDoc } from "../../parametric/types";

// Frame gizmos (slice 1 of docs/design/14-component-outputs.md): while the selected node's
// kind outputs frames, draw each as a small dot + a facing tick in the viewport — frames need
// to be SEEN to be trusted. The lightest believable rendering; an up-tick joins when frames
// start carrying explicit `up`s.

const DOT = new SphereGeometry(0.05, 12, 8);
const MAT = new MeshBasicMaterial({ color: 0xc97b9d, depthTest: false }); // the frame socket pink
const LINE_MAT = new LineBasicMaterial({ color: 0xc97b9d, depthTest: false });
const TICK = 0.35; // facing tick length, meters

const isFrame = (v: unknown): v is Frame =>
  !!v && Array.isArray((v as Frame).pos) && Array.isArray((v as Frame).facing);

export const mountFrameGizmos = (
  scope: Scope,
  scene: Scene,
  doc: Value<ParametricDoc>,
  evaluated: EvaluatedDoc,
  selectedNode: Value<string | null>,
  render: () => void,
): void => {
  const group = new Group();
  group.renderOrder = 999; // overlay — draws over the level like the highlights do
  scene.add(group);
  scope.add(() => {
    scene.remove(group);
    group.clear();
  });

  scope.effect((use) => {
    const d = use(doc); // re-run on any doc change (outputs may have re-derived)
    const id = use(selectedNode);
    group.clear();

    const node = id ? d.nodes.find((n) => n.id === id) : undefined;
    const kind = node && defaultKinds[node.kind];
    if (id && kind) {
      const outputs = evaluated.outputs(id);
      Object.entries(kind.outputs).forEach(([name, spec]) => {
        if (spec.type !== "frame" && spec.type !== "frames") return;
        const value = outputs?.[name] && use(outputs[name]);
        const frames = (Array.isArray(value) ? value : [value]).filter(isFrame);
        frames.forEach((f) => {
          const pos = new Vector3(...f.pos);
          const dot = new Mesh(DOT, MAT);
          dot.position.copy(pos);
          group.add(dot);
          const tip = pos.clone().addScaledVector(new Vector3(...f.facing).normalize(), TICK);
          group.add(new Line(new BufferGeometry().setFromPoints([pos, tip]), LINE_MAT));
        });
      });
    }
    render();
  });
};
