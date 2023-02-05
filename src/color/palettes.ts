import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { objMap } from "../util.js";
import { toV3, toFRGB, parseHex, toFLRGB } from "./color.js";

export const ENDESGA16 = objMap(
  {
    lightBrown: "#e4a672",
    midBrown: "#b86f50",
    darkBrown: "#743f39",
    deepBrown: "#3f2832",
    darkRed: "#9e2835",
    red: "#e53b44",
    orange: "#fb922b",
    yellow: "#ffe762",
    lightGreen: "#63c64d",
    darkGreen: "#327345",
    deepGreen: "#193d3f",
    darkGray: "#4f6781",
    lightGray: "#afbfd2",
    white: "#ffffff",
    lightBlue: "#2ce8f4",
    blue: "#0484d1",
  },
  (val, name) => {
    return toV3(toFLRGB(parseHex(val))) as vec3;
  }
);
