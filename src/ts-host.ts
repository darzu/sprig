import { Stmt } from "./bast.js";
import ts from "./ext/typescript.js";
import { emitFile } from "./ts-to-bast.js";
import { ajax } from "./util.js";

export function sampleTranspile() {
    const source = "let x: string  = 'string'";

    console.log(`has ts? ${!!ts}`);
    console.dir(ts)

    let result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

    console.dir(result)
}

function createMemHost(files: { [fileName: string]: string }): ts.CompilerHost {
    function fileExists(fileName: string): boolean {
        fileName = getCanonicalFileName(fileName)
        return fileName in files
    }
    function readFile(fileName: string): string | undefined {
        fileName = getCanonicalFileName(fileName)
        const res = files[fileName]
        if (!res) {
            console.error("Oops! Can't find: " + fileName)
        }
        return res
    }
    function getSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): ts.SourceFile | undefined {
        fileName = getCanonicalFileName(fileName)
        // TODO @darzu: cache?
        // TODO @darzu: errors?
        const res = ts.createSourceFile(fileName, files[fileName], languageVersion)
        // console.log(`getSourceFile(${fileName})`)
        // console.dir(res);
        return res
    }
    function getDefaultLibFileName(options: ts.CompilerOptions): string {
        // TODO @darzu: hmmm
        return "lib.d.ts";
    }
    function writeFile(fileName: string, data: string, writeByteOrderMark: boolean, onError?: (message: string) => void, sourceFiles?: readonly ts.SourceFile[]) {
        fileName = getCanonicalFileName(fileName)
        // TODO @darzu: other args?
        files[fileName] = data
    }
    function getCurrentDirectory(): string {
        // TODO @darzu: hmm
        return "~"
    }
    function getCanonicalFileName(fileName: string): string {
        // console.log(`getCanonicalFileName(${fileName})`)
        return fileName.replace("~/", "");
    }
    function useCaseSensitiveFileNames(): boolean {
        return true;
    }
    function getNewLine(): string {
        return "\n";
    }

    return {
        // module resolution
        fileExists,
        readFile,

        // host
        getSourceFile,
        getDefaultLibFileName,
        writeFile,
        getCurrentDirectory,
        getCanonicalFileName,
        useCaseSensitiveFileNames,
        getNewLine,
    }
}

export async function compileTs(maints: string): Promise<Stmt[]> {
    const compOpts: ts.CompilerOptions = {
        lib: ['lib.d.ts', 'dz.d.ts'],
        target: ts.ScriptTarget.Latest
    }
    const files = {
        'main.ts': maints,
        'lib.d.ts': await ajax.getText("./ext/lib.es5.d.ts"), // TODO @darzu:
        'dz.d.ts': await ajax.getText("./dz.d.ts"), // TODO @darzu:
    }
    const host = createMemHost(files)
    // const host = ts.createCompilerHost(compOpts);
    // host.writeFile("main.ts", await ajax.getText('./samples/log.ts'), false);
    const progOpts: ts.CreateProgramOptions = {
        rootNames: ['main.ts'],
        options: compOpts,
        host: host,
    }
    const prog = ts.createProgram(progOpts)
    const diag = [...prog.getSyntacticDiagnostics(), ...prog.getSemanticDiagnostics(), ...prog.getGlobalDiagnostics()]
    for (let d of diag) {
        console.log(`err: ${d.messageText}`)
    }

    const ast = prog.getSourceFile('main.ts')
    if (!ast)
        return [];
    const tc = prog.getTypeChecker()

    const res = emitFile(ast)
    console.dir(res);

    const jsRes = prog.emit()

    for (let d of jsRes.diagnostics) {
        console.log(`err: ${d.messageText}`)
    }

    for (let f of jsRes.emittedFiles || ["main.js"]) {
        const s = host.readFile(f)
        console.log(s)
    }
    // console.dir(prog)

    return res
}