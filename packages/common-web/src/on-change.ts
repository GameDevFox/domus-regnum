import { EventFilter } from "./event-filter";

export const OnChange = <T>(output: (value: T) => void, initial: T) => {
  let value: T = initial;

  const eventFilter = EventFilter<T>(
    newValue => {
      const result = value !== newValue;
      value = newValue;
      return result;
    },
    output,
  );

  return {
    ...eventFilter,
    get: () => value,
  };
};
