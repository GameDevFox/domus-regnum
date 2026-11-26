import { describe, expect, it, vi } from "vitest";

import { collectImages, effect, script } from "./ast";
import { VNEngine } from "./runtime";

describe("VNEngine control flow", () => {
  it("steps through say lines on advance, then finishes", () => {
    const s = script().say("eira", "one").say("two").build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().dialogue).toEqual({ who: "eira", text: "one" });
    expect(engine.status()).toBe("awaiting-advance");

    engine.advance();
    expect(engine.snapshot().dialogue).toEqual({ text: "two" }); // narration, no speaker

    engine.advance();
    expect(engine.status()).toBe("done");
    expect(engine.snapshot().dialogue).toBeNull();
  });

  it("applies a burst of show/hide before the next blocking say", () => {
    const s = script()
      .show("bg", "manor", { layer: "bg", at: { z: 0 } })
      .show("eira", "happy", { at: { z: 1 } })
      .say("hello")
      .build();
    const engine = VNEngine(s);

    engine.start();
    const snap = engine.snapshot();
    expect(snap.layers.bg.map((e) => e.tag)).toEqual(["bg"]);
    expect(snap.layers.sprites.map((e) => e.tag)).toEqual(["eira"]);
    expect(snap.dialogue).toEqual({ text: "hello" });
  });

  it("replaces a sprite when the same tag is re-shown", () => {
    const s = script().show("eira", "happy").say("a").show("eira", "sad").say("b").build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().layers.sprites).toHaveLength(1);
    expect(engine.snapshot().layers.sprites[0].image).toBe("happy");

    engine.advance();
    expect(engine.snapshot().layers.sprites).toHaveLength(1);
    expect(engine.snapshot().layers.sprites[0].image).toBe("sad");
  });

  it("carries an entrance on first show but not on a re-show (expression swap)", () => {
    const s = script()
      .show("eira", "happy", { enter: { from: "left" } })
      .say("a")
      .show("eira", "sad", { enter: { from: "left" } })
      .say("b")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().layers.sprites[0].enter).toEqual({ from: "left" });

    engine.advance(); // swap to "sad" — same tag, so no replayed entrance
    expect(engine.snapshot().layers.sprites[0].image).toBe("sad");
    expect(engine.snapshot().layers.sprites[0].enter).toBeUndefined();
  });

  it("runs exec onLeave teardowns when leaving the beat (advance / before next exec)", () => {
    const log: string[] = [];
    const s = script()
      .exec((ctx) => ctx.onLeave(() => log.push("leave-1")))
      .say("one")
      .exec(() => log.push("enter-2"))
      .say("two")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(log).toEqual([]); // not until we leave the beat

    engine.advance(); // leave "one": cleanup fires BEFORE the next exec runs
    expect(log).toEqual(["leave-1", "enter-2"]);
  });

  it("fires onLeave on choose and on reaching done", () => {
    const log: string[] = [];
    const s = script()
      .exec((ctx) => ctx.onLeave(() => log.push("left-menu-beat")))
      .menu("pick", [{ text: "go", target: "end" }])
      .label("end")
      .exec((ctx) => ctx.onLeave(() => log.push("left-final-beat")))
      .say("bye")
      .build();
    const engine = VNEngine(s);

    engine.start();
    engine.choose(0);
    expect(log).toEqual(["left-menu-beat"]); // teardown ran when leaving the menu beat

    engine.advance(); // "bye" → done
    expect(log).toEqual(["left-menu-beat", "left-final-beat"]);
    expect(engine.status()).toBe("done");
  });

  it("effect() registers a returned cleanup via onLeave", () => {
    const log: string[] = [];
    const playClip = (name: string) =>
      effect(() => {
        log.push(`play:${name}`);
        return () => log.push(`stop:${name}`);
      });
    const s = script().exec(playClip("voice1")).say("one").say("two").build();
    const engine = VNEngine(s);

    engine.start();
    expect(log).toEqual(["play:voice1"]); // setup ran on the beat
    engine.advance(); // leave the beat → cleanup
    expect(log).toEqual(["play:voice1", "stop:voice1"]);
  });

  it("collectImages lists distinct show images in first-seen order", () => {
    const s = script()
      .show("bg", "manor", { layer: "bg" })
      .show("eira", "happy")
      .say("a")
      .show("eira", "happy") // re-show same image — deduped
      .show("eira", "sad")
      .build();
    expect(collectImages(s)).toEqual(["manor", "happy", "sad"]);
  });

  it("sorts a layer by z order", () => {
    const s = script()
      .show("top", "a", { at: { z: 5 } })
      .show("bot", "b", { at: { z: 1 } })
      .say("x")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().layers.sprites.map((e) => e.tag)).toEqual(["bot", "top"]);
  });

  it("branches through a menu to the chosen label", () => {
    const s = script()
      .menu("pick", [
        { text: "left", target: "L" },
        { text: "right", target: "R" },
      ])
      .label("L")
      .say("went left")
      .jump("end")
      .label("R")
      .say("went right")
      .label("end")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.status()).toBe("awaiting-choice");
    expect(engine.snapshot().choices).toEqual([{ text: "left" }, { text: "right" }]);

    engine.choose(1);
    expect(engine.snapshot().dialogue).toEqual({ text: "went right" });
    engine.advance();
    expect(engine.status()).toBe("done");
  });

  it("shows the menu prompt as narration above the choices", () => {
    const s = script()
      .menu("What now?", [
        { text: "stay", target: "end" },
        { text: "go", target: "end" },
      ])
      .label("end")
      .say("done")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.status()).toBe("awaiting-choice");
    expect(engine.snapshot().dialogue).toEqual({ text: "What now?" });
    expect(engine.snapshot().choices).toEqual([{ text: "stay" }, { text: "go" }]);
  });

  it("a menu with no prompt leaves the dialogue box empty", () => {
    const s = script()
      .menu([{ text: "only", target: "end" }])
      .label("end")
      .say("done")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.status()).toBe("awaiting-choice");
    expect(engine.snapshot().dialogue).toBeNull();
    expect(engine.snapshot().choices).toEqual([{ text: "only" }]);
  });

  it("call pushes a return address and return pops it", () => {
    const s = script()
      .call("sub")
      .say("after call")
      .jump("done")
      .label("sub")
      .say("in sub")
      .return()
      .label("done")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().dialogue).toEqual({ text: "in sub" });
    engine.advance();
    expect(engine.snapshot().dialogue).toEqual({ text: "after call" });
    engine.advance();
    expect(engine.status()).toBe("done");
  });

  it("runs exec hooks, mutates vars, and can branch on game state", () => {
    const s = script()
      .exec((ctx) => {
        ctx.vars.gold = 10;
      })
      .exec((ctx) => {
        if ((ctx.vars.gold as number) >= 10) ctx.goto("rich");
      })
      .say("poor")
      .jump("end")
      .label("rich")
      .say("rich")
      .label("end")
      .build();
    const engine = VNEngine(s);

    engine.start();
    expect(engine.snapshot().dialogue).toEqual({ text: "rich" });
  });

  it("notifies subscribers and supports save/restore", () => {
    const s = script().say("one").say("two").say("three").build();
    const engine = VNEngine(s);
    const seen = vi.fn();
    engine.subscribe(seen);

    engine.start();
    engine.advance(); // now on "two"
    expect(seen).toHaveBeenCalled();

    const saved = engine.save();
    const resumed = VNEngine(s, { restore: saved });
    expect(resumed.snapshot().dialogue).toEqual({ text: "two" });
    resumed.advance();
    expect(resumed.snapshot().dialogue).toEqual({ text: "three" });
  });
});

