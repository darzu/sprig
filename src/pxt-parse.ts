import { BlockDef, BlockSectionDef, HOLE } from "./legacy-block-ast.js";
import { ajax, never } from "./util.js";

export namespace pxtblocks {
    // {
    //   "kind": "param",
    //   "name": "sprite",
    //   "ref": false,
    //   "varName": "mySprite"
    // },
    //   {
    //     "kind": "label",
    //     "text": " of kind ",
    //     "style": []
    // },
    export type PartDef = LabelPartDef | ParamPartDef;
    export interface LabelPartDef {
        kind: "label",
        text: string
    }
    export interface ParamPartDef {
        kind: "param",
        name: string,
        varName?: string,
        shadowBlockId?: string
    }
    export interface RawBlockDef {
        qName: string,
        attributes: {
            _def: {
                parts: PartDef[],
                parameters: any[]
            }
        }
    }
    export interface BlockDef {
        id: string,
        parts: PartDef[]
    }
} // end namespace

function trimDef(blockRaw: pxtblocks.RawBlockDef): pxtblocks.BlockDef {
    let b = blockRaw
    return {
        id: b.qName,
        parts: b.attributes._def.parts,
        // params: b.attributes._def.parameters,
    }
}

export function getPxtBlockDefs(): Promise<pxtblocks.BlockDef[]> {
    return ajax.getJson("/blocks/sprite_defs.json")
}


export function genDef(rawDef: pxtblocks.BlockDef): BlockDef | null {
    // TODO(dz):
    let sec: BlockSectionDef = rawDef.parts.map(p => {
        if (p.kind === "label")
            return p.text
        else if (p.kind === "param")
            return HOLE
        return never(p)
    })
    let def: BlockDef = {
        id: rawDef.id,
        category: "sprites",
        look: "statement", // TODO(dz):
        sections: [sec] // TODO
    }
    // console.dir(def)
    return def;
}


/*
block AST forms:
  typescript
  blockly xml
  raw HTMl/SVG
  Blockly.block ?
definition forms:
  BlockDefinition
  block= attribute
*/

interface ElementX {
    kind: string,
}
interface BlockX {
    kind: "block",
    type: string,
    children: (ValueX | FieldX)[],
    next?: BlockX
}
interface ValueX {
    kind: "value",
    block: BlockX
}
interface FieldX {
    kind: "field",
    value: string
}
interface MutationX {
    kind: "mutation",
    muts: { [key: string]: string } // TODO: type?
}
// TODO: pxtblocks/composablemutations.ts
const isBlockX = (e: ElementX): e is BlockX => e.kind === "block"
const isValueX = (e: ElementX): e is ValueX => e.kind === "value"
const isFieldX = (e: ElementX): e is FieldX => e.kind === "field"
const isMutationX = (e: ElementX): e is MutationX => e.kind === "mutation"
const isBlockChildX = (e: ElementX): e is FieldX | ValueX => isFieldX(e) || isValueX(e) || isMutationX(e)
function wrap(xs: HTMLCollection): Element[] {
    let res: Element[] = []
    for (let x of xs)
        res.push(x)
    return res
}
function xmlToString(x: Element): string {
    let atts: [string, string][] = []
    for (let a of x.attributes) {
        atts.push([a.nodeName, a.nodeValue || ""])
    }
    return `<${x.nodeName} ${atts.map(a => `${a[0]}="${a[0]}"`).join(" ")}>...(${x.children.length})</>`
}
function parseBlockX(x: Element): BlockX {
    if (["block", "shadow"].indexOf(x.nodeName) < 0)
        throw `Invalid block with incorrect tag: ${xmlToString(x)}`
    let type = x.getAttribute("type")
    if (!type)
        throw `Invalid block with no type: ${xmlToString(x)}`
    let allChildren = wrap(x.children).map(parseBlockXChild)
    let children = allChildren.filter(isBlockChildX)
    let next = allChildren.filter(isBlockX)
    if (next.length > 1)
        throw `Too many <next> children: ${xmlToString(x)}`
    return {
        kind: "block",
        type,
        children,
        next: next.length ? next[0] : undefined
    }
}
function parseBlockXChild(x: Element): FieldX | ValueX | BlockX | MutationX {
    if (x.nodeName === "field") {
        return parseFieldX(x)
    } else if (x.nodeName === "value" || x.nodeName === "statement") {
        return parseValueX(x)
    } else if (x.nodeName === "next") {
        if (x.children.length !== 1)
            throw `Invalid <next> with too many children: ${xmlToString(x)}`
        return parseBlockX(x.children[0])
    } else if (x.nodeName === "mutation") {
        return parseMutationX(x)
    }
    throw `Invalid block child: ${xmlToString(x)}`
}
function parseValueX(x: Element): ValueX {
    let children = wrap(x.children)
    let nonShadow = wrap(x.children).filter(x => x.nodeName === "block")
    let blockChild: Element;
    if (children.length === 2 && nonShadow.length === 1) {
        blockChild = nonShadow[0]
    } else if (children.length === 1) {
        blockChild = x.children[0]
    } else {
        throw `Invalid value with too few/too many children: ${xmlToString(x)}`
    }
    return {
        kind: "value",
        block: parseBlockX(blockChild)
    }
}
function parseFieldX(x: Element): FieldX {
    if (x.children.length !== 0)
        throw `Invalid field with children: ${xmlToString(x)}`
    let value = x.innerHTML
    return {
        kind: "field",
        value
    }
}
function parseMutationX(x: Element): MutationX {
    let m: MutationX = {
        kind: "mutation",
        muts: {}
    }
    for (let a of x.attributes) {
        if (a.name === "xmlns")
            continue
        m.muts[a.name] = a.value
    }
    return m
}
export function parseBlocksXml(xml: Element) {
    // <block type="variables_set">
    // <shadow xmlns="http://www.w3.org/1999/xhtml" type="math_number">
    // <statement name="HANDLER">
    // <field name="NUM">0</field>
    /*
    <block type="controls_if">
      <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
      <value name="IF0">
      </value>
      <statement name="DO0">
      </statement>
      <statement name="ELSE">
      </statement>
    </block>
    */
    for (let c of xml.children) {
        if (c.nodeName === "block") {
            let b = parseBlockX(c)
            console.dir(b)
            break;
        }
    }
}

