import { collectExports } from "./plugin";

describe("kitsuneHMR — collectExports", () => {
  it("collects const/let/var/function declaration exports", () => {
    const { snapEntries, reExported } = collectExports(`
      export const Cube = () => {};
      export let counter = 0;
      export var legacy = 1;
      export function makeThing() {}
      export async function loadThing() {}
      const local = 1;
    `);
    expect(snapEntries).toEqual(["Cube", "counter", "legacy", "makeThing", "loadThing"]);
    expect(reExported).toEqual([]);
  });

  it("collects local export lists, honoring `as` aliases (exported name → local binding)", () => {
    const { snapEntries } = collectExports(`
      const Inner = () => {};
      const Other = () => {};
      export { Inner as Cube, Other };
    `);
    expect(snapEntries).toEqual(["Cube: Inner", "Other"]);
  });

  it("separates re-exports (no local binding — cannot be snapshotted)", () => {
    const { snapEntries, reExported } = collectExports(`
      export { Halo, Ring as Circle } from "./halo";
      export const Cube = () => {};
    `);
    expect(snapEntries).toEqual(["Cube"]);
    expect(reExported).toEqual(["Halo", "Circle"]);
  });

  it("skips type-only names in export lists", () => {
    const { snapEntries } = collectExports(`
      const Cube = () => {};
      export { type CubeProps, Cube };
    `);
    expect(snapEntries).toEqual(["Cube"]);
  });

  it("dedupes a name exported both ways", () => {
    const { snapEntries } = collectExports(`
      export const Cube = () => {};
      export { Cube };
    `);
    expect(snapEntries).toEqual(["Cube"]);
  });
});
