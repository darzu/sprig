import { pxtColors, pxtColorsHSL } from "./color.js";
import { V2, add, max, sum, even } from "../math.js"
import { genDef, getPxtBlockDefs, parseBlocksXml } from "./pxt-parse.js";
import {
    Renderable, RenderableSection, wrapNodes, sizeOfText
} from "./resize.js"
import { ajax, range } from "../util.js"

const WRAP_INDENT = 8;
const INNER_W_M = 8;
const INNER_H_M = 4;
const CHAR_H = 16;
const CHAR_W = 9.6;
const NODE_SPACER = CHAR_W;
const MOUTH_INDENT = WRAP_INDENT * 2;
const MIN_WIDTH = 164;
const LABEL_MARGIN = 12;
const STACK_GAP = 12;

// categories
export interface BlockCategoryProps {
    hue: number
}
export const BlockCategories = ["loops", "variables", "sprites", "logic"]
export type BlockCategory = "loops" | "variables" | "sprites" | "logic"

// looks
export type CornerShape = "square" | "circular" | "triangular"
export const CornerShapes = ["square", "circular", "triangular"]
export interface BlockLookProps {
    cornerShape: CornerShape
}
export const BlockLooks = ["event", "statement", "norm_exp", "bool_exp"]
export type BlockLook = "event" | "statement" | "norm_exp" | "bool_exp"

export const BlockCategoryProps: { [n in BlockCategory]: BlockCategoryProps } = {
    "loops": {
        hue: 148
    },
    "variables": {
        hue: 350
    },
    "sprites": {
        hue: 222
    },
    "logic": {
        // TODO(dz):
        hue: 222
    }
}
export const BlockLookProps: { [k in BlockLook]: BlockLookProps } = {
    "event": {
        cornerShape: "square"
    },
    "statement": {
        cornerShape: "square"
    },
    "norm_exp": {
        cornerShape: "circular"
    },
    "bool_exp": {
        cornerShape: "triangular"
    }
}

// node defs
export type Label = string
export interface BlockEnumDef {
    kind: "enum",
    values: string[]
}
export interface BlockHoleDef {
    kind: "hole"
}
export const HOLE: BlockHoleDef = { kind: "hole" }
export type LeafDef = Label | BlockEnumDef
export type BlockNodeDef = BlockHoleDef | LeafDef
export function IsLabel(d: BlockNodeDef): d is Label {
    return typeof d === "string";
}
export function IsHoleDef(d: BlockNodeDef): d is BlockHoleDef {
    return (<BlockHoleDef>d).kind === "hole"
}
export function IsLeafDef(d: BlockNodeDef): d is BlockHoleDef {
    return !IsHoleDef(d)
}
export type BlockSectionDef = "mouth" | BlockNodeDef[]
export const MOUTH: BlockSectionDef = "mouth"
export function HasParameter(b: BlockNodeDef) {
    return !IsLabel(b)
}
export function HasParameters(sec: BlockSectionDef) {
    if (sec === "mouth")
        return true
    return sec.reduce((p, n) => p || HasParameter(n), false)
}

// block defs
export interface BlockDef {
    id: string,
    category: BlockCategory,
    look: BlockLook,
    sections: BlockSectionDef[],
}

// values
export interface ImageValue {
    kind: "image",
    value: string
}
export interface EnumValue {
    kind: "enum",
    value: string
}
export interface BoolValue {
    kind: "bool",
    value: boolean
}
export interface BlockValue {
    block: string,
    args: /*multiple sections*/Value[][] | /*one section*/Value[];
}
export function hasMultipleSectionArgs(args: Value[][] | Value[]): args is Value[][] {
    return Array.isArray(args[0])
}
// TODO: most blocks have one section,
export type LeafValue = ImageValue | EnumValue | BoolValue;
export type Value = BlockValue | LeafValue
export function IsBlockValue(v: Value): v is BlockValue {
    return "block" in v
}

//////////////

function genSampleBlock(def: BlockDef): Value | null {
    if (def.sections.length !== 1)
        return null // TODO
    if (def.sections[0] === MOUTH)
        return null // TODO
    let sec = def.sections[0] as BlockNodeDef[]
    let numHoles = sec.filter(p => p === HOLE).length
    let args: Value[] = range(numHoles).map(_ => ({
        kind: "image",
        value: ":)",
    }));
    return {
        block: def.id,
        args: args
    };
}


// Sample gen: (not terribly useful)
//
// let stmtSamples = defs
//   .filter(d => d.look === "statement")
//   .map(genSampleBlock)
//   .filter(b => !!b) as Value[]
// console.log("out samples:")
// console.dir(stmtSamples)

// // codeTree.args = [...codeTree.args as Value[], ...stmtSamples]
// codeTree.args = [stmtSamples[3]]