describe("textSpeed statement", () => {
  const s = () =>
    script()
      .label("start")
      .say("plain line")
      .textSpeed(30)
      .say("slow line")
      .textSpeed()
      .say("default again")
      .label("elsewhere")
      .say("still carrying the last speed")
      .build();

  it("carries the current speed on the snapshot; omitted arg reverts to undefined", () => {
    const e = VNEngine(s());
    e.start();
    expect(e.snapshot().textSpeed).toBeUndefined(); // before any textSpeed statement
    e.advance();
    expect(e.snapshot().textSpeed).toBe(30); // "slow line" is on screen
    e.advance();
    expect(e.snapshot().textSpeed).toBeUndefined(); // reverted for "default again"
  });

  it("persists across start() — a preference, not scene content", () => {
    const e = VNEngine(s());
    e.start();
    e.advance(); // now at "slow line", speed 30
    e.start("elsewhere");
    expect(e.snapshot().textSpeed).toBe(30);
  });

  it("round-trips through save/restore", () => {
    const e = VNEngine(s());
    e.start();
    e.advance(); // speed 30 live
    const resumed = VNEngine(s(), { restore: e.save() });
    expect(resumed.snapshot().textSpeed).toBe(30);
  });
});

describe("actor state", () => {
  it("merges per actor: later keys overlay, unrelated keys survive, undefined deletes", () => {
    const e = VNEngine(
      script()
        .actor("aki", { mood: "neutral", pose: "seated" })
        .say("beat 1")
        .actor("aki", { mood: "proud" })
        .say("beat 2")
        .actor("aki", { pose: undefined })
        .say("beat 3")
        .build(),
    );
    e.start();
    expect(e.snapshot().actors.aki).toEqual({ mood: "neutral", pose: "seated" });
    e.advance();
    expect(e.snapshot().actors.aki).toEqual({ mood: "proud", pose: "seated" });
    e.advance();
    expect(e.snapshot().actors.aki).toEqual({ mood: "proud" });
  });

  it("say's actor option lands WITH the line", () => {
    const e = VNEngine(
      script().say("aki", "plain").say("aki", "Sharp eyes!", { actor: { mood: "proud" } }).build(),
    );
    e.start();
    expect(e.snapshot().actors.aki).toBeUndefined();
    e.advance();
    expect(e.snapshot().dialogue?.text).toBe("Sharp eyes!");
    expect(e.snapshot().actors.aki).toEqual({ mood: "proud" });
  });

  it("persists across start() jumps and round-trips through save/restore", () => {
    const e = VNEngine(
      script().label("a").say("aki", "hi", { actor: { mood: "proud" } }).label("b").say("elsewhere").build(),
    );
    e.start();
    e.start("b");
    expect(e.snapshot().actors.aki).toEqual({ mood: "proud" });
    const resumed = VNEngine(script().say("x").build(), { restore: e.save() });
    expect(resumed.snapshot().actors.aki).toEqual({ mood: "proud" });
  });

  it("snapshots are isolated — mutating one doesn't leak into the engine", () => {
    const e = VNEngine(script().actor("aki", { mood: "calm" }).say("x").build());
    e.start();
    const snap = e.snapshot();
    snap.actors.aki.mood = "hacked";
    expect(e.snapshot().actors.aki.mood).toBe("calm");
  });
});

