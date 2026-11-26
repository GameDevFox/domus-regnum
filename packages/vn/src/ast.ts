// The script model. A VN script is a flat list of `Statement`s plus a `labels` index mapping
// label names to statement positions. This is the linked-list-of-nodes idea from Ren'Py
// (renpy/ast.py) made concrete: instead of `.next` pointers we walk a flat array by index, and
// control flow (`jump`/`call`/`menu`) resolves a label name to an index. A flat array gives us
// stable statement ids (the index) for free, which is what save/load and rollback need.
//
// This module is intentionally dependency-free: no Three.js, no React, no reactive lib. The
// runtime (runtime.ts) interprets these; the render layers consume the runtime's snapshots.

// A purely declarative description of where/how a displayable sits on screen. Units are left to
// the renderer (the Three.js compositor reads these); the runtime only carries the data. Mirrors
// Ren'Py's transform properties (renpy/atl.py) minus the engine-specific bits.
export type Transform = {
  x?: number; // horizontal position
  y?: number; // vertical position
  zoom?: number; // uniform scale (1 = natural size)
  rotate?: number; // degrees
  alpha?: number; // opacity 0..1
  z?: number; // zorder within the layer (higher = on top)
};

// A transition to play when the scene changes (the `with` statement). The runtime records it on
// the snapshot as a transient marker; the compositor plays it and the runtime clears it on the
// next advance. Kept as plain data so the core needs no renderer.
export type TransitionSpec =
  | { kind: "dissolve"; durationMs: number }
  | { kind: "fade"; durationMs: number; color?: string };

// An entrance animation for a freshly-shown sprite: it slides in from off the named side ("the
// wings") to its target position. Plays once on first appearance; re-showing the same tag (e.g. an
// expression swap) does not replay it. Renderer-interpreted; the runtime just carries the data.
export type Enter = {
  from: "left" | "right";
  durationMs?: number; // default 500
};

// One choice in a `menu`. Picking it jumps to `target` (a label name).
export type Choice = { text: string; target: string };

// The execution context handed to an `exec` statement so dialogue can read/write VN-local vars and
// branch on game state without the runtime knowing anything about the host game.
export type ExecContext = {
  vars: Record<string, unknown>;
  // Branch to a label from inside an exec hook (e.g. based on game state). If called, the runtime
  // continues from that label instead of falling through to the next statement.
  goto: (label: string) => void;
  // Register a teardown that runs when execution LEAVES this beat — i.e. on the next advance()/
  // choose(), and when the script reaches `done` (or restarts). The host's bridge for effects that
  // should be undone when moving on: stop a voice clip, clear a temporary visual, etc. (useEffect's
  // cleanup, scoped to a dialogue beat.) See `effect()` for the one-liner utility form.
  //
  // FUTURE — completion signaling for auto-advance: a planned companion `ctx.async()` will return a
  // `done` callback; calling async() marks the beat as having pending host work (e.g. a voice clip),
  // and auto-advance waits until done() fires. Deferred until auto-advance exists (its only consumer).
  // Rules to honor then: pending tokens gate AUTO-advance only — a manual advance always wins and
  // drops them; add a timeout so a never-fired done() can't soft-lock; tokens are beat-scoped like
  // onLeave. NOT `onDone` (would collide with this `done` and fires at a different moment).
  onLeave: (cleanup: () => void) => void;
};

