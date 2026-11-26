// The interpreter. Walks a compiled `Script`, maintains the on-screen scene state as an explicit
// per-layer list (the central pattern borrowed from Ren'Py's SceneLists — renpy/display/
// scenelists.py), and exposes a tiny observable so any UI/renderer can react to changes.
//
// This is a cooperative state machine, not a blocking loop: `say`/`menu` park the machine
// (`awaiting-advance` / `awaiting-choice`) and the caller resumes it with advance()/choose().
// That's the browser-native shape of Ren'Py's "block until the player clicks" — no threads.
//
// Dependency-free by design: the runtime emits plain-data snapshots; the Three.js compositor and
// React dialogue box subscribe and render. Nothing here imports a renderer or a reactive library.

import { Enter, Script, Statement, Transform, TransitionSpec } from "./ast";

export type Status = "idle" | "awaiting-advance" | "awaiting-choice" | "done";

// One thing currently on screen, keyed by `tag` within its layer. Re-showing the same tag replaces
// the entry in place (Ren'Py's "show eira happy" then "show eira sad" swap).
export type SceneEntry = {
  tag: string;
  image: string;
  transform: Transform;
  showTime: number; // host-clock ms when this entry was (re)shown; renderers animate from it
  enter?: Enter; // entrance animation, set on first show; renderers play it once
};

// A plain-data view of everything a renderer needs for the current frame. Rebuilt on every change
// and handed to subscribers. Immutable from the consumer's side — treat as read-only.
export type Snapshot = {
  status: Status;
  // layer name -> entries, each layer sorted by transform.z ascending (draw back-to-front).
  layers: Record<string, SceneEntry[]>;
  dialogue: { who?: string; text: string } | null;
  choices: { text: string }[] | null;
  // A `wait` beat in progress: renderers should advance() after `ms` (a manual advance skips it).
  waiting: { ms: number } | null;
  // The most recent label execution passed through — a stable NAME for "where the show is",
  // robust across script edits (hot-reload restarts the current label; pc would drift).
  label?: string;
  // How many blocking beats (say/menu/wait/await-holds) have been passed since that label —
  // label + beat = a resume point fine enough for line-level iteration (see start()'s toBeat).
  beat: number;
  // An `await` join in progress: how many performances it is still holding for. Presentation-only
  // (a renderer might show a subtle busy mark); completions auto-resume the script.
  holding: { pending: number } | null;
  // A transition requested by `with`, pending until the renderer consumes it. Cleared on advance.
  transition: TransitionSpec | null;
  // The script's typewriter override (chars/sec) from the last `textSpeed` statement, if any.
  // Renderer-interpreted: undefined = use the stage's mount option. Persists across start() —
  // it's a presentation preference, not scene content.
  textSpeed?: number;
  // Persistent per-actor state (mood, pose, …) written by `actor` statements / say's actor option.
  // The engine only CARRIES it — consumers (rigs) decide what the keys mean. Merge semantics;
  // persists across start(), like layers.
  actors: Record<string, Record<string, unknown>>;
};

// One actor's change, as delivered by renderer event surfaces (the DOM stage's onActorChange):
// `talking` is reveal-bound (renderer truth); `state` is the actor's full current state (engine
// truth) — full state, not a delta, so appliers are idempotent.
export type ActorChange = {
  who: string;
  talking: boolean;
  state: Record<string, unknown>;
};

// The serializable save state: program counter + call stack + vars + the live scene. Enough to
// resume exactly where we left off (design doc §4f). Plain JSON-able data.
export type SaveState = {
  pc: number;
  returnStack: number[];
  vars: Record<string, unknown>;
  layers: Record<string, SceneEntry[]>;
  dialogue: { who?: string; text: string } | null;
  choices: { text: string; target: string }[] | null;
  status: Status;
  textSpeed?: number;
  actors?: Record<string, Record<string, unknown>>;
  waiting?: { ms: number } | null;
  label?: string;
  beat?: number;
};

// What a performer returns for one performance:
//   void                  — instant (already done)
//   Promise<void>         — awaitable, not skippable
//   { done?, skip? }      — awaitable and/or skippable; skip() = "snap to the end state NOW"
// A skipped performance counts as complete immediately (the engine doesn't wait for `done`).
export type PerformanceHandle = void | Promise<void> | { done?: Promise<void>; skip?: () => void };

// The host system that interprets `action` statements for one target (an actor's rig, the audio
// team, the camera…). The DIRECTOR (script) only states intents; performers know how.
export type Performer = (name: string, params: Record<string, unknown>) => PerformanceHandle;

