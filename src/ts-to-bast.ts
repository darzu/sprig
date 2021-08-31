import { Exp, ExpBlock, NumLit, Stmt, StrLit } from "./bast.js";
import { pxtColors } from "./color.js";
import ts from "./ext/typescript.js";

// TODO(@darzu): emit code blocks

export function emitFile(file: ts.SourceFile): Stmt[] {
    // TODO @darzu: emit Value

    // emit file
    let outLns = file
        .getChildren()
        .map(emitNode)
        .reduce((p, c) => [...p, ...c], []);

    // // emit any comments that could not be associated with a
    // // statement at the end of the file
    // commentMap.filter(c => !c.owner)
    //     .forEach(comment => outLns.push(...emitComment(comment)))

    return outLns
}
function emitNode(s: ts.Node): Stmt[] {
    switch (s.kind) {
        case ts.SyntaxKind.SyntaxList:
            return (s as ts.SyntaxList)._children
                .map(emitNode)
                .reduce((p, c) => p.concat(c), []);
        case ts.SyntaxKind.EndOfFileToken:
        case ts.SyntaxKind.OpenBraceToken:
        case ts.SyntaxKind.CloseBraceToken:
            return [];
        default:
            return [emitStmtWithNewlines(s as ts.Statement)];
    }
}

function emitStmtWithNewlines(s: ts.Statement): Stmt {
    const out = emitStmt(s);

    // // get comments after emit so that child nodes get a chance to claim them
    // const comments = pxtc.decompiler.getCommentsForStatement(s, commentMap)
    //     .map(emitComment)
    //     .reduce((p, c) => p.concat(c), [])

    // return comments.concat(out);

    return out;
}

// 
// STATEMENTS
//

function emitStmt(s: ts.Statement): Stmt {
    if (ts.isVariableStatement(s)) {
        // return emitVarStmt(s)
    } else if (ts.isClassDeclaration(s)) {
        // return emitClassStmt(s)
    } else if (ts.isEnumDeclaration(s)) {
        // return emitEnumStmt(s)
    } else if (ts.isExpressionStatement(s)) {
        return emitExpStmt(s);
    } else if (ts.isFunctionDeclaration(s)) {
        return emitFuncDecl(s)
    } else if (ts.isIfStatement(s)) {
        // return emitIf(s)
    } else if (ts.isForStatement(s)) {
        // return emitForStmt(s)
    } else if (ts.isForOfStatement(s)) {
        // return emitForOfStmt(s)
    } else if (ts.isWhileStatement(s)) {
        // return emitWhileStmt(s)
    } else if (ts.isReturnStatement(s)) {
        // return emitReturnStmt(s)
    } else if (ts.isBlock(s)) {
        // return emitBlock(s)
    } else if (ts.isTypeAliasDeclaration(s)) {
        // return emitTypeAliasDecl(s)
    } else if (ts.isModuleDeclaration(s)) {
        // return emitModuleDeclaration(s);
    } else if (ts.isBreakStatement(s)) {
        // return ['break']
    } else if (ts.isContinueStatement(s)) {
        // return ['continue']
    }
    throw `TODO emit statement: ${ts.SyntaxKind[s.kind]} (${s.kind})`;
}

function emitExpStmt(s: ts.ExpressionStatement): Stmt {
    const childEs = emitExp(s.expression);
    // TODO(@darzu): more elegant unwrap?
    if (childEs.length === 1 && childEs[0].kind === "exp") {
        return {
            kind: "stmt",
            corner: "square",
            color: childEs[0].color,
            es: childEs[0].es,
        }
    } else {
        return {
            kind: "stmt",
            corner: "square",
            color: pxtColors["functions"], // TODO(@darzu): 
            es: childEs
        }
    }
}

function emitFuncDecl(s: ts.FunctionDeclaration): Stmt {
    return {
        kind: "stmt",
        corner: "square",
        color: pxtColors["functions"],
        es: [
            asExp("function"),
            ...(s.name ? emitIdentifierExp(s.name) : []),
        ],
    }
}

//
// EXPRESSIONS
//

function emitExp(s: ts.Expression): Exp[] {
    if (ts.isBinaryExpression(s)) {
        // return emitBinExp(s)
    }
    if (ts.isPropertyAccessExpression(s)) {
        return emitDotExp(s)
    }
    if (ts.isCallExpression(s)) {
        return [emitCallExp(s)]
    }
    if (ts.isNewExpression(s)) {
        // return emitCallExp(s)
    }
    if (ts.isFunctionExpression(s) || ts.isArrowFunction(s)) {
        // return emitFnExp(s)
    }
    if (ts.isPrefixUnaryExpression(s)) {
        // return emitPreUnaryExp(s)
    }
    if (ts.isPostfixUnaryExpression(s)) {
        // return emitPostUnaryExp(s)
    }
    if (ts.isParenthesizedExpression(s)) {
        // return emitParenthesisExp(s)
    }
    if (ts.isArrayLiteralExpression(s)) {
        // return emitArrayLitExp(s)
    }
    if (ts.isElementAccessExpression(s)) {
        // return emitElAccessExp(s)
    }
    if (
        ts.isNoSubstitutionTemplateLiteral(s) ||
        ts.isTaggedTemplateExpression(s)
    ) {
        // return emitMultiLnStrLitExp(s as ts.NoSubstitutionTemplateLiteral | ts.TaggedTemplateExpression)
    }
    switch (s.kind) {
        case ts.SyntaxKind.TrueKeyword:
        // return asExpRes("True")
        case ts.SyntaxKind.FalseKeyword:
        // return asExpRes("False")
        case ts.SyntaxKind.ThisKeyword:
        // return asExpRes("self")
        case ts.SyntaxKind.NullKeyword:
        case ts.SyntaxKind.UndefinedKeyword:
        // return asExpRes("None")
    }
    if (ts.isIdentifier(s)) {
        return emitIdentifierExp(s)
    }
    if (ts.isNumericLiteral(s)) {
        return [emitNumLit(s)]
    }
    if (ts.isStringLiteral(s)) {
        return [emitStringLit(s)]
    }
    if (ts.isConditionalExpression(s)) {
        // return emitCondExp(s)
    }

    throw `TODO emit expression: ${ts.SyntaxKind[s.kind]} (${s.kind})`;
}

function emitCallExp(s: ts.CallExpression): ExpBlock {
    return {
        kind: "exp",
        corner: "circular",
        color: pxtColors["functions"], // TODO(@darzu): 
        es: [
            ...emitExp(s.expression),
            ...s.arguments.map(emitExp).reduce((p, n) => [...p, ...n], [])
        ]
    }
}

function emitDotExp(s: ts.PropertyAccessExpression): Exp[] {
    return [
        ...emitExp(s.expression),
        asExp(s.name.text)
    ]
}

function emitIdentifierExp(s: ts.Identifier): Exp[] {
    return [asExp(s.text)]
}

function asExp(s: string): Exp {
    return {
        kind: "lbl",
        val: s
    }
}

//
// LITERALS
//

function emitStringLit(s: ts.StringLiteral): StrLit {
    return {
        kind: "str",
        val: s.text
    }
}
function emitNumLit(s: ts.NumericLiteral): NumLit {
    return {
        kind: "num",
        val: (+s.text)
    }
}

