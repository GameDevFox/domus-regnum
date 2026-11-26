# Three.js HMR Architecture

Prototyped in `packages/three-scratch`, with the reusable core now promoted to **`@kitsune/common-web`** and consumed by two example apps: `three-scratch` (no React) and `react-scratch` (a React host). The goal: React Fast Refresh-style hot module replacement for Three.js components, with zero per-file boilerplate. Inspired by the [Fusion](https://elttob.uk/Fusion/0.4/) framework (Roblox/Luau).

---

## Where the code lives

The reusable pieces live in **`@kitsune/common-web`** (`packages/common-web/src/`); the example apps consume them through a `@scene-lib` Vite + tsconfig alias that points there (`@scene-lib/scope` → `common-web/src/scope`, etc.).

| Module | Path | Role |
|---|---|---|
| `value` / `scope` | `common-web/src/{value,scope}.ts` | reactive core — lifetime + signals |
| `registry` | `common-web/src/registry.ts` | `mount` / `swap` / the `children` attach API |
| `animate` | `common-web/src/animate.ts` | `spring` / `tween` |
| `debug` | `common-web/src/debug.ts` | opt-in tracing |
| `plugin` | `common-web/src/plugin.ts` | the Vite HMR plugin (build-time) |
| React layer | `common-web/src/react/` | `<ThreeView>` + `useApp`/`useValue` — a separate entry (`@kitsune/common-web/src/react`), kept out of the main barrel so non-React apps don't pull in React |

The reactive core (`value`/`scope`/`registry`/`animate`/`debug`) is also exported from the
**main `@kitsune/common-web` barrel**; only `plugin` (node-only, used in `vite.config.ts`) and the
React layer stay separate entries.

App-specific harness stays in the example apps: `three-scratch/src/lib/app.ts` (`createApp` + multi-pass), and each app's root/components (`app-scene` + components in three-scratch; `make-app` + scenes in react-scratch). Both apps `dedupe: ["three"]` so the lib and the app share one `three` instance (needed for `animate`'s `instanceof Vector3`).

`paths` in this doc are written relative to `common-web/` (or the example app) for brevity.

---

## Two layers

The system is split into two layers, with a one-way dependency graph:

```
value  ←  scope  ←  registry  ←  components
```

- **Scope core** (`scope.ts`, `value.ts`) — lifetime + reactivity. Knows *nothing* about Three.js or HMR. This is why `effect`/`computed` are **methods on `Scope`**: they only need `value`, which `scope.ts` already imports, so the dependency stays `scope → value` (acyclic).
- **Composition layer** (`registry.ts`) — "build scene content": `mount`, `swap`, and the `children` attach API (`add`/`when`/`each`). These are Three/HMR-aware and stay **free functions that take a scope** — putting them on `Scope` would make `scope.ts` import the registry (which imports `scope.ts`) — a cycle, and a layering inversion where the generic lifetime primitive would know about meshes and hot-reload.

The rule of thumb: **a thing is a `Scope` method only if it depends on nothing above `value`** (lifetime + reactivity); anything that builds scene content is a free function that receives a scope. (`each`/`when` strictly need only `scope` + `value`, but they live with `children` in the registry layer because they're part of the same attach API. We also deliberately don't use Fusion's generic `scoped(Fusion)` binder, which would let any function hang off the scope at the cost of heavy generic typing.)

---

## Scope core

### Scope (`common-web/src/scope.ts`)

Lifecycle container **and** reactivity host. Every component gets one. Methods:

- `add(fn)` — register a cleanup task (run in reverse order on `cleanup()`).
- `own(...disposables)` — dispose the given resources (anything with `.dispose()`) on cleanup; returns the first, so a resource can be created-and-owned in one expression. THE way to tear down geometries/materials/textures.
- `cleanup()` — run all cleanup tasks.
- `child()` — a nested scope whose cleanup is registered in this one (cleanup cascades).
- `listen(target, type, handler, opts?)` — add a DOM event listener, auto-removed on cleanup.
- `effect(fn)` — run `fn` now and re-run whenever a `Value` read via `use()` changes.
- `computed(fn, opts?)` — derive a `Value` from other Values, recomputing on dependency change. `opts.equals` (see Value) lets object-valued derivations go quiet when recomputes are structurally identical.

```ts
const scope = Scope();
const geom = scope.own(new BoxGeometry(1, 1, 1));
const mat = scope.own(new MeshStandardMaterial());
scope.listen(window, "resize", onResize);
scope.effect((use) => { mat.color.set(use(color)); });
const doubled = scope.computed((use) => use(n) * 2);
const pos = scope.computed((use) => new Vector3(use(x), 0, 0), { equals: (a, b) => a.equals(b) });
scope.cleanup(); // runs all cleanup tasks in reverse order
```

`effect`/`computed` pass a second argument to their callback — a per-run `runScope`, cleaned up before each re-run (and on teardown). Register run-scoped resources on it with `runScope.add(...)` so they don't pile up on the outer scope across re-runs (Fusion's `Computed(use, scope)` inner-scope pattern). `Arrow` and `children().when` both rely on this.

