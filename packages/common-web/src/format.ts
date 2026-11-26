import { Euler } from "three";

// GamepadButton
export const gamepadButtonStr = (button: GamepadButton) => {
  if(button === undefined)
    return undefined;

  return {
    pressed: button.pressed,
    touched: button.touched,
    value: button.value,
  };
};

// Vector
export const vecToStr = (vec: any, fixed: number = 3, padStart: number = fixed + 3) => {
  const formatNum = (x: number) => x.toFixed(fixed).padStart(padStart, " ");

  return (
    "[" +
      ("w" in vec ? `${formatNum(vec.w)}, ` : "") +
      formatNum(vec.x) + ", " +
      formatNum(vec.y) +
      ("z" in vec ? `, ${formatNum(vec.z)}` : "") +
    "]"
  );
};
