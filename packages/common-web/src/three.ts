import { Texture, TextureLoader } from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const gltfLoader = new GLTFLoader();
export const textureLoader = new TextureLoader();

export const loadTexture = (url: string, onProgress?: (event: ProgressEvent) => void) => {
  return new Promise<Texture>((resolve, reject) => {
    textureLoader.load(
      url,
      resolve,
      onProgress,
      reject,
    );
  });
};

export const loadGLTF = (url: string, onProgress?: (event: ProgressEvent) => void) => {
  return new Promise<GLTF>((resolve, reject) => {
    gltfLoader.load(
      url,
      resolve,
      onProgress ? onProgress : () => {},
      reject,
    );
  });
};
