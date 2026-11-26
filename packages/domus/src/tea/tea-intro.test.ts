import { describe, expect, it } from "vitest";

import { VNEngine } from "@kitsune/vn";

import { buildIntroScript } from "./tea-intro";

// The intro script's control flow, driven headlessly. The load-bearing assertion: choosing
// "Ready" must land the engine in "done" (parked at the standby label), NOT awaiting-advance —
// a fall-through there left Aki mouth-flapping through the demo with no dialogue box mounted.

const make = () => {
  const calls: string[] = [];
  const engine = VNEngine(
    buildIntroScript({
      startDemo: () => calls.push("startDemo"),
      endIntro: () => calls.push("endIntro"),
    }),
    {
      // Instant stub performers: the entrance/stinger fire as intents; void = already complete,
      // so the script's await falls straight through headlessly.
      performers: {
        Aki: (name) => void calls.push(`Aki:${name}`),
        audio: (name) => void calls.push(`audio:${name}`),
      },
    },
  );
  return { engine, calls };
};

// Click through say-lines until the machine blocks on something else (or gives up). Generous but
// bounded: the tutorial dialogue grows as it's authored, so the cap must clear the longest run yet a
// genuinely-stuck "awaiting-advance" bug still fails fast rather than hanging.
const advanceToChoice = (engine: ReturnType<typeof make>["engine"]) => {
  for (let i = 0; i < 40 && engine.snapshot().status === "awaiting-advance"; i++) engine.advance();
};

describe("tea intro script", () => {
  it("choosing 'Ready' starts the demo and HALTS the script (no fall-through into the verdicts)", () => {
    const { engine, calls } = make();
    engine.start();
    // The opening intents fire inside start(); instant performers mean the await falls through
    // to the stinger breath (the bow only fires after it).
    expect(calls).toEqual(["audio:stinger", "Aki:enter"]);
    expect(engine.snapshot().waiting).not.toBeNull(); // the stinger breath — duration is authored tuning, not contract
    engine.advance(); // through the breath
    expect(calls).toEqual(["audio:stinger", "Aki:enter", "Aki:bow"]);
    // The greeting is authored prose (edited freely) — assert the SHAPE, not the wording.
    expect(engine.snapshot().dialogue?.who).toBe("Aki");
    expect(engine.snapshot().dialogue?.text.length).toBeGreaterThan(0);
    advanceToChoice(engine);
    expect(engine.snapshot().status).toBe("awaiting-choice");

    engine.choose(0); // "Ready — I'm watching."
    expect(calls).toEqual(["audio:stinger", "Aki:enter", "Aki:bow", "startDemo"]);
    expect(engine.snapshot().status).toBe("done"); // parked at standby — NOT awaiting-advance
    expect(engine.snapshot().dialogue).toBeNull(); // nothing left on screen to mouth along to
  });

  it("each verdict coaches, then can loop back into the demo", () => {
    for (const label of ["right", "wrong", "missed"]) {
      const { engine, calls } = make();
      engine.start(label);
      expect(engine.snapshot().status).toBe("awaiting-advance");
      expect(engine.snapshot().dialogue?.who).toBe("Aki");
      advanceToChoice(engine);
      engine.choose(0); // "again" option → demo → halt
      expect(calls).toEqual(["startDemo"]);
      expect(engine.snapshot().status).toBe("done");
    }
  });

  it("declining a verdict menu reaches the outro and ends the intro", () => {
    const { engine, calls } = make();
    engine.start("right");
    advanceToChoice(engine);
    engine.choose(1); // "I've got it, thanks." → outro
    advanceToChoice(engine); // the farewell line
    expect(calls).toEqual(["endIntro"]);
    expect(engine.snapshot().status).toBe("done");
  });

  it("skipping up front says goodbye and ends the intro without a demo", () => {
    const { engine, calls } = make();
    engine.start();
    advanceToChoice(engine);
    engine.choose(1); // "Maybe later."
    advanceToChoice(engine); // skip line + farewell
    expect(calls).toEqual(["audio:stinger", "Aki:enter", "Aki:bow", "endIntro"]);
    expect(engine.snapshot().status).toBe("done");
  });
});