export type Statement =
  | { kind: "label"; name: string }
  | { kind: "say"; who?: string; text: string; actor?: Record<string, unknown> } // blocks until advance(); `actor` merges into the speaker's actor state as the line lands
  | { kind: "show"; tag: string; image: string; layer: string; at: Transform; enter?: Enter }
  | { kind: "hide"; tag: string; layer: string }
  | { kind: "with"; transition: TransitionSpec }
  | { kind: "menu"; prompt?: string; choices: Choice[] } // blocks until choose()
  | { kind: "actor"; who: string; state: Record<string, unknown> } // merge into an actor's persistent state (undefined values delete keys) — no line needed
  | { kind: "action"; target: string; name: string; params?: Record<string, unknown> } // a one-shot performance intent, dispatched to the host's performer for `target`; fire-and-continue
  | { kind: "awaitBegin" } // opens a join scope (the callback form of .await); performances fired inside are joined by the matching awaitEnd
  | { kind: "awaitEnd"; targets?: string[]; scoped?: boolean } // block until the joined performances complete (auto-resumes; a manual advance skips them)
  | { kind: "wait"; ms: number } // blocks like a say, with no dialogue: renderers resume it after `ms` (advance() also resumes — waits are click-skippable)
  | { kind: "textSpeed"; cps?: number } // typewriter chars/sec from here on; omitted = revert to the stage's mount default. Renderer-interpreted (carried on the snapshot), like `with`.
  | { kind: "jump"; target: string }
  | { kind: "call"; target: string } // pushes a return address
  | { kind: "return" } // pops a return address
  | { kind: "exec"; run: (ctx: ExecContext) => void };

// A compiled script: the statement stream plus a name->index map for O(1) label resolution.
export type Script = {
  statements: Statement[];
  labels: Record<string, number>;
};

// Options for say()'s three-arg form. `actor` is sugar for `.actor(who, state)` applied on the
// same beat the line lands — the speaker's face changes as she starts the sentence.
export type SayOptions = {
  actor?: Record<string, unknown>;
};

// Options for show(), kept separate so the common case (tag + image) stays terse.
export type ShowOptions = {
  layer?: string; // defaults to "sprites"
  at?: Transform;
  enter?: Enter; // slide-in entrance on first appearance
};

// A small fluent builder for authoring scripts in TypeScript — the "typed data" authoring path
// from the design doc (docs/design/12-vn-engine.md §4a). A text DSL can compile to the same
// `Script` later without touching the runtime.
export type ScriptBuilder = {
  label: (name: string) => ScriptBuilder;
  // say("narration") or say("eira", "spoken line") or say("eira", "line", { actor: { mood: "proud" } })
  say: (whoOrText: string, text?: string, opts?: SayOptions) => ScriptBuilder;
  // Merge `state` into `who`'s persistent actor state (see docs: merge semantics, undefined deletes).
  actor: (who: string, state: Record<string, unknown>) => ScriptBuilder;
  show: (tag: string, image: string, opts?: ShowOptions) => ScriptBuilder;
  hide: (tag: string, layer?: string) => ScriptBuilder;
  with: (transition: TransitionSpec) => ScriptBuilder;
  // menu(choices) or menu("What now?", choices). The optional prompt shows as narration
  // (the dialogue box) above the options.
  menu: (promptOrChoices: string | Choice[], choices?: Choice[]) => ScriptBuilder;
  // A one-shot performance intent for the host's performer registry (see EngineOptions.performers):
  // .action("Aki", "enter", { from: "right" }). Fire-and-continue — join later with .await().
  action: (target: string, name: string, params?: Record<string, unknown>) => ScriptBuilder;
  // Join outstanding performances. Three forms:
  //   .await()            — everything outstanding
  //   .await("Aki", …)    — those targets' outstanding performances
  //   .await(s => s.say(…).action(…)) — structured: run the block (says still click-paced,
  //     actions still async), then join the performances fired INSIDE it.
  // Blocks like a say; completions auto-resume; a manual advance/click SKIPS the stragglers
  // (their skip() handlers snap them to their end state).
  await: (...args: string[] | [(sub: ScriptBuilder) => void]) => ScriptBuilder;
  // A timed beat between statements (entrances, stingers landing). Click-skippable on the stage.
  wait: (ms: number) => ScriptBuilder;
  // textSpeed(30) — reveal following lines at 30 chars/sec; textSpeed() — back to the stage default.
  textSpeed: (cps?: number) => ScriptBuilder;
  jump: (target: string) => ScriptBuilder;
  call: (target: string) => ScriptBuilder;
  return: () => ScriptBuilder;
  exec: (run: (ctx: ExecContext) => void) => ScriptBuilder;
  build: () => Script;
};