function sizeOfDropdown(txt: string): V2 {
    // TODO(dz): refine
    return add({ x: CHAR_W * txt.length + 2/*for arrow*/, y: CHAR_H }, { x: INNER_W_M * 2, y: 0 })
}
function mkRenderableValue(val: LeafValue): Renderable {
    if (val.kind == "enum") {
        // TODO(dz): enum dropdown
        return {
            kind: "label",
            text: val.value, // TODO(dz): enum rendering
            size: sizeOfText(val.value)
        }
    } else if (val.kind == "image") {
        // TODO(dz): image rendering
        return {
            kind: "label",
            text: ":)",
            size: { x: 20, y: 20 }
        }
    } else if (val.kind == "bool") {
        let txt = val.value + ""
        return {
            kind: "dropdown",
            text: txt,
            size: sizeOfDropdown(txt),
            corner: "square",
            color: pxtColorsHSL["logic"],
            look: "bool_exp"
        }
    }
    let _: never = val;
    return _
}
function mkRenderableLabel(val: Label): Renderable {
    return {
        kind: "label",
        text: val,
        size: add(sizeOfText(val), { x: 0, y: LABEL_MARGIN * 2 })
    }
}

function mkRenderableMouthSection(args: Renderable[], maxWidth: number): RenderableSection {
    let lines = args.map(a => ({ nodes: [a], size: a.size }))
    let innerW = max(args.map(a => a.size.x))
    let innerH = sum(lines.map(a => a.size.y))

    let outerW = Math.min(
        Math.max(
            innerW + INNER_W_M * 2 + MOUTH_INDENT,
            MIN_WIDTH
        ),
        maxWidth
    )

    return {
        kind: "mouth",
        innerSize: { x: innerW, y: innerH },
        outerSize: { x: outerW, y: innerH },
        lines: lines
    }
}


function mkRenderableWrappedSection(def: BlockNodeDef[], args: Renderable[], maxWidth: number): RenderableSection {
    let nodes: Renderable[] = []
    let nextArg = 0;
    for (let defN of def) {
        if (IsLabel(defN)) {
            let words = defN
                .split(" ")
                .filter(n => !!n)
            words
                .map(mkRenderableLabel)
                .forEach(w => nodes.push(w))
        } else if (defN.kind == "hole") {
            // TODO: error handle mis-matched args & nodes
            nodes.push(args[nextArg])
            nextArg++
        } else if (defN.kind == "enum") {
            // TODO(dz): validate enum value? typecheck? probably before this step
            // TODO: Arg should probably not be a Renderable by this point, it should still
            //       be able to take input from the def
            nodes.push(args[nextArg])
            nextArg++
        }
    }
    let lines = wrapNodes(nodes, maxWidth - INNER_W_M * 2);

    let innerW = max(lines.map(l => l.size.x))
    let innerH = sum(lines.map(l => l.size.y))
    let innerSize: V2 = { x: innerW, y: innerH }

    let outerW = Math.min(
        Math.max(
            innerW + INNER_W_M * 2,
            MIN_WIDTH
        ),
        maxWidth
    )

    return {
        kind: "wrap",
        innerSize: innerSize,
        outerSize: { x: outerW, y: innerH + INNER_H_M * 2 },
        lines: lines,
    }
}
function mkRenderableSection(def: BlockSectionDef, args: Renderable[], maxWidth: number): RenderableSection {
    if (def === "mouth")
        return mkRenderableMouthSection(args, maxWidth)
    else
        return mkRenderableWrappedSection(def, args, maxWidth)
}
// function computeSectionPositions(secs: (HasSize & { kind: "wrap" | "mouth" })[]): Pos[] {
//   // TODO: move to elsewhere?
//   // use INNER_H_M, INNER_W_M, INDENT
//   let ps: Pos[] = []
//   let y = INNER_H_M;
//   for (let s of secs) {
//     let x = s.kind === "wrap" ? INNER_W_M : MOUTH_INDENT
//     ps.push({ x, y })
//     let [w, h] = s.size
//     y += h
//     y += INNER_H_M
//   }

//   return ps;
// }