export type EngineOptions = {
  // Host clock used to stamp SceneEntry.showTime. Defaults to a constant so the core stays
  // deterministic for tests; the domus bridge passes the real per-frame clock.
  now?: () => number;
  restore?: SaveState;
  // The performer registry for `action` statements. A missing target/failed handler warns and
  // counts as instantly complete — malformed input is skipped loudly, never thrown.
  performers?: Record<string, Performer>;
};

export type Engine = {
  // Begin (or jump) at a label and run until the machine blocks or finishes. opts.toBeat
  // fast-forwards that many beats past the label first (says stream by, waits/joins skip,
  // actions stay silent) — the resume mechanism for hot reload / loaded saves.
  start: (label?: string, opts?: { toBeat?: number }) => void;
  // Resolve a `say`: clear the line and continue.
  advance: () => void;
  // Skip every outstanding performance to its end state (host teardown / engine hand-off).
  interrupt: () => void;
  // Resolve a `menu`: pick choice `index` and continue.
  choose: (index: number) => void;
  snapshot: () => Snapshot;
  subscribe: (fn: (snap: Snapshot) => void) => () => void;
  save: () => SaveState;
  status: () => Status;
};

const cloneEntries = (layers: Record<string, SceneEntry[]>): Record<string, SceneEntry[]> => {
  const out: Record<string, SceneEntry[]> = {};
  for (const k of Object.keys(layers))
    out[k] = layers[k].map((e) => ({ ...e, transform: { ...e.transform } }));
  return out;
};

