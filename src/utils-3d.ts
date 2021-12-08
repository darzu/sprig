import { mat4, vec3 } from "./gl-matrix.js";

// math utilities
export function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = vec3.cross(
    vec3.create(),
    vec3.sub(vec3.create(), p2, p1),
    vec3.sub(vec3.create(), p3, p1)
  );
  vec3.normalize(n, n);
  return n;
}

// matrix utilities
export function pitch(m: mat4, rad: number) {
  return mat4.rotateX(m, m, rad);
}
export function yaw(m: mat4, rad: number) {
  return mat4.rotateY(m, m, rad);
}
export function roll(m: mat4, rad: number) {
  return mat4.rotateZ(m, m, rad);
}
export function moveX(m: mat4, n: number) {
  return mat4.translate(m, m, [n, 0, 0]);
}
export function moveY(m: mat4, n: number) {
  return mat4.translate(m, m, [0, n, 0]);
}
export function moveZ(m: mat4, n: number) {
  return mat4.translate(m, m, [0, 0, n]);
}
export function getPositionFromTransform(t: mat4): vec3 {
  // TODO(@darzu): not really necessary
  const pos = vec3.create();
  vec3.transformMat4(pos, pos, t);
  return pos;
}
// vec utilities
export function vec3Floor(out: vec3, v: vec3): vec3 {
  out[0] = Math.floor(v[0]);
  out[1] = Math.floor(v[1]);
  out[2] = Math.floor(v[2]);
  return out;
}

export function vec3Dbg(v: vec3): string {
  return `(${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)})`;
}
export function mat4Dbg(v: mat4): string {
  const ns = [...v].map((n) => n.toFixed(2));
  return (
    "" +
    `[${ns[0]},${ns[1]},${ns[2]},${ns[3]}
 ${ns[4]},${ns[5]},${ns[6]},${ns[7]}
 ${ns[8]},${ns[9]},${ns[10]},${ns[11]}
 ${ns[12]},${ns[13]},${ns[14]},${ns[15]}]`
  );
}