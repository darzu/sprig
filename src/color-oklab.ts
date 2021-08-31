
// Oklab color space
// https://bottosson.github.io/posts/oklab/

import { OKLAB, LRGB } from "./color.js";

// References
// https://bottosson.github.io/posts/oklab/
// https://en.wikipedia.org/wiki/Bezold–Brücke_shift
// https://en.wikipedia.org/wiki/Color_appearance_model
// https://www.handprint.com/HP/WCL/wcolor.html
// https://www.cl.cam.ac.uk/teaching/1516/AdvGraph/02_Light_and_colour.pdf
// https://observablehq.com/@mattdesl/perceptually-smooth-multi-color-linear-gradients
// https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/lab()
// https://www.w3.org/TR/css-color-4/

export function LRGBToLAB(c: LRGB): OKLAB {
    // linear sRGB to OKLab
    let l = 0.4122214708 * c.lr + 0.5363325363 * c.lg + 0.0514459929 * c.lb;
    let m = 0.2119034982 * c.lr + 0.6806995451 * c.lg + 0.1073969566 * c.lb;
    let s = 0.0883024619 * c.lr + 0.2817188376 * c.lg + 0.6299787005 * c.lb;

    let l_ = Math.cbrt(l);
    let m_ = Math.cbrt(m);
    let s_ = Math.cbrt(s);

    return {
        l: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
        kind: "oklab"
    };
}

export function LABToLRGB(c: OKLAB): LRGB {
    // OKLab to linear sRGB
    let l_ = c.l + 0.3963377774 * c.a + 0.2158037573 * c.b;
    let m_ = c.l - 0.1055613458 * c.a - 0.0638541728 * c.b;
    let s_ = c.l - 0.0894841775 * c.a - 1.2914855480 * c.b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    const linSRGB = {
        lr: Math.abs(Math.trunc(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
        lg: Math.abs(Math.trunc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
        lb: Math.abs(Math.trunc(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
    };

    return linSRGB;
}