export function range(length) {
    return new Array(length).fill(null).map((_, i) => i);
}
export function edges(ts) {
    return range(ts.length + 1).map((i) => [ts[i - 1] || null, ts[i] || null]);
}
export function zip(ts, us) {
    return ts.map((t, i) => [t, us[i]]);
}
export function never(x, msg) {
    throw new Error(msg !== null && msg !== void 0 ? msg : "Unexpected object: " + x);
}
export function __isSMI(n) {
    // Checks if a number is within the "small integer" range
    //  that V8 uses on 64-bit platforms to efficiently represent
    //  small ints. Keeping numbers within this range _should_
    //  lead to better perf esp. for arrays.
    return -(2 ** 31) < n && n < 2 ** 31 - 1;
}
export function isString(val) {
    return typeof val === "string";
}
export function hashCode(s) {
    var hash = 0, i, chr;
    if (s.length === 0)
        return hash;
    for (i = 0; i < s.length; i++) {
        chr = s.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
        // TODO: is the next line necessary?
        hash >>>= 0; // Convert to unsigned
    }
    return hash;
}
export function objMap(a, map) {
    const res = {};
    Object.entries(a).forEach(([n, v1]) => {
        res[n] = map(v1, n);
    });
    return res;
}
export function toRecord(as, key, val) {
    const res = {};
    as.forEach((a) => (res[key(a)] = val(a)));
    return res;
}
// TODO(@darzu): this is is a typescript hack for the fact that just using "false"
//  causes type inference (specifically type narrowing) to not work right in
//  dead code sometimes (last tested with tsc v4.2.3)
export const FALSE = false;
//# sourceMappingURL=util.js.map