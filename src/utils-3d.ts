import { mat4, vec3 } from "./gl-matrix.js";

// math utilities
export function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
    vec3.normalize(n, n)
    return n;
}

// matrix utilities
export function pitch(m: mat4, rad: number) { return mat4.rotateX(m, m, rad); }
export function yaw(m: mat4, rad: number) { return mat4.rotateY(m, m, rad); }
export function roll(m: mat4, rad: number) { return mat4.rotateZ(m, m, rad); }
export function moveX(m: mat4, n: number) { return mat4.translate(m, m, [n, 0, 0]); }
export function moveY(m: mat4, n: number) { return mat4.translate(m, m, [0, n, 0]); }
export function moveZ(m: mat4, n: number) { return mat4.translate(m, m, [0, 0, n]); }
export function getPositionFromTransform(t: mat4): vec3 {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos
}
// vec utilities
export function vec3Floor(out: vec3, v: vec3): vec3 {
    out[0] = Math.floor(v[0])
    out[1] = Math.floor(v[1])
    out[2] = Math.floor(v[2])
    return out
}