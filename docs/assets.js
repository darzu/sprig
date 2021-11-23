import { importObj, isParseError } from "./import_obj.js";
import { unshareProvokingVertices } from "./mesh-pool.js";
import { assert } from "./test.js";
import { getText } from "./webget.js";
async function loadAssetInternal(path) {
    // download
    const txt = await getText(path);
    // parse
    const opt = importObj(txt);
    assert(!!opt && !isParseError(opt), `unable to parse asset (${path}):\n${opt}`);
    // clean up
    const obj = unshareProvokingVertices(opt);
    return obj;
}
export async function loadAssets() {
    const start = performance.now();
    // TODO(@darzu): parallel download for many objs
    const ship = await loadAssetInternal("/assets/ship.sprig.obj");
    const pick = await loadAssetInternal("/assets/pick.sprig.obj");
    const spaceore = await loadAssetInternal("/assets/spaceore.sprig.obj");
    const spacerock = await loadAssetInternal("/assets/spacerock.sprig.obj");
    // perf tracking
    const elapsed = performance.now() - start;
    console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);
    // done
    return {
        ship,
        pick,
        spaceore,
        spacerock,
    };
}
//# sourceMappingURL=assets.js.map