describe("wait statement", () => {
  it("blocks like a say (no dialogue), carries ms on the snapshot, and advance() resumes it", () => {
    const e = VNEngine(script().wait(1100).say("aki", "hi").build());
    e.start();
    expect(e.snapshot().status).toBe("awaiting-advance");
    expect(e.snapshot().waiting).toEqual({ ms: 1100 });
    expect(e.snapshot().dialogue).toBeNull();
    e.advance();
    expect(e.snapshot().waiting).toBeNull();
    expect(e.snapshot().dialogue?.text).toBe("hi");
  });

  it("start(label) clears a pending wait; save/restore carries one", () => {
    const e = VNEngine(script().label("w").wait(500).label("line").say("x").build());
    e.start("w");
    expect(e.snapshot().waiting).toEqual({ ms: 500 });
    const resumed = VNEngine(script().wait(500).say("x").build(), { restore: e.save() });
    expect(resumed.snapshot().waiting).toEqual({ ms: 500 });
    e.start("line");
    expect(e.snapshot().waiting).toBeNull();
  });
});

describe("action / await (performances)", () => {
  // A controllable performer: each fire returns a handle we resolve/skip from the test.
  const rig = () => {
    const fired: string[] = [];
    const skips: string[] = [];
    const resolvers: Record<string, () => void> = {};
    const performer = (name: string) => {
      fired.push(name);
      return {
        done: new Promise<void>((res) => (resolvers[name] = res)),
        skip: () => skips.push(name),
      };
    };
    return { fired, skips, resolvers, performer };
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0)); // let settle microtasks land

  it("fires the performer with name+params; missing performers warn and don't block", () => {
    const seen: unknown[] = [];
    const e = VNEngine(
      script().action("Aki", "enter", { from: "right" }).action("ghost", "boo").say("x").build(),
      { performers: { Aki: (name, params) => void seen.push([name, params]) } },
    );
    e.start();
    expect(seen).toEqual([["enter", { from: "right" }]]);
    expect(e.snapshot().dialogue?.text).toBe("x"); // ran straight through to the say
  });

  it("await(target) holds, and completion auto-resumes with cleanups", async () => {
    const r = rig();
    const e = VNEngine(
      script().action("Aki", "enter").await("Aki").say("Aki", "seated").build(),
      { performers: { Aki: r.performer } },
    );
    e.start();
    expect(e.snapshot().holding).toEqual({ pending: 1 });
    expect(e.snapshot().dialogue).toBeNull();
    r.resolvers.enter();
    await tick();
    expect(e.snapshot().holding).toBeNull();
    expect(e.snapshot().dialogue?.text).toBe("seated");
  });

  it("a manual advance during a hold SKIPS the stragglers to their end state", () => {
    const r = rig();
    const e = VNEngine(script().action("Aki", "enter").await().say("go").build(), {
      performers: { Aki: r.performer },
    });
    e.start();
    expect(e.snapshot().holding).toEqual({ pending: 1 });
    e.advance(); // the player clicked through
    expect(r.skips).toEqual(["enter"]);
    expect(e.snapshot().dialogue?.text).toBe("go");
  });

  it("await() with nothing outstanding falls straight through", () => {
    const e = VNEngine(script().await().say("x").build());
    e.start();
    expect(e.snapshot().dialogue?.text).toBe("x");
  });

  it("await(targets) joins only those targets' performances", async () => {
    const r = rig();
    const e = VNEngine(
      script()
        .action("Aki", "enter")
        .action("audio", "play")
        .await("Aki")
        .say("in")
        .build(),
      { performers: { Aki: r.performer, audio: r.performer } },
    );
    e.start();
    expect(e.snapshot().holding).toEqual({ pending: 1 }); // audio's play is NOT joined
    r.resolvers.enter();
    await tick();
    expect(e.snapshot().dialogue?.text).toBe("in");
  });

  it("the scoped form joins performances fired INSIDE the block only", async () => {
    const r = rig();
    const e = VNEngine(
      script()
        .action("Aki", "outer") // outstanding, but OUTSIDE the block
        .await((s) => s.say("during").action("Aki", "inner"))
        .say("after")
        .build(),
      { performers: { Aki: r.performer } },
    );
    e.start();
    expect(e.snapshot().dialogue?.text).toBe("during"); // the block's say paces as usual
    e.advance();
    expect(e.snapshot().holding).toEqual({ pending: 1 }); // holding for `inner` only
    r.resolvers.inner();
    await tick();
    expect(e.snapshot().dialogue?.text).toBe("after"); // resumed though `outer` never resolved
  });

  it("void handles are instant; bare promises are awaitable but skip-less", async () => {
    let resolve!: () => void;
    const e = VNEngine(
      script().action("fx", "flash").action("fx2", "rumble").await().say("x").build(),
      {
        performers: {
          fx: () => undefined, // instant
          fx2: () => new Promise<void>((r) => (resolve = r)),
        },
      },
    );
    e.start();
    expect(e.snapshot().holding).toEqual({ pending: 1 });
    e.advance(); // no skip() exists — the manual advance still proceeds
    expect(e.snapshot().dialogue?.text).toBe("x");
    resolve(); // late completion of an already-flushed entry must be harmless
    await tick();
    expect(e.snapshot().dialogue?.text).toBe("x");
  });
});

