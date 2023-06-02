import { ColorDef } from "../color/color-ecs.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { gameMeshFromMesh } from "../meshes/meshes.js";
import { grassPoolPtr, RenderDataGrassDef } from "./std-grass.js";
import { jitter, align } from "../utils/math.js";
import { PositionDef } from "../physics/transform.js";
import { Mesh, RawMesh } from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
import { getPositionFromTransform } from "../utils/utils-3d.js";
import { randColor } from "../utils/utils-game.js";

const RENDER_GRASS = true;

// export interface GrassSystem {
//   getGrassPools: () => MeshPool[];
//   update: (target: vec3) => void;
//   // TODO(@darzu): getAABB
// }

export interface GrassTileOpts {
  bladeW: number;
  bladeH: number;
  spacing: number;
  tileSize: number;
  maxBladeDraw: number;
}
export interface GrassTilesetOpts {
  bladeW: number;
  bladeH: number;
  spacing: number;
  tileSize: number;
  tilesPerSide: number;
}

export function createGrassTile(opts: GrassTileOpts): Mesh {
  const { spacing, tileSize: size, bladeW, bladeH } = opts;
  console.log("createGrassTile");

  // TODO(@darzu): debug coloring
  const [r, g, b] = [Math.random(), Math.random(), Math.random()];

  const m: RawMesh = {
    dbgName: "grass",
    pos: [],
    tri: [],
    quad: [],
    colors: [],
  };

  let i = 0;
  for (let xi = 0.0; xi < size; xi += spacing) {
    for (let zi = 0.0; zi < size; zi += spacing) {
      const x = xi + jitter(spacing);
      const z = zi + jitter(spacing);

      const w = bladeW + jitter(0.05);

      const rot = jitter(Math.PI * 0.5);

      const x1 = x + Math.cos(rot) * w;
      const z1 = z + Math.sin(rot) * w;
      const x2 = x + Math.cos(rot + Math.PI) * w;
      const z2 = z + Math.sin(rot + Math.PI) * w;
      const x3 = x + jitter(0.7);
      const z3 = z + jitter(0.7);
      const x4 = x3 + jitter(w * 0.5);
      const z4 = z3 + jitter(w * 0.5);

      const y1 = 0; //-bladeH;
      const y2 = 0;
      const y3 = bladeH + jitter(1);
      const y4 = y3 * (0.9 + jitter(0.1));

      // TODO(@darzu): disable for debug coloring
      // "make sure your diffuse colors are around 0.2, and no much brighter except for very special situations."
      // const r = (0.05 + jitter(0.02)) * 0.3
      // const g = (0.5 + jitter(0.2)) * 0.3
      // const b = (0.05 + jitter(0.02)) * 0.3

      const p1: vec3 = V(x1, y1, z1);
      const p2: vec3 = V(x2, y2, z2);
      const p3: vec3 = V(x3, y3, z3);
      const p4: vec3 = V(x4, y4, z4);

      // const norm0 = vec3.cross(
      //   vec3.create(),
      //   [x2 - x1, y2 - y1, z2 - z1],
      //   [x3 - x1, y3 - y1, z3 - z1]
      // );
      // vec3.normalize(norm0, norm0);

      // // m.addVertex(p1, [r, g, b], norm0, Vertex.Kind.normal);
      // // m.addVertex(p2, [r, g, b], norm0, Vertex.Kind.normal);
      // // m.addVertex(p3, [r, g, b], norm0, Vertex.Kind.normal);
      // m.addTri([2 + i * 3, 1 + i * 3, 0 + i * 3]);

      let vi = m.pos.length;
      m.pos[vi + 0] = p1;
      m.pos[vi + 1] = p2;
      m.pos[vi + 2] = p3;
      m.tri.push(V(vi + 0, vi + 1, vi + 2));
      m.colors.push(V(r, g, b));

      i++;
      continue;
    }
  }

  // TODO(@darzu): use this?
  const aabbMin: vec3 = V(-spacing, 0, -spacing);
  const aabbMax: vec3 = V(size + spacing, bladeH * 2, size + spacing);

  // m.setUniform(mat4.create(), aabbMin, aabbMax);

  const m2: Mesh = {
    ...m,
    surfaceIds: m.tri.map((_, i) => i + 1),
    usesProvoking: true,
  };

  return m2;
}

// export const GrassTileDef = EM.defineComponent("grassTile", () => true);

type GrassTile = EntityW<[typeof PositionDef]>;

interface GrassTileset {
  tiles: GrassTile[];
  update: (target: vec3) => void;
  numTris: number;
}

// let _dbgGrassTriCount = 0;
// export function getDbgGrassTriCount() {
//   return _dbgGrassTriCount;
// }

