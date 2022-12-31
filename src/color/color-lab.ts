// https://drafts.csswg.org/css-color/#lab-colors
// https://drafts.csswg.org/css-color/#color-conversion-code

import {
  CIELAB,
  FLRGB,
  FRGB,
  LAB,
  LCH,
  toV3,
  XYZD50,
  XYZD65,
} from "./color.js";

// TODO(@darzu): deprecate in favor of gl-matrix style?
type V3 = [number, number, number];
type Mat = [V3, V3, V3];
function multiplyMatrices(a: Mat, b: V3): V3 {
  return [
    a[0][0] * b[0] + a[0][1] * b[1] + a[0][2] * b[2],
    a[1][0] * b[0] + a[1][1] * b[1] + a[1][2] * b[2],
    a[2][0] * b[0] + a[2][1] * b[1] + a[2][2] * b[2],
  ];
}

// sRGB-related functions
export function FRGBToFLRGB({ fr, fg, fb }: FRGB): FLRGB {
  // convert an array of sRGB values in the range 0.0 - 1.0
  // to linear light (un-companded) form.
  // https://en.wikipedia.org/wiki/SRGB
  // TODO for negative values, extend linear portion on reflection of axis, then add pow below that
  function lin(val: number) {
    let sign = val < 0 ? -1 : 1;
    let abs = Math.abs(val);
    if (abs < 0.04045) {
      return val / 12.92;
    }
    return sign * Math.pow((abs + 0.055) / 1.055, 2.4);
  }
  return { flr: lin(fr), flg: lin(fg), flb: lin(fb) };
}

export function FLRGBToFRGB({ flr, flg, flb }: FLRGB): FRGB {
  // convert an array of linear-light sRGB values in the range 0.0-1.0
  // to gamma corrected form
  // https://en.wikipedia.org/wiki/SRGB
  // For negative values, linear portion extends on reflection
  // of axis, then uses reflected pow below that
  function gam(val: number) {
    let sign = val < 0 ? -1 : 1;
    let abs = Math.abs(val);

    if (abs > 0.0031308) {
      return sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
    }

    return 12.92 * val;
  }
  return { fr: gam(flr), fg: gam(flg), fb: gam(flb) };
}