**Dependencies re-track every run**: after each run, subscriptions to Values the run did *not* read are dropped. An effect with branchy reads (`use(cond) ? use(a) : use(b)`) reacts only to the branch it's currently on — and a prop re-wired to a different Value stops reacting to the old one. (This matches Fusion/Solid semantics.)

**A cleaned-up scope is permanently disposed**: a late `add()` runs its task immediately (so an async load resolving after teardown releases its resources instead of leaking them), a late `effect` runs once without subscribing, and `child()` returns a born-disposed scope. `cleanup()` is the point of no return.

### Value (`common-web/src/value.ts`)

A `Value<T>` is a reactive cell: `peek()` reads, `set(next)` writes (skipped if equal, so it won't notify on no-op writes), `update(fn)` applies `fn` to the current value (atomic read-modify-write), `_subscribe(fn)` registers a listener. The change guard defaults to `Object.is`; pass `Value(initial, { equals })` for a structural comparison — an "equal" write is dropped entirely (`peek()` keeps the previous instance), which is how object-valued computeds (fresh `Vector3`s per recompute) stop firing downstream at rest.

```ts
const color = Value(0xff4400);
color.set(0x00ff88); // notifies subscribers

const count = Value(0);
count.update((n) => n + 1); // read-modify-write in one step
```

Prefer `update(fn)` over `set(peek() + …)` whenever the next value derives from the current one: the read happens at the moment of the write, so it can't go stale across an `await` (a captured `peek()` can drop interleaved updates). It's a distinct method rather than a `set` overload so it stays unambiguous even for a `Value` whose `T` is itself a function.

**`batch(fn)`** defers notifications until `fn` returns, deduped per listener — a multi-Value edit (e.g. a rect drag updating `w` AND `h`) reaches each effect once with all writes applied, instead of twice with an inconsistent intermediate state. Reads inside the batch see new values immediately; only notification is deferred. Nestable (flushes at the outermost end). The flush runs in *generations* until quiescent: writes made by flushed listeners (computeds propagating) defer into the next generation, deduped again — so a whole derivation chain settles with final consumers seeing exactly one coherent update.

```ts
batch(() => {
  rectW.set(14);
  rectH.set(20);
}); // downstream effects run once, seeing 14×20 — never 14×12
```

`Value` is a **free function**, not a scope method — a Value has no lifetime of its own (its listeners are released from the subscriber side, inside `scope.effect`), so it doesn't belong on a scope.

`UsedAs<T> = T | Value<T>` — a prop accepts either a static constant or a reactive Value, and the consumer doesn't care which: `use(v)` reads it and (only if it's a Value) subscribes. `peek(v)` reads without subscribing.

### frameDelta, spring & tween (`common-web/src/animate.ts`)

**`frameDelta(scope, time, { maxStep? })`** — the per-frame time step as a `Value<number>` (SECONDS), derived from the app's `time` Value. This is the intended way to run per-frame animation: it rides the app clock instead of a private RAF/`performance.now`, so anything built on it follows a virtual clock (pause/advance harnesses) for free, and `maxStep` (default 0.05 s) keeps a background-tab gap from exploding physics. It always fires on advancing frames — even when consecutive steps are identical (fixed-step harnesses) — and swallows zero/backward steps.

