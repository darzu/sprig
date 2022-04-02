import { mat4, quat, vec3 } from "./gl-matrix.js";
import { avg } from "./math.js";
import { tempVec } from "./temp-pool.js";
// math utilities
export function computeTriangleNormal(p1, p2, p3) {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1));
    vec3.normalize(n, n);
    return n;
}
// matrix utilities
export function pitch(m, rad) {
    return mat4.rotateX(m, m, rad);
}
export function yaw(m, rad) {
    return mat4.rotateY(m, m, rad);
}
export function roll(m, rad) {
    return mat4.rotateZ(m, m, rad);
}
export function moveX(m, n) {
    return mat4.translate(m, m, [n, 0, 0]);
}
export function moveY(m, n) {
    return mat4.translate(m, m, [0, n, 0]);
}
export function moveZ(m, n) {
    return mat4.translate(m, m, [0, 0, n]);
}
export function getPositionFromTransform(t) {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos;
}
// vec utilities
export function vec3Floor(out, v) {
    out[0] = Math.floor(v[0]);
    out[1] = Math.floor(v[1]);
    out[2] = Math.floor(v[2]);
    return out;
}
export function vec3Dbg(v) {
    return `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`;
}
export function quatDbg(q) {
    const axis = tempVec();
    const n = quat.getAxisAngle(axis, q);
    return `${vec3Dbg(axis)}*${n.toFixed(2)}`;
}
export function mat4Dbg(v) {
    const ns = [...v].map((n) => n.toFixed(2));
    return ("" +
        `[${ns[0]},${ns[1]},${ns[2]},${ns[3]}
 ${ns[4]},${ns[5]},${ns[6]},${ns[7]}
 ${ns[8]},${ns[9]},${ns[10]},${ns[11]}
 ${ns[12]},${ns[13]},${ns[14]},${ns[15]}]`);
}
export function centroid(vs) {
    const avgX = avg(vs.map((v) => v[0]));
    const avgY = avg(vs.map((v) => v[1]));
    const avgZ = avg(vs.map((v) => v[2]));
    return vec3.fromValues(avgX, avgY, avgZ);
}
// TODO(@darzu):  move into gl-matrix?
export function vec3Mid(out, a, b) {
    out[0] = (a[0] + b[0]) * 0.5;
    out[1] = (a[1] + b[1]) * 0.5;
    out[2] = (a[2] + b[2]) * 0.5;
    return out;
}
//# sourceMappingURL=utils-3d.js.map