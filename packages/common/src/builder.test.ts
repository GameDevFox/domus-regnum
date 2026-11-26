import { Builder } from "./builder";

const makeTestBuilder = () =>
  Builder()
    .add("x", 123)
    .add("y", 456)
    .add("total", ({ x, y }) => x + y, ["x", "y"])
    .add("b", ({ total }) => total % 3 === 0, ["total"])
    .add("msg", ({ b, total }) => `The total is ${total} and is${b ? "" : " NOT"} divisible by 3`, [
      "b",
      "total",
    ]);

describe("Builder", () => {
  it("should build all values in dependency order", async () => {
    const { data } = await makeTestBuilder().run();

    expect(data).toEqual({
      x: 123,
      y: 456,
      total: 579,
      b: true,
      msg: "The total is 579 and is divisible by 3",
    });
  });

  it("should support async build functions", async () => {
    const { data } = await Builder()
      .add("x", async () => 10)
      .add("doubled", async ({ x }) => x * 2, ["x"])
      .run();

    expect(data).toEqual({ x: 10, doubled: 20 });
  });

  it("should detect circular dependencies", async () => {
    // Circular deps are impossible through the type-safe .add() API —
    // this tests the runtime check by bypassing the type system
    const builder = (Builder() as any).add("a", () => 1, ["b"]).add("b", () => 2, ["a"]);

    await expect(builder.run()).rejects.toThrow("Circular dependency: a > b > a");
  });

  it("should rebuild affected nodes on update", async () => {
    const { data, update } = await makeTestBuilder().run();

    const rebuilt = await update({ x: () => 1000 });
    expect(rebuilt).toEqual(["x", "total", "b", "msg"]);
    expect(data).toEqual({
      x: 1000,
      y: 456,
      total: 1456,
      b: false,
      msg: "The total is 1456 and is NOT divisible by 3",
    });
  });

  it("should handle multiple simultaneous updates", async () => {
    const { data, update } = await makeTestBuilder().run();

    const rebuilt = await update({
      b: ({ total }) => total % 2 === 0,
      msg: ({ b, total }) => `The total is ${total} and is${b ? "" : " NOT"} divisible by 2`,
    });
    expect(rebuilt).toEqual(["b", "msg"]);
    expect(data).toEqual({
      x: 123,
      y: 456,
      total: 579,
      b: false,
      msg: "The total is 579 and is NOT divisible by 2",
    });
  });

  it("should call cleanup before rebuilding a node", async () => {
    let cleanUpCount = 0;

    const { update } = await Builder()
      .add("x", 1)
      .add("msg", ({ x }) => `x is ${x}`, {
        deps: ["x"],
        cleanUp: () => cleanUpCount++,
      })
      .run();

    expect(cleanUpCount).toBe(0);
    await update({ x: () => 2 });
    expect(cleanUpCount).toBe(1);
  });

  it("should use partial updater instead of rebuild when dep changes", async () => {
    const log: string[] = [];

    const { data, update } = await Builder()
      .add("config", { multiplier: 2 })
      .add(
        "counter",
        ({ config }) => {
          log.push("built");
          return { count: 0, multiplier: config.multiplier };
        },
        {
          deps: ["config"],
          partialUpdaters: {
            config: (instance, config) => {
              log.push("partial");
              instance.multiplier = config.multiplier;
            },
          },
        },
      )
      .run();

    expect(log).toEqual(["built"]);
    data.counter.count = 99; // simulate internal state

    await update({ config: () => ({ multiplier: 5 }) });

    expect(log).toEqual(["built", "partial"]); // rebuild not called again
    expect(data.counter.count).toBe(99); // internal state preserved
    expect(data.counter.multiplier).toBe(5); // dep updated
  });

  it("should fall back to full rebuild when a changed dep has no partial updater", async () => {
    const log: string[] = [];

    const { data, update } = await Builder()
      .add("a", 1)
      .add("b", 2)
      .add(
        "thing",
        ({ a, b }) => {
          log.push("built");
          return { a, b, state: 0 };
        },
        {
          deps: ["a", "b"],
          partialUpdaters: {
            a: (instance, a) => {
              instance.a = a;
            }, // partial updater only for 'a'
          },
        },
      )
      .run();

    data.thing.state = 99;

    // Both a and b change — b has no partial updater → full rebuild
    await update({ a: () => 10, b: () => 20 });

    expect(log).toEqual(["built", "built"]);
    expect(data.thing.state).toBe(0); // state lost — full rebuild
    expect(data.thing.a).toBe(10);
    expect(data.thing.b).toBe(20);
  });

  it("should not call cleanup when using partial updater", async () => {
    let cleanUpCount = 0;

    const { update } = await Builder()
      .add("x", 1)
      .add("thing", ({ x }) => ({ x }), {
        deps: ["x"],
        cleanUp: () => cleanUpCount++,
        partialUpdaters: {
          x: (instance, x) => {
            instance.x = x;
          },
        },
      })
      .run();

    await update({ x: () => 2 });
    expect(cleanUpCount).toBe(0); // cleanup skipped for partial update
  });
});