// -----
// NOTES
// -----

/* TARGET
{
  id: "new_sprite",
  category: "sprites",
  look: "norm_exp",
  sections: [
    ["new sprite",
    HOLE, "of kind",
    {
      kind: "enum",
      values: ["player", "enemy"]
    }
  ]]
},
*/
/* INPUT (mod)
 {
       "id": "sprites.create",
       "parts": [
           "sprite ",
           {
               "kind": "param",
               "name": "img",
               "shadowBlockId": "screen_image_picker",
               "ref": false
           },
           " of kind ",
           {
               "kind": "param",
               "name": "kind",
               "shadowBlockId": "spritekind",
               "ref": false
           }
       ]
   },
 */
/* INPUT
{
      "id": "sprites.create",
      "parts": [
          {
              "kind": "label",
              "text": "sprite ",
              "style": []
          },
          {
              "kind": "param",
              "name": "img",
              "shadowBlockId": "screen_image_picker",
              "ref": false
          },
          {
              "kind": "label",
              "text": " of kind ",
              "style": []
          },
          {
              "kind": "param",
              "name": "kind",
              "shadowBlockId": "spritekind",
              "ref": false
          }
      ]
  },
*/


/*
TARGET:
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
PXT DEF:
{
"id": "Sprite.setPosition",
"parts": [
    {
        "kind": "label",
        "text": "set ",
        "style": []
    },
    {
        "kind": "param",
        "name": "sprite",
        "ref": false,
        "varName": "mySprite"
    },
    {
        "kind": "label",
        "text": " position to x ",
        "style": []
    },
    {
        "kind": "param",
        "name": "x",
        "shadowBlockId": "positionPicker",
        "ref": false
    },
    {
        "kind": "label",
        "text": " y ",
        "style": []
    },
    {
        "kind": "param",
        "name": "y",
        "shadowBlockId": "positionPicker",
        "ref": false
    }
]
},
XML Field:
<block type="spritesetpos">
<value name="sprite">
  <block type="variables_get">
    <field name="VAR">mySprite</field>
  </block>
</value>
<value name="x">
  <shadow type="positionPicker">
    <field name="index">80</field>
  </shadow>
</value>
<value name="y">
  <shadow type="positionPicker">
    <field name="index">60</field>
  </shadow>
</value>
</block>
*/