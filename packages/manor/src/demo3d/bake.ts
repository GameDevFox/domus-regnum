import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh } from "three";
import type { Material, Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The house is built from a great many small boxes, which is easy to write and slow to draw:
// every box is its own call to the graphics card. Once a part of the house is finished and will
// not move again, all its boxes that share a paint are fused into one shape.

const KEPT = ["position", "normal", "uv"] as const;
/** A shape that carries a colour of its own at each corner keeps it (parts.ts, `tinted`): every shape of its paint does. */
const TINT = "color";

/** The part of a shape that one of its several paints covers, as a shape of its own. */
const slice = (geom: BufferGeometry, start: number, count: number): BufferGeometry => {
  const part = new BufferGeometry();
  for (const name of geom.hasAttribute(TINT) ? [...KEPT, TINT] : KEPT) {
    const attr = geom.getAttribute(name);
    part.setAttribute(name, new Float32BufferAttribute(attr.array.slice(start * attr.itemSize, (start + count) * attr.itemSize), attr.itemSize));
  }
  return part;
};

/**
 * Fuse every mesh under `root` into one mesh per material, in `root`'s own frame. Anything
 * `apart` says yes to is left alone, with all its children: use it for parts that still move.
 */
export const bake = (root: Object3D, apart: (o: Object3D) => boolean = () => false): void => {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const byPaint = new Map<Material, BufferGeometry[]>();
  const fused: Mesh[] = [];
  const add = (paint: Material, geom: BufferGeometry): void => {
    byPaint.set(paint, [...(byPaint.get(paint) ?? []), geom]);
  };
  const visit = (o: Object3D): void => {
    if (o !== root && apart(o)) return;
    if (o instanceof Mesh) {
      const flat: BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      flat.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, o.matrixWorld));
      const paints: Material | Material[] = o.material;
      if (Array.isArray(paints)) {
        for (const g of flat.groups) add(paints[g.materialIndex ?? 0], slice(flat, g.start, g.count));
        flat.dispose();
      } else add(paints, slice(flat, 0, flat.getAttribute("position").count));
      fused.push(o);
    }
    for (const child of [...o.children]) visit(child);
  };
  visit(root);
  for (const mesh of fused) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  for (const [paint, geoms] of byPaint) {
    root.add(new Mesh(mergeGeometries(geoms), paint));
    for (const g of geoms) g.dispose();
  }
};
