import { Group } from "three";
import { describe, expect, it } from "vitest";

import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { onCell } from "./author";
import { mountLevel } from "./level";
import { manorLevel } from "./sample-level";
import { Level } from "./types";

const tinyLevel = (placements: Level["placements"]): Level => ({
  name: "tiny",
  tile: 1,
  placements,
});

describe("mountLevel", () => {
  it("adds one object per placement", () => {
    const scope = Scope();
    const parent = new Group();
    mountLevel(scope, parent, tinyLevel([onCell("floor", [0, 0]), onCell("floor", [1, 0])]));
    expect(parent.children).toHaveLength(2);
    scope.cleanup();
    expect(parent.children).toHaveLength(0); // teardown removes everything
  });

  it("positions a grid block at its cell center", () => {
    const scope = Scope();
    const parent = new Group();
    mountLevel(scope, parent, tinyLevel([onCell("floor", [3, 2])]));
    expect(parent.children[0].position.x).toBe(3);
    expect(parent.children[0].position.z).toBe(2);
  });

  it("reacts to a level change — adding a placement mounts another object", () => {
    const scope = Scope();
    const parent = new Group();
    const lv = Value(tinyLevel([onCell("floor", [0, 0])]));
    mountLevel(scope, parent, lv);
    expect(parent.children).toHaveLength(1);

    lv.set(tinyLevel([onCell("floor", [0, 0]), onCell("floor", [1, 0])]));
    expect(parent.children).toHaveLength(2);
  });

  it("reacts to a placement move — the block follows its new cell", () => {
    const scope = Scope();
    const parent = new Group();
    const lv = Value(tinyLevel([onCell("floor", [0, 0])]));
    mountLevel(scope, parent, lv);
    expect(parent.children[0].position.x).toBe(0);

    lv.set(tinyLevel([onCell("floor", [4, 0])]));
    expect(parent.children[0].position.x).toBe(4); // rebuilt in place at the new cell
  });

  it("keyed: removing the first id-stamped placement leaves the survivors' objects untouched", () => {
    const scope = Scope();
    const parent = new Group();
    const a = { ...onCell("floor", [0, 0]), id: "n/a" };
    const b = { ...onCell("floor", [1, 0]), id: "n/b" };
    const lv = Value(tinyLevel([a, b]));
    mountLevel(scope, parent, lv);
    const objB = parent.children[1];

    lv.set(tinyLevel([b])); // delete the FIRST — index keying would rebuild b too
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(objB); // same instance — b was never torn down
  });

  it("mounts the full sample manor without throwing", () => {
    const scope = Scope();
    const parent = new Group();
    mountLevel(scope, parent, manorLevel);
    expect(parent.children.length).toBe(manorLevel.placements.length);
    scope.cleanup();
  });
});

describe("manual uid stability (via the deriver's local-id precedence)", () => {
  it("placements carrying ids keep their objects when an EARLIER item is deleted", () => {
    const scope = Scope();
    const parent = new Group();
    const a = { ...onCell("chair", [0, 0]), id: "u1" };
    const b = { ...onCell("chair", [1, 0]), id: "u2" };
    const c = { ...onCell("chair", [2, 0]), id: "u3" };
    const lv = Value(tinyLevel([a, b, c]));
    mountLevel(scope, parent, lv);
    const [, objB, objC] = [...parent.children];

    lv.set(tinyLevel([b, c])); // delete the FIRST
    expect(parent.children).toHaveLength(2);
    expect(parent.children[0]).toBe(objB); // identical instances — no rebuild ripple
    expect(parent.children[1]).toBe(objC);
  });
});
