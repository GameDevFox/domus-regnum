// import axios from "axios";
import _ from "lodash";

import { Matrix4 } from "three";

export const matrixToLog = (matrix: Matrix4, fixed: number = 3) => {
  const { elements } = matrix;

  const e = elements.map(value => value.toFixed(fixed).padStart(fixed+3));

  return [
    `[${e[0]}, ${e[4]}, ${e[8]}, ${e[12]}]`,
    `[${e[1]}, ${e[5]}, ${e[9]}, ${e[13]}]`,
    `[${e[2]}, ${e[6]}, ${e[10]}, ${e[14]}]`,
    `[${e[3]}, ${e[7]}, ${e[11]}, ${e[15]}]`,
  ];
};
