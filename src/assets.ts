import { importObj, isParseError } from "./import_obj.js";
import { Mesh, unshareProvokingVertices } from "./mesh-pool.js";
import { assert } from "./test.js";
import { getText } from "./webget.js";

export interface GameAssets {
  ship: Mesh;
}

export async function loadAssets(): Promise<GameAssets> {
  const start = performance.now();

  // download
  // TODO(@darzu): parallel download for many objs
  const shipTxt = await getText("/assets/ship.sprig.obj");

  // parse
  const shipOpt = importObj(shipTxt);
  assert(
    !!shipOpt && !isParseError(shipOpt),
    `unable to parse ship:\n${shipOpt}`
  );

  // clean up
  const ship = unshareProvokingVertices(shipOpt);

  // perf tracking
  const elapsed = performance.now() - start;
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  // done
  return {
    ship,
  };
}