export const VNEngine = (compiled: Script, options: EngineOptions = {}): Engine => {
  const now = options.now ?? (() => 0);
  const { statements, labels } = compiled;

  // ---- mutable execution state ----
  let pc = options.restore?.pc ?? 0;
  let returnStack: number[] = options.restore?.returnStack ?? [];
  const vars: Record<string, unknown> = options.restore?.vars ?? {};
  let status: Status = options.restore?.status ?? "idle";

  // ---- mutable scene state ----
  const layers: Record<string, SceneEntry[]> = options.restore?.layers ?? {};
  let dialogue: { who?: string; text: string } | null = options.restore?.dialogue ?? null;
  // The live menu keeps its targets (needed by choose()); the snapshot exposes only display text.
  let activeChoices: { text: string; target: string }[] | null = options.restore?.choices ?? null;
  let transition: TransitionSpec | null = null;
  let waiting: { ms: number } | null = options.restore?.waiting ?? null;
  let lastLabel: string | undefined = options.restore?.label;
  let beat = options.restore?.beat ?? 0; // blocks passed since lastLabel
  // Fast-forward: how many beats to stream past without blocking (say auto-passes, wait/await
  // skip, ACTIONS ARE SUPPRESSED — replayed presentation stays quiet). null = normal playback.
  // A menu aborts it (a choice can't be assumed); reaching the count resumes normal blocking.
  let ff: number | null = null;

  // ---- performances (the `action`/`await` machinery) ----
  // Live performances are HOST work — they are deliberately not serialized (a restore starts with
  // none outstanding, so a restored hold falls through — the sane resume behavior).
  type Pending = { target: string; scopes: number[]; skip?: () => void; settled: boolean };
  const pending: Pending[] = [];
  const scopeStack: number[] = []; // awaitBegin pushes; the matching scoped awaitEnd pops
  let scopeSeq = 0;
  let hold: { entries: Pending[] } | null = null;

  const holdRemaining = () => (hold ? hold.entries.filter((e) => !e.settled).length : 0);

  const settle = (entry: Pending) => {
    if (entry.settled) return;
    entry.settled = true;
    const i = pending.indexOf(entry);
    if (i >= 0) pending.splice(i, 1);
    // Auto-resume: the director was holding for this — everything settled means we proceed.
    // (Same leave-the-beat semantics as a manual advance, cleanups included.)
    if (hold && holdRemaining() === 0) {
      hold = null;
      runCleanups();
      beat++;
      pc++;
      run();
      emit();
    }
  };

  const fireAction = (target: string, name: string, params: Record<string, unknown>) => {
    const performer = options.performers?.[target];
    if (!performer) {
      console.warn(`vn: no performer registered for "${target}" (action "${name}") — skipped`);
      return;
    }
    let handle: PerformanceHandle;
    try {
      handle = performer(name, params);
    } catch (err) {
      console.warn(`vn: performer "${target}" threw on "${name}" — treated as complete`, err);
      return;
    }
    if (handle == null) return; // instant
    const done = handle instanceof Promise ? handle : handle.done;
    const skip = handle instanceof Promise ? undefined : handle.skip;
    if (!done && !skip) return; // nothing to track
    const entry: Pending = { target, scopes: [...scopeStack], skip, settled: false };
    pending.push(entry);
    if (done) {
      done.then(
        () => settle(entry),
        (err) => {
          console.warn(`vn: performance "${target}"/"${name}" failed — treated as complete`, err);
          settle(entry);
        },
      );
    }
    // A skippable performance with no `done` stays pending until a skip flushes it — the
    // performer opted into "runs until someone says stop".
  };

  // Strike the stage: skip every outstanding performance to its end state (settling any hold,
  // which auto-resumes the script if it was waiting). For host teardown/hot-swap — the engine
  // being discarded must not orphan running performances (an unskippable half-finished slide).
  const interrupt = () => {
    for (const e of [...pending]) {
      try {
        e.skip?.();
      } catch (err) {
        console.warn("vn: a performance's skip() threw during interrupt — ignoring", err);
      }
      settle(e);
    }
  };

  // A manual advance during a hold: skip the stragglers to their end state and move on.
  const flushHold = () => {
    if (!hold) return;
    for (const e of hold.entries) {
      if (!e.settled) {
        try {
          e.skip?.();
        } catch (err) {
          console.warn("vn: a performance's skip() threw — ignoring", err);
        }
        e.settled = true;
        const i = pending.indexOf(e);
        if (i >= 0) pending.splice(i, 1);
      }
    }
    hold = null;
  };
  let textSpeed: number | undefined = options.restore?.textSpeed;
  const actors: Record<string, Record<string, unknown>> = options.restore?.actors ?? {};

  // Shallow-merge `patch` into an actor's state; an undefined value deletes its key.
  const mergeActor = (who: string, patch: Record<string, unknown>) => {
    const next = { ...(actors[who] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    actors[who] = next;
  };
  const cloneActors = () =>
    Object.fromEntries(Object.entries(actors).map(([who, st]) => [who, { ...st }]));

  const listeners = new Set<(snap: Snapshot) => void>();

  const labelIndex = (name: string): number => {
    const i = labels[name];
    if (i === undefined) throw new Error(`vn: unknown label "${name}"`);
    return i;
  };

  // Teardowns registered by `exec` via ctx.onLeave, fired when execution leaves the current beat
  // (next advance/choose, or done/restart). Snapshot-then-clear so a cleanup can't see itself.
  let pendingCleanups: Array<() => void> = [];
  const runCleanups = () => {
    const fns = pendingCleanups;
    pendingCleanups = [];
    for (const fn of fns) fn();
  };

  const sortLayer = (layer: string) =>
    layers[layer].sort((a, b) => (a.transform.z ?? 0) - (b.transform.z ?? 0));

  const snapshot = (): Snapshot => ({
    status,
    layers: cloneEntries(layers),
    dialogue: dialogue && { ...dialogue },
    choices: activeChoices && activeChoices.map((c) => ({ text: c.text })),
    transition,
    textSpeed,
    actors: cloneActors(),
    waiting: waiting && { ...waiting },
    holding: hold ? { pending: holdRemaining() } : null,
    label: lastLabel,
    beat,
  });

  const emit = () => {
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  };

  // Execute statements until one blocks (say/menu) or the script ends. Non-blocking statements
  // (show/hide/with/jump/call/return/exec) fall straight through, so a burst of shows before a
  // say all apply, then the textbox appears — matching Ren'Py semantics.
  const run = () => {
    while (pc < statements.length) {
      const s: Statement = statements[pc];
      switch (s.kind) {
        case "label":
          lastLabel = s.name;
          beat = 0;
          pc++;
          break;
        case "action":
          if (ff === null) fireAction(s.target, s.name, s.params ?? {}); // suppressed during fast-forward
          pc++;
          break;
        case "awaitBegin":
          scopeStack.push(++scopeSeq);
          pc++;
          break;
        case "awaitEnd": {
          if (ff !== null && ff > 0) {
            if (s.scoped) scopeStack.pop(); // keep begin/end pairing balanced
            ff--;
            beat++;
            pc++;
            break;
          }
          ff = null;
          const scopeId = s.scoped ? scopeStack.pop() : undefined;
          const joined = pending.filter((p) =>
            s.scoped
              ? scopeId !== undefined && p.scopes.includes(scopeId)
              : s.targets
                ? s.targets.includes(p.target)
                : true,
          );
          if (joined.every((p) => p.settled)) {
            pc++;
            break; // nothing outstanding — fall straight through
          }
          hold = { entries: joined };
          status = "awaiting-advance";
          return; // block — completions auto-resume; a manual advance skips the stragglers
        }
        case "wait":
          if (ff !== null && ff > 0) {
            ff--;
            beat++;
            pc++;
            break;
          }
          ff = null;
          waiting = { ms: s.ms };
          status = "awaiting-advance";
          return; // block — the renderer (or a skipping click) advances past it
        case "say":
          if (s.actor && s.who !== undefined) mergeActor(s.who, s.actor); // land WITH the line
          if (ff !== null && ff > 0) {
            ff--;
            beat++;
            pc++;
            break; // fast-forward: the line streams past without blocking
          }
          ff = null; // arrived — resume normal playback
          dialogue = s.who === undefined ? { text: s.text } : { who: s.who, text: s.text };
          status = "awaiting-advance";
          return; // block
        case "show": {
          const list = (layers[s.layer] ??= []);
          const existing = list.findIndex((e) => e.tag === s.tag);
          const entry: SceneEntry = {
            tag: s.tag,
            image: s.image,
            transform: { ...s.at },
            showTime: now(),
            // Entrance plays only on first appearance — a re-show (expression swap) keeps it off.
            ...(existing < 0 && s.enter ? { enter: s.enter } : {}),
          };
          if (existing >= 0) list[existing] = entry;
          else list.push(entry);
          sortLayer(s.layer);
          pc++;
          break;
        }
        case "hide": {
          const list = layers[s.layer];
          if (list) layers[s.layer] = list.filter((e) => e.tag !== s.tag);
          pc++;
          break;
        }
        case "with":
          transition = s.transition;
          pc++;
          break;
        case "menu":
          ff = null; // a choice can't be fast-forwarded — stop here
          // An optional prompt shows as narration (the dialogue box) above the choices,
          // matching Ren'Py's menu caption. Omitted → leave the current dialogue as-is.
          if (s.prompt !== undefined) dialogue = { text: s.prompt };
          activeChoices = s.choices.map((c) => ({ text: c.text, target: c.target }));
          status = "awaiting-choice";
          return; // block
        case "textSpeed":
          textSpeed = s.cps; // undefined = revert to the stage default
          pc++;
          break;
        case "actor":
          mergeActor(s.who, s.state);
          pc++;
          break;
        case "jump":
          pc = labelIndex(s.target);
          break;
        case "call":
          returnStack.push(pc + 1);
          pc = labelIndex(s.target);
          break;
        case "return":
          if (returnStack.length === 0) {
            runCleanups();
            status = "done";
            return;
          }
          pc = returnStack.pop() as number;
          break;
        case "exec": {
          let branched = false;
          let dest = 0;
          s.run({
            vars,
            goto: (label) => {
              branched = true;
              dest = labelIndex(label);
            },
            onLeave: (fn) => pendingCleanups.push(fn),
          });
          pc = branched ? dest : pc + 1;
          break;
        }
      }
    }
    runCleanups(); // script ran to the end — tear down any effects from the final beat
    status = "done";
  };

  const start = (label?: string, opts?: { toBeat?: number }) => {
    runCleanups(); // clear any effects left over from a prior run before (re)starting
    waiting = null;
    hold = null; // outstanding performances keep running host-side; their completions settle quietly
    scopeStack.length = 0;
    beat = 0;
    ff = opts?.toBeat ?? null; // 0 still suppresses actions up to the first block (silent resume)
    pc = label === undefined ? 0 : labelIndex(label);
    run();
    emit();
  };

  const advance = () => {
    if (status !== "awaiting-advance") return;
    flushHold(); // a held join skips its stragglers to their end state
    runCleanups(); // leaving this beat — fire its onLeave teardowns first
    dialogue = null;
    transition = null;
    waiting = null;
    beat++;
    pc++;
    run();
    emit();
  };

  const choose = (index: number) => {
    if (status !== "awaiting-choice" || !activeChoices) return;
    const choice = activeChoices[index];
    if (!choice) return;
    runCleanups(); // leaving this beat — fire its onLeave teardowns first
    activeChoices = null;
    beat++; // the menu beat is passed (usually immediately reset by the target's label)
    pc = labelIndex(choice.target);
    run();
    emit();
  };

  const save = (): SaveState => ({
    pc,
    returnStack: [...returnStack],
    vars: { ...vars },
    layers: cloneEntries(layers),
    dialogue: dialogue && { ...dialogue },
    choices: activeChoices && activeChoices.map((c) => ({ ...c })),
    status,
    textSpeed,
    actors: cloneActors(),
    waiting: waiting && { ...waiting },
    label: lastLabel,
    beat,
  });

  const subscribe = (fn: (snap: Snapshot) => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  return { start, advance, choose, interrupt, snapshot, subscribe, save, status: () => status };
};
