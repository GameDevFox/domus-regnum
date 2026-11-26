export const DigitFlipper = (base: number = 10) => {
  let value = 0;
  let exponent = 0;

  const result = {
    set: (newValue: number) => {
      value = newValue;
      result.output(value);
    },
    get: () => value,

    increment: () => {
      value += Math.pow(base, exponent);
      result.output(value);
    },
    decrement: () => {
      value -= Math.pow(base, exponent);
      result.output(value);
    },

    setExponent: (newValue: number) => {
      exponent = newValue;
    },
    getExponent: () => exponent,

    incrementExponent: () => {
      exponent++;
    },
    decrementExponent: () => {
      exponent--;
    },

    round: () => {
      const power = Math.pow(base, -exponent);
      value = Math.round(value * power) / power;

      result.output(value);
    },

    getOffsets: () => {
      const digitCount = Math.floor(value).toString().length;

      let arrowOffset = digitCount - (exponent + 1);
      if(exponent < 0)
        arrowOffset++;

      return {
        number: (exponent + 1) > digitCount ? (exponent + 1) - digitCount: 0,
        arrow: arrowOffset,
      };
    },

    getLines: () => {
      const { number, arrow } = result.getOffsets();

      return [
        "".padStart(number) + value,
        "".padStart(arrow) + "^"
      ];
    },

    output: (_value: number) => {},
  };

  return result;
};
