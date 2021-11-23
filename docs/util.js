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
//# sourceMappingURL=util.js.map