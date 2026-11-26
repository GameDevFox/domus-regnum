import { describe, expect, it } from "vitest";

import { study } from "./lab";
import { gameAt } from "./test-kit";

// The laboratory at its edges: reading with the measure already full.

describe("something read while the measure is full", () => {
  it("fills nothing, and the invention is not marked as a feat a second time", () => {
    const game = gameAt();
    game.lab.progress = game.lab.needed;
    game.lab.ready = true;
    game.feats.push({ who: "master", what: "invention", at: game.clock });
    study(game, 0.25);
    expect(game.lab.progress).toBe(game.lab.needed);
    expect(game.feats.filter((f) => f.what === "invention")).toHaveLength(1);
  });

  it("is marked as a feat once, by the reading that fills the measure", () => {
    const game = gameAt();
    study(game, 0.5);
    expect(game.lab.ready).toBe(false);
    expect(game.feats).toHaveLength(0);
    study(game, 0.5);
    expect(game.lab.ready).toBe(true);
    expect(game.feats.filter((f) => f.what === "invention")).toHaveLength(1);
  });
});
