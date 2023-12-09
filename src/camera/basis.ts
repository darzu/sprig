import { mat4 } from "../matrix/sprig-matrix.js";

// TODO(@darzu): PERF. If we end up using these a lot, we could speed up the matrix multiply
//  and vec transform by inlining these since they're just 1s and 0s

// USAGE: apply this to a model that was designed for the old Y-up, X-right, Z-backward, this
//  transforms it into Z-up, X-right, Y-forward
export const transformModelIntoZUp = new Float32Array([
  // column 1, x-basis
  1, 0, 0, 0,
  // column 2, y-basis
  0, 0, 1, 0,
  // column 3, z-basis
  0, -1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;

// USAGE: apply this as the last step in the view transformation before the perspective
//  transformation to translate our Z-up world into Y-up for WebGPU's NDC which has
//  Y-up and bottom-left corner at (-1.0, -1.0, z).
export const transformCameraViewForWebGPUsNDC = new Float32Array([
  // column 1, x-basis
  1, 0, 0, 0,
  // column 2, y-basis,
  0, 0, -1, 0,
  // column 3, z-basis,
  0, 1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;
