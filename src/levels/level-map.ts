import { EM } from "../ecs/ecs.js";
import { Resource } from "../ecs/em-resources.js";
import { VERBOSE_LOG } from "../flags.js";
import { TextDef } from "../gui/ui.js";
import { AABB2, aabbCenter2, updateAABBWithPoint2_ } from "../physics/aabb.js";
import { CY } from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { V, tV, V2, V4 } from "../matrix/sprig-matrix.js";
import { assert, assertDbg } from "../utils/util.js";
import { vec2Dbg, vec4Dbg } from "../utils/utils-3d.js";
import { MapName, MapBytesSetDef, MapBytes, MapHelp } from "./map-loader.js";
import { ScoreDef } from "../game-ld53/score.js";

const DBG_PRINT_BLOBS = false;

const WIDTH = 1024; // +x
const HEIGHT = 512; // +y

function mapXYtoImgPxDataIdx(
  x: number,
  y: number,
  width: number,
  height: number
) {
  // NOTE:
  //  image origin is top-left
  //  map origin is bottom-left
  return x + (height - 1 - y) * width;
}

function mapXYtoCyTexDataIdx(
  x: number,
  y: number,
  width: number,
  height: number
) {
  // TODO(@darzu): verify cy tex?
  // NOTE:
  //  map origin is bottom-left
  //  cy tex origin is bottom-left

  return x + y * width;
}

export const LandMapTexPtr = CY.createTexture("landMap", {
  size: [WIDTH, HEIGHT],
  format: "r32float",
});

// TODO(@darzu): should this thing be game-aware?
export const LevelMapDef = EM.defineResource("levelMap", () => ({
  name: "unknown",
  landCyTexData: new Float32Array(),
  towers: [] as [V2, V2][],
  startPos: V(0, 0),
  windDir: V(0, 0),
  endZonePos: V(0, 0),
}));
type LevelMap = Resource<typeof LevelMapDef>;

// NOTE: this is for some pretty egregiously naive run-length encoding
type MapBlobRun = {
  y: number;
  x0: number; // inclusive
  x1: number; // exclusive
};
interface MapBlob {
  color: V4;
  aabb: AABB2; // NOTE: min is inclusive, max is exclusive
  area: number;
  runs: MapBlobRun[];
}

const mapCache = new Map<string, LevelMap>();

function centerOfMassAndDirection(b: MapBlob): [V2, V2] {
  let cx = 0;
  let cy = 0;
  let len = 0;
  for (let run of b.runs) {
    const y = run.y;
    for (let x = run.x0; x < run.x1; x++) {
      cx += x;
      cy += y;
      len++;
    }
  }
  cx /= len;
  cx = Math.floor(cx);
  cy /= len;
  cy = Math.floor(cy);
  // direction of furthest point
  let fx = cx;
  let fy = cy;
  let fd = 0;
  for (let run of b.runs) {
    const y = run.y;
    for (let x = run.x0; x < run.x1; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d > fd) {
        fx = x;
        fy = y;
        fd = d;
      }
    }
  }
  const dir = V(fx - cx, fy - cy);
  V2.norm(dir, dir);
  return [V(cx, cy), dir];
}

