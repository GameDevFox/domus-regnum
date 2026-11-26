# @kitsune/vn

A web-native **visual-novel engine** designed to render _over_ a live game view (Three.js),
not as a standalone player. Born inside the [domus](../domus) game but built as a
self-contained package so it can be **factored out into its own repository** and used
independently.

> Design rationale, the Ren'Py research it draws on, and the full architecture are in
> [`packages/domus/docs/design/12-vn-engine.md`](../domus/docs/design/12-vn-engine.md) and
> [`research-renpy.md`](../domus/docs/design/research-renpy.md). _(These docs live in `domus`
> for now; move them here when the package is extracted.)_

## Layered design (so it stays independently usable)

| Layer                                              | Module / entry               | Dependencies            | Status         |
| -------------------------------------------------- | ---------------------------- | ----------------------- | -------------- |
| **Core** — script AST + interpreter + scene state  | `@kitsune/vn`                | none (pure TS)          | ✅ implemented |
| **DOM stage** — sprites + textbox + choices as DOM | `@kitsune/vn` (`mountStage`) | none (DOM)              | ✅ implemented |
| **Canvas sprites** — Three.js ortho sprite layer   | `@kitsune/vn/three`          | `three` (optional peer) | ✅ implemented |
| **React dialogue** — textbox + choice menu as JSX  | `src/react/*` (planned)      | `react` (optional peer) | ⬜ next        |

The core has **no rendering or framework dependency** — it emits plain-data snapshots and
you bring your own renderer. `three` and `react` are _optional_ peer dependencies, isolated
behind their own entry points (`@kitsune/vn/three`), so a consumer can use just the runtime,
just the DOM stage, or compose them.

### Render layers compose (the "sandwich")

The DOM stage and the canvas renderer both consume the same engine snapshots, so they mix.
The intended hybrid: **canvas sprites** (they blend with a 3D game and enable in-canvas
compositing) + a **DOM/React dialogue box** (best for text, input, a11y). `mountSprites`
exposes a `render(renderer)` pass you slot into your own loop, so the VN layer composites
between a 3D game pass and anything above it:

```ts
import { mountSprites } from "@kitsune/vn/three";

const sprites = mountSprites(engine, { resolveImage });
// ...in your render loop:
renderer.clear();
renderer.render(gameScene, gameCamera); // 3D game
renderer.clearDepth();
sprites.render(renderer); // VN sprite pass, composited over the game
// DOM/React dialogue box stacks on top via normal DOM
```

The standalone `demo/` shows exactly this: a live 3D scene, a semi-transparent backdrop the
3D shows through, character sprites as textured quads, and a DOM dialogue box on top.

## Core usage

```ts
import { script, VNEngine } from "@kitsune/vn";

const story = script()
  .show("eira", "eira-happy", { at: { z: 1 } })
  .say("eira", "Welcome to the manor.")
  .menu("Open the forbidden door?", [
    { text: "Open it", target: "open" },
    { text: "Walk away", target: "leave" },
  ])
  .label("open")
  .exec((ctx) => {
    ctx.vars.daring = true;
  })
  .say("The lock clicks.")
  .jump("end")
  .label("leave")
  .say("Best not.")
  .label("end")
  .build();

// Rich text (Ren'Py-compatible tags, phase-1 style family — see rich-text.ts):
//   .say("eira", "A {b}bold{/b} claim, {i}wouldn't you say{/}? {color=#e8b4c8}How romantic.{/}")
// {b} {i} {u} {s} {color=…} {size=18|+4}, LIFO closing, unclosed tags auto-close at line end,
// {{ escapes a brace. OUR EXTENSION: {/} closes the most recent open tag (names in closers are
// redundant under LIFO). Unknown/malformed tags strip with a console.warn. Parsing is core +
// pure (parseRichText/plainText); the DOM stage renders segment span-pairs so the typewriter
// reveals THROUGH styled text without reflow, and cps counts glyphs (markup is free).
// Pacing (phase 2, the control family): {w} pause-for-click, {w=1.5} timed pause (both
// click-skippable), {p} pause + paragraph break, {cps=8}…{/cps} / {cps=*2}…{/cps} per-segment
// reveal rate, {fast} pre-reveals everything before it. A click mid-reveal completes to the NEXT
// pause (Ren'Py semantics), and a paused speaker stops `talking` (rigs' mouths rest for the
// beat). The pure RevealWalk (reveal.ts) owns the pacing; renderers just paint its position.
// Still not built: {nw}/auto-advance.
//
// Performances — the director states INTENTS; host "performers" know how:
//   .action("eira", "enter", { from: "right" })   // fire-and-continue
//   .action("audio", "play", { clip: "sting" })
//   .await("eira")                                 // hold until HER performances complete
//   .await()                                       // …or everything outstanding
//   .await((s) => s.say("…").action("fx", "x"))    // …or a structured block: run it, join what it fired
// Performers register via VNEngine(script, { performers: { eira: (name, params) => handle } });
// a handle is void (instant), a Promise (awaitable), or { done, skip } — skip() is called when a
// click advances through a hold ("stop the slide, place her at her mark"). Completions auto-resume.
//
// Timed beats: `.wait(1100)` blocks like a say with no textbox — the DOM stage advances it after
// the delay, and a click skips it (entrances, stingers landing, dramatic pauses).
//
// Typewriter pacing is script-controllable: `.textSpeed(26)` slows following lines to 26 chars/sec,
// `.textSpeed()` reverts to the renderer's default (the DOM stage's `textSpeed` mount option).
// The runtime just carries the value on its snapshot — renderers interpret it, like transitions.
//
// Actor state: `.actor("eira", { mood: "wry" })` merges into a persistent per-actor map (undefined
// deletes a key; survives start() jumps + save/restore); `.say("eira", "line", { actor: {...} })`
// lands the merge WITH the line. External systems (character rigs) consume it via the DOM stage's
// `onActorChange` option — one event stream of `{ who, talking, state }`, where `talking` is
// reveal-bound (typewriter start → true, settle/early-complete → false; instant lines pulse;
// unmount always flushes false). The diffing lives in the pure, reusable ActorTracker.

const engine = VNEngine(story, { now: () => performance.now() });

engine.subscribe((snap) => {
  // snap.dialogue, snap.choices, snap.layers — render however you like
});

engine.start(); // run until the first say/menu
engine.advance(); // resolve a say
engine.choose(0); // resolve a menu
const saved = engine.save(); // serializable snapshot
const resumed = VNEngine(story, { restore: saved });
```

