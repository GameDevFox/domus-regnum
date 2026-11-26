import { Object3D } from "three";

import { Scope } from "./scope";
import { UsedAs, Value } from "./value";

// Any Three node we can parent into (Scene, Group, …). props stays `any` — the registry
// holds entries for many component types with different prop shapes.
type Parent = Object3D;

type Entry = {
  scope: Scope;
  props: any;
  output: { mesh: Object3D };
  parent: Parent;
  // The scope this instance's lifetime is tied to (its parent component's scope),
  // or undefined for a detached root. swap() recreates the new scope under it so
  // teardown still cascades from the parent.
  parentScope?: Scope;
};

// Options for `each`. `key` gives items a stable identity for keyed reconciliation: slots
// survive insertion/removal/reorder, with their item AND index Values updated in place.
// Without it, slots are index-keyed — an insertion/removal rewrites every later slot's item.
export type EachOptions<T> = {
  key?: (item: T, index: number) => string | number;
};

// The attach API for one (scope, parent) pair — the ways to put children under a parent:
//   add  — mount one child now
//   when — mount one child while a condition is truthy
//   each — mount one reconciled child per item of a reactive list
// `parent` is the bound parent node and `scope` the bound scope, exposed so when/each
// builds can reach them (e.g. scope.computed). (children() also returns `parent` directly.)
export type Children<Root extends Parent = Parent> = {
  parent: Root;
  scope: Scope;
  add: <P, O extends { mesh: Object3D }>(factory: (scope: Scope, props: P) => O, props: P) => O;
  when: (cond: UsedAs<unknown>, build: (children: Children) => void) => void;
  // Mount exactly one branch keyed by a discriminant Value (the multi-way `when` — camera
  // modes, tool states). Switching keys tears the old branch down and builds the new one;
  // an unlisted key mounts nothing. Same synchronous mount semantics as when().
  match: <K extends string>(
    value: UsedAs<K>,
    branches: Partial<Record<K, (children: Children) => void>>,
  ) => void;
  each: <T>(
    list: UsedAs<T[]>,
    build: (
      children: Children,
      item: Value<T>,
      index: Value<number>,
      count: Value<number>,
    ) => void,
    opts?: EachOptions<T>,
  ) => void;
};

// The loosest factory shape the registry stores — a component of ANY prop type.
// (Entries for many component types share one map, so props degrade to `any` here.)
type AnyFactory = (scope: Scope, props: any) => { mesh: Object3D };

// Keyed by factory function reference — no URLs, no strings.
// WeakMap lets old factory versions be GC'd once no module holds a reference to them.
const _entries = new WeakMap<AnyFactory, Entry[]>();

const addEntry = (factory: AnyFactory, entry: Entry): void => {
  if (!_entries.has(factory)) _entries.set(factory, []);
  const arr = _entries.get(factory)!;
  arr.push(entry);
  entry.scope.add(() => {
    const i = arr.indexOf(entry);
    if (i >= 0) arr.splice(i, 1);
  });
};

// Builds a component instance, adds its mesh to the parent, and registers it so it
// can be hot-swapped in place. Pass `parentScope` to tie the instance's lifetime to
// its parent component (nested children); omit it for a detached root.
export const mount = <P, O extends { mesh: Object3D }>(
  factory: (scope: Scope, props: P) => O,
  props: P,
  parent: Parent,
  parentScope?: Scope,
): O => {
  const scope = parentScope ? parentScope.child() : Scope();
  const output = factory(scope, props);
  parent.add(output.mesh);
  scope.add(() => parent.remove(output.mesh));
  addEntry(factory, { scope, props, output, parent, parentScope });
  return output;
};

