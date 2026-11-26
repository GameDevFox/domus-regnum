export type DeadBandType<T> = {
  input: (value: T) => void;
  output: (value: boolean) => void;
};

export type DeadBandOptions<T> = {
  initialState: boolean,
};

export const DeadBand = <T>(inner: T, outer: T, options: Partial<DeadBandOptions<T>> = {}) => {
  const initialState = options.initialState ?? false;

  if(inner >= outer)
    throw new Error(`inner (${inner}) must be less than outer (${outer})`);

  let state = initialState;

  const result: DeadBandType<T> = {
    input: (value: T) => {
      if(!state && value <= inner) {
        state = true;
        result.output(state);
      }

      if(state && value >= outer) {
        state = false;
        result.output(state);
      }
    },
    output: () => {},
  };

  return result;
};
