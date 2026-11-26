import { Scope } from "./scope";
import { Value, batch } from "./value";

describe("Scope", () => {
  it("runs cleanup tasks in reverse order", () => {
    const s = Scope();
    const order: number[] = [];
    s.add(() => order.push(1));
    s.add(() => order.push(2));
    s.cleanup();
    expect(order).toEqual([2, 1]);
  });

  it("child cleanup cascades from the parent", () => {
    const s = Scope();
    const child = s.child();
    let cleaned = false;
    child.add(() => (cleaned = true));
    s.cleanup();
    expect(cleaned).toBe(true);
  });

  it("effect runs immediately and re-runs when a used Value changes", () => {
    const s = Scope();
    const v = Value(1);
    const seen: number[] = [];
    s.effect((use) => seen.push(use(v)));
    expect(seen).toEqual([1]);
    v.set(2);
    expect(seen).toEqual([1, 2]);
  });

  it("effect only subscribes to Values it actually reads", () => {
    const s = Scope();
    const a = Value(1);
    const b = Value(10);
    let runs = 0;
    s.effect((use) => {
      runs++;
      use(a);
    });
    expect(runs).toBe(1);
    b.set(11); // not read — no re-run
    expect(runs).toBe(1);
    a.set(2);
    expect(runs).toBe(2);
  });

  it("cleans the per-run runScope before each re-run, and on teardown", () => {
    const s = Scope();
    const v = Value(0);
    const cleaned: number[] = [];
    s.effect((use, runScope) => {
      const n = use(v);
      runScope.add(() => cleaned.push(n));
    });
    expect(cleaned).toEqual([]);
    v.set(1);
    expect(cleaned).toEqual([0]); // run for 0 cleaned before run for 1
    v.set(2);
    expect(cleaned).toEqual([0, 1]);
    s.cleanup();
    expect(cleaned).toEqual([0, 1, 2]); // last run cleaned on teardown
  });

  it("effect stops re-running after the scope is cleaned up", () => {
    const s = Scope();
    const v = Value(0);
    let runs = 0;
    s.effect((use) => {
      runs++;
      use(v);
    });
    s.cleanup();
    v.set(1);
    expect(runs).toBe(1);
  });

  it("computed derives a Value and updates on dependency change", () => {
    const s = Scope();
    const n = Value(2);
    const doubled = s.computed((use) => use(n) * 2);
    expect(doubled.peek()).toBe(4);
    n.set(5);
    expect(doubled.peek()).toBe(10);
  });

  it("effect re-tracks dependencies each run, dropping Values no longer read", () => {
    const s = Scope();
    const cond = Value(true);
    const a = Value(1);
    const b = Value(2);
    let runs = 0;
    s.effect((use) => {
      runs++;
      if (use(cond)) use(a);
      else use(b);
    });
    expect(runs).toBe(1);
    a.set(5); // currently read — re-runs
    expect(runs).toBe(2);
    cond.set(false); // branch flips: now reads b, not a
    expect(runs).toBe(3);
    a.set(9); // no longer read — must NOT re-run
    expect(runs).toBe(3);
    b.set(7); // newly read — re-runs
    expect(runs).toBe(4);
  });

  it("add() on a disposed scope runs the task immediately (late async cleanup can't leak)", () => {
    const s = Scope();
    s.cleanup();
    let ran = false;
    s.add(() => (ran = true));
    expect(ran).toBe(true);
  });

  it("child() of a disposed scope is born disposed", () => {
    const s = Scope();
    s.cleanup();
    const child = s.child();
    let ran = false;
    child.add(() => (ran = true)); // runs immediately — the child can never be torn down later
    expect(ran).toBe(true);
  });

  it("effect on a disposed scope runs once without subscribing", () => {
    const s = Scope();
    s.cleanup();
    const v = Value(0);
    let runs = 0;
    s.effect((use) => {
      runs++;
      use(v);
    });
    expect(runs).toBe(1); // still builds (so resources get created + immediately released)…
    v.set(1);
    expect(runs).toBe(1); // …but never reacts
  });

  it("a batched notification does not re-run an effect torn down during the batch", () => {
    const s = Scope();
    const v = Value(0);
    let runs = 0;
    s.effect((use) => {
      runs++;
      use(v);
    });
    batch(() => {
      v.set(1); // queued
      s.cleanup(); // effect dies before the flush
    });
    expect(runs).toBe(1);
  });

  it("listen registers a handler and removes the same one on cleanup", () => {
    const s = Scope();
    const log: Array<[string, unknown, string]> = [];
    const target = {
      addEventListener: (t: string, h: unknown) => log.push([t, h, "add"]),
      removeEventListener: (t: string, h: unknown) => log.push([t, h, "remove"]),
    } as unknown as EventTarget;
    const fn = () => {};
    s.listen(target, "click", fn);
    expect(log).toEqual([["click", fn, "add"]]);
    s.cleanup();
    expect(log).toEqual([
      ["click", fn, "add"],
      ["click", fn, "remove"],
    ]);
  });
});

describe("scope.own", () => {
  it("disposes owned resources on cleanup, in one task", () => {
    const s = Scope();
    const order: string[] = [];
    const d = (name: string) => ({ dispose: () => order.push(name) });
    const geom = s.own(d("geom"), d("mat"), d("tex"));
    expect(order).toEqual([]); // nothing until cleanup
    expect(geom.dispose).toBeDefined(); // returns the first resource
    s.cleanup();
    expect(order).toEqual(["geom", "mat", "tex"]);
  });

  it("on a disposed scope, own() disposes immediately (late async load can't leak)", () => {
    const s = Scope();
    s.cleanup();
    let disposed = false;
    s.own({ dispose: () => (disposed = true) });
    expect(disposed).toBe(true);
  });

  it("computed passes the equals option through", () => {
    const s = Scope();
    const src = Value(0);
    const derived = s.computed((use) => ({ bucket: Math.floor(use(src) / 10) }), {
      equals: (a, b) => a.bucket === b.bucket,
    });
    let fires = 0;
    derived._subscribe(() => fires++);
    src.set(3); // bucket 0 → 0: suppressed
    src.set(7); // still bucket 0
    expect(fires).toBe(0);
    src.set(12); // bucket 1
    expect(fires).toBe(1);
  });
});

describe("scope.cleanup — re-entrancy", () => {
  it("a cleanup task that triggers cleanup() again cannot re-run the sweep", () => {
    const s = Scope();
    const order: string[] = [];
    s.add(() => order.push("teardown")); // registered first → runs LAST
    s.add(() => {
      order.push("end-state");
      s.cleanup(); // e.g. an end-state write observed by a watcher that calls finish()
    });
    s.cleanup();
    expect(order).toEqual(["end-state", "teardown"]); // each task exactly once, sweep completed
  });

  it("an effect subscribed to a value written by a LATER cleanup task fires mid-sweep at most once", () => {
    const s = Scope();
    const v = Value(0);
    let fires = 0;
    s.effect((use) => {
      use(v);
      fires++;
      if (fires > 3) throw new Error("storm");
    });
    fires = 0;
    s.add(() => v.set(1)); // registered AFTER the effect → runs FIRST in the reverse sweep
    expect(() => s.cleanup()).not.toThrow(); // the effect may see the write once; never a storm
    expect(fires).toBeLessThanOrEqual(1);
  });
});
