import { useEffect, useState, useSyncExternalStore } from "react";

import { Value, peek } from "../value";
import {
  getInstance,
  getResolvedInstance,
  type ThreeApp,
  type ThreeAppFactory,
} from "./three-view";

// Resolves an app instance (from the shared per-factory registry) into React state, so a
// control panel can reach the same app a <ThreeView> renders. Seeds initial state from the
// synchronous resolved cache so a REMOUNT (e.g. switching back to a tab) renders the app on its
// first frame — no null-render flash that would collapse the panel's layout and shift the page.
export const useApp = <T extends ThreeApp>(factory: ThreeAppFactory<T>): T | null => {
  const [app, setApp] = useState<T | null>(() => getResolvedInstance(factory));
  useEffect(() => {
    if (app) return; // already resolved (cache hit) — nothing to wait for
    let cancelled = false;
    void getInstance(factory).then((a) => {
      if (!cancelled) setApp(a);
    });
    return () => {
      cancelled = true;
    };
  }, [factory, app]);
  return app;
};

// Bridges a three-scratch Value into React render via the proper external-store API.
export const useValue = <T,>(value: Value<T>): T =>
  useSyncExternalStore(value._subscribe, () => peek(value));
