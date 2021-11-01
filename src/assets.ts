import { importObj, isParseError } from "./import_obj.js";
import { Mesh, unshareProvokingVertices } from "./mesh-pool.js";
import { assert } from "./test.js";
import { getText } from "./webget.js";

export interface GameAssets {
  ship: Mesh;
  sword: Mesh;
}

async function loadAssetInternal(path: string): Promise<Mesh> {
  // download
  const txt = await getText(path);

  // parse
  const opt = importObj(txt);
  assert(
    !!opt && !isParseError(opt),
    `unable to parse asset (${path}):\n${opt}`
  );

  // clean up
  const obj = unshareProvokingVertices(opt);

  return obj;
}

export async function loadAssets(): Promise<GameAssets> {
  const start = performance.now();

  // TODO(@darzu): parallel download for many objs
  const ship = await loadAssetInternal("/assets/ship.sprig.obj");
  const sword = await loadAssetInternal("/assets/sword.sprig.obj");

  // perf tracking
  const elapsed = performance.now() - start;
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  // done
  return {
    ship,
    sword,
  };
}
