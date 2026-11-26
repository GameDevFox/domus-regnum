import { intervals } from "./intervals";
import { SegmentArg, SegmentArgArray, SegmentArgFn, SegmentArgObj, SegmentFn } from "./segment-fn";

const testSegmentFn = <T>(
  segments: Parameters<typeof SegmentFn<T>>[0],
  expected: number[],
) => {
  const { lengthFn: fn, length } = SegmentFn<T>(segments);

  const intervalList = intervals(20, length);
  const actuals = intervalList.map(fn);

  expected.forEach((expected, index) => {
    expect(actuals[index]).toBeCloseTo(expected);
  })
};

describe("SegmentFn", () => {
  test("should allow SegmentArgObj", () => {
    const segments: SegmentArgObj<number>[] = [
      {
        length: 1,
        fn: t => t,
      },
      {
        length: 1,
        fn: t => 1 - t,
      },
      {
        length: 2,
        fn: t => -t,
      }
    ];

    testSegmentFn(segments, [
      0, 0.2, 0.4, 0.6, 0.8,
      1, 0.8, 0.6, 0.4, 0.2,
      0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1
    ]);
  });

  test("should allow SegmentArgArray", () => {
    const segments: SegmentArgArray<number>[] = [
      [1, t => t],
      [1, t => 1 - t],
      [2, t => -t],
    ];

    testSegmentFn(segments, [
      0, 0.2, 0.4, 0.6, 0.8,
      1, 0.8, 0.6, 0.4, 0.2,
      0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1
    ]);
  });

  test("should allow SegmentArgFn", () => {
    const segments: SegmentArgFn<number>[] = [
      t => t,
      t => 1 - t,
      t => -t,
    ];

    testSegmentFn(segments, [
      0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9,
      0.95, 0.8, 0.65, 0.5, 0.35, 0.2, 0.05,
      -0.1, -0.25, -0.4, -0.55, -0.7, -0.85, -1
    ]);
  });

  test("should allow mix-and-match args", () => {
    const segments: SegmentArg<number>[] = [
      t => t,
      [1, t => 1 - t],
      {
        length: 2,
        fn: t => -t,
      },
    ];

    testSegmentFn(segments, [
      0, 0.2, 0.4, 0.6, 0.8,
      1, 0.8, 0.6, 0.4, 0.2,
      0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1
    ]);
  });

  test.skip("should work with normalized fn", () => {
    // TODO:
  });
});