// NOTE: we mutate the maps as we parse them (so we have easier bookkeeping)
// TODO(@darzu): PERF! If we read the .png huffman table directly, we can probably massively speed this up
// TODO(@darzu): PERF! Or if we switch to .qoi, the format is much easier to decode/encode b/c it uses run-length encoding
// TODO(@darzu): feature: is there such a thing as layered png? png with layers.
// TODO(@darzu): feature: create a "generateLegend" helper fn? creates a png with
//                        all the colors and their meanings
function parseAndMutateIntoMapBlobs(
  rgbaBytes: Uint8ClampedArray,
  width: number,
  height: number
): MapBlob[] {
  const blobs: MapBlob[] = [];

  const white = V(255, 255, 255, 255);

  let _tmpclr = V4.tmp();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const clr = getColor(x, y, _tmpclr);
      // found something?
      if (!V4.equals(clr, V4.ZEROS) && !V4.equals(clr, white)) {
        blobs.push(parseBlob(x, y));
      }
    }
  }

  return blobs;

  // NOTE: use of _tmpclr means we require only one caller at a time
  function getColor(x: number, y: number, out?: V4): V4 {
    out = out ?? _tmpclr;
    // out of bounds
    if (x < 0 || width <= x || y < 0 || height <= y)
      return V4.copy(out, V4.ZEROS);
    const idx = mapXYtoImgPxDataIdx(x, y, width, height) * 4;
    const r = rgbaBytes[idx + 0];
    const g = rgbaBytes[idx + 1];
    const b = rgbaBytes[idx + 2];
    const a = rgbaBytes[idx + 3];
    return V4.set(r, g, b, a, out);
  }
  // TODO(@darzu): perf. we'd probably get some perf by inlining these
  function clearColor(x: number, y: number): void {
    const idx = mapXYtoImgPxDataIdx(x, y, width, height) * 4;
    rgbaBytes[idx + 0] = 0;
    rgbaBytes[idx + 1] = 0;
    rgbaBytes[idx + 2] = 0;
    rgbaBytes[idx + 3] = 0;
  }

  function parseBlob(x: number, y: number): MapBlob {
    // assumptions:
    //    - because we're scanning from (0,0) going up +y, we know we're
    //    at the start of a run and there are no runs
    //    below us.
    //    - map origin is bottom-left.
    const color = getColor(x, y, V4.mk());
    const blob: MapBlob = {
      color,
      aabb: { min: V(Infinity, Infinity), max: V(-Infinity, -Infinity) },
      area: 0,
      runs: [],
    };

    const checkColor = (x: number, y: number) =>
      V4.equals(color, getColor(x, y));

    parseRun(x, y);

    blob.runs.sort((a, b) => a.y - b.y);

    return blob;

    function parseRun(x: number, y: number): void {
      // console.log(`parseRun ${x},${y}`);
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
): LevelMap {
  let __start = performance.now();

  let buf = mapBytes.bytes;
  assert(buf.length === WIDTH * HEIGHT * 4, "map has bad size");
  assert(mapBytes.width === WIDTH, `map.width: ${mapBytes.width}`);
  assert(mapBytes.height === HEIGHT, `map.height: ${mapBytes.height}`);

  const blobs = parseAndMutateIntoMapBlobs(
    buf,
    mapBytes.width,
    mapBytes.height
  );

  if (DBG_PRINT_BLOBS)
    for (let b of blobs)
      console.log(
        `xy: ${vec2Dbg(aabbCenter2(tV(0, 0), b.aabb))}, clr: ${vec4Dbg(
          b.color
        )}, area: ${b.area}`
      );

  const W = 2;
  const landCyTexData = new Float32Array(mapBytes.width * mapBytes.height);
  let totalPurple = 0;

  //extract land data
  for (let blob of blobs) {
    if (blob.color[0] < 50 && blob.color[1] < 50 && blob.color[2] < 50) {
      for (let r of blob.runs) {
        for (let x = r.x0; x < r.x1; x++) {
          // TODO(@darzu): parameterize this transform?
          const outIdx = mapXYtoCyTexDataIdx(
            x,
            r.y,
            mapBytes.width,
            mapBytes.height
          );
          landCyTexData[outIdx] = 1.0;
        }
      }
    }
  }

  // for (let blob of blobs) {
  //   console.log(`Blob with color ${blob.color}`);
  // }

  // extract start pos
  const startBlob = blobs.filter(
    (b) => b.color[0] < 100 && b.color[1] < 100 && b.color[2] > 200
  )[0];
  assert(!!startBlob, `no start blob`);
  const startPos = aabbCenter2(V2.mk(), startBlob.aabb);

  // extract tower locations
  const towers = blobs
    .filter((b) => b.color[0] > 200 && b.color[1] > 200 && b.color[2] < 100)
    .map((b) => centerOfMassAndDirection(b));

  // TODO(@darzu): game-specific stuff should probably be abstracted out
  const towerIslandRadius = 50;
  towers.forEach(([pos, _]) => {
    for (let i = -towerIslandRadius; i < towerIslandRadius; i++) {
      for (let j = -towerIslandRadius; j < towerIslandRadius; j++) {
        if (i * i + j * j > towerIslandRadius * towerIslandRadius) continue;
        const x = pos[0] + i;
        const y = pos[1] + j;
        // check to see if we're actually within an approximate circle
        const outIdx = mapXYtoCyTexDataIdx(
          x,
          y,
          mapBytes.width,
          mapBytes.height
        );
        if (0 <= outIdx && outIdx < landCyTexData.length) {
          landCyTexData[outIdx] = 1.0;
        }
      }
    }
  });

  const windBlobs = blobs.filter(
    (b) => b.color[0] > 200 && b.color[1] < 150 && b.color[2] > 200
  );
  assert(
    windBlobs.length === 1,
    `expected 1 windBlob, found ${windBlobs.length}`
  );
  const windBlob = windBlobs[0];
  const [_, windDir] = centerOfMassAndDirection(windBlob);

  const endZoneBlobs = blobs.filter(
    (b) => b.color[0] < 100 && b.color[1] > 200 && b.color[2] < 100
  );
  assert(
    endZoneBlobs.length === 1,
    `expected 1 end zone, found ${endZoneBlobs.length}`
  );
  const endZoneBlob = endZoneBlobs[0];
  const endZonePos = aabbCenter2(V2.mk(), endZoneBlob.aabb);

  const levelMap: LevelMap = {
    landCyTexData,
    name,
    startPos,
    towers,
    windDir,
    endZonePos,
  };

  // TODO(@darzu): DBG:
  // console.dir(levelMap);

  // TODO(@darzu): dbg:
  const __elapsed = performance.now() - __start;
  console.log(`setMap elapsed: ${__elapsed.toFixed(1)}ms`);

  return levelMap;
}

export async function setMap(name: MapName) {
  console.log(`setting map to ${name}`);
  const res = await EM.whenResources(
    MapBytesSetDef,
    RendererDef,
    ScoreDef,
    TextDef
  );

  let __start = performance.now();

  let levelMap;
  // TODO(@darzu): REFACTOR. purge purple stuff
  if (mapCache.has(name)) {
    levelMap = mapCache.get(name)!;
  } else {
    const mapBytes = res.mapBytesSet[name];

    levelMap = parseAndMutateIntoMapData(mapBytes, name);
    mapCache.set(name, levelMap);
  }

  res.text.helpText = MapHelp[name] || " ";

  // TODO(@darzu): FIX LAND SPAWN
  const texResource = res.renderer.renderer.getCyResource(LandMapTexPtr)!;
  texResource.queueUpdate(levelMap.landCyTexData);

  // TODO(@darzu): hacky. i wish there was a way to do "createOrSet" instead of just "ensure"
  const resLandMap = EM.ensureResource(LevelMapDef);
  Object.assign(resLandMap, levelMap);

  // set random secondary/teriary colors
  // const purpleness = (c: V3) => c[0] * c[2];
  // let secColor = randColor();
  // while (purpleness(secColor) > 0.05) secColor = randColor();
  // let terColor = randColor();
  // while (purpleness(terColor) > 0.05) terColor = randColor();
  // // secColor = V(1, 1, 1);
  // res.renderer.renderer.updateScene({
  //   secColor,
  //   terColor,
  // });

  // TODO(@darzu): dbg:
  const __elapsed = performance.now() - __start;
  console.log(`setMap elapsed: ${__elapsed.toFixed(1)}ms`);
}
