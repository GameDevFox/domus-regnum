import { toLogF } from "@kitsune/common";

const watchBuffer: string[] = [];

export const watchLog = (...values: unknown[]) => {
  const log = toLogF({ precision: 3 }, ...values);
  watchBuffer.push(log);
};

export const watchLogGetAndClear = () => {
  const result = [...watchBuffer];
  watchBuffer.splice(0, watchBuffer.length);

  return result;
};

export const watch = {
  log: watchLog,
  getAndClear: watchLogGetAndClear,
};
