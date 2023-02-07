import { clamp } from "../math.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { objMap } from "../util.js";
import { vec3Dbg } from "../utils-3d.js";
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
export const AllEndesga16 = Object.values(ENDESGA16);
export function randEndesga16() {
  const i = clamp(Math.floor(Math.random() * AllEndesga16.length), 0, 15);
  return AllEndesga16[i];
}
let _nextEnd = 0;
export function seqEndesga16() {
  _nextEnd += 1;
  if (_nextEnd > 15) _nextEnd = 0;
  return AllEndesga16[_nextEnd];
}

export const COLOR_SAMPLES = objMap(
  {
    jb_skyblue: "#5775D0",
    jb_skywhite: "#DFE6DB",
  },
  (val, name) => {
    return toV3(toFLRGB(parseHex(val))) as vec3;
  }
);

// for (let _k of Object.keys(COLOR_SAMPLES)) {
//   const k = _k as keyof typeof COLOR_SAMPLES;
//   console.log(`${k}: ${vec3Dbg(COLOR_SAMPLES[k])}`);
// }