export async function createGrassTileset(
  opts: GrassTilesetOpts
): Promise<GrassTileset> {
  // console.log("createGrassTileset");

  const { renderer } = await EM.whenResources(RendererDef);

  // create grass field
  const { spacing, tileSize, tilesPerSide } = opts;
  const grassPerTile = (tileSize / spacing) ** 2;
  const tileCount = tilesPerSide ** 2;
  const totalGrass = grassPerTile * tileCount;
  const totalGrassTris = totalGrass * 1;
  // TODO(@darzu): GRASS FORMAT
  // const totalGrassTris = totalGrass * 2;
  // const builder = builderBuilder({
  //   maxVerts: align(totalGrassTris * 3, 4),
  //   maxTris: align(totalGrassTris, 4),
  //   maxMeshes: tileCount,
  //   // backfaceCulling: false,
  //   // usesIndices: false,
  // });
  const maxVerts = align(totalGrassTris * 3, 4);
  const maxTris = align(totalGrassTris, 4);
  const maxMeshes = tileCount;

  // _dbgGrassTriCount += totalGrassTris;

  const maxBladeDraw = ((tilesPerSide - 1) / 2) * tileSize;
  const tileOpts: GrassTileOpts = {
    ...opts,
    maxBladeDraw,
  };

  const _tileMesh = createGrassTile(tileOpts);
  // const tileGMesh = gameMeshFromMesh(_tileMesh, renderer.renderer);
  const grassPool = renderer.renderer.getCyResource(grassPoolPtr)!;
  const tileProto = grassPool.addMesh(_tileMesh);

  const tileProms: Promise<
    EntityW<
      [typeof PositionDef, typeof RenderableDef, typeof RenderDataGrassDef]
    >
  >[] = [];

  for (let xi = 0; xi < tilesPerSide; xi++) {
    for (let zi = 0; zi < tilesPerSide; zi++) {
      const x = xi * tileSize;
      const z = zi * tileSize;
      // console.log(`(${xi}, ${zi})`);
      // TODO(@darzu): USE INSTANCING
      const tile = EM.new();
      EM.ensureComponentOn(tile, PositionDef, V(x, 0, z));
      EM.ensureComponentOn(
        tile,
        RenderableConstructDef,
        tileProto,
        // false,
        undefined,
        undefined,
        undefined,
        grassPoolPtr
      );
      EM.ensureComponentOn(tile, ColorDef, randColor());
      // mat4.translate(tile.transform, tile.transform, [x, 0, z]);
      // builder.updateUniform(tile);

      tileProms.push(
        EM.whenEntityHas(tile, PositionDef, RenderableDef, RenderDataGrassDef)
      );
    }
  }

  const tiles = await Promise.all(tileProms);

  const grassObjId = 7654;
  for (let t of tiles) {
    t.renderDataGrass.id = grassObjId;
    t.renderDataGrass.spawnDist = tilesPerSide * tileSize * 0.5; // - 2.5;
  }

  // const pool = builder.finish();

  // handle grass tile movement
  function update(target: vec3) {
    const [tx, _, tz] = target;

    // compute the N closest centers
    const txi = tx / opts.tileSize;
    const nearestXIs = nearestIntegers(txi, opts.tilesPerSide);
    const tzi = tz / opts.tileSize;
    const nearestZIs = nearestIntegers(tzi, opts.tilesPerSide);
    const nearestIs: [number, number][] = [];
    for (let xi of nearestXIs)
      for (let zi of nearestZIs) nearestIs.push([xi, zi]);

    // compare with current positions
    const occupied: [number, number][] = [];
    const toMoveInds: number[] = [];
    // const tilePoses: vec3[] = tiles.map((t) =>
    //   getPositionFromTransform(t.transform)
    // );
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const [x, _, z] = t.position;
      const xi = Math.floor((x + 0.5) / opts.tileSize);
      const zi = Math.floor((z + 0.5) / opts.tileSize);
      let shouldMove = true;
      for (let [xi2, zi2] of nearestIs) {
        if (xi2 === xi && zi2 === zi) {
          occupied.push([xi2, zi2]);
          shouldMove = false;
          break;
        }
      }
      if (shouldMove) toMoveInds.push(i);
    }

    // move those that don't match
    for (let i of toMoveInds) {
      const t = tiles[i];
      for (let [xi1, zi1] of nearestIs) {
        const isOpen = !occupied.some(
          ([xi2, zi2]) => xi2 === xi1 && zi2 === zi1
        );
        if (!isOpen) continue;
        // do move
        occupied.push([xi1, zi1]);
        const targetPos = V(xi1 * opts.tileSize, 0, zi1 * opts.tileSize);
        vec3.copy(t.position, targetPos);
        // const move = vec3.sub(targetPos, t.position);
        // mat4.translate(t.transform, t.transform, move);
        // console.log(`moving (${tilePoses[i][0]}, ${tilePoses[i][1]}, ${tilePoses[i][2]}) to (${targetPos[0]}, ${targetPos[1]}, ${targetPos[2]}) via (${move[0]}, ${move[1]}, ${move[2]})`)
        // pool.updateUniform(t);
        break;
      }
    }
  }

  const numTris = totalGrassTris * tiles.length;

  return {
    tiles,
    update,
    numTris,
  };
}

