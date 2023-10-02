import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
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
import { createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  Position,
  PositionDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { randFloat, randInt } from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { assert } from "../utils/util.js";
import { randNormalVec3, randQuat } from "../utils/utils-3d.js";
import { LD54GameStateDef, FUEL_PER_ORE, OXYGEN_PER_ORE } from "./gamestate.js";

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

export const OreDef = EM.defineComponent("ore", () => ({
  carried: false,
  type: "fuel" as "fuel" | "oxygen",
}));

type OreEnt = EntityW<[typeof OreDef, typeof PositionDef]>;
export const OreCarrierDef = EM.defineComponent("oreCarrier", () => ({
  carrying: undefined as OreEnt | undefined,
}));

export const OreStoreDef = EM.defineComponent("oreStore", () => ({
  ores: [] as OreEnt[],
}));

export async function initOre(spacePath: Path) {
  const ballGameMesh = await EM.whenResources(BallMesh.def);
  const mkBallMesh = () => cloneMesh(ballGameMesh.mesh_ball.mesh);

  // ore parameters
  const oxyOreTravelDist = 120;
  const fuelOreTravelDist = 200;

  const pathDistances: number[] = []; // cumulative distance
  {
    // path distances
    let prevPos = spacePath[0].pos;
    let lastDist = 0;
    for (let i = 0; i < spacePath.length; i++) {
      const newTravel = vec3.dist(spacePath[i].pos, prevPos);
      const dist = lastDist + newTravel;
      prevPos = spacePath[i].pos;
      lastDist = dist;
      pathDistances.push(dist);
    }
  }
  const totalDistance = pathDistances.at(-1)!;

  // place fuel
  {
    let totalFuelTravel = fuelOreTravelDist;
    while (totalFuelTravel < totalDistance) {
      const nextOreStop = totalFuelTravel - fuelOreTravelDist * 0.2;
      const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
      const seg = spacePath[segIdx];

      const randDistFromTrack = randFloat(20, 100);
      const pos = vec3.scale(
        randNormalVec3(),
        randDistFromTrack,
        vec3.create()
      );
      pos[2] = seg.pos[2];

      createFuelOre(pos);

      totalFuelTravel = nextOreStop + fuelOreTravelDist;
    }
  }

  // place oxygen
  {
    let totalOxygenTravel = oxyOreTravelDist;
    while (totalOxygenTravel < totalDistance) {
      const nextOreStop = totalOxygenTravel - oxyOreTravelDist * 0.2;
      const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
      const seg = spacePath[segIdx];

      const randDistFromTrack = randFloat(20, 100);
      const pos = vec3.scale(
        randNormalVec3(),
        randDistFromTrack,
        vec3.create()
      );
      pos[2] = seg.pos[2];

      createOxygenOre(pos);

      totalOxygenTravel = nextOreStop + oxyOreTravelDist;
    }
  }

  EM.addSystem(
    "interactWithOre",
    Phase.GAME_PLAYERS,
    [OreCarrierDef, PositionDef],
    [PhysicsResultsDef, LD54GameStateDef],
    (es, res) => {
      if (!es.length) return;
      assert(es.length === 1);
      const carrier = es[0];

      // collisions?
      const otherIds = res.physicsResults.collidesWith.get(carrier.id);
      if (!otherIds) return;

      if (carrier.oreCarrier.carrying) {
        // we're carying ore
        const stores = otherIds
          .map((id) => EM.findEntity(id, [OreStoreDef, PositionDef]))
          .filter((e) => e !== undefined);
        if (!stores.length) return; // didn't reach the store
        assert(stores.length === 1);
        const store = stores[0]!;

        // transfer to store
        const ore = carrier.oreCarrier.carrying;
        ore.ore.carried = true;
        carrier.oreCarrier.carrying = undefined;
        store.oreStore.ores.push(ore);
        EM.set(ore, PhysicsParentDef, store.id);
        vec3.set(0, 10, 0, ore.position);
        switch (ore.ore.type) {
          case "fuel":
            res.ld54GameState.fuel += FUEL_PER_ORE;
            break;
          case "oxygen":
            res.ld54GameState.oxygen += OXYGEN_PER_ORE;
            break;
        }
      } else {
        // we're not carying ore
        const ores = otherIds
          .map((id) =>
            EM.findEntity(id, [OreDef, PositionDef, AngularVelocityDef])
          )
          .filter((e) => e !== undefined && !e.ore.carried);
        if (!ores.length) return; // didn't reach any new ore

        // transfer to carrier
        const ore = ores[0]!;
        carrier.oreCarrier.carrying = ore;
        ore.ore.carried = true;
        vec3.zero(ore.angularVelocity); // stop spinning
        EM.set(ore, PhysicsParentDef, carrier.id);
        vec3.set(0, 0, -5, ore.position);
      }
    }
  );

  function createOxygenOre(pos: vec3) {
    const ore = EM.new();

    EM.set(ore, OreDef);
    ore.ore.type = "oxygen";

    // mesh
    const mesh = createOxygenOreMesh(mkBallMesh);
    EM.set(ore, RenderableConstructDef, mesh);

    // collider
    const S = -3;
    EM.set(ore, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
    });

    // pos
    EM.set(ore, PositionDef, pos);

    // spin
    EM.set(ore, AngularVelocityDef);
    randNormalVec3(ore.angularVelocity);
    vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

    return ore;
  }

  function createFuelOre(pos: vec3) {
    const ore = EM.new();

    EM.set(ore, OreDef);
    ore.ore.type = "fuel";

    // mesh
    const mesh = createFuelOreMesh();
    EM.set(ore, RenderableConstructDef, mesh);
    EM.set(ore, PositionDef, pos);

    // collider
    const S = -3;
    EM.set(ore, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
    });

    // pos
    EM.set(ore, AngularVelocityDef);

    // spin
    randNormalVec3(ore.angularVelocity);
    vec3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

    return ore;
  }
}
