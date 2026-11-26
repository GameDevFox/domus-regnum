import { intervals } from "./intervals";

describe("intervals", () => {
  it("should work", () => {
    expect(intervals(10)).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1
    ]);

    expect(intervals(10, 5)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
    ]);
  });
});
