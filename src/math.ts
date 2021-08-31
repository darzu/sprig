// functions
export function sum(ns: number[]): number {
    return ns.reduce((p, n) => p + n, 0)
}
export function max(ns: number[]): number {
    return ns.reduce((p, n) => p > n ? p : n, -Infinity)
}
export function avg(ns: number[]): number {
    return sum(ns) / ns.length
}
export function clamp(n: number, min: number, max: number): number {
    if (n < min)
        return min
    else if (n > max)
        return max
    return n
}
export function min(ns: number[]): number {
    return ns.reduce((p, n) => p < n ? p : n, Infinity)
}
export function even(n: number) {
    return n % 2 == 0
}

export const radToDeg = 180 / Math.PI;

export function jitter(radius: number): number {
    return (Math.random() - 0.5) * radius * 2
}

export function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}
