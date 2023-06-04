import { EM, Component } from "../ecs/entity-manager.js";
import { mat4, quat, vec4, vec2, vec3 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util.js";
import { normalizeVec2s, computeTriangleNormal } from "../utils/utils-3d.js";
import {
  getBoardsFromMesh,
  unshareProvokingForWood,
  WoodAssets,
  WoodAssetsDef,
} from "../wood/wood.js";
import {
  cloneMesh,
  scaleMesh,
  transformMesh,
  getMeshAsGrid,
  RawMesh,
  mapMeshPositions,
  scaleMesh3,
} from "./mesh.js";
import { XY } from "./mesh-loader.js";
import {
  CUBE_MESH,
  SHIP_OFFSET,
  makePlaneMesh,
  TETRA_MESH,
  mkOctogonMesh,
  mkHalfEdgeQuadMesh,
  HEX_MESH,
  BOAT_MESH,
  BULLET_MESH,
  GRID_PLANE_MESH,
  DBG_FABRIC,
  TRI_FENCE,
  makeSailMesh,
  mkTimberSplinterEnd,
  createRudderMesh,
} from "./primatives.js";
import { createGizmoMesh } from "../debug/gizmos.js";

// TODO(@darzu): move elsewhere?
export const BLACK = V(0, 0, 0);
export const DARK_GRAY = V(0.02, 0.02, 0.02);
export const LIGHT_GRAY = V(0.2, 0.2, 0.2);
export const DARK_BLUE = V(0.03, 0.03, 0.2);
export const LIGHT_BLUE = V(0.05, 0.05, 0.2);

export const BallMesh = XY.registerMesh({
  name: "ball",
  data: "ball.sprig.obj",
  // TODO(@darzu): BUG! This is storing a temp vec as the transform.
  transform: mat4.fromScaling([2, 2, 2]),
});

export const UnitCubeMesh = XY.registerMesh({
  name: "unitCube",
  data: () => {
    const unitCube = cloneMesh(CUBE_MESH);
    unitCube.dbgName = "unitCube";
    // normalize this cube to have min at 0,0,0 and max at 1,1,1
    unitCube.pos.forEach((p) => {
      p[0] = p[0] < 0 ? 0 : 1;
      p[1] = p[1] < 0 ? 0 : 1;
      p[2] = p[2] < 0 ? 0 : 1;
    });
    return unitCube;
  },
});

export const GizmoMesh = XY.registerMesh({
  name: "gizmo",
  data: () => createGizmoMesh(),
});

export const ShipMesh = XY.registerMesh({
  name: "ship",
  data: "barge.sprig.obj",
  modify: (m) => {
    m.lines = [];
    scaleMesh(m, 3);
    return m;
  },
});
export const ShipSmallMesh = XY.registerMesh({
  name: "ship_small",
  data: "player_ship_small.sprig.obj",
  transform: mat4.fromRotationTranslationScaleOrigin(
    quat.IDENTITY,
    [0, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
    mat4.create()
  ),
});

export const ShipFangsMesh = XY.registerMesh({
  name: "ship_fangs",
  data: "enemy_ship_fangs.sprig.obj",
  transform: mat4.fromScaling([3, 3, 3], mat4.create()),
  modify: (m) => {
    // if ("true") return m; // TODO(@darzu): FOR PERF

    // m.colors = m.colors.map((c) => [0.2, 0.2, 0.2]);
    m.surfaceIds = m.colors.map((_, i) => i);
    // console.log(`
    // Fang ship has:
    // ${m.tri.length} tris
    // ${m.quad.length} quads
    // `);

    // m = debugBoardSystem(m);

    // TODO(@darzu): yikes this is a lot of work on import.

    // TODO(@darzu): call getBoardsFromMesh,
    //    then move this data into some resource to be accessed later in an entities lifecycle
    const woodState = getBoardsFromMesh(m);

    unshareProvokingForWood(m, woodState);

    const woodAssets: WoodAssets =
      EM.getResource(WoodAssetsDef) ?? EM.addResource(WoodAssetsDef);

    woodAssets["ship_fangs"] = woodState;

    return m;
  },
});

export const PickMesh = XY.registerMesh({
  name: "pick",
  data: "pick.sprig.obj",
});
export const SpaceOreMesh = XY.registerMesh({
  name: "spaceore",
  data: "spaceore.sprig.obj",
});
export const SpaceRockMesh = XY.registerMesh({
  name: "spacerock",
  data: "spacerock.sprig.obj",
  transform: mat4.fromScaling([1.5, 1.5, 1.5], mat4.create()),
  modify: (m) => {
    m.colors = m.colors.map((c) => V(0.05, 0.15, 0.2));
    const t = mat4.fromYRotation(Math.PI * 0.2, mat4.create());
    transformMesh(m, t);
    m.lines = [];
    return m;
  },
});
export const AmmunitionBoxMesh = XY.registerMesh({
  name: "ammunition_box",
  data: "ammunition_box.sprig.obj",
});
export const LinstockMesh = XY.registerMesh({
  name: "linstock",
  data: "linstock.sprig.obj",
  transform: mat4.fromScaling([0.1, 0.1, 0.1], mat4.create()),
});
export const CannonMesh = XY.registerMesh({
  name: "cannon",
  data: "cannon_simple.sprig.obj",
  transform: mat4.fromYRotation(-Math.PI / 2, mat4.create()),
  modify: (m) => {
    m.colors = m.colors.map((c) => V(0.2, 0.2, 0.2));
    return m;
  },
});
export const CannonLD51Mesh = XY.registerMesh({
  name: "ld51_cannon",
  data: "ld51_cannon.sprig.obj",
  transform: mat4.fromRotationTranslationScale(
    quat.rotateX(quat.IDENTITY, Math.PI * -0.5, quat.create()),
    [0, 0, 0],
    // [0.8, 0.8, 0.8], // LD51 size
    [1.2, 1.2, 1.2],
    mat4.create()
  ),
});
export const GrappleHookMesh = XY.registerMesh({
  name: "grappleHook",
  data: "grapple-hook.sprig.obj",
  transform: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
});
export const GrappleGunMesh = XY.registerMesh({
  name: "grappleGun",
  data: "grapple-gun.sprig.obj",
  transform: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
});
export const GrappleGunUnloadedMesh = XY.registerMesh({
  name: "grappleGunUnloaded",
  data: "grapple-gun-unloaded.sprig.obj",
  transform: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
});
export const RudderMesh = XY.registerMesh({
  name: "rudder",
  data: "rudder.sprig.obj",
  transform: mat4.translate(
    mat4.fromYRotation(-Math.PI * 0.5, mat4.create()),
    V(-5, 0, 0),
    mat4.create()
  ),
});

export const OceanMesh = XY.registerMesh({
  name: "ocean",
  data: "hyperspace-ocean.sprig.obj",
  transform: mat4.fromScaling([2, 2, 2], mat4.create()),
  modify: (m) => {
    // if ("true") return m; // TODO(@darzu): FOR PERF
    // TODO(@darzu): extract out all this setUV stuff.
    // reduce duplicate positions
    // console.log("OCEAN");
    // console.dir(m);
    // m = deduplicateVertices(m);
    // console.dir(m);

    // TODO(@darzu): do we want convexity highlighting on the ocean?
    m.surfaceIds = m.quad.map((_, i) => i);
    // TODO(@darzu): generate UVs for the ocean
    const minX = m.pos.reduce((p, n) => (n[0] < p ? n[0] : p), Infinity);
    const maxX = m.pos.reduce((p, n) => (n[0] > p ? n[0] : p), -Infinity);
    const minZ = m.pos.reduce((p, n) => (n[2] < p ? n[2] : p), Infinity);
    const maxZ = m.pos.reduce((p, n) => (n[2] > p ? n[2] : p), -Infinity);
    // m.uvs = m.pos.map(
    //   (p, i) =>
    //     vec2.fromValues(
    //       mathMap(p[0], minX, maxX, 0, 1),
    //       mathMap(p[2], minZ, maxZ, 0, 1)
    //     )
    //   // vec2.fromValues(i / m.pos.length, 0)
    //   // vec2.fromValues(0.5, 0.5)
    // );

    // TODO(@darzu): DBG
    // try {
    //   console.log("getMeshAsGrid(ocean)");
    const { coords, grid } = getMeshAsGrid(m);
    //   console.log("getMeshAsGrid success!");
    // } catch (e) {
    //   console.log("getMeshAsGrid failed!");
    //   console.error(e);
    // }
    const xLen = grid.length;
    const yLen = grid[0].length;

    // TODO(@darzu): I forgot why we want this? From https://github.com/darzu/sprig/pull/59
    // redo quad indices based on the grid (optional?)
    for (let xi = 0; xi < xLen - 1; xi++) {
      for (let yi = 0; yi < yLen - 1; yi++) {
        const qi = gridXYtoQuad(xi, yi);
        vec4.copy(m.quad[qi], [
          grid[xi][yi],
          grid[xi + 1][yi],
          grid[xi + 1][yi + 1],
          grid[xi][yi + 1],
        ]);
      }
    }
    function gridXYtoQuad(xi: number, yi: number): number {
      const qi = yi + xi * (yLen - 1);
      assert(qi < m.quad.length, "quads and grid mismatch!");
      return qi;
    }

    // console.log(`xLen:${xLen},yLen:${yLen}`);
    const uvs = m.pos.map((_, vi) => vec2.create());
    m.uvs = uvs;
    // setUV(Math.floor(xLen / 2), 0, [0, 1], [0, 0], true);
    setUV(
      0,
      Math.floor(yLen / 2),
      vec2.clone([1, 0]),
      vec2.clone([0, 0]),
      true
    );
    // TODO(@darzu): lots of little annoying issues happen when you go right to the texture edge
    normalizeVec2s(uvs, 0 + 0.01, 1 - 0.01);

    // TODO: should we compute tangents (and normals!) per vertex
    // instead of per quad, for vertex displacement (e.g. waves)
    // purposes?

    //set tangents
    m.tangents = m.pos.map(() => vec3.create());
    m.normals = m.pos.map(() => vec3.create());
    for (let xIndex = 0; xIndex < grid.length; xIndex++) {
      for (let yIndex = 0; yIndex < grid[0].length; yIndex++) {
        let normal: vec3;
        let tangent: vec3;
        if (xIndex + 1 < grid.length && yIndex + 1 < grid[0].length) {
          const pos = m.pos[grid[xIndex][yIndex]];
          const posNX = m.pos[grid[xIndex + 1][yIndex]];
          const posNY = m.pos[grid[xIndex][yIndex + 1]];

          normal = computeTriangleNormal(pos, posNX, posNY, vec3.create());

          tangent = vec3.sub(posNX, pos, m.tangents[grid[xIndex][yIndex]]);
          vec3.normalize(tangent, tangent);
        } else if (xIndex + 1 >= grid.length) {
          normal = m.normals[grid[xIndex - 1][yIndex]];
          tangent = m.tangents[grid[xIndex - 1][yIndex]];
        } else if (yIndex + 1 >= grid[0].length) {
          normal = m.normals[grid[xIndex][yIndex - 1]];
          tangent = m.tangents[grid[xIndex][yIndex - 1]];
        } else {
          assert(false);
        }
        vec3.copy(m.normals[grid[xIndex][yIndex]], normal);
        vec3.copy(m.tangents[grid[xIndex][yIndex]], tangent);
      }
    }

    // console.dir(uvs);
    // console.log(`
    // X:
    // ${max(uvs.map((uv) => uv[0]))}
    // ${min(uvs.map((uv) => uv[0]))}
    // Y:
    // ${max(uvs.map((uv) => uv[1]))}
    // ${min(uvs.map((uv) => uv[1]))}
    // `);

    function setUV(
      x: number,
      y: number,
      dir: vec2,
      currDist: vec2,
      branch: boolean
    ) {
      // console.log(`setUV ${x} ${y} ${dir} ${currDist} ${branch}`);
      // set this UV
      const vi = grid[x][y];
      vec2.copy(uvs[vi], currDist);

      // branch?
      if (branch) {
        setUV(x, y, vec2.clone([dir[1], dir[0]]), currDist, false);
        setUV(x, y, vec2.clone([-dir[1], -dir[0]]), currDist, false);
      }

      // continue forward?
      const nX = x + dir[0];
      const nY = y + dir[1];
      if (nX < 0 || xLen <= nX || nY < 0 || yLen <= nY) return;
      const nVi = grid[nX][nY];
      const delta = vec3.dist(m.pos[vi], m.pos[nVi]);
      const newDist: vec2 = vec2.clone([
        currDist[0] + dir[0] * delta,
        currDist[1] + dir[1] * delta,
      ]);
      setUV(nX, nY, dir, newDist, branch);
    }
    // console.dir({
    //   uvMin: [min(m.uvs.map((a) => a[0])), min(m.uvs.map((a) => a[1]))],
    //   uvMax: [max(m.uvs.map((a) => a[0])), max(m.uvs.map((a) => a[1]))],
    // });

    // console.dir(m.uvs);
    // console.dir({ minX, maxX, minZ, maxZ });
    return m;
  },
});
export const PirateMesh = XY.registerMesh({
  name: "pirate",
  data: "pirate.glb",
});

// TODO(@darzu): both of these are doing "cell fracture" in Blender
//    than exporting into here. It'd be great if sprigland could
//    natively do cell fracture b/c there
//    is a lot of translate/scale alignment issues when we have
//    a base model and a fractured model. Very hard to make changes.
// TODO(@darzu): enemy broken parts doesn't seem to work rn. probably rename related
export const BoatBrokenMesh = XY.registerMesh({
  name: "boat_broken",
  multi: true,
  data: "boat_broken.sprig.obj",
});
export const ShipBrokenMesh = XY.registerMesh({
  name: "ship_broken",
  multi: true,
  data: "barge1_broken.sprig.obj",
  modify: (m) => {
    m.lines = [];
    m.pos = m.pos.map((p) => vec3.sub(p, SHIP_OFFSET, vec3.create()));
    scaleMesh(m, 3);
    return m;
  },
});
export const BallBrokenMesh = XY.registerMesh({
  name: "ball_broken",
  multi: true,
  data: "ball_broken6.sprig.obj",
});

export const CubeMesh = XY.registerMesh({
  name: "cube",
  data: () => CUBE_MESH,
});

export const PlaneMesh = XY.registerMesh({
  name: "plane",
  data: () => makePlaneMesh(-10, 10, -10, 10),
});
export const TetraMesh = XY.registerMesh({
  name: "tetra",
  data: () => TETRA_MESH,
});
export const HeOctoMesh = XY.registerMesh({
  name: "he_octo",
  data: mkOctogonMesh,
});
export const HeQuadMesh = XY.registerMesh({
  name: "he_quad",
  data: mkHalfEdgeQuadMesh,
});
export const HexMesh = XY.registerMesh({ name: "hex", data: HEX_MESH });
export const EnemyShipMesh = XY.registerMesh({
  name: "enemyShip",
  data: () => BOAT_MESH,
});
export const BulletMesh = XY.registerMesh({
  name: "bullet",
  data: () => BULLET_MESH,
});
export const GridPlaneMesh = XY.registerMesh({
  name: "gridPlane",
  data: () => GRID_PLANE_MESH,
});
export const FabricMesh = XY.registerMesh({
  name: "fabric",
  data: () => DBG_FABRIC,
});
export const TriFenceMesh = XY.registerMesh({
  name: "triFence",
  data: TRI_FENCE,
});

// TODO(@darzu): wire cube is kinda broken; needs line renderer
export const WireCubeMesh = XY.registerMesh({
  name: "wireCube",
  data: () =>
    ({ ...CUBE_MESH, tri: [], colors: [], dbgName: "wireCube" } as RawMesh),
});
export const MastMesh = XY.registerMesh({
  name: "mast",
  data: () => {
    let m = cloneMesh(CUBE_MESH);
    m.dbgName = "mast";
    mapMeshPositions(m, (p) => V(p[0], p[1] + 1, p[2]));
    scaleMesh3(m, V(0.5, 20, 0.5));
    return m;
  },
});
export const LD53CannonMesh = XY.registerMesh({
  name: "ld53_cannon",
  data: () => {
    let m = cloneMesh(CUBE_MESH);
    m.dbgName = "ld53_cannon";
    scaleMesh3(m, V(8, 2, 2));
    return m;
  },
});
export const SailMesh = XY.registerMesh({ name: "sail", data: makeSailMesh });
// timber_rib: mkTimberRib,
export const TimberSplinterMesh = XY.registerMesh({
  name: "timber_splinter",
  data: mkTimberSplinterEnd,
});
export const RudderPrimMesh = XY.registerMesh({
  name: "rudderPrim",
  data: () => createRudderMesh(),
});

// TODO(@darzu): remove eventually?
const allMeshesList = [
  // file
  ShipMesh,
  BallMesh,
  ShipSmallMesh,
  ShipFangsMesh,
  PickMesh,
  SpaceOreMesh,
  SpaceRockMesh,
  AmmunitionBoxMesh,
  LinstockMesh,
  CannonMesh,
  CannonLD51Mesh,
  GrappleHookMesh,
  GrappleGunMesh,
  GrappleGunUnloadedMesh,
  RudderMesh,
  OceanMesh,
  PirateMesh,
  // file, groups
  BoatBrokenMesh,
  ShipBrokenMesh,
  BallBrokenMesh,
  // local
  CubeMesh,
  PlaneMesh,
  TetraMesh,
  HeOctoMesh,
  HeQuadMesh,
  HexMesh,
  EnemyShipMesh,
  BulletMesh,
  GridPlaneMesh,
  FabricMesh,
  TriFenceMesh,
  WireCubeMesh,
  MastMesh,
  SailMesh,
  LD53CannonMesh,
  TimberSplinterMesh,
  RudderPrimMesh,
] as const;

export const AllMeshesDef = XY.defineMeshSetResource(
  "allMeshes",
  ...allMeshesList
);

// const { allMeshes } = await EM.whenResources(AllMeshesDef);
// const wip0: GameMesh = allMeshes.ball;
// const wip1: GameMesh[] = allMeshes.boat_broken;

export type AllMeshes = Component<typeof AllMeshesDef>;
export type AllMeshSymbols = keyof AllMeshes;