```ts
const delta = frameDelta(scope, time, { maxStep: 0.1 });
scope.effect((use) => controls.update(use(delta)));
```

Two animators that follow a goal `Value`, integrated each frame off `time`, returning a `Value<T>` you `use()` like any other — Fusion's `Spring` and `Tween`. Both are built on a small `Animatable<T>` interface (`zero`/`add`/`sub`/`scale`, with `lerp` derived), so they work on any value type: `number` and `Vector3` are built in, anything else (`Color`, `Quaternion`, …) is supplied via `opts.animatable`.

```ts
const pos = spring(scope, time, walkerTarget, { stiffness: 30, damping: 11 });
const fade = tween(scope, time, opacityGoal, { duration: 0.25, easing: easeOut });
```

- **`spring`** is physics — it carries velocity across goal changes, so a moving target is absorbed smoothly; no fixed end time. The walker uses it (a small effect picks a new random target on arrival).
- **`tween`** is time + easing — a known duration along a curve; it retargets *from the current value* when the goal changes (no velocity carried) and stops firing once settled.

Both set a fresh value each frame (the functional `Animatable` ops produce new instances, so the Value fires — see the mutation gotcha) and clamp elapsed time so a tab-switch pause can't blow up the integration / jump the curve.

---

## Composition layer — the attach API (`common-web/src/registry.ts`)

`children(scope, parent, build)` runs `build` with the **attach API** — the ways to put children under `parent` (`add`/`when`/`match`/`each`) — then returns `parent`, so a component can create it inline and return it in one expression:

```ts
const group = children(scope, new Group(), ({ add, when, match, each }) => {
  // add — mount one child now (registered, torn down with `scope`)
  add(Cube, { rotation, color });

  // when — mount one child while a condition holds (the {cond && <X/>} pattern)
  when(showHalo, ({ add }) => add(Halo, { color }));

  // match — exactly one branch per key (the multi-way when: camera modes, tool states)
  match(groundStyle, {
    grid: ({ add }) => add(GridGround, {}),
    axes: ({ add }) => add(AxesGround, {}),
    // an unlisted key ("none") mounts nothing
  });

  // each — one reconciled child per item of a reactive list
  each(colors, ({ scope: itemScope, add }, color, index, count) => {
    const pos = itemScope.computed((use) => orbit(use(index), use(count)));
    add(Cube, { position: pos, color });
  });
});

return { mesh: group };
```

`build` receives `{ parent, scope, add, when, match, each }`; `when`/`each` hand their own build a **nested attach API** bound to the per-run (or per-item) scope — `scope` for reactivity (`effect`/`computed`), `add` for mounting into the same parent.

**`each`** is reactive list reconciliation — our analog of Fusion's `ForValues`/`ForPairs`. One persistent child scope per slot: surviving slots are *reused* (their `item` and `index` Values updated in place, so dependent effects react without a teardown), new slots built, dropped slots cleaned up. `item`, `index`, and `count` are all Values. Dropped slots are torn down **before** `count` and survivors update, so nothing alive ever observes a transient length (no empty-list guards needed). `Cluster` (ring) and `Tower` (stack) both use it.

By default slots are **index-keyed** (slot *i* is item *i*) — an insertion or removal rewrites every later slot's item. Pass `opts.key` for **keyed reconciliation**: slots survive insertion/removal/reorder with their `index` Value updated in place, and only genuinely new/removed items build/tear down. Use it whenever items carry expensive output (meshes) and the list is *edited*, not just appended — e.g. a level's placements keyed by a stable id:

```ts
each(placements, (kids, item, index, count) => { /* build the block */ },
  { key: (p) => p.id });
```

Duplicate keys are disambiguated by occurrence (the n-th duplicate pairs with the n-th duplicate of the previous run).

