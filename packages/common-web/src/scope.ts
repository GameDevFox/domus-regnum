import { UsedAs, Value, ValueOptions, isValue, peek } from "./value";

// Anything with a dispose() — geometries, materials, textures, render targets, controls…
export type Disposable = { dispose: () => void };

export type Scope = {
  add: (cleanup: () => void) => void;
  // Disposes the given resources on cleanup — the one-liner for the GPU-resource teardown
  // every leaf component needs: `scope.own(geom, mat, tex)`. Returns the first argument so
  // a resource can be created-and-owned in one expression.
  own: <D extends Disposable>(first: D, ...rest: Disposable[]) => D;
  cleanup: () => void;
  // Creates a child scope whose cleanup is registered in this scope.
  // Use when a component creates sub-components that should be independently
  // swappable but must always be torn down when the parent is.
  child: () => Scope;
  // Registers a DOM event listener and removes it on cleanup. The handler keeps its
  // own type at the call site; `event` is loose here since the event map depends on
  // the target (full addEventListener overloads aren't worth it for this helper).
  listen: (
    target: EventTarget,
    type: string,
    handler: (event: any) => void,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  // Runs fn immediately and re-runs it whenever a Value read via use() changes.
  // fn receives a per-run `runScope`, cleaned up before each re-run (and on teardown).
  // Subscriptions are released when this scope is cleaned up.
  effect: (fn: (use: <T>(v: UsedAs<T>) => T, runScope: Scope) => void) => void;
  // Derives a new Value from other Values, recomputing whenever its dependencies change.
  // Pass opts.equals for object results (e.g. fresh Vector3s) so numerically-identical
  // recomputes don't fire downstream effects.
  computed: <T>(
    fn: (use: <U>(v: UsedAs<U>) => U, runScope: Scope) => T,
    opts?: ValueOptions<T>,
  ) => Value<T>;
};

// Cleanup tasks run in reverse order so dependents are torn down before dependencies.
// A cleaned-up scope is permanently DISPOSED: late add()s run immediately (so an async
// load resolving after teardown can't leak its resources), late effects run once without
// subscribing, and children are born disposed.
export const Scope = (): Scope => {
  const tasks: Array<() => void> = [];
  let disposed = false;

  const cleanup = () => {
    if (disposed) return; // re-entrant-safe: a cleanup task that synchronously triggers a
    // still-subscribed effect (e.g. an end-state write observed by a watcher that calls
    // cleanup again) must not re-run the task list mid-sweep — the teardowns would never finish.
    disposed = true;
    for (let i = tasks.length - 1; i >= 0; i--) tasks[i]();
    tasks.length = 0;
  };

  const scope: Scope = {
    add: (fn) => {
      if (disposed) {
        fn(); // too late to defer — release the resource now rather than never
        return;
      }
      tasks.push(fn);
    },

    own: (first, ...rest) => {
      scope.add(() => {
        first.dispose();
        rest.forEach((d) => d.dispose());
      });
      return first;
    },

    cleanup,

    child: () => {
      const childScope = Scope();
      if (disposed) {
        childScope.cleanup(); // born disposed — its adds run immediately too
        return childScope;
      }
      const task = childScope.cleanup;
      tasks.push(task);
      // An early-cleaned child removes its slot here, so a long-lived parent doesn't
      // accumulate dead closures across mount/unmount churn. (Reverse-order iteration
      // in cleanup() is unaffected: the splice only ever removes the current index.)
      childScope.add(() => {
        const i = tasks.indexOf(task);
        if (i >= 0) tasks.splice(i, 1);
      });
      return childScope;
    },

    listen: (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      scope.add(() => target.removeEventListener(type, handler, options));
    },

    effect: (fn) => {
      if (disposed) {
        // Run once so the caller's resources are created-and-immediately-released
        // (every add() on the born-disposed runScope fires inline) — never subscribe.
        fn(<T>(v: UsedAs<T>): T => peek(v), scope.child());
        return;
      }

      const subs = new Map<Value<any>, () => void>();
      let reads = new Set<Value<any>>();
      let runScope: Scope | undefined;
      let dead = false;

      const use = <T>(v: UsedAs<T>): T => {
        if (isValue(v)) {
          reads.add(v);
          if (!subs.has(v)) subs.set(v, v._subscribe(run));
        }
        return peek(v);
      };

      const run = () => {
        if (dead) return; // a batch()-deferred notification can arrive after teardown
        runScope?.cleanup();
        runScope = Scope();
        reads = new Set();
        fn(use, runScope);
        // Re-track: drop subscriptions to Values this run didn't read, so an effect with
        // branchy reads (or re-wired props) doesn't keep reacting to stale dependencies.
        subs.forEach((unsub, v) => {
          if (!reads.has(v)) {
            unsub();
            subs.delete(v);
          }
        });
      };
      run();

      scope.add(() => {
        dead = true;
        subs.forEach((u) => u());
        subs.clear();
        runScope?.cleanup();
      });
    },

    computed: <T>(
      fn: (use: <U>(v: UsedAs<U>) => U, runScope: Scope) => T,
      opts?: ValueOptions<T>,
    ): Value<T> => {
      let result: Value<T> | undefined;
      scope.effect((use, runScope) => {
        const val = fn(use, runScope);
        if (!result) result = Value(val, opts);
        else result.set(val);
      });
      return result!; // safe — effect runs fn synchronously on first call
    },
  };

  return scope;
};
