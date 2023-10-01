import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { V, mat4, quat, vec3 } from "../matrix/sprig-matrix.js";
import { BallMesh } from "../meshes/mesh-list.js";
import {
  Mesh,
  RawMesh,
  cloneMesh,
  mapMeshPositions,
  mergeMeshes,
  transformMesh,
} from "../meshes/mesh.js";
import { HEX_MESH, TETRA_MESH, mkCubeMesh } from "../meshes/primatives.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { randFloat, randInt } from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { randNormalVec3, randQuat } from "../utils/utils-3d.js";

let _t1 = vec3.create();
let _t2 = quat.create();

function createFuelOreMesh(): Mesh {
  const meshes: RawMesh[] = [];
  let numCubes = 5;
  for (let i = 0; i < numCubes; i++) {
    // TODO(@darzu):
    const c = mkCubeMesh();

    const randTrans = vec3.scale(randNormalVec3(_t1), 2, _t1);
    vec3.add(randTrans, [0, 0, 1 * i], randTrans);
    const randRot = randQuat(_t2);
    const randScale = randFloat(1, 2);

    c.pos.forEach((p) => {
      vec3.transformQuat(p, randRot, p);
      vec3.scale(p, randScale, p);
      vec3.add(p, randTrans, p);
    });

    // const randColorIdx = randInt(0, 2);
    const randColor = [
      ENDESGA16.lightGreen,
      ENDESGA16.darkGreen,
      ENDESGA16.deepGreen,
    ][i % 3];

    c.colors.forEach((c) => {
      vec3.copy(c, randColor);
    });

    meshes.push(c);
  }

  const result = mergeMeshes(...meshes) as Mesh;
  result.usesProvoking = true;
  result.surfaceIds = result.colors.map((_, i) => i);
  return result;
}

function createOxygenOreMesh(mkBallMesh: () => Mesh): Mesh {
  const meshes: RawMesh[] = [];
  let numCubes = 5;
  for (let i = 0; i < numCubes; i++) {
    // TODO(@darzu):
    // const c = cloneMesh(TETRA_MESH);
    // const c = HEX_MESH();
    const c = mkBallMesh();

    const randTrans = vec3.scale(randNormalVec3(_t1), 2, _t1);
    vec3.add(randTrans, [0, 0, 1 * i], randTrans);
    const randRot = randQuat(_t2);
    const randScale = randFloat(1, 2);

    c.pos.forEach((p) => {
      vec3.transformQuat(p, randRot, p);
      vec3.scale(p, randScale, p);
      vec3.add(p, randTrans, p);
    });

    // const randColorIdx = randInt(0, 2);
    const randColor = [ENDESGA16.white, ENDESGA16.lightBlue, ENDESGA16.blue][
      i % 3
    ];

    c.colors.forEach((c) => {
      vec3.copy(c, randColor);
    });

    meshes.push(c);
  }

  const result = mergeMeshes(...meshes) as Mesh;
  result.usesProvoking = true;
  result.surfaceIds = result.colors.map((_, i) => i);
  return result;
}

export function createFuelOre(pos: vec3) {
  const ore = EM.new();
  const mesh = createFuelOreMesh();
  EM.set(ore, RenderableConstructDef, mesh);
  EM.set(ore, PositionDef, pos);
  EM.set(ore, AngularVelocityDef);
  randNormalVec3(ore.angularVelocity);
  vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

  return ore;
}

export function createOxygenOre(mkBallMesh: () => Mesh, pos: vec3) {
  const ore = EM.new();
  const mesh = createOxygenOreMesh(mkBallMesh);
  EM.set(ore, RenderableConstructDef, mesh);
  EM.set(ore, PositionDef, pos);
  EM.set(ore, AngularVelocityDef);
  randNormalVec3(ore.angularVelocity);
  vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

  return ore;
}

export async function initOre(spacePath: Path) {
  const ballGameMesh = await EM.whenResources(BallMesh.def);
  const mkBallMesh = () => cloneMesh(ballGameMesh.mesh_ball.mesh);

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        createFuelOre(V(x * 16 - 50, y * 16, z * 16));
      }
    }
  }

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        createOxygenOre(mkBallMesh, V(x * 16 + 50, y * 16, z * 16));
      }
    }
  }
}
