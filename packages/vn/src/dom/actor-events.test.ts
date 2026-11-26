import { describe, expect, it } from "vitest";

import { ActorTracker } from "./actor-events";

describe("ActorTracker", () => {
  it("first update is a mount flush: every known actor emits once", () => {
    const t = ActorTracker();
    const events = t.update({ aki: { mood: "proud" }, violet: {} }, null);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.who === "aki")).toEqual({ who: "aki", talking: false, state: { mood: "proud" } });
  });

  it("emits only on change after the flush; talking flips and state diffs each count", () => {
    const t = ActorTracker();
    t.update({ aki: { mood: "neutral" } }, null);
    expect(t.update({ aki: { mood: "neutral" } }, null)).toEqual([]); // nothing changed

    const talk = t.update({ aki: { mood: "neutral" } }, "aki");
    expect(talk).toEqual([{ who: "aki", talking: true, state: { mood: "neutral" } }]);

    const moodAndStop = t.update({ aki: { mood: "proud" } }, null);
    expect(moodAndStop).toEqual([{ who: "aki", talking: false, state: { mood: "proud" } }]);
  });

  it("an instant pulse is two updates: true then false", () => {
    const t = ActorTracker();
    t.update({}, null);
    expect(t.update({}, "aki")).toEqual([{ who: "aki", talking: true, state: {} }]);
    expect(t.update({}, null)).toEqual([{ who: "aki", talking: false, state: {} }]);
  });

  it("actors change independently; an unrelated speaker doesn't re-emit bystanders", () => {
    const t = ActorTracker();
    t.update({ aki: { mood: "neutral" }, violet: { mood: "wry" } }, null);
    const events = t.update({ aki: { mood: "neutral" }, violet: { mood: "wry" } }, "violet");
    expect(events).toEqual([{ who: "violet", talking: true, state: { mood: "wry" } }]);
  });

  it("flush emits talking:false for the live speaker only, once", () => {
    const t = ActorTracker();
    t.update({ aki: { mood: "proud" } }, "aki");
    expect(t.flush()).toEqual([{ who: "aki", talking: false, state: { mood: "proud" } }]);
    expect(t.flush()).toEqual([]); // idempotent
  });

  it("flush with no live speaker is silent", () => {
    const t = ActorTracker();
    t.update({ aki: {} }, null);
    expect(t.flush()).toEqual([]);
  });
});
