import { DefaultLoadingManager } from "three";

import { Value } from "@kitsune/common-web/src/value";

// Unified bucket-1 (HTTP fetch + decode) state for the whole app. Every TextureLoader / GLTFLoader
// without an explicit manager reports through DefaultLoadingManager — common-web's shared
// `textureLoader` (mascot/icons/floor) and the block textures (wallpaper/wood) all do — so this is
// the single source the load sessions (load-session.ts) observe for download progress.
//
// IMPORTANT: this module must be imported BEFORE the scene's loaders run, so the onStart for the
// very first batch isn't missed. `domus-app/index.ts` imports it on its first line for that reason.
// (Dedicated per-session managers are reserved for future area transitions; the initial loads all
// share the default manager.)

export const httpProgress = Value<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
export const httpLoading = Value(false);

DefaultLoadingManager.onStart = (_url, loaded, total) => {
  httpLoading.set(true);
  httpProgress.set({ loaded, total });
};
DefaultLoadingManager.onProgress = (_url, loaded, total) => httpProgress.set({ loaded, total });
DefaultLoadingManager.onLoad = () => httpLoading.set(false);
// onError is left to domus/constants.ts so we don't clobber its handler.