### Why a flat script + label index

The script is a flat `Statement[]` with a name→index `labels` map (see `ast.ts`). It's the
Ren'Py "linked list of statement nodes" model with the `.next` pointer replaced by an array
index — which gives stable statement ids for save/load and rollback for free. `jump`/`call`/
`menu` resolve a label name to an index; `call`/`return` use a return-address stack.

### Cooperative, non-blocking runtime

`say` and `menu` _park_ the state machine (`awaiting-advance` / `awaiting-choice`); the host
resumes it via `advance()` / `choose()`. This is the browser-native form of Ren'Py's
"block until the player clicks" — no threads, no blocking the render loop.

### Extending via `exec` (the engine stays lean)

Anything game-specific is a host side effect run through `exec` — the engine never grows audio,
inventory, etc. into its core. Two pieces support this:

- **`ctx.onLeave(fn)`** — register a teardown that fires when execution leaves the beat (next
  advance/choose, or done/restart). `effect(setup)` is the one-liner form: `setup` runs on the
  beat, its returned cleanup is auto-registered. The audio case:

  ```ts
  const playVoice = (clip: string) => effect(() => audio.play(clip)); // audio.play returns its stop fn
  script().exec(playVoice("line1.ogg")).say("…");
  ```

  Persistent things (background music) skip `onLeave` and let the host track "now playing";
  transient things (voice, a one-line sting) use it.

- **Planned — `ctx.async()` → `done`** _(deferred until auto-advance exists, its only consumer)._
  Marks a beat as having pending host work; auto-advance waits until `done()` fires. Opt-in, so the
  run loop stays synchronous. When built: pending tokens gate **auto**-advance only (a manual
  advance always wins), with a timeout so a never-fired `done()` can't soft-lock. See the note on
  `ExecContext` in `src/ast.ts`.

## Consuming it in this monorepo

domus maps `@kitsune/vn` to this package's **source** (no build step) via a Vite alias and a
tsconfig path — exactly like `@kitsune/common-web`:

- `packages/domus/vite.config.ts` → `@kitsune/vn` ⇒ `../vn/src/index.ts`
- `packages/domus/tsconfig.json` → `paths` entry to `../vn/src/index.ts`

For non-bundler consumers (or `tsc` builds), `yarn workspace @kitsune/vn build` emits
`dist/` (the package `main`/`types`).

## Factoring out later

Because this is a standalone workspace (its own `package.json`/`tsconfig.json`, no imports
from `domus` or the other `@kitsune` packages), extraction is mechanical:

1. Copy `packages/vn/` to a new repo.
2. Move the design docs (`12-vn-engine.md`, `research-renpy.md`) alongside it.
3. Publish; consumers `npm i @kitsune/vn` and drop the source alias.

Keep that property intact: **the core must not import from `domus`, `@kitsune/common`, or
`@kitsune/common-web`.** The domus-specific wiring (bridging snapshots to `Value`/`Scope`,
the render-loop pass) lives in `domus`, not here.

## Develop

```bash
yarn workspace @kitsune/vn test        # vitest
yarn workspace @kitsune/vn build       # tsc -> dist/
```
