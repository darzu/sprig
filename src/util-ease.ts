export type EaseFn = (percent: number) => number;

// NOTE:
//  ideas from: https://easings.net/# (GPLv3, don't use code)
//  code from: https://github.com/Michaelangel007/easing#tldr-shut-up-and-show-me-the-code
export const EASE_LINEAR: EaseFn = (p) => p;
export const EASE_OUTQUAD: EaseFn = (p) => 1 - (1 - p) ** 2;
export const EASE_INQUAD: EaseFn = (p) => p ** 2;
export const EASE_INCUBE: EaseFn = (p) => p ** 3;
export const EASE_OUTBACK: EaseFn = (p) => {
  const m = p - 1;
  const k = 1.70158; // 10% bounce, see Michaelangel007's link for derivation
  return 1 + m * m * (m * (k + 1) + k);
};
export const EASE_INBACK: EaseFn = (p) => {
  const k = 1.70158;
  return p * p * (p * (k + 1) - k);
};
export function EASE_INVERSE(fn: EaseFn): EaseFn {
  return (p) => 1.0 - fn(1.0 - p);
}