export function FLRGBToXYZD65(rgb: FLRGB): XYZD65 {
  // convert an array of linear-light sRGB values to CIE XYZ
  // using sRGB's own white, D65 (no chromatic adaptation)

  const M: Mat = [
    [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
    [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
    [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
  ];
  const [x, y, z] = multiplyMatrices(M, toV3(rgb));
  return { x, y, z, white: "D65" };
}

export function XYZD65ToFLRGB(xyz: XYZD65): FLRGB {
  // TODO(@darzu): is this D65 or D50 or does it not matter?
  // convert XYZ to linear-light sRGB

  const M: Mat = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
  ];

  const [flr, flg, flb] = multiplyMatrices(M, toV3(xyz));
  return { flr, flg, flb };
}

// // TODO(@darzu): these are different than FRGB. Handle differently
// //  display-p3-related functions

// function lin_P3(RGB: FRGB) {
//     // convert an array of display-p3 RGB values in the range 0.0 - 1.0
//     // to linear light (un-companded) form.

//     return FRGBToFLRGB(RGB);	// same as sRGB
// }

// function gam_P3(RGB: FLRGB) {
//     // convert an array of linear-light display-p3 RGB  in the range 0.0-1.0
//     // to gamma corrected form

//     return FLRGBToFRGB(RGB);	// same as sRGB
// }

// function lin_P3_to_XYZ(rgb) {
//     // convert an array of linear-light display-p3 values to CIE XYZ
//     // using  D65 (no chromatic adaptation)
//     // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
//     const M: Mat = [
//         [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
//         [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
//         [0.0000000000000000, 0.04511338185890264, 1.043944368900976]
//     ];
//     // 0 was computed as -3.972075516933488e-17

//     return multiplyMatrices(M, rgb);
// }

// function XYZ_to_lin_P3(XYZ) {
//     // convert XYZ to linear-light P3
//     const M: Mat = [
//         [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
//         [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
//         [0.03584583024378447, -0.07617238926804182, 0.9568845240076872]
//     ];

//     return multiplyMatrices(M, XYZ);
// }

// // prophoto-rgb functions

// function lin_ProPhoto(RGB) {
//     // convert an array of prophoto-rgb values in the range 0.0 - 1.0
//     // to linear light (un-companded) form.
//     // Transfer curve is gamma 1.8 with a small linear portion
//     // TODO for negative values, extend linear portion on reflection of axis, then add pow below that
//     const Et2 = 16 / 512;
//     return RGB.map(function (val) {
//         if (val <= Et2) {
//             return val / 16;
//         }

//         return Math.pow(val, 1.8);
//     });
// }

// function gam_ProPhoto(RGB) {
//     // convert an array of linear-light prophoto-rgb  in the range 0.0-1.0
//     // to gamma corrected form
//     // Transfer curve is gamma 1.8 with a small linear portion
//     // TODO for negative values, extend linear portion on reflection of axis, then add pow below that
//     const Et = 1 / 512;
//     return RGB.map(function (val) {
//         if (val >= Et) {
//             return Math.pow(val, 1 / 1.8);
//         }

//         return 16 * val;
//     });
// }

// function lin_ProPhoto_to_XYZ(rgb) {
//     // convert an array of linear-light prophoto-rgb values to CIE XYZ
//     // using  D50 (so no chromatic adaptation needed afterwards)
//     // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
//     const M: Mat = [
//         [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
//         [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
//         [0.0, 0.0, 0.8251046025104601]
//     ];

//     return multiplyMatrices(M, rgb);
// }

// function XYZ_to_lin_ProPhoto(XYZ) {
//     // convert XYZ to linear-light prophoto-rgb
//     const M: Mat = [
//         [1.3457989731028281, -0.25558010007997534, -0.05110628506753401],
//         [-0.5446224939028347, 1.5082327413132781, 0.02053603239147973],
//         [0.0, 0.0, 1.2119675456389454]
//     ];

//     return multiplyMatrices(M, XYZ);
// }

// // a98-rgb functions

// function lin_a98rgb(RGB) {
//     // convert an array of a98-rgb values in the range 0.0 - 1.0
//     // to linear light (un-companded) form.
//     // negative values are also now accepted
//     return RGB.map(function (val) {
//         return Math.pow(Math.abs(val), 563 / 256) * Math.sign(val);
//     });
// }

// function gam_a98rgb(RGB) {
//     // convert an array of linear-light a98-rgb  in the range 0.0-1.0
//     // to gamma corrected form
//     // negative values are also now accepted
//     return RGB.map(function (val) {
//         return Math.pow(Math.abs(val), 256 / 563) * Math.sign(val);
//     });
// }

// function lin_a98rgb_to_XYZ(rgb) {
//     // convert an array of linear-light a98-rgb values to CIE XYZ
//     // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
//     // has greater numerical precision than section 4.3.5.3 of
//     // https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf
//     // but the values below were calculated from first principles
//     // from the chromaticity coordinates of R G B W
//     // see matrixmaker.html
//     const M: Mat = [
//         [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
//         [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
//         [0.02703136138641234, 0.07068885253582723, 0.9913375368376388]
//     ];

//     return multiplyMatrices(M, rgb);
// }

// function XYZ_to_lin_a98rgb(XYZ) {
//     // convert XYZ to linear-light a98-rgb
//     const M: Mat = [
//         [2.0415879038107465, -0.5650069742788596, -0.34473135077832956],
//         [-0.9692436362808795, 1.8759675015077202, 0.04155505740717557],
//         [0.013444280632031142, -0.11836239223101838, 1.0151749943912054]
//     ];

//     return multiplyMatrices(M, XYZ);
// }

// //Rec. 2020-related functions

// function lin_2020(RGB) {
//     // convert an array of rec2020 RGB values in the range 0.0 - 1.0
//     // to linear light (un-companded) form.
//     // ITU-R BT.2020-2 p.4

//     const α = 1.09929682680944;
//     const β = 0.018053968510807;

//     return RGB.map(function (val) {
//         let sign = val < 0 ? -1 : 1;
//         let abs = Math.abs(val);

//         if (abs < β * 4.5) {
//             return val / 4.5;
//         }

//         return sign * (Math.pow((abs + α - 1) / α, 1 / 0.45));
//     });
// }

// function gam_2020(RGB) {
//     // convert an array of linear-light rec2020 RGB  in the range 0.0-1.0
//     // to gamma corrected form
//     // ITU-R BT.2020-2 p.4

//     const α = 1.09929682680944;
//     const β = 0.018053968510807;

//     return RGB.map(function (val) {
//         let sign = val < 0 ? -1 : 1;
//         let abs = Math.abs(val);

//         if (abs > β) {
//             return sign * (α * Math.pow(abs, 0.45) - (α - 1));
//         }

//         return 4.5 * val;
//     });
// }

// function lin_2020_to_XYZ(rgb) {
//     // convert an array of linear-light rec2020 values to CIE XYZ
//     // using  D65 (no chromatic adaptation)
//     // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
//     const M: Mat = [
//         [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
//         [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
//         [0.000000000000000, 0.028072693049087428, 1.060985057710791]
//     ];
//     // 0 is actually calculated as  4.994106574466076e-17

//     return multiplyMatrices(M, rgb);
// }

// function XYZ_to_lin_2020(XYZ) {
//     // convert XYZ to linear-light rec2020
//     const M: Mat = [
//         [1.7166511879712674, -0.35567078377639233, -0.25336628137365974],
//         [-0.6666843518324892, 1.6164812366349395, 0.01576854581391113],
//         [0.017639857445310783, -0.042770613257808524, 0.9421031212354738]
//     ];

//     return multiplyMatrices(M, XYZ);
// }

// Chromatic adaptation
export function D65_to_D50(xyz: XYZD65): XYZD50 {
  // Bradford chromatic adaptation from D65 to D50
  // The matrix below is the result of three operations:
  // - convert from XYZ to retinal cone domain
  // - scale components from one reference white to another
  // - convert back to XYZ
  // http://www.brucelindbloom.com/index.html?Eqn_ChromAdapt.html
  const M: Mat = [
    [1.0478112, 0.0228866, -0.050127],
    [0.0295424, 0.9904844, -0.0170491],
    [-0.0092345, 0.0150436, 0.7521316],
  ];

  const [x, y, z] = multiplyMatrices(M, toV3(xyz));
  return { x, y, z, white: "D50" };
}

export function D50_to_D65(xyz: XYZD50): XYZD65 {
  // Bradford chromatic adaptation from D50 to D65
  const M: Mat = [
    [0.9555766, -0.0230393, 0.0631636],
    [-0.0282895, 1.0099416, 0.0210077],
    [0.0122982, -0.020483, 1.3299098],
  ];

  const [x, y, z] = multiplyMatrices(M, toV3(xyz));
  return { x, y, z, white: "D65" };
}

// Lab and LCH
export function XYZD50_to_CIELAB(XYZ: XYZD50): CIELAB {
  // Assuming XYZ is relative to D50, convert to CIE Lab
  // from CIE standard, which now defines these as a rational fraction
  const ε = 216 / 24389; // 6^3/29^3
  const κ = 24389 / 27; // 29^3/3^3
  const white = [0.96422, 1.0, 0.82521]; // D50 reference white

  // compute xyz, which is XYZ scaled relative to reference white
  const xyz = toV3(XYZ).map((value, i) => value / white[i]);

  // now compute f
  const f = xyz.map((value) =>
    value > ε ? Math.cbrt(value) : (κ * value + 16) / 116
  );

  return {
    l: 116 * f[1] - 16,
    a: 500 * (f[0] - f[1]),
    b: 200 * (f[1] - f[2]),
    kind: "cielab",
  };
}

export function Lab_to_XYZD50(lab: CIELAB): XYZD50 {
  const Lab = toV3(lab);
  // Convert Lab to D50-adapted XYZ
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  const κ = 24389 / 27; // 29^3/3^3
  const ε = 216 / 24389; // 6^3/29^3
  const white = [0.96422, 1.0, 0.82521]; // D50 reference white
  const f = [];

  // compute f, starting with the luminance-related term
  f[1] = (Lab[0] + 16) / 116;
  f[0] = Lab[1] / 500 + f[1];
  f[2] = f[1] - Lab[2] / 200;

  // compute xyz
  const xyz = [
    Math.pow(f[0], 3) > ε ? Math.pow(f[0], 3) : (116 * f[0] - 16) / κ,
    Lab[0] > κ * ε ? Math.pow((Lab[0] + 16) / 116, 3) : Lab[0] / κ,
    Math.pow(f[2], 3) > ε ? Math.pow(f[2], 3) : (116 * f[2] - 16) / κ,
  ];

  // Compute XYZ by scaling xyz by reference white
  const [x, y, z] = xyz.map((value, i) => value * white[i]);
  return { x, y, z, white: "D50" };
}

export function Lab_to_LCH(cielab: CIELAB): LCH {
  const Lab = toV3(cielab);
  // Convert to polar form
  const hue = (Math.atan2(Lab[2], Lab[1]) * 180) / Math.PI;
  return {
    l: Lab[0], // L is still L
    c: Math.sqrt(Math.pow(Lab[1], 2) + Math.pow(Lab[2], 2)), // Chroma
    h: hue >= 0 ? hue : hue + 360, // Hue, in degrees [0 to 360)
  };
}

export function LCH_to_Lab(lch: LCH): CIELAB {
  const LCH = toV3(lch);
  // Convert from polar form
  return {
    l: LCH[0],
    a: LCH[1] * Math.cos((LCH[2] * Math.PI) / 180),
    b: LCH[1] * Math.sin((LCH[2] * Math.PI) / 180),
    kind: "cielab",
  };
}

export function deltaE2000(lab1: LAB, lab2: LAB) {
  // hhttps://drafts.csswg.org/css-color/#color-difference-code
  const reference = [lab1.l, lab1.a, lab1.b];
  const sample = [lab2.l, lab2.a, lab2.b];

  // deltaE2000 is a statistically significant improvement
  // over deltaE76 and deltaE94,
  // and is recommended by the CIE and Idealliance
  // especially for color differences less than 10 deltaE76
  // but is wicked complicated
  // and many implementations have small errors!

  // Given a reference and a sample color,
  // both in CIE Lab,
  // calculate deltaE 2000.

  // This implementation assumes the parametric
  // weighting factors kL, kC and kH
  // (for the influence of viewing conditions)
  // are all 1, as seems typical.

  let [L1, a1, b1] = reference;
  let [L2, a2, b2] = sample;
  let C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
  let C2 = Math.sqrt(a2 ** 2 + b2 ** 2);

  let Cbar = (C1 + C2) / 2; // mean Chroma

  // calculate a-axis asymmetry factor from mean Chroma
  // this turns JND ellipses for near-neutral colors back into circles
  let C7 = Math.pow(Cbar, 7);
  const Gfactor = Math.pow(25, 7);
  let G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Gfactor)));

  // scale a axes by asymmetry factor
  // this by the way is why there is no Lab2000 colorspace
  let adash1 = (1 + G) * a1;
  let adash2 = (1 + G) * a2;

  // calculate new Chroma from scaled a and original b axes
  let Cdash1 = Math.sqrt(adash1 ** 2 + b1 ** 2);
  let Cdash2 = Math.sqrt(adash2 ** 2 + b2 ** 2);

  // calculate new hues, with zero hue for true neutrals
  // and in degrees, not radians
  const pi = Math.PI;
  const r2d = 180 / pi;
  const d2r = pi / 180;
  let h1 = adash1 === 0 && b1 === 0 ? 0 : Math.atan2(b1, adash1);
  let h2 = adash2 === 0 && b2 === 0 ? 0 : Math.atan2(b2, adash2);

  if (h1 < 0) {
    h1 += 2 * pi;
  }
  if (h2 < 0) {
    h2 += 2 * pi;
  }

  h1 *= r2d;
  h2 *= r2d;

  // Lightness and Chroma differences; sign matters
  let dL = L2 - L1;
  let dC = Cdash2 - Cdash1;

  // Hue difference, taking care to get the sign correct
  let hdiff = h2 - h1;
  let hsum = h1 + h2;
  let habs = Math.abs(hdiff);
  let dh;

  if (Cdash1 * Cdash2 === 0) {
    dh = 0;
  } else if (habs <= 180) {
    dh = hdiff;
  } else if (hdiff > 180) {
    dh = hdiff - 360;
  } else if (hdiff < -180) {
    dh = hdiff + 360;
  } else {
    throw new Error("the unthinkable has happened");
  }

  // weighted Hue difference, more for larger Chroma
  let dH = 2 * Math.sqrt(Cdash2 * Cdash1) * Math.sin((dh * d2r) / 2);

  // calculate mean Lightness and Chroma
  let Ldash = (L1 + L2) / 2;
  let Cdash = (Cdash1 + Cdash2) / 2;
  let Cdash7 = Math.pow(Cdash, 7);

  // Compensate for non-linearity in the blue region of Lab.
  // Four possibilities for hue weighting factor,
  // depending on the angles, to get the correct sign
  let hdash;
  if (Cdash1 == 0 && Cdash2 == 0) {
    hdash = hsum; // which should be zero
  } else if (habs <= 180) {
    hdash = hsum / 2;
  } else if (hsum < 360) {
    hdash = (hsum + 360) / 2;
  } else {
    hdash = (hsum - 360) / 2;
  }

  // positional corrections to the lack of uniformity of CIELAB
  // These are all trying to make JND ellipsoids more like spheres

  // SL Lightness crispening factor
  // a background with L=50 is assumed
  let lsq = (Ldash - 50) ** 2;
  let SL = 1 + (0.015 * lsq) / Math.sqrt(20 + lsq);

  // SC Chroma factor, similar to those in CMC and deltaE 94 formulae
  let SC = 1 + 0.045 * Cdash;

  // Cross term T for blue non-linearity
  let T = 1;
  T -= 0.17 * Math.cos((hdash - 30) * d2r);
  T += 0.24 * Math.cos(2 * hdash * d2r);
  T += 0.32 * Math.cos((3 * hdash + 6) * d2r);
  T -= 0.2 * Math.cos((4 * hdash - 63) * d2r);

  // SH Hue factor depends on Chroma,
  // as well as adjusted hue angle like deltaE94.
  let SH = 1 + 0.015 * Cdash * T;

  // RT Hue rotation term compensates for rotation of JND ellipses
  // and Munsell constant hue lines
  // in the medium-high Chroma blue region
  // (Hue 225 to 315)
  let dTH = 30 * Math.exp(-1 * ((hdash - 275) / 25) ** 2);
  let RC = 2 * Math.sqrt(Cdash7 / (Cdash7 + Gfactor));
  let RT = -1 * Math.sin(2 * dTH * d2r) * RC;

  // Finally calculate the deltaE, term by term as root sum of squares
  let dE = (dL / SL) ** 2;
  dE += (dC / SC) ** 2;
  dE += (dH / SH) ** 2;
  dE += RT * (dC / SC) * (dH / SH);
  return Math.sqrt(dE);
  // Yay!!!
}
