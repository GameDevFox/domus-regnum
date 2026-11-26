import { times } from "lodash";

export const intervals = (count, length = 1) => {
  return [...times(count).map(x => (x / count) * length), length];
};