describe("label tracking", () => {
  it("snapshot carries the most recent label passed; start(label) updates it; save/restore keeps it", () => {
    const s = script().label("a").say("one").label("b").say("two").build();
    const e = VNEngine(s);
    e.start();
    expect(e.snapshot().label).toBe("a");
    e.advance();
    expect(e.snapshot().label).toBe("b");
    e.start("a");
    expect(e.snapshot().label).toBe("a");
    const resumed = VNEngine(s, { restore: e.save() });
    expect(resumed.snapshot().label).toBe("a");
  });
});

describe("beat tracking + fast-forward resume", () => {
  const build = () =>
    script()
      .label("start")
      .action("audio", "sting")
      .say("Aki", "one")
      .wait(500)
      .action("Aki", "bow")
      .say("Aki", "two")
      .say("Aki", "three")
      .menu("choose", [{ text: "go", target: "start" }])
      .build();

  it("beat counts blocks passed since the label", () => {
    const e = VNEngine(build());
    e.start();
    expect(e.snapshot()).toMatchObject({ label: "start", beat: 0 }); // on "one"
    e.advance(); // past "one" → blocked on wait
    expect(e.snapshot().beat).toBe(1);
    e.advance(); // past the wait → on "two"
    expect(e.snapshot().beat).toBe(2);
  });

  it("start(label, { toBeat }) resumes the exact line, silently", () => {
    const fired: string[] = [];
    const e = VNEngine(build(), {
      performers: { audio: (n) => void fired.push(`audio:${n}`), Aki: (n) => void fired.push(`Aki:${n}`) },
    });
    e.start();
    e.advance();
    e.advance(); // sitting on "two" (beat 2)
    const { label, beat } = e.snapshot();

    const fresh = VNEngine(build(), {
      performers: { audio: (n) => void fired.push(`audio:${n}`), Aki: (n) => void fired.push(`Aki:${n}`) },
    });
    fired.length = 0;
    fresh.start(label, { toBeat: beat });
    expect(fired).toEqual([]); // NO stinger, NO bow — replayed presentation stays quiet
    expect(fresh.snapshot().dialogue?.text).toBe("two"); // landed on the very line
    expect(fresh.snapshot().beat).toBe(2);
    fresh.advance();
    expect(fresh.snapshot().dialogue?.text).toBe("three"); // and plays on normally
  });

  it("a menu stops fast-forward — a choice can't be assumed", () => {
    const e = VNEngine(build());
    e.start("start", { toBeat: 99 }); // far past everything
    expect(e.snapshot().status).toBe("awaiting-choice"); // parked at the menu, not beyond
  });
});

