import { Component, EM, EntityManager } from "../entity-manager.js";
import { AABB } from "../physics/aabb.js";
import { CY } from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { V, vec3 } from "../sprig-matrix.js";
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

type MapBlobRun = { y: number; x0: number; x1: number };
interface MapBlob {
  color: vec3;
  aabb: AABB;
  runs: MapBlobRun[]; // sorted by y
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
function parseMap() {}

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

  const W = 2;
  const landData = new Float32Array(map.width * map.height);
  let totalPurple = 0;
  for (let x = 0; x < map.width; x += 1) {
    for (let y = 0; y < map.height; y += 1) {
      const rIdx = x * 4 + y * map.width * 4;
      const r = buf[rIdx + 0];
      const g = buf[rIdx + 1];
      const b = buf[rIdx + 2];
      const a = buf[rIdx + 3]; // unused?
      // console.log(r, g, b);
      // note: we flip y b/c we're mapping to x/z
      const outIdx = x + (map.height - 1 - y) * map.width;
      // TODO(@darzu): texture should probably be ints
      // r,g,b each range from 0-255
      if (
        x <= W ||
        y <= W ||
        x >= map.width - 1 - W ||
        y >= map.height - 1 - W
      ) {
        landData[outIdx] = 1.0;
      } else if (g > 100) {
        landData[outIdx] = 0.0;
      } else if (r > 100 && b > 100) {
        landData[outIdx] = 0.5;
        totalPurple++;
      } else if (r > 100) {
        landData[outIdx] = 1.0;
      }
    }
  }
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
