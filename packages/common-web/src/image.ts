import { Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture, TextureLoader } from "three";

const textureLoader = new TextureLoader();

// TODO: Pass in texture instead of url
export const Image = (url: string) => {
  const geometry = new PlaneGeometry();

  let texture: Texture | undefined = undefined;

  // TODO: Replace this with a preloaded texture
  const texturePromise = new Promise<Texture>((resolve, reject) => {
    texture = textureLoader.load(
      url,
      resolve,
      () => {}, // onProgress
      reject
    );
    texture.colorSpace = SRGBColorSpace;
  });
  if(texture === undefined)
    throw Error("Failed to resolve texture");

  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(geometry, material);

  return { geometry, material, mesh, texturePromise };
}