**`when`** is built on `effect`'s per-run scope: the child is mounted onto `runScope`, so a flip to falsy (or teardown) cleans it up. The condition is coerced through an internal boolean computed, so the child rebuilds only on truthiness **transitions** — a cond that refires with fresh truthy values can't churn the mount. `cond` accepts any `UsedAs<unknown>`.

**`match(value, branches)`** is the keyed sibling: one branch mounted per key, switching keys tears the old branch down and builds the new (same synchronous mount semantics as `when` — a `value.set` in an event handler mounts the new branch inline). domus's camera tri-state (`controlled`/`manual`/`fly` in `composition.ts`) is the canonical use.

---

## Component model

Every component is a plain function:

```ts
(scope: Scope, props: Props) => { mesh }
```

Key rules:

- **Return a mesh; let the parent place it**: a component builds and returns its `mesh` (or `Group`). Whoever instantiates it — `mount()` at the top, or the `children()` adder for nested components — adds the mesh to the parent and registers the matching `remove` on cleanup. Components don't take a `parent`.
- **Default props over guards**: give optional props defaults so every prop is wired uniformly with one `scope.effect`, instead of `if (props.x !== undefined)` blocks. A constant (provided or default) just runs its effect once and subscribes to nothing — no ongoing cost. See `cube.ts`:

  ```ts
  const { position = new Vector3(), rotation = 0, color = 0xff4400 } = props;
  scope.effect((use) => { mesh.position.copy(use(position)); });
  ```

- **No update functions**: state flows through Values; `scope.effect` subscriptions handle all updates — no per-frame callbacks.
- **Compose children via `children(scope, parent, build)`**: `build` gets the attach API (`add`/`when`/`each`) and `children` returns the `parent`. Each child mounted is registered (independently hot-swappable) and tied to the parent's lifetime.
- **Every instance is registered**: registration — not nesting depth — is the unit of hot-swapping. The whole tree is registered, so editing any one component swaps just its instances in place.

---

## HMR registry (`common-web/src/registry.ts`)

The registry is a global `WeakMap<Function, Entry[]>` keyed by **factory function reference** — each live instance recorded under the factory that built it. It is the equivalent of React's fiber tree for our purposes: the authoritative index of what is mounted and where. Keying by the function itself (rather than a URL string) means no path/timestamp bookkeeping, and old factory versions are GC'd once no module references them. The **whole tree** is registered — every component, at every depth — so any one component can be swapped in place.

### `mount(factory, props, parent, parentScope?)`

Builds the instance, adds its `mesh` to `parent`, registers a `remove`-on-cleanup task and a registry entry, and returns the output. Pass `parentScope` to tie the instance to its parent component (its scope becomes `parentScope.child()`, so teardown cascades); omit it for a detached root. `app-scene.ts` calls it once, for `App`, passing app-scene's own scope.

### `children(scope, parent, build?)`

Runs `build` with the attach API `{ parent, scope, add, when, each }` (see *Composition layer* above), then returns `parent`. `add` is a `mount` with the scope + parent bound in; `when`/`each` build on it for conditional and reactive-list mounting. Used by `App` (its children), `Cluster`/`Tower` (`each`), and the `Halo` toggle (`when`).

### `swap(oldFactory, newFactory)`

Called by the Vite plugin's injected accept block on every hot update. For each entry under `oldFactory`:

1. Builds the new instance with `newFactory` in a fresh scope — recreated under the entry's stored `parentScope` so it stays correctly parented — and adds its mesh to the same parent, reusing the entry's stored `props`.
2. Removes the old entry from the array *before* calling `entry.scope.cleanup()` (critical — see Gotchas), so the scope's deregister task is a no-op.
3. Registers the new instance under `newFactory`.

