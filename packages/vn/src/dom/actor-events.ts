import { ActorChange } from "../runtime";

// The diff brain behind the stage's `onActorChange` — pure and renderer-agnostic so it unit-tests
// in node and a future renderer (Three text, headless auto-advance) can reuse it. Feed it the
// snapshot's actors map plus who is currently mid-reveal; it returns the events to emit.
//
// Rules it encodes:
//   • First update = mount flush: every known actor emits once (a rig remounting mid-scene syncs).
//   • After that: an actor emits when its state changed (shallow, per-key) or its talking flipped.
//   • `talking` is reveal-bound: exactly one actor (the revealing speaker) is true at a time;
//     narration reveals no one. Instant lines pulse true→false across two updates.
//   • flush() emits a final talking:false for the live speaker (the unmount guarantee — a rig can
//     never be left mouth-flapping), plus nothing else.
export type ActorTracker = {
  update: (actors: Record<string, Record<string, unknown>>, talkingWho: string | null) => ActorChange[];
  flush: () => ActorChange[];
};

const stateChanged = (a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean => {
  if (!a) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length !== bk.length || bk.some((k) => !Object.is(a[k], b[k]));
};

export const ActorTracker = (): ActorTracker => {
  let prev: Record<string, Record<string, unknown>> | null = null; // null = nothing emitted yet
  let prevTalking: string | null = null;

  const update: ActorTracker["update"] = (actors, talkingWho) => {
    const events: ActorChange[] = [];
    const first = prev === null;
    const known = new Set([
      ...Object.keys(actors),
      ...(prev ? Object.keys(prev) : []),
      ...(talkingWho ? [talkingWho] : []),
      ...(prevTalking ? [prevTalking] : []),
    ]);
    for (const who of known) {
      const state = actors[who] ?? {};
      const talking = who === talkingWho;
      const wasTalking = who === prevTalking;
      if (first || talking !== wasTalking || stateChanged(prev?.[who], state)) {
        events.push({ who, talking, state: { ...state } });
      }
    }
    prev = Object.fromEntries(Object.entries(actors).map(([w, s]) => [w, { ...s }]));
    prevTalking = talkingWho;
    return events;
  };

  return {
    update,
    flush: () => {
      if (prevTalking === null) return [];
      const who = prevTalking;
      const state = prev?.[who] ?? {};
      prevTalking = null;
      return [{ who, talking: false, state: { ...state } }];
    },
  };
};
