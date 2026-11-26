# Builder — fluent API

`Builder` (in `packages/common/src/builder.ts`) is a fluent dep-injection builder. Its TypeScript type system **enforces topological ordering**: each `.add()` call can only declare deps on keys already added earlier in the chain.

**Fluent pattern** (see `packages/three-app/src/app.ts` or `packages/domus/src/domus-app/index.ts`):

```ts
export const builder = Builder()
  .add("canvas", () => document.createElement("canvas"))
  .add("renderer", buildRenderer, ["canvas"], cleanUpRenderer)
  .add("scene", buildScene, ["renderer"]);

export const appP = builder.run();
```

- `.add(key, buildFn, deps?, cleanUp?)` — deps must reference only keys already added above
- `builder.run()` returns a Promise resolving to `{ data, update }` — `data` is the built app; `update(updates)` re-runs the given keys and their dependents (invoking partial updaters where declared — see below) and resolves to the list of rebuilt keys. Call `run()` once and export/share the result.
- Individual files should export plain build functions. The deps array and cleanUp belong at the `.add()` call site in the builder chain.
- The `packages/domus/src/three-canvas/utils.ts` helpers (`setAnimationLoop`, `buildUpdateDepFn`) accept `{ data: T }` and `ReturnType<Builder<T>["run"]>` respectively.

## Deriving the app type from the builder

Use `BuilderData` (exported from `@kitsune/common`) to infer the app type from the builder chain rather than writing it by hand:

```ts
import { Builder, BuilderData } from "@kitsune/common";

export const builder = Builder()
  .add("canvas", () => document.createElement("canvas"))
  .add("renderer", buildRenderer, ["canvas"]);

export type MyApp = BuilderData<typeof builder>;
// equivalent to: { canvas: HTMLCanvasElement, renderer: WebGLRenderer }
```

## Partial updaters — preserve instance state when a dep changes

By default, when a dependency is updated, all dependents are fully rebuilt (old instance discarded, build function called again). A `partialUpdater` lets you mutate the existing instance in place instead, preserving any internal state it has accumulated.

```ts
Builder()
  .add("config", { multiplier: 2 })
  .add(
    "counter",
    ({ config }) => ({ count: 0, multiplier: config.multiplier }),
    {
      deps: ["config"],
      partialUpdaters: {
        config: (instance, config) => {
          instance.multiplier = config.multiplier; // mutate in place
          // instance.count is untouched — preserved across the update
        },
      },
    },
  );
```

Rules:
- A partial updater is only invoked when **every** directly-changed dep has a corresponding entry in `partialUpdaters`. If any changed dep is missing a partial updater, the Builder falls back to a full rebuild.
- `cleanUp` is **not** called when a partial update is used — only on full rebuilds.
- The second argument to each partial updater is the new value of that dep (already updated in `data`).
- Works with both the positional API (`partialUpdaters` as the 5th arg) and the options-object API.

**When to use:** any node that accumulates runtime state (counters, caches, animation state, control objects) and only needs to *react* to certain dep changes rather than be rebuilt from scratch.

## Circular import constraint — build function parameter types

`BuilderData<typeof builder>` works only if no file in the builder's transitive import tree imports the app type back from `app.ts`. If any build function file does (e.g. `import { MyApp } from "../app"`), TypeScript detects the cycle and degrades `builder` to `any`.

The rule: **build function files must not import the app type from `app.ts`**. Instead:

1. Move shared state types (e.g. `MyAppState`) to a separate `types.ts` that has no imports from the builder chain.
2. Replace `Pick<MyApp, "camera" | "renderer">` parameter types with explicit inline structural types:
   ```ts
   // Instead of: ({ camera, renderer }: Pick<MyApp, "camera" | "renderer">) =>
   ({ camera, renderer }: { camera: PerspectiveCamera; renderer: WebGLRenderer }) =>
   ```
3. Mod/callback files that type their callbacks against the full app (e.g. `Mod<MyApp, T>`) must also avoid importing from `app.ts`. Use a structural subset — TypeScript's contravariance makes `Mod<{ camera: PerspectiveCamera }, T>` assignable to `Mod<MyApp, T>` as long as `MyApp` extends that subset.

See `packages/workout-waifu/src/` for a worked example of this pattern.
