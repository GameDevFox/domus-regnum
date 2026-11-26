import { describe, expect, it } from "vitest";

import { History } from "./history";

describe("History<T>", () => {
  it("starts with the initial value and no undo/redo", () => {
    const h = History(0);
    expect(h.value.peek()).toBe(0);
    expect(h.canUndo.peek()).toBe(false);
    expect(h.canRedo.peek()).toBe(false);
  });

  it("commits, then undoes and redoes along the timeline", () => {
    const h = History("a");
    h.commit("b");
    h.commit("c");
    expect(h.value.peek()).toBe("c");
    expect(h.canUndo.peek()).toBe(true);

    h.undo();
    expect(h.value.peek()).toBe("b");
    h.undo();
    expect(h.value.peek()).toBe("a");
    expect(h.canUndo.peek()).toBe(false);

    h.redo();
    expect(h.value.peek()).toBe("b");
    expect(h.canRedo.peek()).toBe(true);
  });

  it("clears the redo branch when committing after an undo", () => {
    const h = History("a");
    h.commit("b");
    h.undo(); // back to "a", "b" on the redo stack
    expect(h.canRedo.peek()).toBe(true);
    h.commit("c"); // new branch — "b" is gone
    expect(h.canRedo.peek()).toBe(false);
    h.redo(); // no-op
    expect(h.value.peek()).toBe("c");
  });

  it("undo/redo are no-ops at the ends of the timeline", () => {
    const h = History(1);
    h.undo();
    expect(h.value.peek()).toBe(1);
    h.redo();
    expect(h.value.peek()).toBe(1);
  });

  it("commitLive records a live-edited gesture as a single undo step", () => {
    const h = History("a");
    const before = h.value.peek();
    // simulate a live gesture: set the value directly several times (no history)…
    h.value.set("a1");
    h.value.set("a2");
    expect(h.canUndo.peek()).toBe(false); // nothing recorded yet
    // …then record the whole gesture in one step.
    h.commitLive(before);
    expect(h.canUndo.peek()).toBe(true);
    expect(h.value.peek()).toBe("a2"); // value stays at the live result
    h.undo();
    expect(h.value.peek()).toBe("a"); // one undo restores the pre-gesture state
  });

  it("notifies subscribers when the value changes", () => {
    const h = History(0);
    const seen: number[] = [];
    h.value._subscribe(() => seen.push(h.value.peek()));
    h.commit(1);
    h.undo();
    expect(seen).toEqual([1, 0]);
  });
});
