import { Scope } from "./scope";
import { Value } from "./value";
import { mount, children, swap } from "./registry";

// A stand-in for a Three parent (Object3D-like) — registry only calls add/remove.
const fakeParent = () => {
  const children: unknown[] = [];
  return {
    children,
    add: (o: unknown) => children.push(o),
    remove: (o: unknown) => {
      const i = children.indexOf(o);
      if (i >= 0) children.splice(i, 1);
    },
  };
};

describe("registry — mount", () => {
  it("adds the returned mesh to the parent and returns the output", () => {
    const s = Scope();
    const parent = fakeParent();
    const mesh = { id: "m" };
    const out = mount(() => ({ mesh }), {}, parent as never, s);
    expect(out.mesh).toBe(mesh);
    expect(parent.children).toContain(mesh);
  });

  it("removes the mesh when its scope is cleaned up", () => {
    const s = Scope();
    const parent = fakeParent();
    const mesh = {};
    mount(() => ({ mesh }), {}, parent as never, s);
    expect(parent.children).toContain(mesh);
    s.cleanup();
    expect(parent.children).not.toContain(mesh);
  });
});

describe("registry — children attach API", () => {
  it("returns the parent and add() mounts into it", () => {
    const s = Scope();
    const parent = fakeParent();
    const m1 = {};
    const m2 = {};
    const ret = children(s, parent as never, ({ add }) => {
      add(() => ({ mesh: m1 }), {});
      add(() => ({ mesh: m2 }), {});
    });
    expect(ret).toBe(parent);
    expect(parent.children).toEqual([m1, m2]);
  });

  it("each mounts one child per item, reusing slots across list changes", () => {
    const s = Scope();
    const parent = fakeParent();
    const colors = Value([0, 1, 2]);
    let builds = 0;
    children(s, parent as never, ({ each }) => {
      each(colors, ({ add }) => {
        builds++;
        add(() => ({ mesh: {} }), {});
      });
    });
    expect(builds).toBe(3);
    expect(parent.children.length).toBe(3);

    colors.set([0, 1, 2, 3]); // grow: one new build, three reused
    expect(builds).toBe(4);
    expect(parent.children.length).toBe(4);

    colors.set([0, 1]); // shrink: dropped items cleaned up, no new builds
    expect(builds).toBe(4);
    expect(parent.children.length).toBe(2);
  });

  it("when mounts while truthy and unmounts when falsy", () => {
    const s = Scope();
    const parent = fakeParent();
    const show = Value(true);
    let builds = 0;
    children(s, parent as never, ({ when }) => {
      when(show, ({ add }) => {
        builds++;
        add(() => ({ mesh: {} }), {});
      });
    });
    expect(builds).toBe(1);
    expect(parent.children.length).toBe(1);

    show.set(false);
    expect(parent.children.length).toBe(0);

    show.set(true);
    expect(builds).toBe(2);
    expect(parent.children.length).toBe(1);
  });
});

describe("registry — keyed each", () => {
  type Item = { id: string; label: string };
  const A = { id: "a", label: "A" };
  const B = { id: "b", label: "B" };
  const C = { id: "c", label: "C" };

  // Builds a keyed each whose slots record their lifecycle: builds, index updates, teardowns.
  const harness = () => {
    const s = Scope();
    const parent = fakeParent();
    const list = Value<Item[]>([A, B, C]);
    const builds: string[] = [];
    const torndown: string[] = [];
    const indexOf: Record<string, () => number> = {};
    const itemOf: Record<string, () => Item> = {};
    children(s, parent as never, ({ each }) => {
      each(
        list,
        ({ scope: itemScope, add }, item, index) => {
          const id = item.peek().id;
          builds.push(id);
          indexOf[id] = () => index.peek();
          itemOf[id] = () => item.peek();
          itemScope.add(() => torndown.push(id));
          add(() => ({ mesh: {} }), {});
        },
        { key: (item) => item.id },
      );
    });
    return { s, parent, list, builds, torndown, indexOf, itemOf };
  };

  it("removing a middle item tears down only that slot; survivors keep their slots", () => {
    const { list, builds, torndown, parent } = harness();
    expect(builds).toEqual(["a", "b", "c"]);
    list.set([A, C]); // b removed
    expect(torndown).toEqual(["b"]);
    expect(builds).toEqual(["a", "b", "c"]); // no rebuilds
    expect(parent.children.length).toBe(2);
  });

  it("inserting at the front builds only the new item and updates survivors' index Values", () => {
    const { list, builds, indexOf } = harness();
    const Z = { id: "z", label: "Z" };
    list.set([Z, A, B, C]);
    expect(builds).toEqual(["a", "b", "c", "z"]); // one new build
    expect(indexOf["z"]()).toBe(0);
    expect(indexOf["a"]()).toBe(1);
    expect(indexOf["c"]()).toBe(3);
  });

  it("reordering reuses every slot and just moves the indices", () => {
    const { list, builds, torndown, indexOf } = harness();
    list.set([C, A, B]);
    expect(builds).toEqual(["a", "b", "c"]);
    expect(torndown).toEqual([]);
    expect(indexOf["c"]()).toBe(0);
    expect(indexOf["a"]()).toBe(1);
    expect(indexOf["b"]()).toBe(2);
  });

  it("updating an item in place updates its item Value without a rebuild", () => {
    const { list, builds, itemOf } = harness();
    const A2 = { id: "a", label: "A2" };
    list.set([A2, B, C]);
    expect(builds).toEqual(["a", "b", "c"]); // same key — no rebuild
    expect(itemOf["a"]().label).toBe("A2"); // the slot's item Value carries the new data
  });
});

