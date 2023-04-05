import { Component, EM, EntityManager } from "../entity-manager.js";
import {
  AABB,
  AABB2,
  updateAABBWithPoint2,
  updateAABBWithPoint2_,
} from "../physics/aabb.js";
import { CY } from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { V, vec3, vec4 } from "../sprig-matrix.js";
import { assert, dbgLogOnce } from "../util.js";
import { randColor } from "../utils-game.js";
import { MapName, MapsDef } from "./map-loader.js";
import { ScoreDef } from "./score.js";

const WIDTH = 1024;
const HEIGHT = 512;

export const LandMapTexPtr = CY.createTexture("landMap", {
  size: [WIDTH, HEIGHT],
  format: "r32float",
});

export const LandMapDef = EM.defineComponent(
  "landMap",
  (name: string, map: Float32Array) => ({
    name,
    map,
  })
);

type MapBlobRun = {
  y: number;
  x0: number; // inclusive
  x1: number; // exclusive
};
interface MapBlob {
  color: vec4;
  aabb: AABB2; // NOTE: min is inclusive, max is exclusive
  area: number;
  runs: MapBlobRun[];
}

// TODO(@darzu): use union-find to track islands?
//  or extract all color blobs as x,y offset + sub-img data ?
//    this could then be processed down into points of interest
//    and the land map
//  perhaps arranged as a tree so you could see if a blob encloses another blob
//    either with "encloses" (tree) or "touching" relationships
// TODO(@darzu): ! extract islands as run-length encoded sections
// TODO(@darzu): create a "generateLegend" helper fn? creates a png with
//  all the colors and their meanings
// TODO(@darzu): is there such a thing as layered png? png with layers.
// TODO(@darzu): also what compression does png use?
// NOTE: we mutate the maps as we parse them (so we have easier bookkeeping)
// TODO(@darzu): PERF. If we read the .png huffman table directly, we can probably massively speed this up
function parseAndMutateMapBlobs(
  rgbaBytes: Uint8ClampedArray,
  width: number,
  height: number
): MapBlob[] {
  const blobs: MapBlob[] = [];

  let _tmpclr = vec4.tmp();
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      // found something?
      if (!vec4.equals(getColor(x, y, _tmpclr), vec4.ZEROS)) {
        blobs.push(parseBlob(x, y));
      }

      // // console.log(r, g, b);
      // // note: we flip y b/c we're mapping to x/z
      // const outIdx = x + (height - 1 - y) * width;
      // // TODO(@darzu): texture should probably be ints
      // // r,g,b each range from 0-255
      // if (x <= W || y <= W || x >= width - 1 - W || y >= height - 1 - W) {
      //   landData[outIdx] = 1.0;
      // } else if (g > 100) {
      //   landData[outIdx] = 0.0;
      // } else if (r > 100 && b > 100) {
      //   landData[outIdx] = 0.5;
      //   totalPurple++;
      // } else if (r > 100) {
      //   landData[outIdx] = 1.0;
      // }
    }
  }

  return blobs;

  // NOTE: use of _tmpclr means we require only one caller at a time
  function getColor(x: number, y: number, out?: vec4): vec4 {
    out = out ?? _tmpclr;
    // out of bounds
    if (x < 0 || width <= x || y < 0 || height <= y)
      return vec4.copy(out, vec4.ZEROS);
    const idx = x * 4 + y * width * 4;
    const r = rgbaBytes[idx + 0];
    const g = rgbaBytes[idx + 1];
    const b = rgbaBytes[idx + 2];
    const a = rgbaBytes[idx + 3];
    return vec4.set(r, g, b, a, out);
  }
  // TODO(@darzu): perf. we'd probably get some perf by inlining these
  function clearColor(x: number, y: number): void {
    const idx = x * 4 + y * width * 4;
    rgbaBytes[idx + 0] = 0;
    rgbaBytes[idx + 1] = 0;
    rgbaBytes[idx + 2] = 0;
    rgbaBytes[idx + 3] = 0;
  }

  function parseBlob(x: number, y: number): MapBlob {
    // assumptions:
    //    because we're scanning from (0,0), we know we're
    //    at the start of a run and there are no runs
    //    above us
    const color = getColor(x, y, vec4.create());
    const blob: MapBlob = {
      color,
      aabb: { min: V(Infinity, Infinity), max: V(-Infinity, -Infinity) },
      area: 0,
      runs: [],
    };

    const checkColor = (x: number, y: number) =>
      vec4.equals(color, getColor(x, y));

    // TODO(@darzu):
    parseRun(x, y);

    return blob;

    function parseRun(x: number, y: number): void {
      // walk as far left as we can
      let x0 = x;
      // NOTE: MOST of the time runs will be started v close to the left end anyway
      while (checkColor(x0 - 1, y)) x0 -= 1;
      let x1 = x0; // NOTE: outputed x1 is exclusive
      // walk right and clear as we go
      while (checkColor(x1, y)) {
        clearColor(x1, y);
        // check above
        if (checkColor(x1, y + 1)) {
          parseRun(x1, y + 1);
        }
        // TODO(@darzu): how do we make sure there isn't a race here?
        // // check below
        // if (checkColor(x1, y - 1)) {
        //   parseRun(x1, y - 1);
        // }
        x1 += 1;
      }
      // store run & update counts
      const len = x1 - x0;
      assert(x0 <= x && x < x1, `invalid run w/ length ${x1 - x0}`);
      updateAABBWithPoint2_(blob.aabb, x0, y);
      updateAABBWithPoint2_(blob.aabb, x1, y + 1);
      blob.area += len;
      blob.runs.push({ y, x0, x1 });
    }
  }
}

