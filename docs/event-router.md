# EventRouter — layered input routing

`EventRouter` (in `packages/common/src/event-router.ts`) routes input events through a stack of **layers**. It is framework-agnostic — events are plain string-array ids fired via `trigger`; what produces them (WebXR gamepad polling, DOM keyboard/pointer listeners, UI buttons) is the caller's concern.

The core idea: instead of every handler re-checking mode flags (`if(rectMode) ... else if(regionMode) ...`), each mode is a layer with its own handlers. Entering/exiting layers *is* the mode switch; dispatch picks the top-most active layer that defines a handler for the event and falls through to lower layers otherwise. There is no privileged base tree — always-on default bindings are just a layer (conventionally named `base`) entered first, so it sits at the bottom of the stack.

```ts
import { EventRouter } from "@kitsune/common";

const events = EventRouter();

// Default bindings — entered first, so every mode layer shadows them
events.layer("base", {
  key: {
    x: () => removeSelected(),
    z: (e: KeyboardEvent) => { if(e.ctrlKey) undo(); },
  },
});

// A modal tool — only consulted while active
events.layer("tool:move", {
  _enter: () => showAxisGizmo(),
  _exit: () => hideAxisGizmo(),

  key: {
    x: () => toggleAxis("x"),   // shadows the base layer's "delete" binding
    escape: () => cancelMove(),
  },
  pointer: {
    move: (hit: Hit) => updateDrag(hit),
    up: () => commitMove(),
  },
});

events.enter("base");

events.enter("tool:move");      // entering the mode = pushing the layer
events.trigger(["key", "x"]);   // → toggleAxis("x")
events.exit("tool:move");
events.trigger(["key", "x"]);   // → removeSelected()
```

## Dispatch rules

`trigger(id, ...args)` walks active layers **top of stack first**:

- The first handler found at `id` is called with `args` and **consumes** the event — unless it returns exactly `false`, in which case dispatch continues to lower layers (conditional pass-through).
- A no-op handler (`() => {}`) therefore **masks** a lower binding.
- If nothing consumes the event, the `onUnhandled` callback fires and `trigger` returns `false`; otherwise it returns `true`.
- Subtrees are never called — only functions at the exact path.
- A node may define the reserved key **`_any`** as a catch-all for events under it that have no exact handler in that layer — `key: { _any: (rest, e) => {} }` swallows every key event (a blocking modal in one line). Exact handlers win over `_any`; the *nearest* `_any` to the event wins (deepest matched node first, walking up); one handler fires per layer per event, so an `_any` returning `false` passes to the next layer down, not to a shallower `_any` in the same layer. `_any` receives the unmatched id remainder relative to its node, then the event args. It never intercepts `_enter`/`_exit`.

## API

| Method | Purpose |
|---|---|
| `trigger(id, ...args)` | Dispatch an event; returns whether it was handled |
| `layer(name, tree)` | Define (or replace — HMR-friendly) a named layer |
| `enter(name)` / `exit(name)` | Push/remove a layer; idempotent. Fires the layer's `_enter` / `_exit` |
| `toggle(name, enable?)` | Enter/exit by flag, or flip when no flag given |
| `replace(prefix, name)` | Replace the active layer matching `prefix` **in place** (stack position preserved) — for mutually exclusive mode families like `mode:select` / `mode:adjust` |
| `set(names)` | Overwrite the entire stack in one call — for restoring saved modal state. `_exit` fires for layers leaving (top-down), `_enter` for layers arriving; reordered layers fire nothing. One `onChange` notification |
| `clear()` | Exit every layer, firing `_exit` top-down. Equivalent to `set([])` |
| `isActive(name)` / `active()` | Query the stack (`active()` returns a copy, bottom→top) |
| `onChange(fn)` | Observe stack changes — fires with a copy of the new stack after every change (no-ops don't fire); returns an unsubscribe function |
| `onChange(name, fn)` | Watch one layer — `fn(enabled)` fires only when that layer's activation transitions (not at subscribe time; read `isActive` for initial state) |
| `onUnhandled(fn)` | Fallback for unconsumed events |
| `onTrigger(fn)` | Trace every dispatch: `(id, args, handledBy)` where `handledBy` is the consuming layer's name or `null` |

## Layer lifecycle

A layer tree may define the reserved keys `_enter` / `_exit`, called when the layer is entered/exited (including both sides of a `replace`, and layers added/removed by `set`). Define a layer **before** entering it if you rely on `_enter`. Use these for mode setup/teardown — cursors, gizmos, cancelling in-flight gestures.

## Observing the router

- **`onChange(name, fn)` vs `_enter`/`_exit`:** lifecycle handlers belong to the layer's *definition* (its own setup/teardown, exactly one of each, replaced with the tree); named watchers belong to *outside* code — any number of UI components can watch a mode without owning it.
- **UI reactivity:** mirror the stack into the reactive scene lib at the app layer — e.g. `const mode = value(events.active()); events.onChange(active => mode.set(active));` — so React/Three views react to mode changes without `common` depending on `common-web`. For a single mode: `events.onChange("tool:move", enabled => moveActive.set(enabled));`.
- **Debugging "why didn't my key do anything":** `events.onTrigger((id, args, handledBy) => console.log(id.join("."), "→", handledBy ?? "(unhandled)"));` answers it authoritatively.

## Conventions

- **Event ids** are hierarchical string arrays: `["controllers", "left", "trigger", "pressed"]`, `["key", "x"]`, `["pointer", "down"]`.
- **Layer names** encode families with a prefix: `mode:select`, `tool:move`, `altMode`. `replace("mode:", ...)` keeps one member of a family active.
- **Default bindings** live in a layer named `base`, entered before any mode layers. Stack position comes from entry order, so enter `base` first — there is no built-in bottom-pinning.
- **Handler trees** can be typed — define a tree type (see `OculusQuestRootControlRouter` in `common-web`) as a `type` alias (not an `interface` — interfaces don't get the implicit index signature `HandlerTree` assignability relies on).

## Consumers

- `common-web/src/oculus-quest-controls.ts` — polls XR gamepads and fires `["controllers", handedness, button, pressed|released|changed]` events.
- `three-app` / `workout-waifu` `src/controls/control-router.ts` — base bindings + `altMode` and `mode:*` layers for VR controller routing.
- `common-web/src/dom-input.ts` — `attachDomInput(events, { pointerTarget? })`: DOM adapter firing `["key", code, "down"|"up"]` (physical `KeyboardEvent.code`, see the `Key` constants), `["pointer", left|middle|right|button3|button4, down|up]`, `pointer.move`/`contextmenu`, `wheel`, `window.blur`. Editable-field guarding built in; returns a detach function.
- `domus` Builder — key fragments in `domus-app/editor-input.ts`, pointer fragments + layer assembly in `domus-app/level-editor.ts` (`editor` base, `region:draw`, `view:fly`, and `tool:move`/`tool:scale`/`tool:texture` with `_exit` gesture cleanup); the `editor-ui` layer + tab scoping in `views/use-editor-shortcuts.ts`.

## Migration from the pre-2026-06 API

| Old | New |
|---|---|
| `events.router = { ...base, _overlays: trees }` | `events.layer("base", base)` + `events.layer(name, tree)` per overlay, then `events.enter("base")` |
| `replaceOverlay(events.overlays, prefix, name)` | `events.replace(prefix, name)` |
| `enableOverlay(events.overlays, name, on)` | `events.toggle(name, on)` |
| `events.default = fn` | `events.onUnhandled(fn)` |
