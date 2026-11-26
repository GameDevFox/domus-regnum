import { Material, Mesh, Object3D } from "three";

// Recursively dispose the GPU resources (geometry + material(s)) of an Object3D subtree. Call this
// when removing a block from the scene so swapping levels / live-editing doesn't leak buffers.
// Lights and bare Groups have nothing to dispose; the optional chaining skips them.
export const disposeDeep = (obj: Object3D): void => {
  obj.traverse((node) => {
    const mesh = node as Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose?.();
  });
};
