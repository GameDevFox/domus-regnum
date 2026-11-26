import { Color, DefaultLoadingManager, Vector3 } from "three";

// Colors
export const WHITE = new Color(0xffffff);
export const BLACK = new Color(0x0);

// Vectors
export const ZERO = new Vector3();

// DefaultLoadingManager.onStart = (url, loaded, total) => {
//   console.log("START", url, loaded, total);
// };

// DefaultLoadingManager.onProgress = (url, loaded, total) => {
//   console.log("PROGRESS", url, loaded, total);
// };

// DefaultLoadingManager.onLoad = () => {
//   console.log("ON_LOAD");
// };

DefaultLoadingManager.onError = (url) => {
  console.error("Error loading: ", url);
};

// TODO: Implement URL Modifier in DefaultLoadingManager?
// https://threejs.org/docs/?q=Loading#api/en/loaders/managers/LoadingManager

