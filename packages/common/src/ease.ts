const invert = (fn: (t: number) => number) => (t: number) => {
  const subT = fn(t);
  return 1 - subT;
};

const linear = (t: number) => t;

const quadEaseIn = (power: number = 2) => {
  return (t: number) => Math.pow(t, power);
};

const quadEaseOut = (power: number = 2) => {
  return (t: number) => 1 - Math.pow(1 - t, power);
};

const quadEaseInOut = (power: number = 2) => {
  return (t: number) => {
    if(t < 0.5) {
      return Math.pow(2, power - 1) * Math.pow(t, power);
    } else {
      return 1 - Math.pow(2, power - 1) * Math.pow(1 - t, power);
    }
  };
};

export const ease = {
  invert,

  linear,

  quadIn: quadEaseIn,
  quadOut: quadEaseOut,
  quadInOut: quadEaseInOut,
};