Because the entry carries the parent, parent scope, and props, the swap is in place — nothing else in the tree is touched, and the props (the app's state Values) carry across, so state is preserved. A `swap` for a factory with no live entries is a harmless no-op.

### `setupHMR()`

Called once during app setup — by `createApp` in three-scratch, at module top level of `src/scene/make-app.ts` in react-scratch. Sets `globalThis.__kitsune_hmr = swap` so the plugin-injected accept blocks can reach the registry.

---

## Vite plugin (`common-web/src/plugin.ts`)

### `transform` hook

Appends a self-accept block to every `.ts`/`.js` file in a configurable components dir (default `src/components`, excluding `app-scene.ts`; `react-scratch` configures `src/scene`, excluding `make-app.ts`/`apps.ts`). It snapshots the module's exported `const`s (the old factory references) so the accept callback can pair each with its replacement and call `swap`:

```js
if (import.meta.hot) {
  const _snap = { Cube /*, ...other exports */ };
  import.meta.hot.accept((mod) => {
    if (!mod) return;
    Object.entries(_snap).forEach(([k, oldFn]) => {
      const newFn = mod[k];
      if (typeof oldFn === "function" && typeof newFn === "function")
        globalThis.__kitsune_hmr?.(oldFn, newFn);
    });
  });
}
```

This block runs in the context of the already-compiled JavaScript (the plugin runs after esbuild). Do not use TypeScript syntax (e.g. `as any`) in this string — it will land in the browser as invalid JS.

The snapshot collects declaration exports (`export const/let/var/function`) **and** local export lists (`export { Inner as Cube }` — snapshotted under the exported name). Re-export forms (`export { A } from "./x"`) create no local binding to snapshot, so they can't hot-swap through the re-exporting file — the injected block logs a dev-time `console.warn` naming them; edit the source module instead. (`collectExports` in `plugin.ts` is unit-tested.)

### No `handleHotUpdate` hook

Earlier versions walked the importer graph here (BFS through `mod.importers`) to force parents to re-evaluate. That is no longer needed: because every component is registered, each component's self-accept block can swap *its own* instances directly, and Vite's default behavior re-executes only the changed module — a self-accepting module is its own HMR boundary, so propagation stops there.

So editing `walker.ts` re-executes just `walker.ts`, fires its accept, and `swap(oldWalker, newWalker)` replaces the live Walker in place. `App`, `Cluster`, and the cubes are never re-evaluated. The server log confirms it: a single-module update (`hmr update /src/components/walker.ts`) with no reload.

Non-component modules (lib files, `cluster-colors.ts`) don't self-accept, so a change there propagates up to the nearest accepting boundary. `app-scene.ts` has a manual `import.meta.hot.accept(["../cluster-colors"], ...)` that hot-applies `cluster-colors.ts` edits by setting the `clusterColors` Value; anything else that reaches `app-scene.ts` (excluded from the plugin transform, no self-accept) triggers a full reload — intended, since those are root-level concerns.

**Server restart required**: plugin changes take effect only after Vite restarts. Client-side source changes (registry, components) are picked up live.

---

## Multi-pass rendering (`three-scratch/src/lib/app.ts`)

This is **three-scratch's** app harness — it stays in the app (not promoted); `react-scratch` assembles the equivalent with Builder instead (see *React integration*). `createApp(container, rootFactory)` bootstraps the renderer and passes the root component `{ time, renderer }`. The root component returns:

```ts
{ passes: RenderPass | RenderPass[] }
```

```ts
type RenderPass = {
  scene: Scene;
  camera: Camera;
  onBefore?: (renderer: WebGLRenderer) => void;
};
```

`renderer.autoClear = false` — clearing is done manually once per frame, before all passes. `onBefore` is called before each pass and is used for viewport, scissor, and `clearDepth` — enabling overlays, split-screen, PIP, and portals.

`createApp` auto-updates `PerspectiveCamera` aspect on resize — tracked with a `ResizeObserver` on the container, so layout-driven size changes count too. `OrthographicCamera` sizing is the root component's responsibility. DPR is capped at 2.

The frame tick publishes `time` inside **`batch()`**, so every effect gets exactly one coherent run per frame even when it also reads a Value written mid-frame (a spring output, a computed chain) — do the same in any hand-rolled loop (domus's `buildAnimate` does).

`createApp` returns an **`AppHandle`** — `{ renderer, frame, stop, start, dispose }`. `stop()` then driving `frame(t)` with a virtual clock is the deterministic-stepping hook (the same shape as domus's `RenderLoopHandle` harness); `dispose()` is full teardown (scope cleanup, renderer dispose, canvas removal).

---

## React integration (`common-web/src/react/`, demoed in `react-scratch`)

For React apps, the React layer wraps a Three app so it survives React's mount/unmount churn. It's imported from the separate entry `@kitsune/common-web/src/react` (kept out of the main barrel so non-React apps don't pull in React).

- **`<ThreeView app={factory} />`** — attaches the app's canvas to its `<div>` on mount and *detaches* (never disposes) on unmount, so React can tear it down and remount it (StrictMode, parent re-renders, conditional rendering) without disturbing the scene.
- **Per-factory instance registry** — a `WeakMap` keyed by the app factory gives one persistent app per factory. Multiple `<ThreeView>`s with *different* factories render independent scenes; passing the same stable factory reuses the one instance across remounts.
- **`useValue(value)`** bridges a `Value` into React render via `useSyncExternalStore`; **`useApp(factory)`** resolves the shared app instance for control panels.

`react-scratch` is the worked example: **Builder** assembles each app singleton (renderer/scene/camera/time/state), **the reactive lib** builds the scene content, and the canvas lives *outside* React. It runs two `<ThreeView>`s (Ring + Stack) side by side, each with its own controls and a mount/unmount toggle — proving the scene keeps running with state intact across React teardown.

---

## Playground & controls (three-scratch — `src/components/app-scene.ts`)

`app-scene.ts` is the non-swappable root host: it owns the scene, the cameras, the app-level state Values, and the render passes, then mounts a single `App`. Because the state lives *here* (outside `App`), it survives every hot-swap of the components below.

The example components, each demonstrating something:

| Component | Demonstrates |
|---|---|
| `App` | the single registered root; composes everything via `children(scope, group)` |
| `Cube` | default props + reactive `position`/`rotation`/`color` (`color` is `ColorValue = number \| Color`) |
| `Cluster` | `children().each` as a ring; per-item `computed` layout reacting to `count` |
| `Tower` | a second `children().each` (vertical) sharing the same `colors` Value — one source, two reconcilers |
| `Walker` | a position-only component; its position is a `spring` following a target Value |
| `Arrow` | `runScope` cleanup — rebuilds its line geometry on each target change, disposing the old |
| `Halo` | `children().when` — mounted/unmounted by a boolean toggle |

**Camera** — both passes (main perspective + PIP ortho) share one `orbit` Value `{ azimuth, polar, radius }`, so they rotate together. A `scope.effect` positions both cameras from it. Mouse: hold-drag to orbit (uses Pointer Lock, so the cursor hides and the drag isn't bounded by screen edges), wheel to zoom (dollies the perspective camera and mirrors the zoom on the ortho via `pipCamera.zoom`).

**Keyboard** (mutating state Values live, no file edits):

| Key | Effect |
|---|---|
| `+` / `=` | add a cluster color |
| `-` / `_` | remove one (all the way down to an empty list — `each` reconciles it away cleanly) |
| `[` / `]` | slower / faster spin |
| `h` | toggle the halo |

**Tracing**: component builds are silent by default; set `localStorage.kitsuneTrace = "1"` and reload to log each build/rebuild (`common-web/src/debug.ts`) — handy for watching HMR granularity.

---

## Gotchas

### Deregister-before-cleanup ordering

`scope.cleanup()` runs the scope's tasks, one of which removes the entry from `_entries`. If you call `cleanup()` before manually removing the entry, the entry is gone and the next `swap()` finds an empty array — HMR works once, then silently stops.

Fix: remove the entry from the array manually before calling `cleanup()`, so the scope's deregister task is a no-op (indexOf returns -1).

### Per-run cleanup (was: `rebuild()` leaks child scopes)

Earlier, `Cluster.rebuild()` recreated child scopes via `scope.child()` on every color change; the old scopes' cleanup tasks accumulated on the parent and ran only at swap time, so cube geometries weren't disposed between changes. **Resolved** by two changes: `scope.effect`/`scope.computed` give each run a `runScope` cleaned before the next run, and `Cluster` is built on `children().each`, which owns one scope per item and cleans it up the moment that item leaves the list.

(The old "URL timestamps after repeated HMR" gotcha is gone too: the registry keys by factory function reference, so there are no URL strings to strip.)

### Stale factory for dynamically-created children

A parent captures the child factories it imports in its closure, and a child edit does *not* re-evaluate the parent (that is what keeps swaps granular). So a parent that creates children **dynamically** — `Cluster`/`Tower` via `children().each` — uses its last-seen factory for *newly added* items after you have edited that child. Concretely: edit `cube.ts`, then add a cluster color, and the brand-new cube is built from the pre-edit `Cube`; already-mounted cubes swapped fine. Recoverable with a reload. This is the gap between this registry and a full reconciler that re-resolves component types on every render.

### Mutating a `Value`'s object in place won't fire

`Value.set` notifies only on `Object.is` inequality, so mutating a `Vector3` (or any object) in place and setting the same reference does nothing. Always set a **new** instance: `spring` sets a fresh `Vector3` each frame, and `Cluster`'s position `computed` returns a fresh `Vector3` per recompute. Reading is safe — consumers use `.copy(use(pos))`, which doesn't mutate the source.

---

## Relationship to Fusion

The reactive model is modelled on [Fusion](https://elttob.uk/Fusion/0.4/) (Roblox/Luau). Correspondence and where we diverge:

| Fusion | Here | Notes |
|---|---|---|
| `scope` / `scoped()` / `doCleanup` | `Scope` (`common-web/src/scope.ts`) | Cleanup runs in reverse order, same as Fusion. |
| `innerScope()` | `scope.child()` | Child is cleaned up with its parent. |
| `Computed(use, scope)` | `scope.computed(fn)` | `fn` receives `use` and a per-run `runScope` — same inner-scope semantics. |
| `Observer:onBind` | `scope.effect(fn)` | Runs immediately and on every change. No change-only (`onChange`) variant yet. |
| `peek` / `use` | `peek` / `use` | Identical: `use` reads and tracks, `peek` reads only. |
| `Value` | `Value` (`common-web/src/value.ts`) | Free function, not a scope method — a Value has no lifetime (listeners released subscriber-side). |
| `UsedAs<T>` | `UsedAs<T>` | Identical — a prop is either a constant or a `Value`. |
| `ForValues` / `ForPairs` | `children(scope, parent).each` | Index-keyed by default (closer to `ForPairs`); `opts.key` gives keyed reconciliation (slots survive insert/remove/reorder). `item`/`index`/`count` are all Values. |
| `[Children]` (New/Hydrate key) | `children(scope, parent)` → `{ add, when, each }` | Ours is a *mounter binder* (attach API), not a property-table key (we have no Hydrate). |
| `Hydrate` / `New` | — | Not implemented. Props are wired with `scope.effect` over default values (see `cube.ts`). |
| `Spring` | `spring` (`common-web/src/animate.ts`) | Physics; carries velocity across goal changes. Built on a pluggable `Animatable<T>` (number/Vector3 built in). SETTLES: snaps to the goal and stops emitting once position + velocity are within `restEpsilon` (needs `Animatable.magnitude`). |
| `Tween` | `tween` (`common-web/src/animate.ts`) | Time + easing; retargets from the current value, known duration. Same `Animatable<T>`. The camera orbit is still direct (no smoothing). |
| component `(scope, props)` | `(scope, props) => { mesh }` | Same shape; we return a Three object instead of a Roblox instance. |

---

## How React handles the same problem

React Fast Refresh operates at the framework level, not the module level. It registers every component instance in the fiber tree, keyed by component type. When a module hot-updates, Fast Refresh re-registers the new component types, then walks the entire fiber tree to find every mounted instance — regardless of nesting depth or import path — and re-renders them in place.

Our registry is the equivalent of the fiber tree, and now works much the same way: the whole tree is registered, and a hot update swaps every instance of the changed component type in place. The remaining differences are that React's tree is built automatically by the JSX reconciler (ours is built by explicit `children()`/`mount()` calls), and React re-resolves component types on every render — so it has no stale-factory gotcha for dynamically-created children (see Gotchas).
