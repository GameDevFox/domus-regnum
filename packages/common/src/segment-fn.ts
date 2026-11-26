export type SegmentArgFn<T> = (t: number) => T;

export type SegmentArgArray<T> = [
  number,
  SegmentArgFn<T>,
];

export type SegmentArgObj<T> = {
  length: number,
  fn: SegmentArgFn<T>,
};

export type SegmentArg<T> = SegmentArgObj<T> | SegmentArgArray<T> | SegmentArgFn<T>;

type Segment<T> = {
  start: number,
  end: number,
  fn: SegmentArgFn<T>,
};

// TODO: Add other types like "RegEx" etc.
// TODO: Move to own file
export const typeOf = (arg: any) => {
  if(Array.isArray(arg))
    return "array";

  return typeof arg;
};

export const SegmentFn = <T>(
  segmentArgs: SegmentArg<T>[],
) => {
  if(segmentArgs.length === 0)
    throw new Error("Must specify at least one segment");

  const segments = [];

  let totalLength = 0;
  segmentArgs.forEach(segmentArg => {
    let length;
    let fn;

    if(typeof segmentArg === "function") {
      length = 1;
      fn = segmentArg;
    } else if(Array.isArray(segmentArg)) {
      length = segmentArg[0];
      fn = segmentArg[1];
    } else if(typeof segmentArg === "object") {
      length = segmentArg.length;
      fn = segmentArg.fn;
    } else {
      throw new Error(`segment was of type \"${typeof segmentArg}\"`);
    }

    const end = totalLength + length

    const segment: Segment<T> = {
      start: totalLength,
      end: end,
      fn,
    };

    totalLength += length;

    segments.push(segment);
  });

  const lengthFn = (length: number): T => {
    if(length <= 0)
      return segments[0].fn(0);

    if(length >= totalLength)
      return segments[segments.length - 1].fn(1);

    let { start, end, fn } = segments.find(segment => {
      return length >= segment.start && length < segment.end;
    });

    const segmentLength = end - start;
    const t = (length - start) / segmentLength;

    return fn(t);
  };

  // 0 <= t <= 1
  const normalizedFn = (t: number) => lengthFn(t * totalLength);

  return { fn: normalizedFn, lengthFn, length: totalLength };
};
