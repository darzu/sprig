import { assert } from "./test.js";
// functions
export function sum(ns) {
    return ns.reduce((p, n) => p + n, 0);
}
export function max(ns) {
    return ns.reduce((p, n) => (p > n ? p : n), -Infinity);
}
export function avg(ns) {
    return sum(ns) / ns.length;
}
export function clamp(n, min, max) {
    if (n < min)
        return min;
    else if (n > max)
        return max;
    return n;
}
export function min(ns) {
    return ns.reduce((p, n) => (p < n ? p : n), Infinity);
}
export function even(n) {
    return n % 2 == 0;
}
export const radToDeg = 180 / Math.PI;
export function jitter(radius) {
    return (Math.random() - 0.5) * radius * 2;
}
export function align(x, size) {
    return Math.ceil(x / size) * size;
}
// maps a number from [inMin, inMax] to [outMin, outMax]
export function mathMap(n, inMin, inMax, outMin, outMax) {
    assert(inMin < inMax, "must be: inMin < inMax");
    assert(outMin <= outMax, "must be: outMin <= outMax");
    assert(inMin <= n && n <= inMax, "must be: inMin <= n && n <= inMax");
    const s = (n - inMin) / (inMax - inMin);
    return s * (outMax - outMin) + outMin;
}
//# sourceMappingURL=math.js.map