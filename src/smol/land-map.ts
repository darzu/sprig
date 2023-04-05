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
import { assert, assertDbg, dbgLogOnce } from "../util.js";
import { vec4Dbg } from "../utils-3d.js";
import { randColor } from "../utils-game.js";
import { MapName, MapBytesSetDef, MapBytes } from "./map-loader.js";
import { ScoreDef } from "./score.js";

const WIDTH = 1024;
const HEIGHT = 512;

export const LandMapTexPtr = CY.createTexture("landMap", {
  size: [WIDTH, HEIGHT],
  format: "r32float",
});

export const LandMapDef = EM.defineComponent(
  "landMap",
  (name?: string, land?: Float32Array) => ({
    name: name ?? "unknown",
    land: land ?? new Float32Array(),
  })
);
type LandMap = Component<typeof LandMapDef>;

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
function parseAndMutateIntoMapBlobs(
  rgbaBytes: Uint8ClampedArray,
  width: number,
  height: number
): MapBlob[] {
  const blobs: MapBlob[] = [];

  const white = V(255, 255, 255, 255);

  let _tmpclr = vec4.tmp();
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const clr = getColor(x, y, _tmpclr);
      // found something?
      if (!vec4.equals(clr, vec4.ZEROS) && !vec4.equals(clr, white)) {
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

    parseRun(x, y);

    blob.runs.sort((a, b) => a.y - b.y);

    return blob;

    function parseRun(x: number, y: number): void {
      // assumption: MOST of the time runs will be started v close to the left end anyway
      assertDbg(checkColor(x, y), `invalid parseRun`);
      // clear to the left
      let x0 = x; // NOTE: outputed x0 is inclusive
      while (checkColor(x0 - 1, y)) {
        x0 -= 1;
        clearColor(x0, y);
      }
      // clear to the right
      let x1 = x; // NOTE: outputed x1 is exclusive
      while (checkColor(x1, y)) {
        clearColor(x1, y);
        x1 += 1;
      }
      // store run & update counts
      const len = x1 - x0;
      assertDbg(x0 <= x && x < x1 && len > 0, `invalid run w/ length ${len}`);
      //NOTE: aabb min is inclusive, max is exclusive
      updateAABBWithPoint2_(blob.aabb, x0, y);
      updateAABBWithPoint2_(blob.aabb, x1, y + 1);
      blob.area += len;
      blob.runs.push({ y, x0, x1 });
      // check for new runs above and below
      for (let xi = x0; xi < x1; xi++) {
        if (checkColor(xi, y + 1)) parseRun(xi, y + 1);
        if (checkColor(xi, y - 1)) parseRun(xi, y - 1);
      }
    }
  }
}

export function parseAndMutateIntoMapData(
  mapBytes: MapBytes,
  name: string
): LandMap {
  let __start = performance.now();

  let buf = mapBytes.bytes;
  // yikes
  // buf = buf.slice(0x8a);
  // const view = new Uint32Array(buf.buffer);
  // assert(view.length === WIDTH * HEIGHT, "map has bad size");
  assert(buf.length === WIDTH * HEIGHT * 4, "map has bad size");
  assert(mapBytes.width === WIDTH, `map.width: ${mapBytes.width}`);
  assert(mapBytes.height === HEIGHT, `map.height: ${mapBytes.height}`);

  const blobs = parseAndMutateIntoMapBlobs(
    buf,
    mapBytes.width,
    mapBytes.height
  );

  // for (let b of blobs) console.log(`clr: ${vec4Dbg(b.color)}, area: ${b.area}`);

  const W = 2;
  const landData = new Float32Array(mapBytes.width * mapBytes.height);
  let totalPurple = 0;

  for (let blob of blobs) {
    // is it land?
    if (blob.color[0] > 100) {
      for (let r of blob.runs) {
        for (let x = r.x0; x < r.x1; x++) {
          // TODO(@darzu): parameterize this transform?
          const outIdx = x + (mapBytes.height - 1 - r.y) * mapBytes.width;
          landData[outIdx] = 1.0;
        }
      }
    }
  }

  const landMap: LandMap = {
    land: landData,
    name,
  };

  // TODO(@darzu): dbg:
  const __elapsed = performance.now() - __start;
  console.log(`setMap elapsed: ${__elapsed.toFixed(1)}ms`);

  return landMap;
}

export async function setMap(em: EntityManager, name: MapName) {
  const res = await em.whenResources(MapBytesSetDef, RendererDef, ScoreDef);

  let __start = performance.now();

  const mapBytes = res.mapBytesSet[name];

  let totalPurple = 0;

  const landMap = parseAndMutateIntoMapData(mapBytes, name);

  const texResource = res.renderer.renderer.getCyResource(LandMapTexPtr)!;
  texResource.queueUpdate(landMap.land);

  // TODO(@darzu): hacky. i wish there was a way to do "createOrSet" instead of just "ensure"
  const resLandMap = em.ensureResource(LandMapDef);
  Object.assign(resLandMap, landMap);

  res.score.totalPurple = totalPurple;
  res.score.cutPurple = 0;

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

  // TODO(@darzu): dbg:
  const __elapsed = performance.now() - __start;
  console.log(`setMap elapsed: ${__elapsed.toFixed(1)}ms`);
}