// Builds the attach API object for a (scope, parent) pair. Internal — public `children`
// wraps it, and when/each recurse through it for nested per-run / per-item scopes.
const makeChildren = <Root extends Parent>(scope: Scope, parent: Root): Children<Root> => ({
  parent,
  scope,

  add: (factory, props) => mount(factory, props, parent, scope),

  // Conditional mount: present while `cond` is truthy. Built on effect's per-run scope,
  // so the child is torn down when cond flips false (or on teardown). The build receives
  // a nested attach API bound to that per-run scope.
  //
  // The condition is coerced through a boolean computed first, so the child only rebuilds
  // on truthiness TRANSITIONS — a cond that fires repeated truthy values (a computed
  // minting fresh objects) can't churn the mount.
  when: (cond, build) => {
    const truthy = scope.computed((use) => !!use(cond));
    scope.effect((use, runScope) => {
      if (!use(truthy)) return;
      build(makeChildren(runScope, parent));
    });
  },

  // One branch per key; the effect re-runs only when the KEY changes (the computed's
  // Object.is guard absorbs same-key refires), tearing down the old branch's per-run scope.
  match: <K extends string>(
    value: UsedAs<K>,
    branches: Partial<Record<K, (children: Children) => void>>,
  ) => {
    const key = scope.computed((use) => use(value));
    scope.effect((use, runScope) => {
      const build = branches[use(key)];
      if (build) build(makeChildren(runScope, parent));
    });
  },

  // Reactive list: one reconciled child per item — our take on Fusion's ForValues/ForPairs.
  // Surviving slots are reused (their item/index Values updated in place, so dependent
  // effects react without a teardown); new slots are built, dropped slots cleaned up.
  // `count` is the live length. Dropped slots are torn down BEFORE count/survivors update,
  // so nothing alive ever observes a transient length.
  //
  // Default is index-keyed (slot i is item i — an insertion/removal rewrites every later
  // slot). Pass opts.key for keyed reconciliation: slots survive insertion/removal/reorder
  // and only genuinely new/removed items build/tear down — essential when items carry
  // expensive output (meshes) and the list is edited, not just appended.
  each: <T>(
    list: UsedAs<T[]>,
    build: (
      children: Children,
      item: Value<T>,
      index: Value<number>,
      count: Value<number>,
    ) => void,
    opts: EachOptions<T> = {},
  ) => {
    type Slot = { scope: Scope; item: Value<T>; index: Value<number> };
    const count = Value(0);
    const { key } = opts;

    const makeSlot = (value: T, i: number): Slot => {
      const itemScope = Scope();
      const item = Value(value);
      const index = Value(i);
      build(makeChildren(itemScope, parent), item, index, count);
      return { scope: itemScope, item, index };
    };

    if (!key) {
      const slots: Slot[] = [];
      scope.effect((use) => {
        const arr = use(list);
        for (let i = slots.length - 1; i >= arr.length; i--) {
          slots[i].scope.cleanup();
          slots.pop();
        }
        count.set(arr.length);
        for (let i = 0; i < arr.length; i++) {
          if (i < slots.length) slots[i].item.set(arr[i]); // reuse — update in place
          else slots.push(makeSlot(arr[i], i));
        }
      });
      scope.add(() => slots.forEach((s) => s.scope.cleanup()));
      return;
    }

    // Keyed. Duplicate keys are disambiguated by occurrence, so the n-th duplicate of a
    // key pairs with the n-th duplicate from the previous run.
    let slots = new Map<string | number, Slot>();
    scope.effect((use) => {
      const arr = use(list);
      const seen = new Map<string | number, number>();
      const keys = arr.map((item, i) => {
        const k = key(item, i);
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        return n === 0 ? k : `${String(k)}\u0000${n}`;
      });
      const keep = new Set(keys);
      slots.forEach((slot, k) => {
        if (!keep.has(k)) slot.scope.cleanup();
      });
      count.set(arr.length);
      const next = new Map<string | number, Slot>();
      for (let i = 0; i < arr.length; i++) {
        const existing = slots.get(keys[i]);
        if (existing) {
          existing.item.set(arr[i]);
          existing.index.set(i);
          next.set(keys[i], existing);
        } else {
          next.set(keys[i], makeSlot(arr[i], i));
        }
      }
      slots = next;
    });
    scope.add(() => slots.forEach((s) => s.scope.cleanup()));
  },
});

// Composes children under `parent`: runs `build` with the attach API (add/when/each),
// then returns `parent` — so a component can `new Group()` inline and return it in one
// expression. Every child mounted is registered (independently hot-swappable) and torn
// down with `scope`.
export const children = <Root extends Parent>(
  scope: Scope,
  parent: Root,
  build?: (children: Children<Root>) => void,
): Root => {
  build?.(makeChildren(scope, parent));
  return parent;
};

// Called by the plugin-injected accept block: swap(oldFactory, newFactory).
// Replaces every live instance of oldFactory in place — same parent, same props,
// same parent scope — without touching anything else in the tree. A swap for a
// factory with no live entries (e.g. a composed-but-never-mounted helper) no-ops.
export const swap = (oldFactory: AnyFactory, newFactory: AnyFactory): void => {
  const arr = _entries.get(oldFactory);
  if (!arr?.length) return;

  [...arr].forEach((entry) => {
    // New instance first (it adds itself to the parent), then tear down the old —
    // so the parent never momentarily loses the child.
    const newScope = entry.parentScope ? entry.parentScope.child() : Scope();
    const newOutput = newFactory(newScope, entry.props);
    entry.parent.add(newOutput.mesh);
    newScope.add(() => entry.parent.remove(newOutput.mesh));

    // Remove before cleanup so the deregister task is a no-op.
    const i = arr.indexOf(entry);
    if (i >= 0) arr.splice(i, 1);
    entry.scope.cleanup();

    addEntry(newFactory, {
      scope: newScope,
      props: entry.props,
      output: newOutput,
      parent: entry.parent,
      parentScope: entry.parentScope,
    });
  });
};

export const setupHMR = (): void => {
  // Wire the global the plugin-injected accept blocks call. Set unconditionally (no
  // `import.meta.hot` guard) so this stays plain ESM — testable under babel/jest, and a
  // no-op in production builds where no accept blocks exist to use it.
  (globalThis as any).__kitsune_hmr = swap;
};
