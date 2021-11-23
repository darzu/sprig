import { mat4, vec3 } from "./ext/gl-matrix.js";
// math utilities
export function computeTriangleNormal(p1, p2, p3) {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1));
    vec3.normalize(n, n);
    return n;
}
// matrix utilities
export function pitch(m, rad) { return mat4.rotateX(m, m, rad); }
export function yaw(m, rad) { return mat4.rotateY(m, m, rad); }
export function roll(m, rad) { return mat4.rotateZ(m, m, rad); }
export function moveX(m, n) { return mat4.translate(m, m, [n, 0, 0]); }
export function moveY(m, n) { return mat4.translate(m, m, [0, n, 0]); }
export function moveZ(m, n) { return mat4.translate(m, m, [0, 0, n]); }
export function getPositionFromTransform(t) {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos;
}
//# sourceMappingURL=3d-util.js.map