function nearestIntegers(target: number, numInts: number): number[] {
  const maxIntDist = (numInts - 1) / 2;
  const minInt = Math.floor(target - maxIntDist);
  const maxInt = Math.floor(target + maxIntDist);
  const nearestInts: number[] = [];
  for (let xi = minInt; xi <= maxInt; xi++) nearestInts.push(xi);
  if (nearestInts.length !== numInts) {
    console.error(
      `Too many (!=${numInts}) 'NEAREST' integers [${nearestInts.join(
        ","
      )}] found to: ${target}`
    );
  }
  return nearestInts;
}

// export function initGrassSystem(
//   builderBuilder: (opts: MeshPoolOpts) => MeshPoolBuilder
// ): GrassSystem {
//   if (!RENDER_GRASS) {
//     return {
//       getGrassPools: () => [],
//       update: () => {},
//     };
//   }
//   const start = performance.now();

//   // TODO(@darzu): try upside down triangles
//   const lod1Opts: GrassTilesetOpts = {
//     bladeW: 0.2,
//     // bladeH: 3,
//     // bladeH: 1.6,
//     // bladeH: 1.5,
//     bladeH: 1.8,
//     // TODO(@darzu): debugging
//     // spacing: 1,
//     // tileSize: 4,
//     spacing: 0.25,
//     tileSize: 16,
//     // tileSize: 10,
//     tilesPerSide: 5,
//   };
//   const lod0Opts: GrassTilesetOpts = {
//     ...lod1Opts,
//     bladeH: lod1Opts.bladeH * 0.8,
//     spacing: lod1Opts.spacing * 0.5,
//     tileSize: lod1Opts.tileSize * 0.5,
//   };
//   const lod2Opts: GrassTilesetOpts = {
//     ...lod1Opts,
//     bladeH: lod1Opts.bladeH * 1.4,
//     spacing: lod1Opts.spacing * 2,
//     tileSize: lod1Opts.tileSize * 2,
//   };
//   const lod3Opts: GrassTilesetOpts = {
//     ...lod1Opts,
//     bladeH: lod1Opts.bladeH * 1.6,
//     spacing: lod1Opts.spacing * 4,
//     tileSize: lod1Opts.tileSize * 4,
//   };
//   const lod4Opts: GrassTilesetOpts = {
//     ...lod1Opts,
//     tilesPerSide: 8,
//     bladeH: lod1Opts.bladeH * 1.8,
//     spacing: lod1Opts.spacing * 8,
//     tileSize: lod1Opts.tileSize * 8,
//   };
//   const lod5Opts: GrassTilesetOpts = {
//     ...lod1Opts,
//     tilesPerSide: 8,
//     bladeW: lod1Opts.bladeW * 2,
//     bladeH: lod1Opts.bladeH * 2,
//     spacing: lod1Opts.spacing * 32,
//     tileSize: lod1Opts.tileSize * 32,
//   };

//   const lodDebug: GrassTilesetOpts = {
//     bladeW: 0.4,
//     bladeH: 2,
//     spacing: 0.5,
//     tileSize: 4,
//     tilesPerSide: 5,
//   };

//   // TODO(@darzu): debugging
//   // const lodOpts = [lodDebug]
//   const lodOpts = [
//     // lodDebug
//     lod0Opts,
//     lod1Opts,
//     lod2Opts,
//     lod3Opts,
//     lod4Opts,
//     lod5Opts,
//   ];

//   const tilesets = lodOpts.map((opts) =>
//     createGrassTileset(opts, builderBuilder)
//   );

//   function updateAll(target: vec3) {
//     tilesets.forEach((t) => t.update(target));
//   }

//   const numTris = tilesets
//     .map((s) => s.pool.numTris)
//     .reduce((p, n) => p + n, 0);
//   console.log(
//     `Created grass system with ${(numTris / 1000).toFixed(0)}k triangles in ${(
//       performance.now() - start
//     ).toFixed(0)}ms.`
//   );

//   const res: GrassSystem = {
//     getGrassPools: () => tilesets.map((t) => t.pool),
//     update: updateAll,
//   };
//   return res;
// }
