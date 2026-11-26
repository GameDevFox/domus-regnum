const NANOSECONDS = 1000 * 1000 * 1000;

export const getRuntime = <T>(fn: () => T) => {
  const start = process.hrtime();
  const result = fn()
  const end = process.hrtime();

  const delta = [
    end[0] - start[0],
    end[1] - start[1],
  ];

  const runtime = delta[0] + (delta[1] / NANOSECONDS);

  return {
    start, end, delta,
    runtime,
    result,
  };
};
