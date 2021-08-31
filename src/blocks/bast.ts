// blocks AST
import { Color } from "./color";
import { CornerShape } from "./legacy-block-ast"; // TODO: move out of legacy

export interface BlockLook {
    color: Color,
    corner: CornerShape,
}

export interface StmtBlock extends BlockLook {
    kind: "stmt",
    es: Exp[],
}
export interface ExpBlock extends BlockLook {
    kind: "exp",
    es: Exp[]
}
export interface MultiStmt extends BlockLook {
    kind: "multi",
    ess: (Exp[] | StmtBlock[])[]
}

export interface Lbl {
    kind: "lbl"
    val: string
}
export interface NumLit {
    kind: "num",
    val: number
}
export interface StrLit {
    kind: "str",
    val: string
}
export interface BoolLit {
    kind: "bool",
    val: boolean
}
export type Lit = NumLit | StrLit | BoolLit;
export type Exp = Lbl | Lit | ExpBlock;
export type Stmt = StmtBlock | MultiStmt;
// TODO @darzu: events, block of stmts, etc..
export type Block = Stmt | ExpBlock
export type Node = Exp | Stmt

export function isStmt(stmt: Node): stmt is Stmt {
    return stmt.kind === "stmt" || stmt.kind === "multi"
}
export function isStmtList(es: Exp[] | Stmt[]): es is Stmt[] {
    if (!es || !es.length)
        return true
    return isStmt(es[0])
}