export async function setMap(em: EntityManager, name: MapName) {
  const res = await em.whenResources(MapsDef, RendererDef, ScoreDef);

  const map = res.maps[name];

  let buf = map.bytes;
  // yikes
  // buf = buf.slice(0x8a);
  // const view = new Uint32Array(buf.buffer);
  // assert(view.length === WIDTH * HEIGHT, "map has bad size");
  assert(buf.length === WIDTH * HEIGHT * 4, "map has bad size");
  assert(map.width === WIDTH, `map.width: ${map.width}`);
  assert(map.height === HEIGHT, `map.height: ${map.height}`);

  const blobs = parseAndMutateMapBlobs(buf, map.width, map.height);
  console.dir(blobs);

  const W = 2;
  const landData = new Float32Array(map.width * map.height);
  let totalPurple = 0;
  // for (let x = 0; x < map.width; x += 1) {
  //   for (let y = 0; y < map.height; y += 1) {
  //     const rIdx = x * 4 + y * map.width * 4;
  //     const r = buf[rIdx + 0];
  //     const g = buf[rIdx + 1];
  //     const b = buf[rIdx + 2];
  //     const a = buf[rIdx + 3]; // unused?
  //     // console.log(r, g, b);
  //     // note: we flip y b/c we're mapping to x/z
  //     const outIdx = x + (map.height - 1 - y) * map.width;
  //     // TODO(@darzu): texture should probably be ints
  //     // r,g,b each range from 0-255
  //     if (
  //       x <= W ||
  //       y <= W ||
  //       x >= map.width - 1 - W ||
  //       y >= map.height - 1 - W
  //     ) {
  //       landData[outIdx] = 1.0;
  //     } else if (g > 100) {
  //       landData[outIdx] = 0.0;
  //     } else if (r > 100 && b > 100) {
  //       landData[outIdx] = 0.5;
  //       totalPurple++;
  //     } else if (r > 100) {
  //       landData[outIdx] = 1.0;
  //     }
  //   }
  // }
  const texResource = res.renderer.renderer.getCyResource(LandMapTexPtr)!;
  texResource.queueUpdate(landData);

  const landMap = em.ensureResource(LandMapDef, name, landData);
  res.score.totalPurple = totalPurple;
  res.score.cutPurple = 0;
  landMap.map = landData;
  landMap.name = name;

  // set random secondary/teriary colors
  const purpleness = (c: vec3) => c[0] * c[2];
  let secColor = randColor();
  while (purpleness(secColor) > 0.05) secColor = randColor();
  let terColor = randColor();
  while (purpleness(terColor) > 0.05) terColor = randColor();
  // secColor = V(1, 1, 1);
  res.renderer.renderer.updateScene({
    secColor,
    terColor,
  });
}