export function mkRenderable(codeTree: Value, maxWidth: number): Renderable {
    // TODO: render should take both def and values as arg? Feel like we should have that step in here, maybe before rendering

    // is it a leaf value?
    if (!IsBlockValue(codeTree)) {
        return mkRenderableValue(codeTree)
    }

    // it's a block
    let def = blockDefsById[codeTree.block]
    let cat = BlockCategoryProps[def.category]
    let kin = BlockLookProps[def.look]

    // first, do children
    let sectionArgs: Renderable[][];
    // TODO: distinguish indent levels in head vs mouth?
    let maxBlockChildWidth = maxWidth - WRAP_INDENT;
    let maxMouthChildWidth = maxWidth - MOUTH_INDENT;
    if (hasMultipleSectionArgs(codeTree.args)) {
        sectionArgs = codeTree.args.map((secArgs, i) => {
            let isMouth = even(i)
            return secArgs.map(a => mkRenderable(a, isMouth ? maxMouthChildWidth : maxBlockChildWidth))
        })
    } else {
        sectionArgs = [codeTree.args.map(v => mkRenderable(v, maxBlockChildWidth))]
    }

    // combine arguments and definition nodes to create renderable sections
    let nextArgs = 0
    let sections: RenderableSection[] = []
    for (let sec of def.sections) {
        if (HasParameters(sec)) {
            sections.push(mkRenderableSection(sec, sectionArgs[nextArgs], maxWidth));
            nextArgs++;
        } else {
            sections.push(mkRenderableSection(sec, [], maxWidth))
        }
    }
    if (even(sections.length)) {
        // add end cap
        let innerSize: V2 = { x: 0, y: 16 + 8 }
        sections.push({
            lines: [],
            innerSize: innerSize,
            outerSize: add(innerSize, { x: INNER_W_M * 2, y: INNER_H_M * 2 }),
            kind: "wrap"
        })
    }

    // determine outer size
    let width = Math.max(...sections.map(s => s.outerSize.x))
    let height = sections
        .map(s => s.outerSize.y)
        .reduce((p, n) => p + n, 0)

    // finalize
    const color = pxtColorsHSL[def.category]
    return {
        kind: "block",
        corner: kin.cornerShape,
        sections: sections,
        color,
        look: def.look,
        size: { x: width, y: height }
    }
}


export let legacyCodeTree: BlockValue =
{
    block: "on_start",
    args: [
        {
            block: "set_var",
            args: [
                {
                    kind: "enum",
                    value: "foobar"
                },
                {
                    block: "new_sprite",
                    args: [
                        {
                            kind: "image",
                            value: ":)",
                        },
                        {
                            kind: "enum",
                            value: "player"
                        }
                    ]
                }
            ]
        },
        {
            block: "set_var",
            args: [
                {
                    kind: "enum",
                    value: "foobar"
                },
                {
                    kind: "image",
                    value: ":)",
                },
            ]
        },
        {
            block: "if",
            args: [
                // TODO(dz): handle missing parameters
                [{ kind: "bool", value: true }],
                [
                    {
                        block: "set_var",
                        args: [
                            {
                                kind: "enum",
                                value: "baz"
                            },
                            {
                                kind: "image",
                                value: "-.-",
                            },
                        ]
                    },
                ],
                [{ kind: "bool", value: true }],
                [
                    {
                        block: "set_var",
                        args: [
                            {
                                kind: "enum",
                                value: "bar"
                            },
                            {
                                kind: "image",
                                value: "0.0",
                            },
                        ]
                    },
                ],
                [
                    {
                        block: "set_var",
                        args: [
                            {
                                kind: "enum",
                                value: "cat"
                            },
                            {
                                kind: "image",
                                value: ":P",
                            },
                        ]
                    },
                ],
            ]
        }
    ] // on start
}
// codeTree =
//   {
//     block: "on_start",
//     args: [] // on start
//   }


// TODO @darzu:
let blockDefs: BlockDef[] = []
let blockDefsById: { [name: string]: BlockDef } = {}
// TODO: don't mutate like this... tsk tsk
function addBlockDef(def: BlockDef) {
    blockDefsById[def.id] = def
    blockDefs.push(def)
}
const initBlockDefs: BlockDef[] = [
    {
        id: "on_start",
        category: "loops",
        look: "event",
        sections: [
            ["on start"],
            MOUTH
        ]
    },
    {
        id: "set_var",
        category: "variables",
        look: "statement",
        sections: [[
            "set", {
                // TODO: iterate on enum definition
                kind: "enum",
                values: ["foobar", "baz"]
            }, "to", HOLE
        ]]
    },
    {
        id: "new_sprite",
        category: "sprites",
        look: "norm_exp",
        sections: [["new sprite",
            HOLE, "of kind",
            {
                kind: "enum",
                values: ["player", "enemy"]
            }
        ]]
    },
    {
        id: "if",
        category: "logic",
        look: "statement",
        sections: [
            ["if", HOLE, "then"],
            MOUTH,
            ["else if", HOLE, "then"],
            MOUTH,
            ["else"],
            MOUTH
        ],
    }
]
initBlockDefs.forEach(addBlockDef)
let pxtBuiltinBlockDefMap = {
    // TODO: logic_compare, logic_boolean, variables_get,
    //    math_number, math_arithmetic,
    "pxt-on-start": "on_start",
    "variables_set": "set_var",
    "controls_if": "if",
}


export async function runSampleBlocks() {
    // load definitions
    let pxtDefs = await getPxtBlockDefs()
    let defs = pxtDefs.map(genDef).filter(b => !!b) as BlockDef[]
    // console.log("out defs:")
    // console.dir(defs)

    defs.forEach(addBlockDef)

    // load code
    let example = await ajax.getXml("/blocks/sample_blocks.xml")
    console.log(example)
    parseBlocksXml(example)
}