export const DEFAULT_LAYER = "sprites";

export const script = (): ScriptBuilder => {
  const statements: Statement[] = [];

  const push = (s: Statement): ScriptBuilder => {
    statements.push(s);
    return builder;
  };

  const builder: ScriptBuilder = {
    label: (name) => push({ kind: "label", name }),
    say: (whoOrText, text, opts) =>
      push(
        text === undefined
          ? { kind: "say", text: whoOrText }
          : { kind: "say", who: whoOrText, text, ...(opts?.actor ? { actor: opts.actor } : {}) },
      ),
    actor: (who, state) => push({ kind: "actor", who, state }),
    show: (tag, image, opts) =>
      push({
        kind: "show",
        tag,
        image,
        layer: opts?.layer ?? DEFAULT_LAYER,
        at: opts?.at ?? {},
        ...(opts?.enter ? { enter: opts.enter } : {}),
      }),
    hide: (tag, layer) => push({ kind: "hide", tag, layer: layer ?? DEFAULT_LAYER }),
    with: (transition) => push({ kind: "with", transition }),
    menu: (promptOrChoices, choices) =>
      push(
        Array.isArray(promptOrChoices)
          ? { kind: "menu", choices: promptOrChoices }
          : { kind: "menu", prompt: promptOrChoices, choices: choices ?? [] },
      ),
    action: (target, name, params) =>
      push({ kind: "action", target, name, ...(params ? { params } : {}) }),
    await: (...args) => {
      if (args.length === 1 && typeof args[0] === "function") {
        push({ kind: "awaitBegin" });
        args[0](builder); // the sub-script appends inline on the same builder
        return push({ kind: "awaitEnd", scoped: true });
      }
      return push({ kind: "awaitEnd", ...(args.length ? { targets: args as string[] } : {}) });
    },
    wait: (ms) => push({ kind: "wait", ms }),
    textSpeed: (cps) => push({ kind: "textSpeed", ...(cps === undefined ? {} : { cps }) }),
    jump: (target) => push({ kind: "jump", target }),
    call: (target) => push({ kind: "call", target }),
    return: () => push({ kind: "return" }),
    exec: (run) => push({ kind: "exec", run }),
    build: () => compile(statements),
  };

  return builder;
};

// Resolve labels to indices once, up front. Duplicate labels are a script error.
export const compile = (statements: Statement[]): Script => {
  const labels: Record<string, number> = {};
  statements.forEach((s, i) => {
    if (s.kind !== "label") return;
    if (s.name in labels) throw new Error(`vn: duplicate label "${s.name}"`);
    labels[s.name] = i;
  });
  return { statements, labels };
};

// Every distinct image name a script references (via `show`), in first-seen order. A renderer
// resolves these to URLs and preloads them before the scene starts, so nothing pops in untextured.
export const collectImages = (compiled: Script): string[] => {
  const seen = new Set<string>();
  for (const s of compiled.statements) if (s.kind === "show") seen.add(s.image);
  return [...seen];
};

// Turn a setup function into an exec callback: `setup` runs when the beat is reached, and if it
// returns a cleanup that cleanup is registered via ctx.onLeave (runs when the beat is left). The
// host's one-liner pattern for effects-with-teardown — the audio case being the motivator:
//   const playVoice = (clip: string) => effect(() => audio.play(clip)); // audio.play returns its stop fn
//   script().exec(playVoice("line1.ogg")).say("…")
export const effect =
  (setup: (ctx: ExecContext) => (() => void) | void) =>
  (ctx: ExecContext): void => {
    const cleanup = setup(ctx);
    if (cleanup) ctx.onLeave(cleanup);
  };
