// NOTE: array elements must all be unique
// for this to work properly
export const getNextCircular = <T>(array: T[], value: T, previous: boolean = false) => {
  const index = array.indexOf(value);
  if(index === -1) {
    return {
      index,
      value: undefined,
    };
  }

  let newIndex = -1;
  if(previous) {
    const isFirst = index === 0;
    newIndex = isFirst ? array.length - 1 : index - 1;
  } else {
    const isLast = index === array.length - 1;
    newIndex = isLast ? 0 : index + 1;
  }

  return {
    index: newIndex,
    value: array[newIndex],
  }
};
