// import { deltaE2000 } from "./color-lab.js";
import { D50_to_D65 as XYZD50ToXYZD65, D65_to_D50 as XYZD65ToXYZD50, deltaE2000, FLRGBToFRGB, FLRGBToXYZD65, FRGBToFLRGB, Lab_to_LCH as CIELABToLCH, Lab_to_XYZD50 as XYZCIELABToXYZD50, LCH_to_Lab as LCHToCIELAB, XYZD50_to_CIELAB as XYZD50ToCIELAB, XYZD65ToFLRGB } from "./color-lab.js";
import { LABToLRGB, LRGBToLAB } from "./color-oklab.js";
import { clamp, dist, max, min, sub, V3 } from "./math.js";
import { mapObj, never, values } from "./util.js"

export type FRGB = { fr: number, fg: number, fb: number };
export type RGB = { r: number, g: number, b: number };
export type LRGB = { lr: number, lg: number, lb: number };
export type FLRGB = { flr: number, flg: number, flb: number };
export type HSL = { h: number, s: number, l: number };
export type XYZD65 = { x: number, y: number, z: number, white: "D65" };
export type XYZD50 = { x: number, y: number, z: number, white: "D50" };
export type XYZ = XYZD50 | XYZD65;
export type OKLAB = { l: number, a: number, b: number, kind: "oklab" };
export type CIELAB = { l: number, a: number, b: number, kind: "cielab" };
export type LAB = OKLAB | CIELAB
export type LCH = { l: number, c: number, h: number }
export type Color = HSL | RGB | LAB | FRGB | LRGB | FLRGB | XYZ | LCH

export function isHSL(hsl: Color): hsl is HSL {
    return "h" in hsl && "s" in hsl && "l" in hsl
}
export function isRGB(rgb: Color): rgb is RGB {
    return "r" in rgb && "g" in rgb && "b" in rgb
}
export function isLRGB(rgb: Color): rgb is LRGB {
    return "lr" in rgb && "lg" in rgb && "lb" in rgb
}
export function isFLRGB(rgb: Color): rgb is FLRGB {
    return "flr" in rgb && "flg" in rgb && "flb" in rgb
}
export function isFRGB(rgb: Color): rgb is FRGB {
    return "fr" in rgb && "fg" in rgb && "fb" in rgb
}
export function isXYZ(xyz: Color): xyz is XYZ {
    return "x" in xyz && "y" in xyz && "z" in xyz
}
export function isXYZD50(xyz: Color): xyz is XYZD50 {
    return isXYZ(xyz) && xyz.white === "D50"
}
export function isXYZD65(xyz: Color): xyz is XYZD65 {
    return isXYZ(xyz) && xyz.white === "D65"
}
export function isLAB(lab: Color): lab is LAB {
    return "l" in lab && "a" in lab && "b" in lab
}
export function isOKLAB(lab: Color): lab is OKLAB {
    return isLAB(lab) && lab.kind === "oklab"
}
export function isCIELAB(lab: Color): lab is CIELAB {
    return isLAB(lab) && lab.kind === "cielab"
}
export function isLCH(lch: Color): lch is LCH {
    return "l" in lch && "c" in lch && "h" in lch
}

