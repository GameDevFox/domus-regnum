import { useEffect, useRef } from "react";
import type { WebGLRenderer } from "three";

// The minimal contract a <ThreeView> needs: a canvas to mount, and an optional resize hook.
// Any app (Builder-assembled or otherwise) that exposes these can be rendered.
export type ThreeApp = {
  renderer: WebGLRenderer;
  resize?: (width: number, height: number) => void;
};

export type ThreeAppFactory<T extends ThreeApp = ThreeApp> = () => T | Promise<T>;

// One persistent app instance per factory *reference*, keyed in a WeakMap — so an app (its
// canvas, GPU resources, and state) survives React mount/unmount and is reused if the same
// factory mounts again. Pass a STABLE factory (a module-level const), not an inline arrow,
// or each render would build a new app. GC'd once the factory is no longer referenced.
const instances = new WeakMap<ThreeAppFactory, Promise<ThreeApp>>();
// The same instance, cached SYNCHRONOUSLY once its promise resolves, so a remount can read it
// without a render that sees `null`. (`getInstance` always resolves on a microtask, so without this
// every remount flashes one null render — which collapses a panel's layout and shifts the page.)
const resolved = new WeakMap<ThreeAppFactory, ThreeApp>();

export const getInstance = <T extends ThreeApp>(factory: ThreeAppFactory<T>): Promise<T> => {
  let instance = instances.get(factory) as Promise<T> | undefined;
  if (!instance) {
    instance = Promise.resolve(factory());
    instances.set(factory, instance);
    void instance.then((inst) => resolved.set(factory, inst));
  }
  return instance;
};

// The resolved instance if it's already available, else null. Lets a remounting consumer render the
// app on its first frame instead of null-then-app.
export const getResolvedInstance = <T extends ThreeApp>(factory: ThreeAppFactory<T>): T | null =>
  (resolved.get(factory) as T | undefined) ?? null;

// Reusable: renders any ThreeApp's canvas, attaching it on mount and detaching (never
// disposing) on unmount — so React can tear it down and remount it freely. Multiple
// <ThreeView>s with different `app` factories each render their own independent scene.
export const ThreeView = ({
  app,
  className,
}: {
  app: ThreeAppFactory;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let detach: (() => void) | null = null;

    void getInstance(app).then((inst) => {
      if (cancelled) return;
      el.appendChild(inst.renderer.domElement);

      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (w > 0 && h > 0) inst.resize?.(w, h);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(el);

      detach = () => {
        observer.disconnect();
        inst.renderer.domElement.remove(); // detach only — never dispose
      };
    });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [app]);

  return <div ref={ref} className={className ?? "three-view"} />;
};
