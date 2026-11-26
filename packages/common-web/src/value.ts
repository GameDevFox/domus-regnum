const IS_VALUE = Symbol("kitsune.value");

export type Value<T> = {
  peek: () => T;
  set: (newVal: T) => void;
  // Read-modify-write: applies fn to the CURRENT value at call time, atomically. Prefer this
  // over `set(fn(peek()))` — the read happens at the moment of the write, so it can't go stale
  // across an `await` (the captured-peek form can lose updates if the value changes meanwhile).
  // A distinct method, not a `set` overload, so it stays unambiguous even for `Value<function>`.
  update: (fn: (prev: T) => T) => void;
  _subscribe: (fn: () => void) => () => void;
};

// Accept either a raw constant or a reactive Value — the consumer doesn't care which.
export type UsedAs<T> = T | Value<T>;

export const isValue = (v: unknown): v is Value<unknown> =>
  typeof v === "object" && v !== null && IS_VALUE in (v as object);

export const peek = <T>(v: UsedAs<T>): T => (isValue(v) ? (v as Value<T>).peek() : (v as T));

// Defers notifications until `fn` returns, deduped per listener — so a multi-Value edit
// (e.g. a rect drag updating w AND h) reaches each subscriber once, with all writes applied,
// instead of N times with inconsistent intermediate states. Reads inside the batch see the
// new values immediately (only notification is deferred). Nestable: flushes at the outermost
// end.
//
// The flush runs in GENERATIONS until quiescent: writes made by flushed listeners (computeds
// propagating) are deferred into the next generation and deduped again — so a whole derivation
// chain (w,h → rect → floor/walls/spawn → placements) settles with each listener running once
// per generation, and the final consumers see exactly one coherent update.
let batchDepth = 0;
const pending = new Set<() => void>();

export const batch = (fn: () => void): void => {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pending.size) {
      batchDepth++; // stay batched while flushing so cascaded writes coalesce per generation
      try {
        while (pending.size) {
          const generation = Array.from(pending);
          pending.clear();
          generation.forEach((listener) => listener());
        }
      } finally {
        batchDepth--;
      }
    }
  }
};

// Options for Value. `equals` replaces the Object.is change-guard — pass a structural
// comparison for object values (fresh-instance Vector3s, tuples) so numerically-identical
// recomputes don't fire subscribers. An "equal" write is dropped entirely — peek() keeps
// returning the previous instance, exactly like the default guard.
export type ValueOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

// A Value has no lifetime of its own — its listeners are released from the subscriber
// side (see Scope.effect) — so it's a free function, not a scope method.
export const Value = <T>(initial: T, { equals = Object.is }: ValueOptions<T> = {}): Value<T> => {
  let current = initial;
  const listeners = new Set<() => void>();

  const set = (next: T) => {
    if (equals(next, current)) return;
    current = next;
    if (batchDepth > 0) listeners.forEach((fn) => pending.add(fn));
    else listeners.forEach((fn) => fn());
  };

  const value: Value<T> = {
    peek: () => current,
    set,
    update: (fn) => set(fn(current)),
    _subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  (value as any)[IS_VALUE] = true;
  return value;
};
