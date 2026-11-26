import { DeadBand } from "./dead-band";

describe("DeadBand", () => {
  it("should work", () => {
    const deadBand = DeadBand(10, 20);

    const spy = jest.fn();
    deadBand.output = value => spy("output", value);

    [
      5, 8, 10, 12, 15, 18, 20, 22, 25,
      25, 22, 20, 18, 20, 22, 25,
      25, 22, 20, 18, 15, 12, 10, 8, 5,
    ].forEach(value => {
      spy("input", value);
      deadBand.input(value);
    });

    expect(spy.mock.calls).toEqual([
      ["input", 5], ["output", true],
      ["input", 8],
      ["input", 10],
      ["input", 12],
      ["input", 15],
      ["input", 18],
      ["input", 20], ["output", false],
      ["input", 22],
      ["input", 25],

      ["input", 25],
      ["input", 22],
      ["input", 20],
      ["input", 18],
      ["input", 20],
      ["input", 22],
      ["input", 25],

      ["input", 25],
      ["input", 22],
      ["input", 20],
      ["input", 18],
      ["input", 15],
      ["input", 12],
      ["input", 10], ["output", true],
      ["input", 8],
      ["input", 5],
    ]);
  });

  it("should throw error on invalid config", () => {
    expect(() => {
      DeadBand(12, 8)
    }).toThrow("inner (12) must be less than outer (8)");

    expect(() => {
      DeadBand(10, 10)
    }).toThrow("inner (10) must be less than outer (10)");
  });
});