describe("interrupt + silent beat-0 resume", () => {
  it("interrupt() skips every outstanding performance and releases a hold", () => {
    const skips: string[] = [];
    const e = VNEngine(
      script().action("Aki", "enter").action("fx", "swirl").await().say("go").build(),
      {
        performers: {
          Aki: () => ({ done: new Promise<void>(() => {}), skip: () => skips.push("Aki") }),
          fx: () => ({ done: new Promise<void>(() => {}), skip: () => skips.push("fx") }),
        },
      },
    );
    e.start();
    expect(e.snapshot().holding).toEqual({ pending: 2 });
    e.interrupt();
    expect(skips.sort()).toEqual(["Aki", "fx"]);
    expect(e.snapshot().holding).toBeNull();
    expect(e.snapshot().dialogue?.text).toBe("go"); // the hold auto-resumed
  });

  it("start(label, { toBeat: 0 }) suppresses pre-block actions — a silent resume at line one", () => {
    const fired: string[] = [];
    const e = VNEngine(
      script().label("start").action("audio", "sting").say("Aki", "one").build(),
      { performers: { audio: (n) => void fired.push(n) } },
    );
    e.start("start", { toBeat: 0 });
    expect(fired).toEqual([]); // no stinger refire
    expect(e.snapshot().dialogue?.text).toBe("one");
  });
});
