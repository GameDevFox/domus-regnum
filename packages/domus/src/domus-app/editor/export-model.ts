import { Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Export a Three subtree as a binary glTF (.glb) download — the whole authored room as one
// shareable model (opens in Blender, three.js viewers, Windows 3D Viewer, …). Binary keeps it
// a single file (geometry + materials + embedded textures); other formats (OBJ, zipped .gltf)
// can hang off this seam later if needed.
export const exportGlb = (root: Object3D, filename: string): Promise<void> =>
  new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (result) => {
        const blob =
          result instanceof ArrayBuffer
            ? new Blob([result], { type: "model/gltf-binary" })
            : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      reject,
      { binary: true },
    );
  });
