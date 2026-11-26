export const EventFilter = <T>(
  filter: (value: T) => boolean,
  output: (value: T) => void,
) => {
  const functions = {
    input: (value: T) => {
      const pass = functions.filter(value)
      if(pass)
        functions.output(value);
    },
    filter,
    output,
  };

  return functions;
};
