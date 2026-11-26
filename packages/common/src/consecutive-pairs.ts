export const consecutivePairs = <T>(arr: T[]): [T, T][] => {
  const result = [];

  for(let i = 0; i < arr.length - 1; i++) {
    result.push([
      arr[i],
      arr[i + 1],
    ]);
  }

  return result;
};
