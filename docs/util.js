export function range(length) {
    return (new Array(length))
        .fill(null)
        .map((_, i) => i);
}
export function edges(ts) {
    return range(ts.length + 1)
        .map(i => [
        ts[i - 1] || null,
        ts[i] || null
    ]);
}
export function zip(ts, us) {
    return ts.map((t, i) => [t, us[i]]);
}
export function never(x) {
    throw new Error("Unexpected object: " + x);
}