describe("registry — each teardown/count ordering", () => {
  it("tears down dropped slots BEFORE updating count, so no live computed sees a transient length", () => {
    const s = Scope();
    const parent = fakeParent();
    const list = Value([0, 1, 2]);
    const seenBySlot: number[][] = [];
    children(s, parent as never, ({ each }) => {
      each(list, ({ scope: itemScope, add }, _item, _index, count) => {
        const seen: number[] = [];
        seenBySlot.push(seen);
        itemScope.effect((use) => seen.push(use(count)));
        add(() => ({ mesh: {} }), {});
      });
    });
    expect(seenBySlot.map((s2) => s2[0])).toEqual([3, 3, 3]);

    list.set([0]); // dropped slots must never observe count=1
    expect(seenBySlot[1]).toEqual([3]);
    expect(seenBySlot[2]).toEqual([3]);
    expect(seenBySlot[0]).toEqual([3, 1]); // survivor sees the new length

    list.set([]); // emptying: the last slot must never observe count=0
    expect(seenBySlot[0]).toEqual([3, 1]);
  });
});

describe("registry — swap", () => {
  it("replaces a live instance in place: same parent, props reused, old removed", () => {
    const s = Scope();
    const parent = fakeParent();
    const Old = (_: Scope, p: unknown) => ({ mesh: { tag: "old", p } });
    mount(Old, { k: 1 }, parent as never, s);
    const oldMesh = parent.children[0];

    const New = (_: Scope, p: unknown) => ({ mesh: { tag: "new", p } });
    swap(Old as never, New as never);

    expect(parent.children.length).toBe(1);
    expect((parent.children[0] as { tag: string }).tag).toBe("new");
    expect((parent.children[0] as { p: unknown }).p).toEqual({ k: 1 }); // props carried across
    expect(parent.children).not.toContain(oldMesh);
  });

  it("is a no-op for a factory with no live instances", () => {
    const Never = () => ({ mesh: {} });
    expect(() => swap(Never as never, Never as never)).not.toThrow();
  });
});

describe("registry — when() transition semantics", () => {
  it("does not rebuild the child when cond refires with a fresh truthy value", () => {
    const s = Scope();
    const parent = fakeParent();
    // A condition that fires a NEW truthy object on every set — pre-fix this churned the mount.
    const cond = Value<{ on: boolean } | null>({ on: true }, { equals: () => false });
    let builds = 0;
    children(s, parent as never, ({ when }) => {
      when(cond, ({ add }) => {
        builds++;
        add(() => ({ mesh: {} as never }), {});
      });
    });
    expect(builds).toBe(1);
    cond.set({ on: true }); // still truthy — must NOT rebuild
    cond.set({ on: true });
    expect(builds).toBe(1);
    expect(parent.children).toHaveLength(1);
    cond.set(null); // falsy — unmounts
    expect(parent.children).toHaveLength(0);
    cond.set({ on: true }); // truthy again — one rebuild
    expect(builds).toBe(2);
  });
});

describe("registry — match()", () => {
  it("mounts one branch per key, switching tears down and rebuilds", () => {
    const s = Scope();
    const parent = fakeParent();
    const mode = Value<"a" | "b" | "c">("a");
    const mounted: string[] = [];
    children(s, parent as never, ({ match }) => {
      match(mode, {
        a: ({ add, scope: branchScope }) => {
          mounted.push("a");
          branchScope.add(() => mounted.splice(mounted.indexOf("a"), 1));
          add(() => ({ mesh: { tag: "a" } as never }), {});
        },
        b: ({ add, scope: branchScope }) => {
          mounted.push("b");
          branchScope.add(() => mounted.splice(mounted.indexOf("b"), 1));
          add(() => ({ mesh: { tag: "b" } as never }), {});
        },
        // "c" deliberately unlisted — mounts nothing
      });
    });
    expect(mounted).toEqual(["a"]);
    expect(parent.children).toHaveLength(1);

    mode.set("b");
    expect(mounted).toEqual(["b"]); // a torn down, b mounted
    expect(parent.children).toHaveLength(1);

    mode.set("c"); // unlisted key — nothing mounted
    expect(mounted).toEqual([]);
    expect(parent.children).toHaveLength(0);

    mode.set("a");
    expect(mounted).toEqual(["a"]);
    s.cleanup();
    expect(parent.children).toHaveLength(0);
  });
});
