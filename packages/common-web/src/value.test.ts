import { Value, batch, peek, isValue } from "./value";

describe("Value", () => {
  it("peek returns the current value; set updates it", () => {
    const v = Value(1);
    expect(v.peek()).toBe(1);
    v.set(2);
    expect(v.peek()).toBe(2);
  });

  it("notifies subscribers in order on change", () => {
    const v = Value(0);
    const seen: number[] = [];
    v._subscribe(() => seen.push(v.peek()));
    v.set(1);
    v.set(2);
    expect(seen).toEqual([1, 2]);
  });

  it("does NOT notify when set to an Object.is-equal value (the mutation gotcha)", () => {
    const v = Value(5);
    let n = 0;
    v._subscribe(() => n++);
    v.set(5);
    expect(n).toBe(0);

    const obj = {};
    const o = Value<object>(obj);
    let m = 0;
    o._subscribe(() => m++);
    o.set(obj); // same reference — no fire
    expect(m).toBe(0);
    o.set({}); // new reference — fires
    expect(m).toBe(1);
  });

  it("update applies fn to the current value and notifies", () => {
    const v = Value(1);
    const seen: number[] = [];
    v._subscribe(() => seen.push(v.peek()));
    v.update((n) => n + 1);
    v.update((n) => n * 10);
    expect(v.peek()).toBe(20);
    expect(seen).toEqual([2, 20]);
  });

  it("update avoids the lost-update a captured peek() suffers across an await", async () => {
    // Two interleaved increments. Capturing peek() before the await reads the SAME base twice,
    // so the second write clobbers the first — net +1 (a lost update).
    const stale = Value(0);
    const a = stale.peek();
    const b = stale.peek();
    await Promise.resolve();
    stale.set(a + 1);
    stale.set(b + 1);
    expect(stale.peek()).toBe(1);

    // update reads `current` at write time, so the two compose — net +2.
    const live = Value(0);
    await Promise.resolve();
    live.update((n) => n + 1);
    live.update((n) => n + 1);
    expect(live.peek()).toBe(2);
  });

  it("update does NOT notify when the result is Object.is-equal", () => {
    const v = Value(5);
    let n = 0;
    v._subscribe(() => n++);
    v.update((x) => x); // same value — no fire (shares set's guard)
    expect(n).toBe(0);
  });

  it("_subscribe returns an unsubscribe", () => {
    const v = Value(0);
    let n = 0;
    const off = v._subscribe(() => n++);
    v.set(1);
    off();
    v.set(2);
    expect(n).toBe(1);
  });

  it("isValue and peek discriminate a Value from a constant", () => {
    expect(isValue(Value(1))).toBe(true);
    expect(isValue(1)).toBe(false);
    expect(peek(7)).toBe(7);
    expect(peek(Value(7))).toBe(7);
  });
});

describe("batch", () => {
  it("defers notifications to the end of the batch and dedupes per listener", () => {
    const w = Value(10);
    const h = Value(12);
    let runs = 0;
    const listener = () => runs++; // one listener watching both, like an effect would
    w._subscribe(listener);
    h._subscribe(listener);

    batch(() => {
      w.set(14);
      h.set(20);
      expect(runs).toBe(0); // nothing fired mid-batch
      expect(w.peek()).toBe(14); // but reads see the new values immediately
      expect(h.peek()).toBe(20);
    });
    expect(runs).toBe(1); // one flush for both writes — no inconsistent intermediate run
  });

  it("nested batches flush once, at the end of the outermost", () => {
    const v = Value(0);
    let runs = 0;
    v._subscribe(() => runs++);
    batch(() => {
      v.set(1);
      batch(() => v.set(2));
      expect(runs).toBe(0);
    });
    expect(runs).toBe(1);
  });

  it("skips listeners for values that end the batch back at their original value", () => {
    const v = Value(1);
    let runs = 0;
    v._subscribe(() => runs++);
    batch(() => v.set(1)); // Object.is-equal write — never queued
    expect(runs).toBe(0);
  });

  it("a set from a flushed listener flows into the next flush generation (chains settle)", () => {
    const a = Value(0);
    const b = Value(0);
    const seen: number[] = [];
    a._subscribe(() => b.set(a.peek() * 10));
    b._subscribe(() => seen.push(b.peek()));
    batch(() => a.set(2));
    expect(seen).toEqual([20]); // the chain fully settled by the time batch() returns
  });

  it("coalesces a diamond: two writes converging on one consumer fire it once per generation", () => {
    const w = Value(1);
    const h = Value(1);
    const area = Value(1);
    let consumerRuns = 0;
    const recompute = () => area.set(w.peek() * h.peek());
    w._subscribe(recompute);
    h._subscribe(recompute);
    area._subscribe(() => consumerRuns++);
    batch(() => {
      w.set(3);
      h.set(4);
    });
    expect(area.peek()).toBe(12);
    expect(consumerRuns).toBe(1); // recompute deduped, so area set once with the final value
  });

  it("flushes even when the batch body throws", () => {
    const v = Value(0);
    let runs = 0;
    v._subscribe(() => runs++);
    expect(() =>
      batch(() => {
        v.set(1);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(runs).toBe(1);
  });
});

describe("Value — equals option", () => {
  it("suppresses notification (and the write) when equals says equal", () => {
    const v = Value({ x: 1 }, { equals: (a, b) => a.x === b.x });
    const first = v.peek();
    let fires = 0;
    v._subscribe(() => fires++);

    v.set({ x: 1 }); // structurally equal — dropped
    expect(fires).toBe(0);
    expect(v.peek()).toBe(first); // previous instance kept

    v.set({ x: 2 });
    expect(fires).toBe(1);
    expect(v.peek().x).toBe(2);
  });

  it("equals: () => false makes every set notify, even identical values", () => {
    const v = Value(5, { equals: () => false });
    let fires = 0;
    v._subscribe(() => fires++);
    v.set(5);
    v.set(5);
    expect(fires).toBe(2);
  });
});
