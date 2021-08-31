// functions
export function sum(ns) {
    return ns.reduce((p, n) => p + n, 0);
}
export function max(ns) {
    return ns.reduce((p, n) => p > n ? p : n, -Infinity);
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
    return ns.reduce((p, n) => p < n ? p : n, Infinity);
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
//# sourceMappingURL=math.js.map