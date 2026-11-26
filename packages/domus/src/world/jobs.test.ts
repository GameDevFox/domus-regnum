import { describe, expect, it } from "vitest";

import { JobBoard } from "./jobs";
import { NodeId } from "./nav";

// Fixed distances for scoring tests: a lookup table instead of real geometry.
const distances = (map: Record<number, number>) => (node: NodeId) => map[node as number] ?? 0;

describe("JobBoard", () => {
  it("tracks open (unclaimed) jobs and avoids duplicates at a node", () => {
    const board = JobBoard();
    board.add({ id: "j1", type: "sweep", node: 3 });
    expect(board.open()).toHaveLength(1);
    expect(board.hasAt("sweep", 3)).toBe(true);
    expect(board.hasAt("sweep", 4)).toBe(false);
  });

  it("picks the nearest job when priorities are equal", () => {
    const board = JobBoard();
    board.add({ id: "near", type: "sweep", node: 1, priority: 1 });
    board.add({ id: "far", type: "sweep", node: 2, priority: 1 });
    const best = board.bestFor("s", distances({ 1: 1, 2: 9 }));
    expect(best?.id).toBe("near");
  });

  it("prefers higher priority even when slightly farther", () => {
    const board = JobBoard();
    board.add({ id: "dirty", type: "sweep", node: 1, priority: 1 }); // grimy
    board.add({ id: "clean-ish", type: "sweep", node: 2, priority: 0.1 });
    const best = board.bestFor("s", distances({ 1: 2, 2: 1 }));
    expect(best?.id).toBe("dirty");
  });

  it("lets an urgent job jump the queue", () => {
    const board = JobBoard();
    board.add({ id: "normal", type: "sweep", node: 1, priority: 1 });
    board.add({ id: "urgent", type: "sweep", node: 2, priority: 0.1, urgent: true });
    const best = board.bestFor("s", distances({ 1: 1, 2: 50 }));
    expect(best?.id).toBe("urgent");
  });

  it("honors a forced assignment regardless of score, only for that servant", () => {
    const board = JobBoard();
    board.add({ id: "tempting", type: "sweep", node: 1, priority: 5 });
    board.add({ id: "forced", type: "sweep", node: 2, priority: 0.1, forcedAssignee: "alice" });

    expect(board.bestFor("alice", distances({ 1: 1, 2: 1 }))?.id).toBe("forced");
    // Bob can't take Alice's forced job; he gets the tempting one.
    expect(board.bestFor("bob", distances({ 1: 1, 2: 1 }))?.id).toBe("tempting");
  });

  it("excludes claimed jobs from selection", () => {
    const board = JobBoard();
    const j = board.add({ id: "j", type: "sweep", node: 1, priority: 1 });
    board.claim(j, "alice");
    expect(board.open()).toHaveLength(0);
    expect(board.bestFor("bob", distances({ 1: 1 }))).toBeNull();
  });

  it("makes a released job claimable again", () => {
    const board = JobBoard();
    const j = board.add({ id: "j", type: "sweep", node: 1, priority: 1 });
    board.claim(j, "alice");
    expect(board.bestFor("bob", distances({ 1: 1 }))).toBeNull();
    board.release(j);
    expect(board.open()).toHaveLength(1);
    expect(board.bestFor("bob", distances({ 1: 1 }))?.id).toBe("j");
  });

  it("chooses deterministically among multiple jobs forced onto one servant", () => {
    const board = JobBoard();
    board.add({ id: "far", type: "sweep", node: 1, forcedAssignee: "alice" });
    board.add({ id: "near", type: "sweep", node: 2, forcedAssignee: "alice" });
    // Both forced to Alice; the nearer one should win (forced bonus is equal, score decides).
    expect(board.bestFor("alice", distances({ 1: 99, 2: 1 }))?.id).toBe("near");
  });
});