function toRGBInternal(clr: Color): RGB {
    if (isHSL(clr))
        return HSLToRGB(clr)
    else if (isRGB(clr))
        return { ...clr }
    else if (isOKLAB(clr))
        return toRGB(LABToLRGB(clr))
    else if (isFRGB(clr))
        return FRGBToRGB(clr)
    else if (isFLRGB(clr))
        return toRGB(FLRGBToFRGB(clr))
    else if (isLRGB(clr))
        return toRGB(LRGBToFLRGB(clr))
    else if (isXYZD65(clr))
        return toRGB(XYZD65ToFLRGB(clr))
    else if (isXYZD50(clr))
        return toRGB(XYZD50ToXYZD65(clr))
    else if (isCIELAB(clr))
        return toRGB(XYZCIELABToXYZD50(clr))
    else if (isLCH(clr))
        return toRGB(LCHToCIELAB(clr))
    never(clr)
}
export function toRGB(clr: Color): RGB {
    // TODO(@darzu): needed?
    const res = toRGBInternal(clr)
    return res
    // return clampRGB(res);
}
export function toHSL(clr: Color): HSL {
    if (isHSL(clr))
        return { ...clr }
    return RGBToHSL(toRGB(clr))
}
export function toOKLAB(clr: Color): OKLAB {
    if (isOKLAB(clr))
        return { ...clr }
    return LRGBToLAB(toLRGB(clr))
}
export function toLRGB(clr: Color): LRGB {
    if (isLRGB(clr))
        return { ...clr }
    return FLRGBToLRGB(toFLRGB(clr))
}
export function toFLRGB(clr: Color): FLRGB {
    if (isFLRGB(clr))
        return { ...clr }
    return FRGBToFLRGB(toFRGB(clr))
}
export function toFRGB(clr: Color): FRGB {
    if (isFRGB(clr))
        return { ...clr }
    return RGBToFRGB(toRGB(clr))
}
export function toCIELAB(clr: Color): CIELAB {
    if (isCIELAB(clr))
        return { ...clr }
    return XYZD50ToCIELAB(toXYZD50(clr))
}
export function toLCH(clr: Color): LCH {
    if (isLCH(clr))
        return { ...clr }
    return CIELABToLCH(toCIELAB(clr))
}
export function toXYZD50(clr: Color): XYZD50 {
    if (isXYZD50(clr))
        return { ...clr }
    return XYZD65ToXYZD50(toXYZD65(clr))
}
export function toXYZD65(clr: Color): XYZD65 {
    if (isXYZD65(clr))
        return { ...clr }
    return FLRGBToXYZD65(toFLRGB(clr))
}

export function toV3(c: Color): V3 {
    if (isHSL(c))
        return [c.h, c.s, c.l]
    else if (isRGB(c))
        return [c.r, c.g, c.b]
    else if (isLAB(c))
        return [c.l, c.a, c.b]
    else if (isFRGB(c))
        return [c.fr, c.fg, c.fb]
    else if (isFLRGB(c))
        return [c.flr, c.flg, c.flb]
    else if (isLRGB(c))
        return [c.lr, c.lg, c.lb]
    else if (isXYZ(c))
        return [c.x, c.y, c.z]
    else if (isLCH(c))
        return [c.l, c.c, c.h]
    never(c)
}

export function fromHue(h: number): LCH {
    return clampLCH({ l: 80, c: 132, h })
}

export function FLRGBToLRGB({ flr, flg, flb }: FLRGB): LRGB {
    if (flr > 1 || flg > 1 || flb > 1) {
        // TODO(@darzu): 
        throw new Error(`invalid FLRGB: (${flr}, ${flg}, ${flb})`)
    }
    return {
        lr: Math.trunc(clamp(flr * 255, 0, 255)),
        lg: Math.trunc(clamp(flg * 255, 0, 255)),
        lb: Math.trunc(clamp(flb * 255, 0, 255)),
    }
}
export function FRGBToRGB({ fr, fg, fb }: FRGB): RGB {
    // if (fr > 1 || fg > 1 || fb > 1) {
    //     // TODO(@darzu): 
    //     throw new Error(`invalid FRGB: (${fr}, ${fg}, ${fb})`)
    // }
    return {
        r: Math.trunc(clamp(fr * 255, 0, 255)),
        g: Math.trunc(clamp(fg * 255, 0, 255)),
        b: Math.trunc(clamp(fb * 255, 0, 255)),
    }
}

export function RGBToFRGB({ r, g, b }: RGB): FRGB {
    return {
        fr: clamp(r / 255.0, 0.0, 1.0),
        fg: clamp(g / 255.0, 0.0, 1.0),
        fb: clamp(b / 255.0, 0.0, 1.0),
    }
}
export function LRGBToFLRGB({ lr, lg, lb }: LRGB): FLRGB {
    return {
        flr: clamp(lr / 255.0, 0.0, 1.0),
        flg: clamp(lg / 255.0, 0.0, 1.0),
        flb: clamp(lb / 255.0, 0.0, 1.0),
    }
}
// https://css-tricks.com/converting-color-spaces-in-javascript/

