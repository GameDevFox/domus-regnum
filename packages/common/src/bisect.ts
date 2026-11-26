// fn(x) < 0 means x is too low (go higher), fn(x) > 0 means x is too high (go lower)
export const bisect = (min: number, max: number, fn: (num: number) => number) => {
  if(min === max)
    return min;

  // Make sure min and max are in correct order
  if(max < min)
    [min, max] = [max, min];

  // ceil(log2(2^53)) = 53 — enough for any practical integer range
  const maxIterations = Math.ceil(Math.log2(max - min + 1)) + 2;
  for(let i = 0; i < maxIterations; i++) {
    const mid = Math.floor(((max - min) / 2) + min);
    const check = fn(mid);

    if(check === 0)
      return mid;

    if(check > 0) {
      // Exceptional cases
      if(mid === min)
        return Number.NEGATIVE_INFINITY;

      // Normal case
      max = mid;
    } else {
      // Exceptional cases
      if(min + 1 === max) {
        const check = fn(max);

        if(check === 0)
          return max;

        const result = check > 0 ? min : Number.POSITIVE_INFINITY;
        return result;
      }

      // Normal case
      min = mid;
    }
  };

  console.error(`Too deep! ${JSON.stringify({ min, max }, null, 2)}`);
  return min;
};