export function parseHex(hex: string): RGB {
    // Convert hex to RGB first
    let r = 0, g = 0, b = 0;
    if (hex.length == 4) {
        r = parseInt("0x" + hex[1] + hex[1])
        g = parseInt("0x" + hex[2] + hex[2])
        b = parseInt("0x" + hex[3] + hex[3])
    } else if (hex.length == 7) {
        r = parseInt("0x" + hex[1] + hex[2])
        g = parseInt("0x" + hex[3] + hex[4])
        b = parseInt("0x" + hex[5] + hex[6])
    }
    return { r, g, b }
}

export function parseRGB(rgb: string): RGB {
    // Choose correct separator
    let sep = rgb.indexOf(",") > -1 ? "," : " ";
    // Turn "rgb(r,g,b)" into [r,g,b]
    const arr = rgb.substr(4).split(")")[0].split(sep);
    const [r, g, b] = arr.map(i => parseInt(i))
    return { r, g, b }
}

export function parse(s: string): RGB {
    if (s.startsWith("#"))
        return parseHex(s)
    else if (s.startsWith("rgb"))
        return parseRGB(s)
    else
        throw "Unsupported color string: " + s
}

function HSLToRGB({ h, s, l }: HSL): RGB {
    // Must be fractions of 1
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0,
        g = 0,
        b = 0;

    if (0 <= h && h < 60) {
        r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
        r = c; g = 0; b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return { r, g, b };
}

function RGBToHSL({ r, g, b }: RGB): HSL {
    // Make r, g, and b fractions of 1
    r /= 255;
    g /= 255;
    b /= 255;

    // Find greatest and smallest channel values
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;

    // Calculate hue
    // No difference
    if (delta == 0)
        h = 0;
    // Red is max
    else if (cmax == r)
        h = ((g - b) / delta) % 6;
    // Green is max
    else if (cmax == g)
        h = (b - r) / delta + 2;
    // Blue is max
    else
        h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    // Make negative hues positive behind 360°
    if (h < 0)
        h += 360;

    // Calculate lightness
    l = (cmax + cmin) / 2;

    // Calculate saturation
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    // Multiply l and s by 100
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

function RGBToHex({ r, g, b }: RGB): string {
    let r16 = r.toString(16);
    let g16 = g.toString(16);
    let b16 = b.toString(16);

    if (r16.length == 1)
        r16 = "0" + r16;
    if (g16.length == 1)
        g16 = "0" + g16;
    if (b16.length == 1)
        b16 = "0" + b16;

    const res = "#" + r16 + g16 + b16;
    if (res.length >= "#a231115".length) {
        // TODO(@darzu): 
        console.dir({ r, g, b })
        throw new Error("invalid rgb")
    }
    return res
}

function HSLToString({ h, s, l }: HSL) {
    return "hsl(" + h + "," + s + "%," + l + "%)"
}

function RGBToString({ r, g, b }: RGB) {
    return "rgb(" + r + "," + g + "," + b + ")"
}

export function toHex(clr: Color): string {
    return RGBToHex(toRGB(clr))
}
export function toString(clr: Color): string {
    if (isHSL(clr))
        return HSLToString(clr)
    else if (isRGB(clr))
        return RGBToString(clr)
    return toHex(clr)
}

// Reference / well-known colors

const _referenceColors = {
    scene: "#4b6584",
    music: "rgb(227,17,192)",
    controller: "#d54322",
    variables: "rgb(237,59,89)",
    functions: "rgb(35,69,154)",
    input: "#b4009e",
    logic: "rgb(69,170,242)",
    loops: "rgb(32,191,107)",
    control: "#ff5722",
    jacdac: "#e79251",
    display: "#311557",
    animation: "#03aa74",
    sprite: "#3b6fea",
    sprites: "#4b7bec",
    location: "#401255",
    gamepad: "#303030",
    lcd: "#219e42",
    light: "#0078d7",
    net: "#8446cf",
    power: "#898989",
    images: "#a5b1c2",
    switch: "#d65cd6",
    corgio: "#d2b48c",
    darts: "#6699cc",
    info: "#cf6a87",
    sevenseg: "#4682b4",
    statusbar: "#38364d",
    tilemaps: "#84b89f",
    textsprite: "#3e99de",
    timer: "#700204",
    story: "#b36634",
    minimap: "#cfab0c",
}
export const pxtColors: { [k: string]: RGB } = mapObj(_referenceColors, parse)
export const pxtColorsHSL: { [k: string]: HSL } = mapObj(pxtColors, RGBToHSL)

const contrastRef = [
    [parse("#FF0000"), 4.0],
    [parse("#00FF00"), 1.4],
    [parse("#000FF"), 8.6],
]

export function perceptualLum(color: Color): number {
    // https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
    const { fr, fg, fb } = toFRGB(color)
    // if RsRGB <= 0.03928 then R = RsRGB/12.92 else R = ((RsRGB+0.055)/1.055) ^ 2.4
    const R = fr <= 0.03928 ? fr / 12.92 : ((fr + 0.055) / 1.055) ** 2.4
    // if GsRGB <= 0.03928 then G = GsRGB/12.92 else G = ((GsRGB+0.055)/1.055) ^ 2.4
    const G = fg <= 0.03928 ? fg / 12.92 : ((fg + 0.055) / 1.055) ** 2.4
    // if BsRGB <= 0.03928 then B = BsRGB/12.92 else B = ((BsRGB+0.055)/1.055) ^ 2.4
    const B = fb <= 0.03928 ? fb / 12.92 : ((fb + 0.055) / 1.055) ** 2.4
    // L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    return L
}

export function lumDiff(L1: number, L2: number): number {
    // https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
    // (L1 + 0.05) / (L2 + 0.05)
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
}

export const white = { h: 0, s: 0, l: 100 }
export const whiteLAB = toOKLAB(white)

export const whiteLum = perceptualLum(white)

export function clampHSL({ h, s, l }: HSL): HSL {
    h = h % 360;
    s = clamp(s, 0, 100)
    l = clamp(l, 0, 100)
    return { h, s, l }
}
export function clampLCH({ l, c, h }: LCH): LCH {
    l = clamp(l, 0, 100)
    c = clamp(c, 0, 132)
    h = clamp(h, 0, 360)
    return { l, c, h }
}
export function clampRGB({ r, g, b }: RGB): RGB {
    r = clamp(r, 0, 255)
    g = clamp(g, 0, 255)
    b = clamp(b, 0, 255)
    return { r, g, b }
}
export function clampFRGB({ fr, fg, fb }: FRGB): FRGB {
    fr = clamp(fr, 0, 1.0)
    fg = clamp(fg, 0, 1.0)
    fb = clamp(fb, 0, 1.0)
    return { fr, fg, fb }
}
export function clampFLRGB({ flr, flg, flb }: FLRGB): FLRGB {
    flr = clamp(flr, 0, 1.0)
    flg = clamp(flg, 0, 1.0)
    flb = clamp(flb, 0, 1.0)
    return { flr, flg, flb }
}

// TODO(@darzu): This just uses lum. What about saturation?
export function contrastClamp<C extends Color>(clr: C, ref: Color, min: number, max: number, mod: (hsl: C) => C): C | null {
    const refLum = perceptualLum(ref)
    const cont = () => lumDiff(perceptualLum(clr), refLum)
    let prevCont = cont()
    while (prevCont < min || max < prevCont) {
        clr = mod(clr)
        const newCont = cont()
        if (prevCont < min)
            if (prevCont < newCont)
                prevCont = newCont
            else
                break;
        else if (max < prevCont)
            if (newCont < prevCont)
                prevCont = newCont
            else
                break;
        else
            throw 'Unreachable'
    }
    const finalCont = cont()
    if (min < finalCont && finalCont < max)
        return clr;
    else
        return null; // failed to reach the target
}

function colorDistEuclid({ l: l1, a: a1, b: b1 }: LAB, { l: l2, a: a2, b: b2 }: LAB): number {
    // https://en.wikipedia.org/wiki/Color_difference
    // const c1 = { x: a1, y: b1 }
    // const c2 = { x: a2, y: b2 }
    // return dist(sub(c1, c2))
    return Math.sqrt((a1 - a2) ** 2 + (b1 - b2) ** 2) + Math.abs(l1 - l2)
}

export function colorDistDeltaE2000(lab1: Color, lab2: Color): number {
    // TODO(@darzu): restrict to CIELAB?
    return deltaE2000(toCIELAB(lab1), toCIELAB(lab2));
}

// export const labDist = labDistEuclid;
// export const labDist = labDistDeltaE2000;

export function colorDistOKLAB(c1: Color, c2: Color) {
    return colorDistEuclid(toOKLAB(c1), toOKLAB(c2))
}